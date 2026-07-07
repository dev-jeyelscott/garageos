#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const gate = require('./pr-merge-gate.cjs');
const watcher = require('./eng-loop-ci-status-watcher.cjs');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pr-merge-gate-'));
}

function ciResult(overrides = {}) {
  return {
    status: 'ci_passed',
    message: 'All required GitHub checks passed.',
    repository: 'dev-jeyelscott/garageos',
    branch: 'chore/eng-loop-29-pr-merge-gate',
    pr_number: 29,
    head_sha: 'abc123',
    checked_at: '2026-07-07T00:00:00.000Z',
    safe_to_mark_done: true,
    required_checks: [
      {
        name: 'validation-quick',
        matched_name: 'validation-quick',
        status: 'completed',
        conclusion: 'success',
        classification: 'success',
      },
      {
        name: 'Validate PR evidence',
        matched_name: 'Validate PR evidence',
        status: 'completed',
        conclusion: 'success',
        classification: 'success',
      },
    ],
    missing_required_checks: [],
    failed_checks: [],
    pending_checks: [],
    cancelled_checks: [],
    timed_out_checks: [],
    unknown_checks: [],
    ...overrides,
  };
}

class FakeFollowUpClient {
  constructor() {
    this.created = [];
  }

  async fetchDatabase() {
    return {
      Task: { type: 'title' },
      Status: { type: 'status' },
      'Codex Ready': { type: 'checkbox' },
      Branch: { type: 'rich_text' },
      Repository: { type: 'rich_text' },
      Priority: { type: 'select' },
      Category: { type: 'select' },
      'Item Type': { type: 'select' },
      Milestone: { type: 'select' },
      Dependencies: { type: 'rich_text' },
      'Progress Source': { type: 'rich_text' },
      'Validation Commands': { type: 'rich_text' },
      'Commit Message': { type: 'rich_text' },
    };
  }

  async findExistingFollowUp() {
    return {
      dedupeSafe: true,
      existingPage: null,
    };
  }

  async createFollowUpTask(page) {
    this.created.push(page);
    return {
      id: 'created-follow-up',
      url: 'https://app.notion.com/p/created-follow-up',
    };
  }
}

class FailingFollowUpClient {
  async fetchDatabase() {
    throw new Error('Injected follow-up creation failure.');
  }
}

function testPassingCiAllowsMerge() {
  const result = gate.buildMergeGateResult(ciResult(), {
    evaluatedAt: '2026-07-07T01:00:00.000Z',
  });

  assert.equal(result.status, 'merge_gate_passed');
  assert.equal(result.merge_allowed, true);
  assert.equal(result.reason, 'all_required_checks_passed');
  assert.equal(result.source, 'eng-loop-ci-status-watcher');
  assert.equal(result.non_goals.includes('does_not_merge'), true);
}

function testFailedCheckBlocksMerge() {
  const result = gate.buildMergeGateResult(
    ciResult({
      status: 'ci_failed',
      safe_to_mark_done: false,
      failed_checks: [{ name: 'validation-quick', classification: 'failed' }],
    }),
  );

  assert.equal(result.status, 'merge_gate_blocked');
  assert.equal(result.merge_allowed, false);
  assert.equal(result.reason, 'required_check_failed');
}

function testPendingCheckBlocksMerge() {
  const result = gate.buildMergeGateResult(
    ciResult({
      status: 'ci_pending',
      safe_to_mark_done: false,
      pending_checks: [{ name: 'validation-security', classification: 'pending' }],
    }),
  );

  assert.equal(result.status, 'merge_gate_blocked');
  assert.equal(result.reason, 'required_check_pending');
}

function testMissingCheckBlocksMerge() {
  const result = gate.buildMergeGateResult(
    ciResult({
      status: 'ci_missing_required_check',
      safe_to_mark_done: false,
      missing_required_checks: ['Validate PR evidence'],
    }),
  );

  assert.equal(result.status, 'merge_gate_blocked');
  assert.equal(result.reason, 'required_check_missing');
}

function testUnknownCheckBlocksMerge() {
  const result = gate.buildMergeGateResult(
    ciResult({
      status: 'ci_unknown',
      safe_to_mark_done: false,
      unknown_checks: [{ name: 'validation-api', classification: 'unknown' }],
    }),
  );

  assert.equal(result.status, 'merge_gate_blocked');
  assert.equal(result.reason, 'required_check_unknown');
}

async function testEvaluateReusesWatcherResult() {
  const result = await gate.evaluateMergeGate(
    { watcherOptions: {} },
    {
      now: () => '2026-07-07T01:00:00.000Z',
      ciResult: ciResult(),
    },
  );

  assert.equal(result.status, 'merge_gate_passed');
  assert.equal(result.evaluated_at, '2026-07-07T01:00:00.000Z');
}

function testWriteOutputsUpdatesLedger() {
  const dir = makeTempDir();
  const result = gate.buildMergeGateResult(ciResult(), {
    evaluatedAt: '2026-07-07T01:00:00.000Z',
  });
  const artifacts = gate.writeOutputs(result, {
    resultFile: path.join(dir, 'result.json'),
    summaryFile: path.join(dir, 'summary.md'),
    ledgerFile: path.join(dir, 'ledger.json'),
  });

  const savedResult = JSON.parse(fs.readFileSync(artifacts.resultFile, 'utf8'));
  const summary = fs.readFileSync(artifacts.summaryFile, 'utf8');
  const ledger = JSON.parse(fs.readFileSync(artifacts.ledgerFile, 'utf8'));

  assert.equal(savedResult.status, 'merge_gate_passed');
  assert.match(summary, /PR Merge Gate/);
  assert.match(summary, /AI PR review remains advisory/);
  assert.equal(ledger.pr_merge_gate.merge_allowed, true);
  assert.equal(ledger.events.at(-1).type, 'pr_merge_gate_passed');
}

async function testBlockedMergeGateCreatesFollowUpTask() {
  const dir = makeTempDir();
  const taskFile = path.join(dir, 'task.json');
  fs.writeFileSync(
    taskFile,
    JSON.stringify(
      {
        id: 'task-34',
        title: 'ENG-LOOP-34 - Integrate merge gate failures with follow-up task creation',
        url: 'https://app.notion.com/p/task-34',
        branch: 'chore/eng-loop-34-merge-gate-follow-up-tasks',
        repository: 'dev-jeyelscott/garageos',
      },
      null,
      2,
    ),
  );
  const result = gate.buildMergeGateResult(
    ciResult({
      status: 'ci_failed',
      safe_to_mark_done: false,
      failed_checks: [{ name: 'validation-quick', classification: 'failed' }],
    }),
    {
      evaluatedAt: '2026-07-07T01:00:00.000Z',
    },
  );
  const client = new FakeFollowUpClient();

  gate.writeOutputs(result, {
    resultFile: path.join(dir, 'gate-result.json'),
    summaryFile: path.join(dir, 'gate-summary.md'),
    ledgerFile: path.join(dir, 'ledger.json'),
  });
  const outcome = await gate.createFollowUpForMergeGateFailure(
    result,
    {
      taskFile,
      ledgerFile: path.join(dir, 'ledger.json'),
      followUpResultFile: path.join(dir, 'follow-up-result.json'),
      followUpSummaryFile: path.join(dir, 'follow-up-summary.md'),
    },
    {
      followUpClient: client,
      now: () => '2026-07-07T01:01:00.000Z',
    },
  );

  const ledger = JSON.parse(fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8'));

  assert.equal(outcome.result.status, 'created');
  assert.equal(client.created.length, 1);
  assert.equal(outcome.result.task_url, 'https://app.notion.com/p/created-follow-up');
  assert.equal(ledger.pr_merge_gate.status, 'merge_gate_blocked');
  assert.equal(ledger.follow_up_task.status, 'created');
  assert.equal(ledger.events.at(-1).type, 'follow_up_task_created');
}

async function testPendingMergeGateDoesNotCreateFollowUpTask() {
  const result = gate.buildMergeGateResult(
    ciResult({
      status: 'ci_pending',
      safe_to_mark_done: false,
      pending_checks: [{ name: 'validation-security', classification: 'pending' }],
    }),
  );
  const client = new FakeFollowUpClient();
  const outcome = await gate.createFollowUpForMergeGateFailure(
    result,
    {
      followUpResultFile: path.join(makeTempDir(), 'follow-up-result.json'),
    },
    {
      followUpClient: client,
    },
  );

  assert.equal(outcome, null);
  assert.equal(client.created.length, 0);
}

async function testFollowUpCreationFailureWritesFailureArtifacts() {
  const dir = makeTempDir();
  const result = gate.buildMergeGateResult(
    ciResult({
      status: 'ci_failed',
      safe_to_mark_done: false,
      failed_checks: [{ name: 'validation-quick', classification: 'failed' }],
    }),
  );

  await assert.rejects(
    () =>
      gate.createFollowUpForMergeGateFailure(
        result,
        {
          ledgerFile: path.join(dir, 'ledger.json'),
          followUpResultFile: path.join(dir, 'follow-up-result.json'),
          followUpSummaryFile: path.join(dir, 'follow-up-summary.md'),
        },
        {
          followUpClient: new FailingFollowUpClient(),
        },
      ),
    /Injected follow-up creation failure/,
  );

  const savedResult = JSON.parse(fs.readFileSync(path.join(dir, 'follow-up-result.json'), 'utf8'));
  const ledger = JSON.parse(fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8'));

  assert.equal(savedResult.status, 'failed');
  assert.equal(savedResult.reason, 'follow_up_creation_failed');
  assert.equal(ledger.follow_up_task.status, 'failed');
}

function testResolveGateOptionsUsesSeparateCiAndGateOutputs() {
  const dir = makeTempDir();
  const options = gate.resolveGateOptions(
    {
      repo: 'dev-jeyelscott/garageos',
      branch: 'chore/eng-loop-29-pr-merge-gate',
      sha: 'abc123',
      token: 'test-token',
      out: 'gate-result.json',
      summary: 'gate-summary.md',
    },
    dir,
  );

  assert.equal(options.resultFile, 'gate-result.json');
  assert.equal(options.summaryFile, 'gate-summary.md');
  assert.equal(options.watcherOptions.resultFile, '.tmp/eng-loop-ci-status-result.json');
  assert.equal(options.watcherOptions.summaryFile, '.tmp/eng-loop-ci-status-summary.md');
  assert.equal(options.watcherOptions.watch, false);
}

function testResolveGateOptionsCanDisableFollowUp() {
  const options = gate.resolveGateOptions(
    {
      followUp: 'false',
    },
    makeTempDir(),
  );

  assert.equal(options.followUpEnabled, false);
}

async function testEvaluateWritesWatcherEvidenceWhenRunningWatcher() {
  const dir = makeTempDir();
  const requiredChecksFile = path.join(dir, 'required-checks.json');
  fs.writeFileSync(
    requiredChecksFile,
    JSON.stringify(
      {
        required_checks: ['validation-quick'],
        aliases: {
          'validation-quick': ['validation-quick'],
        },
      },
      null,
      2,
    ),
  );

  const options = {
    watcherOptions: {
      repository: 'dev-jeyelscott/garageos',
      branch: 'chore/eng-loop-29-pr-merge-gate',
      headSha: 'abc123',
      prNumber: 29,
      requiredChecksFile,
      ledgerFile: path.join(dir, 'ledger.json'),
      resultFile: path.join(dir, 'ci-result.json'),
      summaryFile: path.join(dir, 'ci-summary.md'),
      watch: false,
      maxAttempts: 1,
      pollIntervalMs: 1,
      apiRetryCount: 1,
      apiRetryBaseDelayMs: 1,
      token: 'test-token',
    },
  };

  const result = await gate.evaluateMergeGate(options, {
    now: () => '2026-07-07T01:00:00.000Z',
    fetchGithubChecks: async () => [
      {
        source_type: 'check_run',
        name: 'validation-quick',
        normalized_name: watcher.normalizeCheckName('validation-quick'),
        status: 'completed',
        conclusion: 'success',
        url: 'https://github.example/validation-quick',
        created_at: '2026-07-07T00:00:00.000Z',
      },
    ],
  });

  assert.equal(result.status, 'merge_gate_passed');
  assert.equal(fs.existsSync(options.watcherOptions.resultFile), true);
  assert.equal(fs.existsSync(options.watcherOptions.summaryFile), true);
}

function testRequiredCheckConfigUsesDeterministicChecks() {
  const config = watcher.loadRequiredChecks('.github/scripts/eng-loop-required-checks.json');

  assert.equal(config.status, 'ok');
  assert.equal(config.requiredChecks.includes('validation-quick'), true);
  assert.equal(config.requiredChecks.includes('Validate PR evidence'), true);
  assert.equal(config.requiredChecks.includes('Dependency audit and security profile'), true);
  assert.equal(config.requiredChecks.includes('Semgrep static security scan'), true);
  assert.equal(config.requiredChecks.includes('GarageOS AI Review / advisory'), false);
}

async function run() {
  const tests = [
    testPassingCiAllowsMerge,
    testFailedCheckBlocksMerge,
    testPendingCheckBlocksMerge,
    testMissingCheckBlocksMerge,
    testUnknownCheckBlocksMerge,
    testEvaluateReusesWatcherResult,
    testWriteOutputsUpdatesLedger,
    testBlockedMergeGateCreatesFollowUpTask,
    testPendingMergeGateDoesNotCreateFollowUpTask,
    testFollowUpCreationFailureWritesFailureArtifacts,
    testResolveGateOptionsUsesSeparateCiAndGateOutputs,
    testResolveGateOptionsCanDisableFollowUp,
    testEvaluateWritesWatcherEvidenceWhenRunningWatcher,
    testRequiredCheckConfigUsesDeterministicChecks,
  ];

  for (const test of tests) {
    await test();
    console.log(`passed: ${test.name}`);
  }

  console.log(`All ${tests.length} PR merge gate tests passed.`);
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
