#!/usr/bin/env node
'use strict';

/**
 * ENG-LOOP-35 - merged PR task completion.
 *
 * This script is intentionally narrow: after guarded merge evidence exists, it
 * marks the corresponding Notion tracker task Done and records merge evidence.
 */

const fs = require('node:fs');
const path = require('node:path');
const runner = require('./eng-loop-runner.cjs');
const watcher = require('./eng-loop-ci-status-watcher.cjs');

const DEFAULT_GUARDED_MERGE_RESULT_FILE = '.tmp/pr-guarded-merge-result.json';
const DEFAULT_LEDGER_FILE = '.tmp/eng-loop-run-ledger.json';
const DEFAULT_RESULT_FILE = '.tmp/eng-loop-merged-pr-completion-result.json';
const DEFAULT_SUMMARY_FILE = '.tmp/eng-loop-merged-pr-completion-summary.md';
const LIVE_CONFIRMATION = 'ENG-LOOP-35-COMPLETE';

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeComparable(value) {
  return normalizeText(value).toLowerCase();
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  return raw ? JSON.parse(raw) : null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(`${filePath}.tmp`, filePath);
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(`${filePath}.tmp`, value.endsWith('\n') ? value : `${value}\n`, 'utf8');
  fs.renameSync(`${filePath}.tmp`, filePath);
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function firstPropertyName(properties, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(properties, name)) return name;
  }
  return null;
}

function resolveRuntimeOptions(args = {}, env = process.env, cwd = process.cwd()) {
  const guardedMergeResultFile =
    args.guardedMergeResult ||
    args.mergeResult ||
    args.guardedResult ||
    DEFAULT_GUARDED_MERGE_RESULT_FILE;
  const guardedMergeResult = readJsonIfExists(path.resolve(cwd, guardedMergeResultFile));
  const ledgerFile = args.ledger || DEFAULT_LEDGER_FILE;
  const ledger = readJsonIfExists(path.resolve(cwd, ledgerFile)) || {};
  const taskId = firstDefined(
    args.taskId,
    args.task,
    env.INPUT_TASK_ID,
    ledger.task && ledger.task.id,
  );

  return {
    mode: args.mode || env.INPUT_COMPLETION_MODE || 'dry-run',
    confirmation: args.confirm || args.confirmation || env.INPUT_COMPLETION_CONFIRMATION || '',
    taskId: taskId ? normalizeText(taskId) : '',
    guardedMergeResult,
    guardedMergeResultFile,
    ledger,
    ledgerFile,
    resultFile: args.out || args.output || DEFAULT_RESULT_FILE,
    summaryFile: args.summary || DEFAULT_SUMMARY_FILE,
    token: firstDefined(
      args.notionToken,
      args.token,
      env.GARAGEOS_NOTION_TOKEN,
      env.NOTION_TOKEN,
      env.NOTION_API_KEY,
    ),
    databaseId: firstDefined(
      args.notionDatabaseId,
      args.databaseId,
      env.GARAGEOS_NOTION_TASK_DATABASE_ID,
      env.NOTION_TASK_DATABASE_ID,
      env.NOTION_DATABASE_ID,
    ),
    json: Boolean(args.json),
  };
}

function buildResult(status, reason, message, options, extra = {}) {
  const merge = options.guardedMergeResult || {};
  const mergeSha =
    merge.github_response && merge.github_response.sha ? merge.github_response.sha : null;
  const repository = merge.repository || extra.repository || null;

  return {
    status,
    tracker_updated: status === 'merged_pr_task_completed',
    reason,
    message,
    evaluated_at: extra.evaluatedAt || nowIso(),
    task_id: options.taskId || null,
    task_title: extra.taskTitle || null,
    previous_task_status: extra.previousTaskStatus || null,
    next_task_status: extra.nextTaskStatus || null,
    repository,
    pr_number: merge.pr_number || null,
    pr_url: extra.prUrl || (merge.pull_request && merge.pull_request.html_url) || null,
    merge_sha: mergeSha,
    guarded_merge_status: merge.status || null,
    guarded_merge_executed: Boolean(merge.merge_executed),
    non_goals: [
      'does_not_merge',
      'does_not_push',
      'does_not_change_branch_protection',
      'does_not_complete_unmerged_tasks',
      'does_not_mutate_unknown_tracker_fields',
    ],
  };
}

function blocked(reason, message, options, extra) {
  return buildResult('merged_pr_completion_blocked', reason, message, options, extra);
}

function validatePreconditions(options) {
  if (!options.guardedMergeResult) {
    return blocked('guarded_merge_result_missing', 'Guarded merge result is missing.', options);
  }

  if (
    options.guardedMergeResult.status !== 'guarded_merge_merged' ||
    options.guardedMergeResult.merge_executed !== true
  ) {
    return blocked(
      'guarded_merge_not_merged',
      'Task completion requires a successful guarded merge result.',
      options,
    );
  }

  if (!options.taskId) {
    return blocked('task_id_missing', 'Task id or Notion page id is required.', options);
  }

  if (options.mode === 'live') {
    if (options.confirmation !== LIVE_CONFIRMATION) {
      return blocked(
        'live_confirmation_required',
        `Live completion requires confirmation ${LIVE_CONFIRMATION}.`,
        options,
      );
    }

    if (!options.token || !options.databaseId) {
      return blocked(
        'notion_credentials_missing',
        'Live completion requires Notion token and task database id.',
        options,
      );
    }
  } else if (options.mode !== 'dry-run') {
    return blocked('unsupported_mode', 'Completion mode must be dry-run or live.', options);
  }

  return null;
}

function buildCompletionEvidence({ task, result, timestamp }) {
  const parts = [
    `${timestamp} - engineering-loop - PR merged; task tracker completion recorded.`,
    `Task: ${task.title || task.id}.`,
    `PR: ${result.pr_number || 'unresolved'}.`,
  ];

  if (result.pr_url) parts.push(`URL: ${result.pr_url}.`);
  if (result.merge_sha) parts.push(`Merge SHA: ${result.merge_sha}.`);
  parts.push('Evidence: guarded merge result succeeded.');
  parts.push('Next: none.');
  return parts.join(' ');
}

function buildCompletionPatch(page, result, timestamp = nowIso()) {
  const properties = page.properties ?? {};
  const task = runner.taskFromPage(page);
  const statusName = firstPropertyName(properties, ['Status', 'status']);
  const progressName = firstPropertyName(properties, [
    'Progress Source',
    'ProgressSource',
    'progress_source',
  ]);
  const reviewName = firstPropertyName(properties, ['Review ID', 'ReviewID', 'review_id']);
  const commitShaName = firstPropertyName(properties, ['Commit SHA', 'CommitSHA', 'commit_sha']);
  const commitUrlName = firstPropertyName(properties, ['Commit URL', 'CommitURL', 'commit_url']);

  if (!statusName) {
    throw new Error(
      'Cannot complete task because the Notion page does not expose a Status property.',
    );
  }

  const patch = {
    [statusName]: runner.propertyPatchFromExistingProperty(properties[statusName], 'Done'),
  };

  if (progressName) {
    patch[progressName] = runner.propertyPatchFromExistingProperty(
      properties[progressName],
      buildCompletionEvidence({ task, result, timestamp }),
    );
  }

  if (reviewName && result.pr_url) {
    patch[reviewName] = runner.propertyPatchFromExistingProperty(
      properties[reviewName],
      result.pr_url,
    );
  }

  if (commitShaName && result.merge_sha) {
    patch[commitShaName] = runner.propertyPatchFromExistingProperty(
      properties[commitShaName],
      result.merge_sha,
    );
  }

  if (commitUrlName && result.merge_sha && result.repository) {
    patch[commitUrlName] = runner.propertyPatchFromExistingProperty(
      properties[commitUrlName],
      `https://github.com/${result.repository}/commit/${result.merge_sha}`,
    );
  }

  return patch;
}

function createTaskClient(options = {}) {
  return new runner.NotionTaskClient({
    token: options.token,
    databaseId: options.databaseId,
    maxTasks: 1,
  });
}

async function completeMergedPrTask(options, dependencies = {}) {
  const preconditionFailure = validatePreconditions(options);
  if (preconditionFailure) return preconditionFailure;

  const baseResult = buildResult(
    options.mode === 'dry-run' ? 'merged_pr_completion_planned' : 'merged_pr_completion_ready',
    options.mode === 'dry-run' ? 'dry_run_only' : 'preconditions_passed',
    options.mode === 'dry-run'
      ? 'Merged PR completion is eligible. No tracker mutation performed in dry-run mode.'
      : 'Merged PR completion preconditions passed.',
    options,
    { evaluatedAt: dependencies.now ? dependencies.now() : nowIso() },
  );

  if (options.mode === 'dry-run') return baseResult;

  const client = dependencies.client || createTaskClient(options);
  const page = await client.fetchPage(options.taskId);
  const task = runner.taskFromPage(page);
  const currentStatus = normalizeComparable(task.status);

  if (currentStatus === 'done') {
    return buildResult(
      'merged_pr_task_already_done',
      'task_already_done',
      'Task is already Done. No tracker mutation performed.',
      options,
      {
        evaluatedAt: dependencies.now ? dependencies.now() : nowIso(),
        taskTitle: task.title,
        previousTaskStatus: task.status,
        nextTaskStatus: task.status,
        prUrl: baseResult.pr_url,
      },
    );
  }

  if (currentStatus !== 'in progress') {
    return blocked(
      'unsupported_task_status',
      `Task completion requires Status to be In Progress. Received: ${task.status || '(empty)'}.`,
      options,
      {
        evaluatedAt: dependencies.now ? dependencies.now() : nowIso(),
        taskTitle: task.title,
        previousTaskStatus: task.status,
      },
    );
  }

  const timestamp = dependencies.now ? dependencies.now() : nowIso();
  const patch = buildCompletionPatch(page, baseResult, timestamp);
  await client.updatePageProperties(task.id, patch);
  const updatedPage = await client.fetchPage(task.id);
  const updatedTask = runner.taskFromPage(updatedPage);

  if (normalizeComparable(updatedTask.status) !== 'done') {
    return buildResult(
      'merged_pr_completion_failed',
      'completion_verification_failed',
      `Completion verification failed: expected Done, received ${updatedTask.status || '(empty)'}.`,
      options,
      {
        evaluatedAt: timestamp,
        taskTitle: updatedTask.title || task.title,
        previousTaskStatus: task.status,
        nextTaskStatus: updatedTask.status,
        prUrl: baseResult.pr_url,
      },
    );
  }

  return buildResult(
    'merged_pr_task_completed',
    'tracker_status_updated',
    'Merged PR task tracker update completed.',
    options,
    {
      evaluatedAt: timestamp,
      taskTitle: updatedTask.title || task.title,
      previousTaskStatus: task.status,
      nextTaskStatus: updatedTask.status,
      prUrl: baseResult.pr_url,
    },
  );
}

function buildMarkdownSummary(result) {
  return `${[
    '## Merged PR Task Completion',
    '',
    `Status: ${result.status}`,
    `Tracker updated: ${result.tracker_updated ? 'yes' : 'no'}`,
    `Reason: ${result.reason}`,
    `Task: ${result.task_title || result.task_id || 'unresolved'}`,
    `Repository: ${result.repository || 'unresolved'}`,
    `PR: ${result.pr_number || 'unresolved'}`,
    `PR URL: ${result.pr_url || 'unresolved'}`,
    `Merge SHA: ${result.merge_sha || 'unresolved'}`,
    `Previous task status: ${result.previous_task_status || 'unresolved'}`,
    `Next task status: ${result.next_task_status || 'unresolved'}`,
    `Evaluated at: ${result.evaluated_at}`,
    '',
    `Message: ${result.message}`,
    '',
    'Completion requires successful guarded merge evidence and does not merge, push, or change branch protection.',
    '',
  ].join('\n')}\n`;
}

function mergeCompletionIntoLedger(existing, result, timestamp = nowIso()) {
  const ledger =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};

  ledger.merged_pr_completion = {
    status: result.status,
    tracker_updated: result.tracker_updated,
    reason: result.reason,
    message: result.message,
    task_id: result.task_id,
    task_title: result.task_title,
    repository: result.repository,
    pr_number: result.pr_number,
    pr_url: result.pr_url,
    merge_sha: result.merge_sha,
    evaluated_at: result.evaluated_at,
  };
  ledger.updated_at = timestamp;
  ledger.events = Array.isArray(ledger.events) ? ledger.events.slice() : [];
  ledger.events.push({
    timestamp,
    type: result.status,
    message: result.message,
  });

  return ledger;
}

function writeOutputs(result, options = {}) {
  const resultFile = options.resultFile || DEFAULT_RESULT_FILE;
  const summaryFile = options.summaryFile || DEFAULT_SUMMARY_FILE;
  const ledgerFile = options.ledgerFile || DEFAULT_LEDGER_FILE;

  writeJson(resultFile, result);
  writeText(summaryFile, buildMarkdownSummary(result));
  const existingLedger = readJsonIfExists(ledgerFile) || {};
  writeJson(ledgerFile, mergeCompletionIntoLedger(existingLedger, result));
  return { resultFile, summaryFile, ledgerFile };
}

async function main() {
  try {
    const args = watcher.parseArgs(process.argv.slice(2));
    const options = resolveRuntimeOptions(args);
    const result = await completeMergedPrTask(options);
    const artifacts = writeOutputs(result, options);

    if (options.json) {
      console.log(JSON.stringify({ result, artifacts }, null, 2));
    } else {
      console.log(`Merged PR task completion result: ${result.status}`);
      console.log(`Result JSON: ${path.resolve(artifacts.resultFile)}`);
      console.log(`Summary Markdown: ${path.resolve(artifacts.summaryFile)}`);
      console.log(`Run ledger: ${path.resolve(artifacts.ledgerFile)}`);
    }

    if (
      ![
        'merged_pr_completion_planned',
        'merged_pr_task_completed',
        'merged_pr_task_already_done',
      ].includes(result.status)
    ) {
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(`::error::${error && error.message ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_GUARDED_MERGE_RESULT_FILE,
  DEFAULT_LEDGER_FILE,
  DEFAULT_RESULT_FILE,
  DEFAULT_SUMMARY_FILE,
  LIVE_CONFIRMATION,
  buildCompletionEvidence,
  buildCompletionPatch,
  buildMarkdownSummary,
  completeMergedPrTask,
  mergeCompletionIntoLedger,
  resolveRuntimeOptions,
  validatePreconditions,
  writeOutputs,
};
