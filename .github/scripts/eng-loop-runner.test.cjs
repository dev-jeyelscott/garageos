#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const runner = require('./eng-loop-runner.cjs');

function page({
  id,
  task,
  status = 'Backlog',
  codexReady = true,
  branch = '',
  repository = 'dev-jeyelscott/garageos',
  priority = 'P1',
  progressSource = '',
  createdAt = '2026-07-05',
}) {
  return {
    id,
    url: `https://app.notion.com/p/${id}`,
    properties: {
      Task: { type: 'title', title: [{ plain_text: task }] },
      Status: { type: 'status', status: { name: status } },
      'Codex Ready': { type: 'checkbox', checkbox: codexReady },
      Branch: { type: 'rich_text', rich_text: [{ plain_text: branch }] },
      Repository: { type: 'rich_text', rich_text: [{ plain_text: repository }] },
      Priority: { type: 'select', select: { name: priority } },
      'Progress Source': { type: 'rich_text', rich_text: [{ plain_text: progressSource }] },
      'Created At': { type: 'date', date: { start: createdAt } },
    },
  };
}

function testTaskParsing() {
  const parsed = runner.taskFromPage(
    page({
      id: 'task-18',
      task: 'ENG-LOOP-18 — Add task claiming and run ledger',
      branch: 'chore/eng-loop-18-claim-ledger',
    }),
  );

  assert.equal(parsed.id, 'task-18');
  assert.equal(parsed.status, 'Backlog');
  assert.equal(parsed.codexReady, true);
  assert.equal(parsed.branch, 'chore/eng-loop-18-claim-ledger');
  assert.equal(parsed.repository, 'dev-jeyelscott/garageos');
}

function testEligibility() {
  assert.equal(
    runner.isEligibleTask(
      runner.taskFromPage(
        page({ id: 'task-18', task: 'ENG-LOOP-18 — Add task claiming and run ledger' }),
      ),
    ),
    true,
  );
  assert.equal(
    runner.isEligibleTask(
      runner.taskFromPage(
        page({
          id: 'task-18',
          task: 'ENG-LOOP-18 — Add task claiming and run ledger',
          status: 'In Progress',
        }),
      ),
    ),
    false,
  );
  assert.equal(
    runner.isEligibleTask(
      runner.taskFromPage(
        page({
          id: 'task-18',
          task: 'ENG-LOOP-18 — Add task claiming and run ledger',
          codexReady: false,
        }),
      ),
    ),
    false,
  );
  assert.equal(
    runner.isEligibleTask(
      runner.taskFromPage(
        page({
          id: 'task-18',
          task: 'ENG-LOOP-18 — Add task claiming and run ledger',
          progressSource:
            'Claimed by engineering loop run eng-loop-20260706-000000Z-abc123 at 2026-07-06T00:00:00.000Z.',
        }),
      ),
    ),
    false,
  );
}

function testDeterministicSelection() {
  const selected = runner.selectEligibleTask([
    page({ id: 'task-20', task: 'ENG-LOOP-20 — Add PR body and branch automation' }),
    page({ id: 'task-18', task: 'ENG-LOOP-18 — Add task claiming and run ledger' }),
    page({ id: 'task-19', task: 'ENG-LOOP-19 — Add local validation executor' }),
  ]);

  assert.equal(selected.id, 'task-18');
}

function testClaimPatchUsesExistingNotionPropertyTypes() {
  const source = page({ id: 'task-18', task: 'ENG-LOOP-18 — Add task claiming and run ledger' });
  const patch = runner.buildClaimPatch(
    source,
    'Claimed by engineering loop run eng-loop-test at 2026-07-06T00:00:00.000Z.',
  );

  assert.deepEqual(patch.Status, { status: { name: 'In Progress' } });
  assert.equal(patch['Progress Source'].rich_text[0].text.content.includes('eng-loop-test'), true);
}

function testClaimSummaryAndClaimExtraction() {
  const summary = runner.buildClaimSummary({
    runId: 'eng-loop-20260706-000000Z-abc123',
    actor: 'tester',
    mode: 'claim',
    branch: 'chore/eng-loop-18-claim-ledger',
    timestamp: '2026-07-06T00:00:00.000Z',
  });

  const claim = runner.extractClaimFromProgressSource(summary);
  assert.equal(claim.hasClaimMarker, true);
  assert.equal(claim.runId, 'eng-loop-20260706-000000Z-abc123');
  assert.equal(claim.claimedAt, '2026-07-06T00:00:00.000Z');
}

function testLedgerLifecycle() {
  const task = runner.taskFromPage(
    page({ id: 'task-18', task: 'ENG-LOOP-18 — Add task claiming and run ledger' }),
  );
  const ledger = runner.createLedgerRecord({
    runId: 'eng-loop-test',
    mode: 'claim',
    actor: 'tester',
    task,
    status: 'started',
    summary: 'Started test run.',
    timestamp: '2026-07-06T00:00:00.000Z',
  });

  assert.equal(ledger.status, 'started');
  assert.equal(ledger.task.title, 'ENG-LOOP-18 — Add task claiming and run ledger');
  assert.equal(ledger.events.length, 1);

  const claimed = runner.completeLedgerRecord(
    ledger,
    'claimed',
    'Claim verified.',
    '2026-07-06T00:01:00.000Z',
  );

  assert.equal(claimed.status, 'claimed');
  assert.equal(claimed.completed_at, null);
  assert.equal(claimed.events.at(-1).type, 'run_claimed');
}

function testStaleClaimDetection() {
  const task = runner.taskFromPage(
    page({
      id: 'task-18',
      task: 'ENG-LOOP-18 — Add task claiming and run ledger',
      progressSource: 'Claimed by engineering loop run eng-loop-old at 2026-07-04T00:00:00.000Z.',
    }),
  );

  assert.equal(runner.isClaimStale(task, 24, new Date('2026-07-06T00:00:01.000Z')), true);
  assert.equal(runner.isClaimStale(task, 72, new Date('2026-07-06T00:00:01.000Z')), false);
}

const tests = [
  testTaskParsing,
  testEligibility,
  testDeterministicSelection,
  testClaimPatchUsesExistingNotionPropertyTypes,
  testClaimSummaryAndClaimExtraction,
  testLedgerLifecycle,
  testStaleClaimDetection,
];

for (const test of tests) {
  test();
  console.log(`passed: ${test.name}`);
}

console.log(`All ${tests.length} engineering loop runner tests passed.`);
