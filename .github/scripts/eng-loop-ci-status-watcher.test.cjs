#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const watcher = require('./eng-loop-ci-status-watcher.cjs');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eng-loop-ci-watcher-'));
}

function writeRequiredChecks(dir) {
  const filePath = path.join(dir, 'required-checks.json');
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        required_checks: ['validate', 'PR Validation Evidence'],
        aliases: {
          validate: ['validate', 'CI / validate', 'Validation / validate'],
          'PR Validation Evidence': ['PR Validation Evidence', 'pr-validation-evidence'],
        },
      },
      null,
      2,
    ),
  );
  return filePath;
}

function baseOptions(dir) {
  return {
    repository: 'dev-jeyelscott/garageos',
    branch: 'chore/eng-loop-21-ci-status-watcher',
    headSha: 'abc123',
    prNumber: 21,
    requiredChecksFile: writeRequiredChecks(dir),
    ledgerFile: path.join(dir, 'ledger.json'),
    resultFile: path.join(dir, 'result.json'),
    summaryFile: path.join(dir, 'summary.md'),
    watch: false,
    maxAttempts: 1,
    pollIntervalMs: 1,
    apiRetryCount: 1,
    apiRetryBaseDelayMs: 1,
    token: 'test-token',
  };
}

function checkRun(name, status, conclusion) {
  return {
    source_type: 'check_run',
    name,
    normalized_name: watcher.normalizeCheckName(name),
    status,
    conclusion,
    url: `https://github.example/${encodeURIComponent(name)}`,
    created_at: '2026-07-06T00:00:00.000Z',
  };
}

async function runWithChecks(checks, overrides = {}) {
  const dir = makeTempDir();
  const options = { ...baseOptions(dir), ...overrides };
  const result = await watcher.runWatcher(options, {
    now: () => '2026-07-06T00:00:00.000Z',
    sleep: async () => undefined,
    fetchGithubChecks: async () => checks,
  });
  return { result, options, dir };
}

async function testAllRequiredChecksSuccess() {
  const { result } = await runWithChecks([
    checkRun('CI / validate', 'completed', 'success'),
    checkRun('PR Validation Evidence', 'completed', 'success'),
  ]);

  assert.equal(result.status, 'ci_passed');
  assert.equal(result.safe_to_mark_done, true);
  assert.equal(result.failed_checks.length, 0);
  console.log('passed: testAllRequiredChecksSuccess');
}

async function testRequiredCheckFailure() {
  const { result } = await runWithChecks([
    checkRun('CI / validate', 'completed', 'failure'),
    checkRun('PR Validation Evidence', 'completed', 'success'),
  ]);

  assert.equal(result.status, 'ci_failed');
  assert.equal(result.safe_to_mark_done, false);
  assert.equal(result.failed_checks.length, 1);
  console.log('passed: testRequiredCheckFailure');
}

async function testRequiredCheckPending() {
  const { result } = await runWithChecks([
    checkRun('CI / validate', 'in_progress', null),
    checkRun('PR Validation Evidence', 'completed', 'success'),
  ]);

  assert.equal(result.status, 'ci_pending');
  assert.equal(result.safe_to_mark_done, false);
  assert.equal(result.pending_checks.length, 1);
  console.log('passed: testRequiredCheckPending');
}

async function testRequiredCheckCancelled() {
  const { result } = await runWithChecks([
    checkRun('CI / validate', 'completed', 'cancelled'),
    checkRun('PR Validation Evidence', 'completed', 'success'),
  ]);

  assert.equal(result.status, 'ci_cancelled');
  assert.equal(result.safe_to_mark_done, false);
  assert.equal(result.cancelled_checks.length, 1);
  console.log('passed: testRequiredCheckCancelled');
}

async function testMissingRequiredCheck() {
  const { result } = await runWithChecks([checkRun('CI / validate', 'completed', 'success')]);

  assert.equal(result.status, 'ci_missing_required_check');
  assert.equal(result.safe_to_mark_done, false);
  assert.deepEqual(result.missing_required_checks, ['PR Validation Evidence']);
  console.log('passed: testMissingRequiredCheck');
}

async function testApiErrorFailsSafely() {
  const dir = makeTempDir();
  const options = baseOptions(dir);
  const result = await watcher.runWatcher(options, {
    now: () => '2026-07-06T00:00:00.000Z',
    fetchGithubChecks: async () => {
      throw new Error('simulated GitHub outage');
    },
  });

  assert.equal(result.status, 'github_api_error');
  assert.equal(result.safe_to_mark_done, false);
  assert.match(result.message, /simulated GitHub outage/);
  console.log('passed: testApiErrorFailsSafely');
}

function testMetadataFallbackResolution() {
  const dir = makeTempDir();
  fs.mkdirSync(path.join(dir, '.tmp'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.tmp/eng-loop-pr-automation-metadata.json'),
    JSON.stringify({
      repository: 'dev-jeyelscott/garageos',
      branch: 'chore/test',
      pr_number: 123,
      head_sha: 'abc',
    }),
  );

  const previousCwd = process.cwd();
  process.chdir(dir);
  try {
    const options = watcher.resolveRuntimeOptions({ once: true }, dir);
    assert.equal(options.repository, 'dev-jeyelscott/garageos');
    assert.equal(options.branch, 'chore/test');
    assert.equal(options.prNumber, 123);
    assert.equal(options.headSha, 'abc');
  } finally {
    process.chdir(previousCwd);
  }

  console.log('passed: testMetadataFallbackResolution');
}

async function testWriteOutputsUpdatesLedger() {
  const { result, options } = await runWithChecks([
    checkRun('CI / validate', 'completed', 'success'),
    checkRun('PR Validation Evidence', 'completed', 'success'),
  ]);

  watcher.writeOutputs(result, options);

  const savedResult = JSON.parse(fs.readFileSync(options.resultFile, 'utf8'));
  const ledger = JSON.parse(fs.readFileSync(options.ledgerFile, 'utf8'));
  const summary = fs.readFileSync(options.summaryFile, 'utf8');

  assert.equal(savedResult.status, 'ci_passed');
  assert.equal(ledger.ci_status.status, 'ci_passed');
  assert.equal(ledger.ci_status.safe_to_mark_done, true);
  assert.match(summary, /GitHub CI Status/);
  console.log('passed: testWriteOutputsUpdatesLedger');
}

async function main() {
  await testAllRequiredChecksSuccess();
  await testRequiredCheckFailure();
  await testRequiredCheckPending();
  await testRequiredCheckCancelled();
  await testMissingRequiredCheck();
  await testApiErrorFailsSafely();
  testMetadataFallbackResolution();
  await testWriteOutputsUpdatesLedger();
  console.log('All 8 GitHub CI status watcher tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
