#!/usr/bin/env node
'use strict';

/**
 * ENG-LOOP-35 - merged PR task completion.
 *
 * After guarded merge evidence exists, this script verifies that the merge
 * commit is reachable from the latest remote base branch, marks the linked
 * Notion task Done exactly once, and records durable completion evidence.
 * Notion is the sole progress source; no repository progress snapshot is
 * generated or maintained by this workflow.
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
const LIVE_CONFIRMATION = 'ENG-LOOP-35-COMPLETE';
const GIT_COMMAND_TIMEOUT_MS = 30_000;

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
    case 'email':
      return property.email || '';
    case 'phone_number':
      return property.phone_number || '';
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

function snapshotPropertyPatch(property) {
  if (!property || !property.type) return { rich_text: [] };

  switch (property.type) {
    case 'status':
      return { status: property.status ? { ...property.status } : null };
    case 'select':
      return { select: property.select ? { ...property.select } : null };
    case 'rich_text':
      return {
        rich_text: Array.isArray(property.rich_text) ? property.rich_text : [],
      };
    case 'title':
      return { title: Array.isArray(property.title) ? property.title : [] };
    case 'checkbox':
      return { checkbox: Boolean(property.checkbox) };
    case 'url':
      return { url: property.url ?? null };
    case 'email':
      return { email: property.email ?? null };
    case 'phone_number':
      return { phone_number: property.phone_number ?? null };
    case 'number':
      return { number: property.number ?? null };
    case 'date':
      return { date: property.date ? { ...property.date } : null };
    default:
      return runner.propertyPatchFromExistingProperty(property, textFromProperty(property));
  }
}

function comparablePropertyValue(property) {
  if (!property) return null;
  if (property.type === 'checkbox') return Boolean(property.checkbox);
  if (property.type === 'number') return property.number ?? null;
  if (property.type === 'date') {
    return property.date
      ? `${property.date.start || ''}|${property.date.end || ''}|${property.date.time_zone || ''}`
      : null;
  }
  return textFromProperty(property);
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
    tracker_state_unknown: Boolean(extra.trackerStateUnknown),
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
    base_branch_refreshed: Boolean(extra.baseBranchRefreshed),
    base_branch_refresh_source: extra.baseBranchRefreshSource || null,
    merge_commit_reachable: extra.mergeCommitReachable ?? null,
    merge_commit_reachability_source: extra.mergeCommitReachabilitySource || null,
    rollback_attempted: Boolean(extra.rollbackAttempted),
    rollback_succeeded: extra.rollbackSucceeded ?? null,
    rollback_error: extra.rollbackError || null,
    progress_source: 'notion',
    non_goals: [
      'does_not_merge',
      'does_not_push',
      'does_not_change_branch_protection',
      'does_not_complete_unmerged_tasks',
      'does_not_mutate_unknown_tracker_fields',
      'does_not_generate_repository_progress_snapshots',
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

function assertSafeBranchName(baseBranch) {
  const value = normalizeText(baseBranch);
  if (
    !value ||
    !/^[A-Za-z0-9._/-]+$/.test(value) ||
    value.includes('..') ||
    value.includes('@{') ||
    value.startsWith('/') ||
    value.endsWith('/')
  ) {
    throw new Error(`Unsafe base branch name: ${baseBranch}`);
  }
  return value;
}

function refreshBaseBranchRef({ baseBranch, cwd, execFileSync = childProcess.execFileSync }) {
  const safeBaseBranch = assertSafeBranchName(baseBranch);
  const shallow = normalizeComparable(
    execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_COMMAND_TIMEOUT_MS,
    }),
  );
  const fetchArgs = ['fetch', '--no-tags', '--prune'];
  if (shallow === 'true') fetchArgs.push('--unshallow');
  fetchArgs.push('origin', `+refs/heads/${safeBaseBranch}:refs/remotes/origin/${safeBaseBranch}`);
  execFileSync('git', fetchArgs, {
    cwd,
    stdio: 'ignore',
    timeout: GIT_COMMAND_TIMEOUT_MS,
  });

  return {
    refreshed: true,
    source: `git ${fetchArgs.join(' ')}`,
    remoteRef: `origin/${safeBaseBranch}`,
  };
}

function checkMergeCommitReachable(options, dependencies = {}) {
  const mergeSha =
    options.guardedMergeResult &&
    options.guardedMergeResult.github_response &&
    options.guardedMergeResult.github_response.sha;
  const baseBranch = assertSafeBranchName(options.baseBranch || 'develop');

  if (!mergeSha) {
    return {
      reachable: false,
      refreshed: false,
      refreshSource: null,
      source: 'git',
      message: 'Merge SHA is missing.',
    };
  }

  if (dependencies.checkMergeCommitReachable) {
    return dependencies.checkMergeCommitReachable({
      mergeSha,
      baseBranch,
      cwd: dependencies.cwd,
    });
  }

  const cwd = dependencies.cwd || process.cwd();
  const execFileSync = dependencies.execFileSync || childProcess.execFileSync;
  let refresh;
  try {
    refresh = (dependencies.refreshBaseBranchRef || refreshBaseBranchRef)({
      baseBranch,
      cwd,
      execFileSync,
    });
  } catch (error) {
    return {
      reachable: false,
      refreshed: false,
      refreshSource: null,
      source: 'git fetch',
      message: `Unable to refresh origin/${baseBranch}: ${error && error.message ? error.message : String(error)}`,
    };
  }

  const candidates = [refresh.remoteRef || `origin/${baseBranch}`, baseBranch];
  const errors = [];
  for (const candidate of candidates) {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', mergeSha, candidate], {
        cwd,
        stdio: 'ignore',
        timeout: GIT_COMMAND_TIMEOUT_MS,
      });
      return {
        reachable: true,
        refreshed: true,
        refreshSource: refresh.source,
        source: `git merge-base --is-ancestor ${mergeSha} ${candidate}`,
        message: `Merge commit is reachable from ${candidate}.`,
      };
    } catch (error) {
      errors.push(`${candidate}: ${error.status == null ? 'failed' : `exit ${error.status}`}`);
    }
  }

  return {
    reachable: false,
    refreshed: true,
    refreshSource: refresh.source,
    source: 'git merge-base --is-ancestor',
    message: `Merge commit ${mergeSha} is not reachable from ${baseBranch}. ${errors.join('; ')}`,
  };
}

function buildCompletionEvidence({ task, result, timestamp }) {
  const parts = [
    `${timestamp} - engineering-loop - PR merged; Notion task completion recorded.`,
    `Task: ${task.title || task.id}.`,
    `PR: ${result.pr_number || 'unresolved'}.`,
  ];
  if (result.pr_url) parts.push(`URL: ${result.pr_url}.`);
  if (result.merge_sha) parts.push(`Merge SHA: ${result.merge_sha}.`);
  parts.push('Evidence: deterministic merge gate passed and merge SHA is reachable from develop.');
  parts.push('Progress source: Notion.');
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

function buildRollbackPatch(page, completionPatch) {
  const properties = page.properties ?? {};
  return Object.fromEntries(
    Object.keys(completionPatch).map((name) => [name, snapshotPropertyPatch(properties[name])]),
  );
}

function createTaskClient(options = {}) {
  return new runner.NotionTaskClient({
    token: options.token,
    databaseId: options.databaseId,
    maxTasks: 1,
  });
}

function verifyRestoredProperties(originalPage, restoredPage, propertyNames) {
  const original = originalPage.properties ?? {};
  const restored = restoredPage.properties ?? {};
  for (const name of propertyNames) {
    if (comparablePropertyValue(original[name]) !== comparablePropertyValue(restored[name])) {
      throw new Error(`Rollback verification failed for Notion property: ${name}.`);
    }
  }
}

async function rollbackCompletion({ client, taskId, rollbackPatch, originalPage }) {
  await client.updatePageProperties(taskId, rollbackPatch);
  const restoredPage = await client.fetchPage(taskId);
  verifyRestoredProperties(originalPage, restoredPage, Object.keys(rollbackPatch));
  return runner.taskFromPage(restoredPage);
}

function commonCompletionEvidence({ task, baseResult, reachability, timestamp }) {
  return {
    evaluatedAt: timestamp,
    taskTitle: task.title,
    previousTaskStatus: task.status,
    prUrl: baseResult.pr_url,
    baseBranchRefreshed: Boolean(reachability.refreshed),
    baseBranchRefreshSource: reachability.refreshSource,
    mergeCommitReachable: true,
    mergeCommitReachabilitySource: reachability.source,
  };
}

async function rollbackFailure({
  client,
  task,
  originalPage,
  rollbackPatch,
  options,
  baseResult,
  reachability,
  timestamp,
  reason,
  message,
}) {
  try {
    await rollbackCompletion({
      client,
      taskId: task.id,
      rollbackPatch,
      originalPage,
    });
    return buildResult(
      'merged_pr_completion_failed',
      reason,
      `${message} The original Notion state was restored.`,
      options,
      {
        ...commonCompletionEvidence({
          task,
          baseResult,
          reachability,
          timestamp,
        }),
        nextTaskStatus: task.status,
        rollbackAttempted: true,
        rollbackSucceeded: true,
        trackerUpdated: false,
      },
    );
  } catch (rollbackError) {
    return buildResult(
      'merged_pr_completion_failed',
      'completion_rollback_failed',
      `${message} The compensating rollback could not be verified.`,
      options,
      {
        ...commonCompletionEvidence({
          task,
          baseResult,
          reachability,
          timestamp,
        }),
        nextTaskStatus: 'unknown',
        rollbackAttempted: true,
        rollbackSucceeded: false,
        rollbackError:
          rollbackError && rollbackError.message ? rollbackError.message : String(rollbackError),
        trackerUpdated: false,
        trackerStateUnknown: true,
      },
    );
  }
}

async function completeMergedPrTask(options, dependencies = {}) {
  const preconditionFailure = validatePreconditions(options);
  if (preconditionFailure) return preconditionFailure;

  const reachability = checkMergeCommitReachable(options, dependencies);
  if (!reachability.reachable) {
    return blocked('merge_commit_not_on_develop', reachability.message, options, {
      evaluatedAt: dependencies.now ? dependencies.now() : nowIso(),
      baseBranchRefreshed: Boolean(reachability.refreshed),
      baseBranchRefreshSource: reachability.refreshSource,
      mergeCommitReachable: false,
      mergeCommitReachabilitySource: reachability.source,
    });
  }

  const evaluatedAt = dependencies.now ? dependencies.now() : nowIso();
  const baseResult = buildResult(
    options.mode === 'dry-run' ? 'merged_pr_completion_planned' : 'merged_pr_completion_ready',
    options.mode === 'dry-run' ? 'dry_run_only' : 'preconditions_passed',
    options.mode === 'dry-run'
      ? 'Merged PR completion is eligible. No Notion mutation performed in dry-run mode.'
      : 'Merged PR completion preconditions passed.',
    options,
    {
      evaluatedAt,
      baseBranchRefreshed: Boolean(reachability.refreshed),
      baseBranchRefreshSource: reachability.refreshSource,
      mergeCommitReachable: true,
      mergeCommitReachabilitySource: reachability.source,
    },
  );
  if (options.mode === 'dry-run') return baseResult;

  const client = dependencies.client || createTaskClient(options);
  let page;
  try {
    page = await client.fetchPage(options.taskId);
  } catch (error) {
    return buildResult(
      'merged_pr_completion_failed',
      'notion_task_read_failed',
      error && error.message ? error.message : 'Unable to read the linked Notion task.',
      options,
      {
        evaluatedAt,
        prUrl: baseResult.pr_url,
        baseBranchRefreshed: Boolean(reachability.refreshed),
        baseBranchRefreshSource: reachability.refreshSource,
        mergeCommitReachable: true,
        mergeCommitReachabilitySource: reachability.source,
        trackerUpdated: false,
      },
    );
  }

  const task = runner.taskFromPage(page);
  const currentStatus = normalizeComparable(task.status);
  const common = commonCompletionEvidence({
    task,
    baseResult,
    reachability,
    timestamp: evaluatedAt,
  });

  if (currentStatus === 'done') {
    return buildResult(
      'merged_pr_task_already_done',
      'task_already_done',
      'Task is already Done. No Notion mutation performed.',
      options,
      { ...common, nextTaskStatus: task.status, trackerUpdated: false },
    );
  }
  if (currentStatus !== 'in progress') {
    return blocked(
      'unsupported_task_status',
      `Task completion requires Status to be In Progress. Received: ${task.status || '(empty)'}.`,
      options,
      common,
    );
  }

  const patch = buildCompletionPatch(page, baseResult, evaluatedAt);
  const rollbackPatch = buildRollbackPatch(page, patch);
  try {
    await client.updatePageProperties(task.id, patch);
  } catch (error) {
    return rollbackFailure({
      client,
      task,
      originalPage: page,
      rollbackPatch,
      options,
      baseResult,
      reachability,
      timestamp: evaluatedAt,
      reason: 'notion_update_failed_rolled_back',
      message: `The Notion update returned an error and its outcome was treated as ambiguous: ${
        error && error.message ? error.message : String(error)
      }`,
    });
  }

  let updatedPage;
  try {
    updatedPage = await client.fetchPage(task.id);
  } catch (error) {
    return rollbackFailure({
      client,
      task,
      originalPage: page,
      rollbackPatch,
      options,
      baseResult,
      reachability,
      timestamp: evaluatedAt,
      reason: 'completion_verification_failed',
      message: `Completion verification could not read the updated task: ${
        error && error.message ? error.message : String(error)
      }`,
    });
  }

  const updatedTask = runner.taskFromPage(updatedPage);
  if (normalizeComparable(updatedTask.status) !== 'done') {
    return rollbackFailure({
      client,
      task,
      originalPage: page,
      rollbackPatch,
      options,
      baseResult,
      reachability,
      timestamp: evaluatedAt,
      reason: 'completion_verification_failed',
      message: `Completion verification expected Done but received ${
        updatedTask.status || '(empty)'
      }.`,
    });
  }

  return buildResult(
    'merged_pr_task_completed',
    'tracker_status_updated',
    'Merged PR Notion task completion completed.',
    options,
    {
      ...common,
      taskTitle: updatedTask.title || task.title,
      nextTaskStatus: updatedTask.status,
    },
  );
}

function buildMarkdownSummary(result) {
  return `${[
    '## Merged PR Task Completion',
    '',
    `Status: ${result.status}`,
    `Notion task updated: ${result.tracker_updated ? 'yes' : 'no'}`,
    `Notion task state unknown: ${result.tracker_state_unknown ? 'yes' : 'no'}`,
    `Reason: ${result.reason}`,
    `Task: ${result.task_title || result.task_id || 'unresolved'}`,
    `Repository: ${result.repository || 'unresolved'}`,
    `PR: ${result.pr_number || 'unresolved'}`,
    `PR URL: ${result.pr_url || 'unresolved'}`,
    `Merge SHA: ${result.merge_sha || 'unresolved'}`,
    `Required checks passed: ${result.required_checks_passed ? 'yes' : 'no'}`,
    `Base branch ref refreshed: ${result.base_branch_refreshed ? 'yes' : 'no'}`,
    `Merge commit reachable from ${result.base_branch || 'develop'}: ${
      result.merge_commit_reachable ? 'yes' : 'no'
    }`,
    `Rollback attempted: ${result.rollback_attempted ? 'yes' : 'no'}`,
    `Rollback succeeded: ${
      result.rollback_succeeded == null
        ? 'not applicable'
        : result.rollback_succeeded
          ? 'yes'
          : 'no'
    }`,
    `Progress source: ${result.progress_source}`,
    `Previous task status: ${result.previous_task_status || 'unresolved'}`,
    `Next task status: ${result.next_task_status || 'unresolved'}`,
    `Evaluated at: ${result.evaluated_at}`,
    '',
    `Message: ${result.message}`,
    '',
    'Completion requires successful guarded merge evidence and does not merge, push, change branch protection, or generate repository progress snapshots.',
    '',
  ].join('\n')}\n`;
}

function mergeCompletionIntoLedger(existing, result, timestamp = nowIso()) {
  const ledger =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
  ledger.merged_pr_completion = {
    status: result.status,
    tracker_updated: result.tracker_updated,
    tracker_state_unknown: result.tracker_state_unknown,
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
    base_branch_refreshed: result.base_branch_refreshed,
    base_branch_refresh_source: result.base_branch_refresh_source,
    merge_commit_reachable: result.merge_commit_reachable,
    merge_commit_reachability_source: result.merge_commit_reachability_source,
    rollback_attempted: result.rollback_attempted,
    rollback_succeeded: result.rollback_succeeded,
    rollback_error: result.rollback_error,
    progress_source: result.progress_source,
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

if (require.main === module) main();

module.exports = {
  DEFAULT_GUARDED_MERGE_RESULT_FILE,
  DEFAULT_LEDGER_FILE,
  DEFAULT_RESULT_FILE,
  DEFAULT_SUMMARY_FILE,
  GIT_COMMAND_TIMEOUT_MS,
  LIVE_CONFIRMATION,
  assertSafeBranchName,
  buildCompletionEvidence,
  buildCompletionPatch,
  buildMarkdownSummary,
  buildRollbackPatch,
  checkMergeCommitReachable,
  completeMergedPrTask,
  mergeCompletionIntoLedger,
  refreshBaseBranchRef,
  resolveRuntimeOptions,
  rollbackCompletion,
  snapshotPropertyPatch,
  validatePreconditions,
  verifyRestoredProperties,
  writeOutputs,
};
