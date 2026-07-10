#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const completion = require('./eng-loop-merged-pr-completion.cjs');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eng-loop-merged-pr-completion-'));
}

function runGit(cwd, args) {
  return childProcess.execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function guardedMergeResult(overrides = {}) {
  return {
    status: 'guarded_merge_merged',
    merge_executed: true,
    repository: 'dev-jeyelscott/garageos',
    pr_number: 35,
    pull_request: {
      html_url: 'https://github.com/dev-jeyelscott/garageos/pull/35',
    },
    github_response: {
      sha: 'merge-sha-35',
      merged: true,
      message: 'Pull Request successfully merged',
    },
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
    guardedMergeResult: guardedMergeResult(),
    guardedMergeResultFile: '.tmp/pr-guarded-merge-result.json',
    ledger: {},
    ledgerFile: '.tmp/eng-loop-run-ledger.json',
    resultFile: '.tmp/eng-loop-merged-pr-completion-result.json',
    summaryFile: '.tmp/eng-loop-merged-pr-completion-summary.md',
    baseBranch: 'develop',
    token: 'notion-token',
    databaseId: 'notion-db',
    ...overrides,
  };
}

function notionPage(status = 'In Progress', overrides = {}) {
  return {
    id: 'task-35',
    url: 'https://app.notion.com/task-35',
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
    ...overrides,
  };
}

function applyPatch(page, properties) {
  return {
    ...page,
    properties: {
      ...page.properties,
      ...Object.fromEntries(
        Object.entries(properties).map(([name, patch]) => {
          const existing = page.properties[name] || {};
          if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
            return [name, { ...existing, type: 'status', status: patch.status }];
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'select')) {
            return [name, { ...existing, type: 'select', select: patch.select }];
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'rich_text')) {
            return [name, { ...existing, type: 'rich_text', rich_text: patch.rich_text }];
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
            return [name, { ...existing, type: 'title', title: patch.title }];
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'url')) {
            return [name, { ...existing, type: 'url', url: patch.url }];
          }
          return [name, { ...existing, ...patch }];
        }),
      ),
    },
  };
}

function makeClient(initialStatus = 'In Progress', behavior = {}) {
  const calls = [];
  let page = notionPage(initialStatus);
  let fetchCount = 0;
  let updateCount = 0;

  return {
    calls,
    async fetchPage(pageId) {
      calls.push({ type: 'fetch', pageId });
      fetchCount += 1;
      if (behavior.failFetchAt === fetchCount) {
        throw new Error('Notion verification read failed');
      }
      if (behavior.fetchStatusAt && behavior.fetchStatusAt[fetchCount]) {
        return notionPage(behavior.fetchStatusAt[fetchCount]);
      }
      return page;
    },
    async updatePageProperties(pageId, properties) {
      calls.push({ type: 'update', pageId, properties });
      updateCount += 1;
      if (behavior.failUpdateAt === updateCount) {
        throw new Error('Notion update failed');
      }
      page = applyPatch(page, properties);
      return page;
    },
  };
}

function reachableDependency(overrides = {}) {
  return {
    now: () => '2026-07-07T06:30:00.000Z',
    checkMergeCommitReachable: () => ({
      reachable: true,
      refreshed: true,
      refreshSource: 'unit-test-fetch',
      source: 'unit-test-reachability',
      message: 'reachable',
    }),
    ...overrides,
  };
}

function createGitFixture() {
  const root = makeTempDir();
  const remote = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  runGit(root, ['init', '--bare', remote]);
  runGit(root, ['clone', remote, work]);
  runGit(work, ['config', 'user.email', 'garageos-test@example.com']);
  runGit(work, ['config', 'user.name', 'GarageOS Test']);
  runGit(work, ['checkout', '-b', 'develop']);
  fs.writeFileSync(path.join(work, 'base.txt'), 'base\n', 'utf8');
  runGit(work, ['add', 'base.txt']);
  runGit(work, ['commit', '-m', 'base']);
  runGit(work, ['push', '-u', 'origin', 'develop']);
  const reachableSha = runGit(work, ['rev-parse', 'HEAD']);

  runGit(work, ['checkout', '-b', 'unmerged']);
  fs.writeFileSync(path.join(work, 'unmerged.txt'), 'unmerged\n', 'utf8');
  runGit(work, ['add', 'unmerged.txt']);
  runGit(work, ['commit', '-m', 'unmerged']);
  const unreachableSha = runGit(work, ['rev-parse', 'HEAD']);
  runGit(work, ['checkout', 'develop']);

  return { work, reachableSha, unreachableSha };
}

function testMissingMergeResultBlocks() {
  const result = completion.validatePreconditions(options({ guardedMergeResult: null }));
  assert.equal(result.status, 'merged_pr_completion_blocked');
  assert.equal(result.reason, 'guarded_merge_result_missing');
}

function testUnmergedResultBlocks() {
  const result = completion.validatePreconditions(
    options({
      guardedMergeResult: guardedMergeResult({
        status: 'guarded_merge_blocked',
        merge_executed: false,
      }),
    }),
  );
  assert.equal(result.status, 'merged_pr_completion_blocked');
  assert.equal(result.reason, 'guarded_merge_not_merged');
}

function testFailedCheckEvidenceBlocks() {
  const result = completion.validatePreconditions(
    options({
      guardedMergeResult: guardedMergeResult({
        gate_status: 'merge_gate_blocked',
        gate_merge_allowed: false,
      }),
    }),
  );
  assert.equal(result.status, 'merged_pr_completion_blocked');
  assert.equal(result.reason, 'required_checks_not_confirmed');
}

function testLiveModeRequiresConfirmation() {
  const result = completion.validatePreconditions(options({ confirmation: '' }));
  assert.equal(result.status, 'merged_pr_completion_blocked');
  assert.equal(result.reason, 'live_confirmation_required');
}

function testUnsafeBaseBranchRejected() {
  assert.throws(() => completion.assertSafeBranchName('../develop'), /Unsafe base branch/);
}

function testRealGitReachabilityRefreshesRemoteBase() {
  const fixture = createGitFixture();
  const result = completion.checkMergeCommitReachable(
    options({
      guardedMergeResult: guardedMergeResult({
        github_response: { sha: fixture.reachableSha, merged: true },
      }),
    }),
    { cwd: fixture.work },
  );
  assert.equal(result.reachable, true);
  assert.equal(result.refreshed, true);
  assert.match(result.refreshSource, /git fetch/);
  assert.match(result.source, /origin\/develop/);
}

function testRealGitUnreachableCommitBlocks() {
  const fixture = createGitFixture();
  const result = completion.checkMergeCommitReachable(
    options({
      guardedMergeResult: guardedMergeResult({
        github_response: { sha: fixture.unreachableSha, merged: true },
      }),
    }),
    { cwd: fixture.work },
  );
  assert.equal(result.reachable, false);
  assert.equal(result.refreshed, true);
  assert.match(result.message, /not reachable/);
}

async function testDryRunPlansNoMutation() {
  const result = await completion.completeMergedPrTask(
    options({ mode: 'dry-run', confirmation: '', token: '', databaseId: '' }),
    reachableDependency(),
  );
  assert.equal(result.status, 'merged_pr_completion_planned');
  assert.equal(result.tracker_updated, false);
  assert.equal(result.base_branch_refreshed, true);
  assert.equal(result.merge_commit_reachable, true);
  assert.equal(result.progress_source, 'notion');
}

async function testUnreachableMergeCommitBlocksBeforeMutation() {
  const client = makeClient('In Progress');
  const result = await completion.completeMergedPrTask(options(), {
    client,
    now: () => '2026-07-07T06:30:00.000Z',
    checkMergeCommitReachable: () => ({
      reachable: false,
      refreshed: true,
      refreshSource: 'unit-test-fetch',
      source: 'unit-test',
      message: 'merge-sha-35 is not reachable from develop',
    }),
  });
  assert.equal(result.status, 'merged_pr_completion_blocked');
  assert.equal(result.reason, 'merge_commit_not_on_develop');
  assert.equal(result.merge_commit_reachable, false);
  assert.equal(client.calls.length, 0);
}

async function testLiveCompletionUpdatesNotionAndEvidence() {
  const client = makeClient('In Progress');
  const result = await completion.completeMergedPrTask(
    options(),
    reachableDependency({ client }),
  );
  assert.equal(result.status, 'merged_pr_task_completed');
  assert.equal(result.tracker_updated, true);
  assert.equal(result.required_checks_passed, true);
  assert.equal(result.base_branch_refreshed, true);
  assert.equal(result.merge_commit_reachable, true);
  assert.equal(result.previous_task_status, 'In Progress');
  assert.equal(result.next_task_status, 'Done');

  const update = client.calls.find((call) => call.type === 'update');
  assert.ok(update, 'expected Notion update call');
  assert.deepEqual(update.properties.Status, { status: { name: 'Done' } });
  assert.equal(
    update.properties['Review ID'].url,
    'https://github.com/dev-jeyelscott/garageos/pull/35',
  );
  assert.equal(update.properties['Commit SHA'].rich_text[0].text.content, 'merge-sha-35');
  assert.equal(
    update.properties['Commit URL'].url,
    'https://github.com/dev-jeyelscott/garageos/commit/merge-sha-35',
  );
  assert.match(
    update.properties['Progress Source'].rich_text[0].text.content,
    /Progress source: Notion/,
  );
}

async function testNotionUpdateFailureLeavesTaskUnchanged() {
  const client = makeClient('In Progress', { failUpdateAt: 1 });
  const result = await completion.completeMergedPrTask(
    options(),
    reachableDependency({ client }),
  );
  assert.equal(result.status, 'merged_pr_completion_failed');
  assert.equal(result.reason, 'notion_update_failed');
  assert.equal(result.tracker_updated, false);
  assert.equal(result.next_task_status, 'In Progress');
}

async function testVerificationFailureRollsBackTask() {
  const client = makeClient('In Progress', { fetchStatusAt: { 2: 'Ready' } });
  const result = await completion.completeMergedPrTask(
    options(),
    reachableDependency({ client }),
  );
  assert.equal(result.status, 'merged_pr_completion_failed');
  assert.equal(result.reason, 'completion_verification_failed');
  assert.equal(result.tracker_updated, false);
  assert.equal(result.rollback_attempted, true);
  assert.equal(result.rollback_succeeded, true);
  assert.equal(result.next_task_status, 'In Progress');
  assert.equal(
    client.calls.filter((call) => call.type === 'update').length,
    2,
    'expected completion update and compensating rollback',
  );
}

async function testAlreadyDoneIsIdempotentNoOp() {
  const client = makeClient('Done');
  const result = await completion.completeMergedPrTask(
    options(),
    reachableDependency({ client }),
  );
  assert.equal(result.status, 'merged_pr_task_already_done');
  assert.equal(
    client.calls.some((call) => call.type === 'update'),
    false,
  );
}

async function testUnsupportedStatusBlocksWithoutMutation() {
  const client = makeClient('Ready');
  const result = await completion.completeMergedPrTask(
    options(),
    reachableDependency({ client }),
  );
  assert.equal(result.status, 'merged_pr_completion_blocked');
  assert.equal(result.reason, 'unsupported_task_status');
  assert.equal(
    client.calls.some((call) => call.type === 'update'),
    false,
  );
}

function testResolveRuntimeOptionsReadsArtifacts() {
  const dir = makeTempDir();
  fs.mkdirSync(path.join(dir, '.tmp'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.tmp', 'pr-guarded-merge-result.json'),
    `${JSON.stringify(guardedMergeResult(), null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, '.tmp', 'eng-loop-run-ledger.json'),
    `${JSON.stringify({ task: { id: 'task-from-ledger' } }, null, 2)}\n`,
    'utf8',
  );

  const resolved = completion.resolveRuntimeOptions(
    {},
    {
      GARAGEOS_NOTION_TOKEN: 'token',
      GARAGEOS_NOTION_TASK_DATABASE_ID: 'db',
    },
    dir,
  );
  assert.equal(resolved.taskId, 'task-from-ledger');
  assert.equal(resolved.guardedMergeResult.status, 'guarded_merge_merged');
  assert.equal(resolved.token, 'token');
  assert.equal(resolved.databaseId, 'db');
  assert.equal(Object.prototype.hasOwnProperty.call(resolved, 'progressTrackerFile'), false);
}

function testWriteOutputsUpdatesLedger() {
  const dir = makeTempDir();
  const result = {
    status: 'merged_pr_task_completed',
    tracker_updated: true,
    reason: 'tracker_status_updated',
    message: 'Merged PR Notion task completion completed.',
    evaluated_at: '2026-07-07T06:30:00.000Z',
    task_id: 'task-35',
    task_title: 'ENG-LOOP-35 - Auto-complete merged PR task tracker updates',
    previous_task_status: 'In Progress',
    next_task_status: 'Done',
    repository: 'dev-jeyelscott/garageos',
    pr_number: 35,
    pr_url: 'https://github.com/dev-jeyelscott/garageos/pull/35',
    merge_sha: 'merge-sha-35',
    required_checks_passed: true,
    base_branch: 'develop',
    base_branch_refreshed: true,
    base_branch_refresh_source: 'unit-test-fetch',
    merge_commit_reachable: true,
    merge_commit_reachability_source: 'unit-test',
    rollback_attempted: false,
    rollback_succeeded: null,
    rollback_error: null,
    progress_source: 'notion',
  };

  const artifacts = completion.writeOutputs(result, {
    resultFile: path.join(dir, 'result.json'),
    summaryFile: path.join(dir, 'summary.md'),
    ledgerFile: path.join(dir, 'ledger.json'),
  });

  const savedResult = JSON.parse(fs.readFileSync(artifacts.resultFile, 'utf8'));
  const summary = fs.readFileSync(artifacts.summaryFile, 'utf8');
  const ledger = JSON.parse(fs.readFileSync(artifacts.ledgerFile, 'utf8'));
  assert.equal(savedResult.status, 'merged_pr_task_completed');
  assert.match(summary, /Notion task updated: yes/);
  assert.match(summary, /Base branch ref refreshed: yes/);
  assert.match(summary, /Progress source: notion/);
  assert.equal(ledger.merged_pr_completion.tracker_updated, true);
  assert.equal(ledger.merged_pr_completion.base_branch_refreshed, true);
  assert.equal(ledger.merged_pr_completion.merge_commit_reachable, true);
  assert.equal(ledger.merged_pr_completion.progress_source, 'notion');
  assert.equal(ledger.events.at(-1).type, 'merged_pr_task_completed');
}

async function run() {
  const tests = [
    testMissingMergeResultBlocks,
    testUnmergedResultBlocks,
    testFailedCheckEvidenceBlocks,
    testLiveModeRequiresConfirmation,
    testUnsafeBaseBranchRejected,
    testRealGitReachabilityRefreshesRemoteBase,
    testRealGitUnreachableCommitBlocks,
    testDryRunPlansNoMutation,
    testUnreachableMergeCommitBlocksBeforeMutation,
    testLiveCompletionUpdatesNotionAndEvidence,
    testNotionUpdateFailureLeavesTaskUnchanged,
    testVerificationFailureRollsBackTask,
    testAlreadyDoneIsIdempotentNoOp,
    testUnsupportedStatusBlocksWithoutMutation,
    testResolveRuntimeOptionsReadsArtifacts,
    testWriteOutputsUpdatesLedger,
  ];

  for (const test of tests) {
    await test();
    console.log(`passed: ${test.name}`);
  }

  console.log(`All ${tests.length} merged PR completion tests passed.`);
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
