#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const runner = require('./pr-ai-review.cjs');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pr-ai-review-'));
}

function testParseArgs() {
  const args = runner.parseArgs([
    '--repo',
    'dev-jeyelscott/garageos',
    '--pr=31',
    '--json',
    '--out',
    'result.json',
  ]);

  assert.equal(args.repo, 'dev-jeyelscott/garageos');
  assert.equal(args.pr, '31');
  assert.equal(args.json, true);
  assert.equal(args.out, 'result.json');
}

function testMissingOpenAiKeySkipsAdvisoryReview() {
  const options = runner.resolveRuntimeOptions(
    {},
    {
      GITHUB_REPOSITORY: 'dev-jeyelscott/garageos',
      PR_NUMBER: '31',
    },
  );
  const result = runner.runAiReview(options, {
    now: () => '2026-07-07T00:00:00.000Z',
    spawnSync: () => {
      throw new Error('spawn should not run when OPENAI_API_KEY is missing');
    },
  });

  assert.equal(result.status, 'ai_review_skipped');
  assert.equal(result.advisory, true);
  assert.equal(result.reason, 'openai_key_missing');
  assert.equal(result.exit_code, 0);
  assert.equal(result.non_goals.includes('does_not_make_ai_review_authoritative'), true);
}

function testOpenAiKeyRunsExistingReviewerScript() {
  const options = runner.resolveRuntimeOptions(
    { script: 'scripts/ai-pr-review.mjs' },
    {
      OPENAI_API_KEY: 'sk-test-key-value',
      GITHUB_REPOSITORY: 'dev-jeyelscott/garageos',
      PR_NUMBER: '31',
    },
  );
  const invocations = [];
  const result = runner.runAiReview(options, {
    now: () => '2026-07-07T00:00:00.000Z',
    spawnSync: (executable, args) => {
      invocations.push({ executable, args });
      return {
        status: 0,
        stdout: 'Advisory GarageOS AI PR review completed.\n',
        stderr: '',
      };
    },
  });

  assert.equal(result.status, 'ai_review_completed');
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].executable, process.execPath);
  assert.deepEqual(invocations[0].args, ['scripts/ai-pr-review.mjs']);
}

function testScriptFailureIsReported() {
  const options = runner.resolveRuntimeOptions(
    {},
    {
      OPENAI_API_KEY: 'sk-test-key-value',
      GITHUB_REPOSITORY: 'dev-jeyelscott/garageos',
      PR_NUMBER: '31',
    },
  );
  const result = runner.runAiReview(options, {
    now: () => '2026-07-07T00:00:00.000Z',
    spawnSync: () => ({
      status: 1,
      stdout: '',
      stderr: 'token=ghp_abcdefghijklmnopqrstuvwxyz\n',
    }),
  });

  assert.equal(result.status, 'ai_review_failed');
  assert.equal(result.exit_code, 1);
  assert.match(result.stderr, /\[REDACTED_SECRET\]/);
}

function testWriteOutputsUpdatesLedger() {
  const dir = makeTempDir();
  const result = runner.buildSkippedResult(
    {
      repository: 'dev-jeyelscott/garageos',
      prNumber: '31',
      reviewScript: 'scripts/ai-pr-review.mjs',
    },
    '2026-07-07T00:00:00.000Z',
  );
  const artifacts = runner.writeOutputs(result, {
    resultFile: path.join(dir, 'result.json'),
    summaryFile: path.join(dir, 'summary.md'),
    ledgerFile: path.join(dir, 'ledger.json'),
  });

  const savedResult = JSON.parse(fs.readFileSync(artifacts.resultFile, 'utf8'));
  const summary = fs.readFileSync(artifacts.summaryFile, 'utf8');
  const ledger = JSON.parse(fs.readFileSync(artifacts.ledgerFile, 'utf8'));

  assert.equal(savedResult.status, 'ai_review_skipped');
  assert.match(summary, /PR AI Review Runner/);
  assert.match(summary, /deterministic CI and human review remain authoritative/);
  assert.equal(ledger.pr_ai_review.status, 'ai_review_skipped');
  assert.equal(ledger.events.at(-1).type, 'ai_review_skipped');
}

function testResolveRuntimeOptionsReadsEnvironment() {
  const options = runner.resolveRuntimeOptions(
    {
      out: 'ai-result.json',
      summary: 'ai-summary.md',
      ledger: 'ledger.json',
    },
    {
      GITHUB_REPOSITORY: 'dev-jeyelscott/garageos',
      PR_NUMBER: '31',
    },
  );

  assert.equal(options.repository, 'dev-jeyelscott/garageos');
  assert.equal(options.prNumber, '31');
  assert.equal(options.resultFile, 'ai-result.json');
  assert.equal(options.summaryFile, 'ai-summary.md');
  assert.equal(options.ledgerFile, 'ledger.json');
  assert.equal(options.reviewScript, 'scripts/ai-pr-review.mjs');
}

async function run() {
  const tests = [
    testParseArgs,
    testMissingOpenAiKeySkipsAdvisoryReview,
    testOpenAiKeyRunsExistingReviewerScript,
    testScriptFailureIsReported,
    testWriteOutputsUpdatesLedger,
    testResolveRuntimeOptionsReadsEnvironment,
  ];

  for (const test of tests) {
    await test();
    console.log(`passed: ${test.name}`);
  }

  console.log(`All ${tests.length} PR AI review runner tests passed.`);
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
