#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const guardedMerge = require('./pr-guarded-merge.cjs');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pr-guarded-merge-'));
}

function gateResult(overrides = {}) {
  return {
    status: 'merge_gate_passed',
    merge_allowed: true,
    repository: 'dev-jeyelscott/garageos',
    pr_number: 33,
    head_sha: 'abc123',
    ...overrides,
  };
}

function options(overrides = {}) {
  return {
    mode: 'manual',
    confirmation: guardedMerge.MANUAL_CONFIRMATION,
    repository: 'dev-jeyelscott/garageos',
    prNumber: 33,
    expectedHeadSha: 'abc123',
    mergeMethod: 'squash',
    gateResult: gateResult(),
    gateResultFile: '.tmp/pr-merge-gate-result.json',
    resultFile: '.tmp/pr-guarded-merge-result.json',
    summaryFile: '.tmp/pr-guarded-merge-summary.md',
    ledgerFile: '.tmp/eng-loop-run-ledger.json',
    token: 'test-token',
    ...overrides,
  };
}

function pullRequest(overrides = {}) {
  return {
    number: 33,
    state: 'open',
    draft: false,
    mergeable_state: 'clean',
    html_url: 'https://github.example/pr/33',
    head: {
      ref: 'chore/eng-loop-33-guarded-merge-executor',
      sha: 'abc123',
    },
    base: {
      ref: 'develop',
    },
    ...overrides,
  };
}

function testManualModeIsRequired() {
  const result = guardedMerge.validatePreconditions(options({ mode: 'dry-run' }));

  assert.equal(result.status, 'guarded_merge_blocked');
  assert.equal(result.reason, 'manual_mode_required');
  assert.equal(result.merge_executed, false);
}

function testManualConfirmationIsRequired() {
  const result = guardedMerge.validatePreconditions(options({ confirmation: '' }));

  assert.equal(result.status, 'guarded_merge_blocked');
  assert.equal(result.reason, 'manual_confirmation_required');
}

function testMergeGateMustPass() {
  const result = guardedMerge.validatePreconditions(
    options({
      gateResult: gateResult({
        status: 'merge_gate_blocked',
        merge_allowed: false,
      }),
    }),
  );

  assert.equal(result.status, 'guarded_merge_blocked');
  assert.equal(result.reason, 'merge_gate_not_passed');
}

async function testHeadShaMismatchBlocksMerge() {
  const calls = [];
  const result = await guardedMerge.executeGuardedMerge(options(), {
    now: () => '2026-07-07T02:00:00.000Z',
    githubRequest: async (apiPath, requestOptions) => {
      calls.push({ apiPath, requestOptions });
      return pullRequest({ head: { ref: 'branch', sha: 'newsha' } });
    },
  });

  assert.equal(result.status, 'guarded_merge_blocked');
  assert.equal(result.reason, 'head_sha_mismatch');
  assert.equal(calls.length, 1);
}

async function testSuccessfulMergeCallsGithubMergeApi() {
  const calls = [];
  const result = await guardedMerge.executeGuardedMerge(options(), {
    now: () => '2026-07-07T02:00:00.000Z',
    githubRequest: async (apiPath, requestOptions) => {
      calls.push({ apiPath, requestOptions });
      if (apiPath.endsWith('/merge')) {
        return {
          sha: 'merge-sha',
          merged: true,
          message: 'Pull Request successfully merged',
        };
      }
      return pullRequest();
    },
  });

  assert.equal(result.status, 'guarded_merge_merged');
  assert.equal(result.merge_executed, true);
  assert.equal(result.reason, 'github_merge_api_succeeded');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].requestOptions.method, 'PUT');
  assert.deepEqual(calls[1].requestOptions.body, {
    sha: 'abc123',
    merge_method: 'squash',
  });
}

async function testGithubMergeApiFailureIsFailClosed() {
  const result = await guardedMerge.executeGuardedMerge(options(), {
    githubRequest: async (apiPath) => {
      if (apiPath.endsWith('/merge')) {
        const error = new Error('GitHub API returned 405: Required status check failed');
        error.payload = { message: 'Required status check failed' };
        throw error;
      }
      return pullRequest();
    },
  });

  assert.equal(result.status, 'guarded_merge_failed');
  assert.equal(result.reason, 'github_merge_api_failed');
  assert.equal(result.merge_executed, false);
}

function testResolveRuntimeOptionsLoadsGateResult() {
  const dir = makeTempDir();
  const gateFile = path.join(dir, 'gate.json');
  fs.writeFileSync(gateFile, `${JSON.stringify(gateResult(), null, 2)}\n`, 'utf8');

  const resolved = guardedMerge.resolveRuntimeOptions(
    {
      mode: 'manual',
      confirmation: guardedMerge.MANUAL_CONFIRMATION,
      gateResult: gateFile,
      token: 'test-token',
    },
    {},
    dir,
  );

  assert.equal(resolved.repository, 'dev-jeyelscott/garageos');
  assert.equal(resolved.prNumber, 33);
  assert.equal(resolved.expectedHeadSha, 'abc123');
  assert.equal(resolved.mergeMethod, 'squash');
}

function testWriteOutputsUpdatesLedger() {
  const dir = makeTempDir();
  const result = {
    status: 'guarded_merge_merged',
    merge_executed: true,
    reason: 'github_merge_api_succeeded',
    message: 'GitHub accepted the guarded pull request merge.',
    evaluated_at: '2026-07-07T02:00:00.000Z',
    repository: 'dev-jeyelscott/garageos',
    pr_number: 33,
    expected_head_sha: 'abc123',
    merge_method: 'squash',
    gate_status: 'merge_gate_passed',
    gate_merge_allowed: true,
  };

  const artifacts = guardedMerge.writeOutputs(result, {
    resultFile: path.join(dir, 'result.json'),
    summaryFile: path.join(dir, 'summary.md'),
    ledgerFile: path.join(dir, 'ledger.json'),
  });

  const savedResult = JSON.parse(fs.readFileSync(artifacts.resultFile, 'utf8'));
  const summary = fs.readFileSync(artifacts.summaryFile, 'utf8');
  const ledger = JSON.parse(fs.readFileSync(artifacts.ledgerFile, 'utf8'));

  assert.equal(savedResult.status, 'guarded_merge_merged');
  assert.match(summary, /branch protection and repository permissions remain authoritative/i);
  assert.equal(ledger.pr_guarded_merge.merge_executed, true);
  assert.equal(ledger.events.at(-1).type, 'guarded_merge_merged');
}

async function run() {
  const tests = [
    testManualModeIsRequired,
    testManualConfirmationIsRequired,
    testMergeGateMustPass,
    testHeadShaMismatchBlocksMerge,
    testSuccessfulMergeCallsGithubMergeApi,
    testGithubMergeApiFailureIsFailClosed,
    testResolveRuntimeOptionsLoadsGateResult,
    testWriteOutputsUpdatesLedger,
  ];

  for (const test of tests) {
    await test();
    console.log(`passed: ${test.name}`);
  }

  console.log(`All ${tests.length} PR guarded merge tests passed.`);
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
