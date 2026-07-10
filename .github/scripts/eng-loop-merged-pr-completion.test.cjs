#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const completion = require('./eng-loop-merged-pr-completion.cjs');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eng-loop-completion-'));
}
function git(cwd, args) {
  return childProcess
    .execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    .trim();
}
function mergeResult(overrides = {}) {
  return {
    status: 'guarded_merge_merged',
    merge_executed: true,
    repository: 'dev-jeyelscott/garageos',
    pr_number: 35,
    pull_request: {
      html_url: 'https://github.com/dev-jeyelscott/garageos/pull/35',
    },
    github_response: { sha: 'merge-sha-35', merged: true },
    gate_status: 'merge_gate_passed',
    gate_merge_allowed: true,
    ...overrides,
  };
}
function options(overrides = {}) {
  return {
    mode: 'live',
    confirmation: completion.LIVE_CONFIRMATION,
    taskId: 'task-35',
    guardedMergeResult: mergeResult(),
    ledger: {},
    ledgerFile: '.tmp/ledger.json',
    resultFile: '.tmp/result.json',
    summaryFile: '.tmp/summary.md',
    baseBranch: 'develop',
    token: 'token',
    databaseId: 'db',
    ...overrides,
  };
}
function page(status = 'In Progress') {
  return {
    id: 'task-35',
    properties: {
      Task: {
        type: 'title',
        title: [
          {
            type: 'text',
            text: {
              content: 'ENG-LOOP-35 - Auto-complete merged PR task tracker updates',
            },
          },
        ],
      },
      Status: { type: 'status', status: { name: status } },
      'Progress Source': { type: 'rich_text', rich_text: [] },
      'Review ID': { type: 'url', url: null },
      'Commit SHA': { type: 'rich_text', rich_text: [] },
      'Commit URL': { type: 'url', url: null },
    },
  };
}
function applyPatch(current, properties) {
  const next = structuredClone(current);
  for (const [name, patch] of Object.entries(properties)) {
    const existing = next.properties[name] || {};
    if ('status' in patch)
      next.properties[name] = {
        ...existing,
        type: 'status',
        status: patch.status,
      };
    else if ('select' in patch)
      next.properties[name] = {
        ...existing,
        type: 'select',
        select: patch.select,
      };
    else if ('rich_text' in patch)
      next.properties[name] = {
        ...existing,
        type: 'rich_text',
        rich_text: patch.rich_text,
      };
    else if ('title' in patch)
      next.properties[name] = {
        ...existing,
        type: 'title',
        title: patch.title,
      };
    else if ('url' in patch) next.properties[name] = { ...existing, type: 'url', url: patch.url };
    else next.properties[name] = { ...existing, ...patch };
  }
  return next;
}
function client(initial = 'In Progress', behavior = {}) {
  let current = page(initial);
  let fetchCount = 0;
  let updateCount = 0;
  const calls = [];
  return {
    calls,
    async fetchPage(id) {
      calls.push({ type: 'fetch', id });
      fetchCount += 1;
      if (behavior.failFetchAt === fetchCount) throw new Error('read failed');
      if (behavior.fetchStatusAt?.[fetchCount]) return page(behavior.fetchStatusAt[fetchCount]);
      return structuredClone(current);
    },
    async updatePageProperties(id, properties) {
      calls.push({ type: 'update', id, properties });
      updateCount += 1;
      if (behavior.applyThenThrowAt === updateCount) {
        current = applyPatch(current, properties);
        throw new Error('ambiguous network error');
      }
      if (behavior.failUpdateAt === updateCount) throw new Error('update failed');
      current = applyPatch(current, properties);
      return structuredClone(current);
    },
  };
}
function reachable(overrides = {}) {
  return {
    now: () => '2026-07-07T06:30:00.000Z',
    checkMergeCommitReachable: () => ({
      reachable: true,
      refreshed: true,
      refreshSource: 'test fetch',
      source: 'test reachability',
    }),
    ...overrides,
  };
}
function gitFixture() {
  const root = tempDir();
  const remote = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, ['init', '--bare', remote]);
  git(root, ['clone', remote, work]);
  git(work, ['config', 'user.email', 'test@example.com']);
  git(work, ['config', 'user.name', 'Test']);
  git(work, ['checkout', '-b', 'develop']);
  fs.writeFileSync(path.join(work, 'base'), 'base\n');
  git(work, ['add', 'base']);
  git(work, ['commit', '-m', 'base']);
  git(work, ['push', '-u', 'origin', 'develop']);
  const reachableSha = git(work, ['rev-parse', 'HEAD']);
  git(work, ['checkout', '-b', 'unmerged']);
  fs.writeFileSync(path.join(work, 'other'), 'other\n');
  git(work, ['add', 'other']);
  git(work, ['commit', '-m', 'other']);
  const unreachableSha = git(work, ['rev-parse', 'HEAD']);
  git(work, ['checkout', 'develop']);
  return { work, reachableSha, unreachableSha };
}

function testMissingMergeResultBlocks() {
  assert.equal(
    completion.validatePreconditions(options({ guardedMergeResult: null })).reason,
    'guarded_merge_result_missing',
  );
}
function testUnmergedBlocks() {
  assert.equal(
    completion.validatePreconditions(
      options({
        guardedMergeResult: mergeResult({
          status: 'blocked',
          merge_executed: false,
        }),
      }),
    ).reason,
    'guarded_merge_not_merged',
  );
}
function testFailedGateBlocks() {
  assert.equal(
    completion.validatePreconditions(
      options({
        guardedMergeResult: mergeResult({
          gate_status: 'blocked',
          gate_merge_allowed: false,
        }),
      }),
    ).reason,
    'required_checks_not_confirmed',
  );
}
function testConfirmationRequired() {
  assert.equal(
    completion.validatePreconditions(options({ confirmation: '' })).reason,
    'live_confirmation_required',
  );
}
function testUnsafeBranchRejected() {
  assert.throws(() => completion.assertSafeBranchName('../develop'), /Unsafe/);
}
function testRealReachable() {
  const f = gitFixture();
  const r = completion.checkMergeCommitReachable(
    options({
      guardedMergeResult: mergeResult({
        github_response: { sha: f.reachableSha },
      }),
    }),
    { cwd: f.work },
  );
  assert.equal(r.reachable, true);
  assert.equal(r.refreshed, true);
}
function testRealUnreachable() {
  const f = gitFixture();
  const r = completion.checkMergeCommitReachable(
    options({
      guardedMergeResult: mergeResult({
        github_response: { sha: f.unreachableSha },
      }),
    }),
    { cwd: f.work },
  );
  assert.equal(r.reachable, false);
  assert.match(r.message, /not reachable/);
}
async function testDryRun() {
  const r = await completion.completeMergedPrTask(
    options({ mode: 'dry-run', confirmation: '', token: '', databaseId: '' }),
    reachable(),
  );
  assert.equal(r.status, 'merged_pr_completion_planned');
  assert.equal(r.tracker_updated, false);
}
async function testUnreachableBeforeMutation() {
  const c = client();
  const r = await completion.completeMergedPrTask(options(), {
    client: c,
    checkMergeCommitReachable: () => ({
      reachable: false,
      refreshed: true,
      source: 'test',
      message: 'no',
    }),
  });
  assert.equal(r.reason, 'merge_commit_not_on_develop');
  assert.equal(c.calls.length, 0);
}
async function testSuccess() {
  const c = client();
  const r = await completion.completeMergedPrTask(options(), reachable({ client: c }));
  assert.equal(r.status, 'merged_pr_task_completed');
  assert.equal(r.tracker_updated, true);
  assert.equal(r.next_task_status, 'Done');
  assert.match(
    c.calls.find((x) => x.type === 'update').properties['Progress Source'].rich_text[0].text
      .content,
    /Progress source: Notion/,
  );
}
async function testUpdateFailureRestoresOriginal() {
  const c = client('In Progress', { failUpdateAt: 1 });
  const r = await completion.completeMergedPrTask(options(), reachable({ client: c }));
  assert.equal(r.reason, 'notion_update_failed_rolled_back');
  assert.equal(r.rollback_succeeded, true);
  assert.equal(r.tracker_updated, false);
  assert.equal(c.calls.filter((x) => x.type === 'update').length, 2);
}
async function testAmbiguousAppliedUpdateRollsBack() {
  const c = client('In Progress', { applyThenThrowAt: 1 });
  const r = await completion.completeMergedPrTask(options(), reachable({ client: c }));
  assert.equal(r.reason, 'notion_update_failed_rolled_back');
  assert.equal(r.rollback_succeeded, true);
  assert.equal(r.next_task_status, 'In Progress');
  assert.equal(r.tracker_state_unknown, false);
}
async function testAmbiguousUpdateRollbackFailureIsUnknown() {
  const c = client('In Progress', { applyThenThrowAt: 1, failUpdateAt: 2 });
  const r = await completion.completeMergedPrTask(options(), reachable({ client: c }));
  assert.equal(r.reason, 'completion_rollback_failed');
  assert.equal(r.rollback_succeeded, false);
  assert.equal(r.tracker_state_unknown, true);
  assert.equal(r.tracker_updated, false);
}
async function testVerificationWrongStatusRollsBack() {
  const c = client('In Progress', { fetchStatusAt: { 2: 'Ready' } });
  const r = await completion.completeMergedPrTask(options(), reachable({ client: c }));
  assert.equal(r.reason, 'completion_verification_failed');
  assert.equal(r.rollback_succeeded, true);
  assert.equal(r.next_task_status, 'In Progress');
}
async function testVerificationReadFailureRollsBack() {
  const c = client('In Progress', { failFetchAt: 2 });
  const r = await completion.completeMergedPrTask(options(), reachable({ client: c }));
  assert.equal(r.reason, 'completion_verification_failed');
  assert.equal(r.rollback_succeeded, true);
}
async function testAlreadyDoneNoOp() {
  const c = client('Done');
  const r = await completion.completeMergedPrTask(options(), reachable({ client: c }));
  assert.equal(r.status, 'merged_pr_task_already_done');
  assert.equal(
    c.calls.some((x) => x.type === 'update'),
    false,
  );
}
async function testUnsupportedNoOp() {
  const c = client('Ready');
  const r = await completion.completeMergedPrTask(options(), reachable({ client: c }));
  assert.equal(r.reason, 'unsupported_task_status');
  assert.equal(
    c.calls.some((x) => x.type === 'update'),
    false,
  );
}
function testOutputs() {
  const d = tempDir();
  const r = {
    status: 'merged_pr_task_completed',
    tracker_updated: true,
    tracker_state_unknown: false,
    reason: 'tracker_status_updated',
    message: 'done',
    evaluated_at: '2026-07-07T00:00:00Z',
    task_id: 'x',
    task_title: 'x',
    previous_task_status: 'In Progress',
    next_task_status: 'Done',
    repository: 'dev-jeyelscott/garageos',
    pr_number: 35,
    pr_url: 'url',
    merge_sha: 'sha',
    required_checks_passed: true,
    base_branch: 'develop',
    base_branch_refreshed: true,
    base_branch_refresh_source: 'fetch',
    merge_commit_reachable: true,
    merge_commit_reachability_source: 'git',
    rollback_attempted: false,
    rollback_succeeded: null,
    rollback_error: null,
    progress_source: 'notion',
  };
  const a = completion.writeOutputs(r, {
    resultFile: path.join(d, 'r.json'),
    summaryFile: path.join(d, 's.md'),
    ledgerFile: path.join(d, 'l.json'),
  });
  assert.match(fs.readFileSync(a.summaryFile, 'utf8'), /Notion task state unknown: no/);
  assert.equal(
    JSON.parse(fs.readFileSync(a.ledgerFile)).merged_pr_completion.progress_source,
    'notion',
  );
}

async function run() {
  const tests = [
    testMissingMergeResultBlocks,
    testUnmergedBlocks,
    testFailedGateBlocks,
    testConfirmationRequired,
    testUnsafeBranchRejected,
    testRealReachable,
    testRealUnreachable,
    testDryRun,
    testUnreachableBeforeMutation,
    testSuccess,
    testUpdateFailureRestoresOriginal,
    testAmbiguousAppliedUpdateRollsBack,
    testAmbiguousUpdateRollbackFailureIsUnknown,
    testVerificationWrongStatusRollsBack,
    testVerificationReadFailureRollsBack,
    testAlreadyDoneNoOp,
    testUnsupportedNoOp,
    testOutputs,
  ];
  for (const test of tests) {
    await test();
    console.log(`passed: ${test.name}`);
  }
  console.log(`All ${tests.length} merged PR completion tests passed.`);
}
run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
