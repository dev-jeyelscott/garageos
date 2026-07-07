#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const completion = require('./eng-loop-merged-pr-completion.cjs');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eng-loop-merged-pr-completion-'));
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

function makeClient(initialStatus = 'In Progress') {
  const calls = [];
  let page = notionPage(initialStatus);

  return {
    calls,
    async fetchPage(pageId) {
      calls.push({ type: 'fetch', pageId });
      return page;
    },
    async updatePageProperties(pageId, properties) {
      calls.push({ type: 'update', pageId, properties });
      page = {
        ...page,
        properties: {
          ...page.properties,
          ...Object.fromEntries(
            Object.entries(properties).map(([name, patch]) => {
              const existing = page.properties[name] || {};
              if (patch.status) {
                return [name, { ...existing, type: 'status', status: patch.status }];
              }
              if (patch.select) {
                return [name, { ...existing, type: 'select', select: patch.select }];
              }
              if (patch.rich_text) {
                return [name, { ...existing, type: 'rich_text', rich_text: patch.rich_text }];
              }
              if (patch.url) return [name, { ...existing, type: 'url', url: patch.url }];
              return [name, { ...existing, ...patch }];
            }),
          ),
        },
      };
      return page;
    },
  };
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

function testLiveModeRequiresConfirmation() {
  const result = completion.validatePreconditions(options({ confirmation: '' }));

  assert.equal(result.status, 'merged_pr_completion_blocked');
  assert.equal(result.reason, 'live_confirmation_required');
}

function testDryRunPlansNoMutation() {
  return completion
    .completeMergedPrTask(options({ mode: 'dry-run', confirmation: '', token: '', databaseId: '' }))
    .then((result) => {
      assert.equal(result.status, 'merged_pr_completion_planned');
      assert.equal(result.tracker_updated, false);
      assert.equal(result.pr_url, 'https://github.com/dev-jeyelscott/garageos/pull/35');
    });
}

async function testLiveCompletionUpdatesStatusAndEvidenceFields() {
  const client = makeClient('In Progress');
  const result = await completion.completeMergedPrTask(options(), {
    client,
    now: () => '2026-07-07T06:30:00.000Z',
  });

  assert.equal(result.status, 'merged_pr_task_completed');
  assert.equal(result.tracker_updated, true);
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
    /PR merged; task tracker completion recorded/,
  );
}

async function testAlreadyDoneIsIdempotentNoOp() {
  const client = makeClient('Done');
  const result = await completion.completeMergedPrTask(options(), {
    client,
    now: () => '2026-07-07T06:30:00.000Z',
  });

  assert.equal(result.status, 'merged_pr_task_already_done');
  assert.equal(
    client.calls.some((call) => call.type === 'update'),
    false,
  );
}

async function testUnsupportedStatusBlocksWithoutMutation() {
  const client = makeClient('Ready');
  const result = await completion.completeMergedPrTask(options(), {
    client,
    now: () => '2026-07-07T06:30:00.000Z',
  });

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
}

function testWriteOutputsUpdatesLedger() {
  const dir = makeTempDir();
  const result = {
    status: 'merged_pr_task_completed',
    tracker_updated: true,
    reason: 'tracker_status_updated',
    message: 'Merged PR task tracker update completed.',
    evaluated_at: '2026-07-07T06:30:00.000Z',
    task_id: 'task-35',
    task_title: 'ENG-LOOP-35 - Auto-complete merged PR task tracker updates',
    previous_task_status: 'In Progress',
    next_task_status: 'Done',
    repository: 'dev-jeyelscott/garageos',
    pr_number: 35,
    pr_url: 'https://github.com/dev-jeyelscott/garageos/pull/35',
    merge_sha: 'merge-sha-35',
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
  assert.match(summary, /Merged PR Task Completion/);
  assert.equal(ledger.merged_pr_completion.tracker_updated, true);
  assert.equal(ledger.events.at(-1).type, 'merged_pr_task_completed');
}

async function run() {
  const tests = [
    testMissingMergeResultBlocks,
    testUnmergedResultBlocks,
    testLiveModeRequiresConfirmation,
    testDryRunPlansNoMutation,
    testLiveCompletionUpdatesStatusAndEvidenceFields,
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
