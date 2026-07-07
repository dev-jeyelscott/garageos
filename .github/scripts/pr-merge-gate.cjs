#!/usr/bin/env node
'use strict';

/**
 * ENG-LOOP-29 - deterministic PR merge gate.
 *
 * This gate is intentionally evidence-only. It reuses the CI status watcher
 * classification and never merges, approves, pushes, or mutates GitHub state.
 */

const fs = require('node:fs');
const path = require('node:path');
const watcher = require('./eng-loop-ci-status-watcher.cjs');
const followUp = require('./eng-loop-follow-up-task.cjs');

const DEFAULT_LEDGER_FILE = '.tmp/eng-loop-run-ledger.json';
const DEFAULT_RESULT_FILE = '.tmp/pr-merge-gate-result.json';
const DEFAULT_SUMMARY_FILE = '.tmp/pr-merge-gate-summary.md';
const DEFAULT_FOLLOW_UP_RESULT_FILE = '.tmp/eng-loop-follow-up-task-result.json';
const DEFAULT_FOLLOW_UP_SUMMARY_FILE = '.tmp/eng-loop-follow-up-task-summary.md';

function nowIso() {
  return new Date().toISOString();
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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function failedReasonFromCiResult(ciResult) {
  if (!ciResult || typeof ciResult !== 'object') return 'ci_result_missing';
  if (ciResult.status === 'ci_passed' && ciResult.safe_to_mark_done === true) return 'passed';
  if (asArray(ciResult.failed_checks).length > 0) return 'required_check_failed';
  if (asArray(ciResult.cancelled_checks).length > 0) return 'required_check_cancelled';
  if (asArray(ciResult.timed_out_checks).length > 0) return 'required_check_timed_out';
  if (asArray(ciResult.pending_checks).length > 0) return 'required_check_pending';
  if (asArray(ciResult.missing_required_checks).length > 0) return 'required_check_missing';
  if (asArray(ciResult.unknown_checks).length > 0) return 'required_check_unknown';
  return ciResult.status || 'ci_not_passed';
}

function buildMergeGateResult(ciResult, options = {}) {
  const evaluatedAt = options.evaluatedAt || nowIso();
  const passed = ciResult && ciResult.status === 'ci_passed' && ciResult.safe_to_mark_done === true;
  const reason = passed ? 'all_required_checks_passed' : failedReasonFromCiResult(ciResult);

  return {
    status: passed ? 'merge_gate_passed' : 'merge_gate_blocked',
    merge_allowed: passed,
    reason,
    message: passed
      ? 'Deterministic required checks passed. This does not perform a merge.'
      : 'Deterministic required checks are not all passing. Merge must remain blocked.',
    evaluated_at: evaluatedAt,
    repository: ciResult ? ciResult.repository || null : null,
    branch: ciResult ? ciResult.branch || null : null,
    pr_number: ciResult ? ciResult.pr_number || null : null,
    head_sha: ciResult ? ciResult.head_sha || null : null,
    required_checks: ciResult ? ciResult.required_checks || [] : [],
    ci_status: ciResult
      ? {
          status: ciResult.status,
          message: ciResult.message || null,
          safe_to_mark_done: Boolean(ciResult.safe_to_mark_done),
          missing_required_checks: ciResult.missing_required_checks || [],
          failed_checks: ciResult.failed_checks || [],
          pending_checks: ciResult.pending_checks || [],
          cancelled_checks: ciResult.cancelled_checks || [],
          timed_out_checks: ciResult.timed_out_checks || [],
          unknown_checks: ciResult.unknown_checks || [],
          checked_at: ciResult.checked_at || null,
        }
      : null,
    source: 'eng-loop-ci-status-watcher',
    non_goals: [
      'does_not_merge',
      'does_not_approve',
      'does_not_push',
      'does_not_change_branch_protection',
      'does_not_make_ai_review_authoritative',
    ],
  };
}

function buildMarkdownSummary(result) {
  const lines = [
    '## PR Merge Gate',
    '',
    `Status: ${result.status}`,
    `Merge allowed: ${result.merge_allowed ? 'yes' : 'no'}`,
    `Reason: ${result.reason}`,
    `Repository: ${result.repository || 'unresolved'}`,
    `Branch: ${result.branch || 'unresolved'}`,
    `PR: ${result.pr_number || 'unresolved'}`,
    `Head SHA: ${result.head_sha || 'unresolved'}`,
    `Evaluated at: ${result.evaluated_at}`,
    '',
    `Message: ${result.message}`,
    '',
    '### Deterministic Required Checks',
    '',
  ];

  if (result.required_checks.length === 0) {
    lines.push('- No required checks were resolved.');
  } else {
    for (const check of result.required_checks) {
      const state = check.classification || check.conclusion || check.state || check.status;
      lines.push(
        `- ${check.name}: ${state}${check.matched_name ? ` (${check.matched_name})` : ''}`,
      );
    }
  }

  lines.push('', 'AI PR review remains advisory and is not evaluated by this gate.', '');
  return `${lines.join('\n')}\n`;
}

function mergeGateIntoLedger(existing, result, timestamp = nowIso()) {
  const ledger =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};

  ledger.pr_merge_gate = {
    status: result.status,
    merge_allowed: result.merge_allowed,
    reason: result.reason,
    message: result.message,
    repository: result.repository,
    branch: result.branch,
    pr_number: result.pr_number,
    head_sha: result.head_sha,
    evaluated_at: result.evaluated_at,
    required_checks: result.required_checks,
    ci_status: result.ci_status,
  };
  ledger.updated_at = timestamp;
  ledger.events = Array.isArray(ledger.events) ? ledger.events.slice() : [];
  ledger.events.push({
    timestamp,
    type: result.merge_allowed ? 'pr_merge_gate_passed' : 'pr_merge_gate_blocked',
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

  const existingLedger = watcher.readJsonIfExists(ledgerFile) || {};
  writeJson(ledgerFile, mergeGateIntoLedger(existingLedger, result));

  return { resultFile, summaryFile, ledgerFile };
}

function buildMergeGateFollowUpInput(result, options = {}) {
  const taskFile = options.taskFile || '.tmp/eng-loop-task.json';
  const task = watcher.readJsonIfExists(path.resolve(options.cwd || process.cwd(), taskFile)) || {};
  const sourceTask = followUp.sourceTaskFromJson(task.task || task);
  const ciStatus = result && result.ci_status ? result.ci_status : {};

  return {
    source: 'ci',
    sourceTask,
    task,
    ledgerPath: options.ledgerFile || DEFAULT_LEDGER_FILE,
    ci: {
      status: ciStatus.status || 'metadata_unresolved',
      message: ciStatus.message || (result ? result.message : 'PR merge gate failed.'),
      safe_to_mark_done: Boolean(ciStatus.safe_to_mark_done),
      repository: result ? result.repository : null,
      branch: result ? result.branch : null,
      pr_number: result ? result.pr_number : null,
      head_sha: result ? result.head_sha : null,
      required_checks: result ? result.required_checks || [] : [],
      missing_required_checks: ciStatus.missing_required_checks || [],
      failed_checks: ciStatus.failed_checks || [],
      pending_checks: ciStatus.pending_checks || [],
      cancelled_checks: ciStatus.cancelled_checks || [],
      timed_out_checks: ciStatus.timed_out_checks || [],
      unknown_checks: ciStatus.unknown_checks || [],
    },
    validationCommand:
      options.followUpValidationCommand || 'node ./.github/scripts/pr-merge-gate.cjs',
  };
}

function createFollowUpClient(options = {}) {
  return new followUp.NotionFollowUpClient({
    token:
      options.notionToken ||
      options.token ||
      process.env.GARAGEOS_NOTION_TOKEN ||
      process.env.NOTION_TOKEN,
    databaseId:
      options.notionDatabaseId ||
      options.databaseId ||
      process.env.GARAGEOS_NOTION_TASK_DATABASE_ID ||
      process.env.NOTION_TASK_DATABASE_ID ||
      process.env.NOTION_DATABASE_ID,
  });
}

function parseBooleanOption(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

async function createFollowUpForMergeGateFailure(result, options = {}, dependencies = {}) {
  if (!result || result.merge_allowed) return null;

  const input = buildMergeGateFollowUpInput(result, options);
  const decision = followUp.shouldCreateFollowUp(input);
  if (!decision.create) return null;

  let followUpResult;
  try {
    followUpResult = await followUp.executeFollowUpCreation(input, {
      dryRun: Boolean(options.followUpDryRun),
      client:
        dependencies.followUpClient ||
        options.followUpClient ||
        (options.followUpDryRun ? null : createFollowUpClient(options)),
      now: dependencies.now,
    });
  } catch (error) {
    followUpResult = {
      status: 'failed',
      reason: 'follow_up_creation_failed',
      fingerprint: null,
      task_title: null,
      task_url: null,
      created_at: dependencies.now ? dependencies.now() : nowIso(),
      message: error && error.message ? error.message : String(error),
    };
    const artifacts = followUp.writeOutputs(followUpResult, {
      resultFile: options.followUpResultFile || DEFAULT_FOLLOW_UP_RESULT_FILE,
      summaryFile: options.followUpSummaryFile || DEFAULT_FOLLOW_UP_SUMMARY_FILE,
      ledgerFile: options.ledgerFile || DEFAULT_LEDGER_FILE,
    });
    error.followUpOutcome = { input, result: followUpResult, artifacts };
    throw error;
  }

  const artifacts = followUp.writeOutputs(followUpResult, {
    resultFile: options.followUpResultFile || DEFAULT_FOLLOW_UP_RESULT_FILE,
    summaryFile: options.followUpSummaryFile || DEFAULT_FOLLOW_UP_SUMMARY_FILE,
    ledgerFile: options.ledgerFile || DEFAULT_LEDGER_FILE,
  });

  return {
    input,
    result: followUpResult,
    artifacts,
  };
}

function resolveGateOptions(args, cwd = process.cwd()) {
  const followUpRequested = parseBooleanOption(args.followUp, true);
  const watcherOptions = watcher.resolveRuntimeOptions(
    {
      ...args,
      once: args.once === undefined ? true : args.once,
      out: args.ciOut || args.ciOutput || '.tmp/eng-loop-ci-status-result.json',
      summary: args.ciSummary || '.tmp/eng-loop-ci-status-summary.md',
      ledger: args.ledger || DEFAULT_LEDGER_FILE,
    },
    cwd,
  );

  return {
    watcherOptions,
    resultFile: args.out || args.output || DEFAULT_RESULT_FILE,
    summaryFile: args.summary || DEFAULT_SUMMARY_FILE,
    ledgerFile: args.ledger || DEFAULT_LEDGER_FILE,
    taskFile: args.task || '.tmp/eng-loop-task.json',
    followUpEnabled: followUpRequested && !Boolean(args.skipFollowUp),
    followUpDryRun: Boolean(args.followUpDryRun),
    followUpResultFile: args.followUpOut || args.followUpOutput || DEFAULT_FOLLOW_UP_RESULT_FILE,
    followUpSummaryFile: args.followUpSummary || DEFAULT_FOLLOW_UP_SUMMARY_FILE,
    followUpValidationCommand: args.followUpValidationCommand,
    notionToken: args.notionToken,
    notionDatabaseId: args.notionDatabaseId || args.databaseId,
    cwd,
    json: Boolean(args.json),
  };
}

async function evaluateMergeGate(options, dependencies = {}) {
  let ciResult = dependencies.ciResult;

  if (!ciResult) {
    ciResult = await watcher.runWatcher(options.watcherOptions, dependencies);
    watcher.writeOutputs(ciResult, options.watcherOptions);
  }

  return buildMergeGateResult(ciResult, {
    evaluatedAt: dependencies.now ? dependencies.now() : nowIso(),
  });
}

async function main() {
  const args = watcher.parseArgs(process.argv.slice(2));
  const options = resolveGateOptions(args);
  const result = await evaluateMergeGate(options);
  const artifacts = writeOutputs(result, options);
  const followUpOutcome =
    options.followUpEnabled && !result.merge_allowed
      ? await createFollowUpForMergeGateFailure(result, options)
      : null;

  if (options.json) {
    console.log(JSON.stringify({ result, artifacts, follow_up: followUpOutcome }, null, 2));
  } else {
    console.log(`PR merge gate result: ${result.status}`);
    console.log(`Result JSON: ${path.resolve(artifacts.resultFile)}`);
    console.log(`Summary Markdown: ${path.resolve(artifacts.summaryFile)}`);
    console.log(`Run ledger: ${path.resolve(artifacts.ledgerFile)}`);
    if (followUpOutcome) {
      console.log(`Follow-up task result: ${followUpOutcome.result.status}`);
      console.log(`Follow-up result JSON: ${path.resolve(followUpOutcome.artifacts.resultFile)}`);
      console.log(
        `Follow-up summary Markdown: ${path.resolve(followUpOutcome.artifacts.summaryFile)}`,
      );
    }
  }

  if (!result.merge_allowed) {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`::error::${error && error.message ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_LEDGER_FILE,
  DEFAULT_FOLLOW_UP_RESULT_FILE,
  DEFAULT_FOLLOW_UP_SUMMARY_FILE,
  DEFAULT_RESULT_FILE,
  DEFAULT_SUMMARY_FILE,
  buildMergeGateFollowUpInput,
  buildMarkdownSummary,
  buildMergeGateResult,
  createFollowUpForMergeGateFailure,
  evaluateMergeGate,
  failedReasonFromCiResult,
  mergeGateIntoLedger,
  resolveGateOptions,
  writeOutputs,
};
