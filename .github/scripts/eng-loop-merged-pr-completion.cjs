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
const childProcess = require('node:child_process');
const runner = require('./eng-loop-runner.cjs');
const watcher = require('./eng-loop-ci-status-watcher.cjs');

const DEFAULT_GUARDED_MERGE_RESULT_FILE = '.tmp/pr-guarded-merge-result.json';
const DEFAULT_LEDGER_FILE = '.tmp/eng-loop-run-ledger.json';
const DEFAULT_RESULT_FILE = '.tmp/eng-loop-merged-pr-completion-result.json';
const DEFAULT_SUMMARY_FILE = '.tmp/eng-loop-merged-pr-completion-summary.md';
const DEFAULT_PROGRESS_TRACKER_FILE = 'docs/progress-tracker.md';
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

function textFromRichText(items) {
  if (!Array.isArray(items)) return '';
  return items
    .map((item) => (item && (item.plain_text || (item.text && item.text.content))) || '')
    .join('');
}

function textFromProperty(property) {
  if (!property) return '';

  if (
    typeof property === 'string' ||
    typeof property === 'number' ||
    typeof property === 'boolean'
  ) {
    return String(property);
  }

  switch (property.type) {
    case 'title':
      return textFromRichText(property.title);
    case 'rich_text':
      return textFromRichText(property.rich_text);
    case 'select':
      return property.select && property.select.name ? property.select.name : '';
    case 'status':
      return property.status && property.status.name ? property.status.name : '';
    case 'checkbox':
      return property.checkbox ? 'true' : 'false';
    case 'url':
      return property.url || '';
    case 'number':
      return property.number == null ? '' : String(property.number);
    case 'date':
      return property.date && property.date.start ? property.date.start : '';
    default:
      if ('name' in property) return String(property.name || '');
      if ('plain_text' in property) return String(property.plain_text || '');
      if ('value' in property) return String(property.value || '');
      return '';
  }
}

function getPagePropertyText(page, names) {
  const properties = page && page.properties ? page.properties : page || {};
  const name = firstPropertyName(properties, names);
  return name ? normalizeText(textFromProperty(properties[name])) : '';
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
    progressTrackerFile: args.progressTracker || DEFAULT_PROGRESS_TRACKER_FILE,
    baseBranch: args.baseBranch || env.INPUT_COMPLETION_BASE_BRANCH || 'develop',
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
    refreshProgressTracker: !Boolean(args.skipProgressTrackerRefresh),
  };
}

function buildResult(status, reason, message, options, extra = {}) {
  const merge = options.guardedMergeResult || {};
  const mergeSha =
    merge.github_response && merge.github_response.sha ? merge.github_response.sha : null;
  const repository = merge.repository || extra.repository || null;

  return {
    status,
    tracker_updated: extra.trackerUpdated ?? status === 'merged_pr_task_completed',
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
    merge_gate_status: merge.gate_status || null,
    merge_gate_allowed: Boolean(merge.gate_merge_allowed),
    required_checks_passed: Boolean(
      merge.gate_merge_allowed && merge.gate_status === 'merge_gate_passed',
    ),
    base_branch: options.baseBranch || null,
    merge_commit_reachable: extra.mergeCommitReachable ?? null,
    merge_commit_reachability_source: extra.mergeCommitReachabilitySource || null,
    progress_tracker_refreshed: Boolean(extra.progressTrackerRefreshed),
    progress_tracker_path: extra.progressTrackerPath || options.progressTrackerFile || null,
    progress_tracker_error: extra.progressTrackerError || null,
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

  if (
    options.guardedMergeResult.gate_status !== 'merge_gate_passed' ||
    options.guardedMergeResult.gate_merge_allowed !== true
  ) {
    return blocked(
      'required_checks_not_confirmed',
      'Task completion requires guarded merge evidence from a passing deterministic merge gate.',
      options,
    );
  }

  const mergeSha =
    options.guardedMergeResult.github_response && options.guardedMergeResult.github_response.sha;
  if (!mergeSha) {
    return blocked(
      'merge_sha_missing',
      'Task completion requires the guarded merge commit SHA.',
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

function checkMergeCommitReachable(options, dependencies = {}) {
  const mergeSha =
    options.guardedMergeResult &&
    options.guardedMergeResult.github_response &&
    options.guardedMergeResult.github_response.sha;
  const baseBranch = options.baseBranch || 'develop';

  if (!mergeSha) {
    return {
      reachable: false,
      source: 'git',
      message: 'Merge SHA is missing.',
    };
  }

  if (dependencies.checkMergeCommitReachable) {
    return dependencies.checkMergeCommitReachable({ mergeSha, baseBranch, cwd: dependencies.cwd });
  }

  const cwd = dependencies.cwd || process.cwd();
  const candidates = [baseBranch, `origin/${baseBranch}`];
  const errors = [];

  for (const candidate of candidates) {
    try {
      childProcess.execFileSync('git', ['merge-base', '--is-ancestor', mergeSha, candidate], {
        cwd,
        stdio: 'ignore',
      });
      return {
        reachable: true,
        source: `git merge-base --is-ancestor ${mergeSha} ${candidate}`,
        message: `Merge commit is reachable from ${candidate}.`,
      };
    } catch (error) {
      errors.push(`${candidate}: ${error.status == null ? 'failed' : `exit ${error.status}`}`);
    }
  }

  return {
    reachable: false,
    source: 'git merge-base --is-ancestor',
    message: `Merge commit ${mergeSha} is not reachable from ${baseBranch}. ${errors.join('; ')}`,
  };
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
    maxTasks: options.maxTasks || 500,
  });
}

function statusCheckbox(status) {
  return normalizeComparable(status) === 'done' ? 'x' : ' ';
}

function progressTrackerMarkdown(pages, timestamp = nowIso()) {
  const tasks = pages
    .map((page) => {
      const task = runner.taskFromPage(page);
      return {
        ...task,
        milestone: getPagePropertyText(page, ['Milestone', 'milestone']) || 'No milestone',
      };
    })
    .filter((task) => task.title)
    .sort((left, right) => {
      const milestoneCompare = normalizeText(left.milestone).localeCompare(
        normalizeText(right.milestone),
      );
      if (milestoneCompare !== 0) return milestoneCompare;
      return normalizeText(left.title).localeCompare(normalizeText(right.title));
    });

  const statusCounts = new Map();
  const milestoneCounts = new Map();
  for (const task of tasks) {
    const status = task.status || 'Unspecified';
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    if (!milestoneCounts.has(task.milestone)) milestoneCounts.set(task.milestone, new Map());
    const counts = milestoneCounts.get(task.milestone);
    counts.set(status, (counts.get(status) || 0) + 1);
  }

  const lines = [
    '# GarageOS Progress Tracker',
    '',
    `**Last Notion alignment:** ${timestamp.slice(0, 10)}`,
    '**Source of truth:** Notion database `GarageOS - Full Build Task Tracker`',
    '**Repository path:** `docs/progress-tracker.md`',
    '',
    'This tracker is a repository snapshot of the current Notion cards. Notion remains the operational source for live card status; this file should be refreshed whenever Notion card statuses change materially.',
    '',
    '## Status Summary',
    '',
    '| Status | Cards |',
    '| --- | ---: |',
  ];

  for (const [status, count] of [...statusCounts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    lines.push(`| ${status} | ${count} |`);
  }
  lines.push(
    `| **Total tracked cards** | **${tasks.length}** |`,
    '',
    '## Milestone Status Summary',
    '',
  );
  lines.push('| Milestone | Status Summary |');
  lines.push('| --- | --- |');

  for (const [milestone, counts] of [...milestoneCounts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const summary = [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([status, count]) => `${count} ${status}`)
      .join(', ');
    lines.push(`| ${milestone} | ${summary || 'No cards'} |`);
  }

  let currentMilestone = null;
  for (const task of tasks) {
    if (task.milestone !== currentMilestone) {
      currentMilestone = task.milestone;
      lines.push('', `## ${currentMilestone}`, '');
    }
    lines.push(
      `- [${statusCheckbox(task.status)}] **${task.status || 'Unspecified'}** - ${task.title}`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

async function refreshProgressTracker({ client, filePath, timestamp }) {
  const pages = await client.listTaskPages();
  writeText(filePath, progressTrackerMarkdown(pages, timestamp));
  return {
    refreshed: true,
    path: filePath,
    taskCount: pages.length,
  };
}

async function completeMergedPrTask(options, dependencies = {}) {
  const preconditionFailure = validatePreconditions(options);
  if (preconditionFailure) return preconditionFailure;

  const reachability = checkMergeCommitReachable(options, dependencies);
  if (!reachability.reachable) {
    return blocked('merge_commit_not_on_develop', reachability.message, options, {
      evaluatedAt: dependencies.now ? dependencies.now() : nowIso(),
      mergeCommitReachable: false,
      mergeCommitReachabilitySource: reachability.source,
    });
  }

  const baseResult = buildResult(
    options.mode === 'dry-run' ? 'merged_pr_completion_planned' : 'merged_pr_completion_ready',
    options.mode === 'dry-run' ? 'dry_run_only' : 'preconditions_passed',
    options.mode === 'dry-run'
      ? 'Merged PR completion is eligible. No tracker mutation performed in dry-run mode.'
      : 'Merged PR completion preconditions passed.',
    options,
    {
      evaluatedAt: dependencies.now ? dependencies.now() : nowIso(),
      mergeCommitReachable: true,
      mergeCommitReachabilitySource: reachability.source,
    },
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
        mergeCommitReachable: true,
        mergeCommitReachabilitySource: reachability.source,
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
        mergeCommitReachable: true,
        mergeCommitReachabilitySource: reachability.source,
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
        mergeCommitReachable: true,
        mergeCommitReachabilitySource: reachability.source,
      },
    );
  }

  let trackerRefresh = { refreshed: false, path: options.progressTrackerFile };
  if (options.refreshProgressTracker !== false) {
    try {
      trackerRefresh = await (dependencies.refreshProgressTracker || refreshProgressTracker)({
        client,
        filePath: options.progressTrackerFile,
        timestamp,
      });
    } catch (error) {
      return buildResult(
        'merged_pr_completion_failed',
        'progress_tracker_refresh_failed',
        error && error.message ? error.message : 'Progress tracker refresh failed.',
        options,
        {
          evaluatedAt: timestamp,
          taskTitle: updatedTask.title || task.title,
          previousTaskStatus: task.status,
          nextTaskStatus: updatedTask.status,
          prUrl: baseResult.pr_url,
          mergeCommitReachable: true,
          mergeCommitReachabilitySource: reachability.source,
          progressTrackerPath: options.progressTrackerFile,
          progressTrackerError: error && error.message ? error.message : String(error),
          trackerUpdated: true,
        },
      );
    }
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
      mergeCommitReachable: true,
      mergeCommitReachabilitySource: reachability.source,
      progressTrackerRefreshed: Boolean(trackerRefresh.refreshed),
      progressTrackerPath: trackerRefresh.path || options.progressTrackerFile,
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
    `Required checks passed: ${result.required_checks_passed ? 'yes' : 'no'}`,
    `Merge commit reachable from ${result.base_branch || 'develop'}: ${
      result.merge_commit_reachable ? 'yes' : 'no'
    }`,
    `Progress tracker refreshed: ${result.progress_tracker_refreshed ? 'yes' : 'no'}`,
    `Progress tracker path: ${result.progress_tracker_path || 'unresolved'}`,
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
    required_checks_passed: result.required_checks_passed,
    base_branch: result.base_branch,
    merge_commit_reachable: result.merge_commit_reachable,
    merge_commit_reachability_source: result.merge_commit_reachability_source,
    progress_tracker_refreshed: result.progress_tracker_refreshed,
    progress_tracker_path: result.progress_tracker_path,
    progress_tracker_error: result.progress_tracker_error,
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
  DEFAULT_PROGRESS_TRACKER_FILE,
  DEFAULT_RESULT_FILE,
  DEFAULT_SUMMARY_FILE,
  LIVE_CONFIRMATION,
  buildCompletionEvidence,
  buildCompletionPatch,
  buildMarkdownSummary,
  checkMergeCommitReachable,
  completeMergedPrTask,
  mergeCompletionIntoLedger,
  progressTrackerMarkdown,
  refreshProgressTracker,
  resolveRuntimeOptions,
  validatePreconditions,
  writeOutputs,
};
