#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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

class InMemoryTaskClient {
  constructor(pages, options = {}) {
    this.pages = pages;
    this.updates = [];
    this.conflictOnFetchIds = new Set(options.conflictOnFetchIds ?? []);
  }

  async listTaskPages() {
    return this.pages;
  }

  async fetchPage(pageId) {
    const page = this.pages.find((candidate) => String(candidate.id) === String(pageId));
    if (!page) throw new Error(`Fixture page not found: ${pageId}`);

    if (this.conflictOnFetchIds.has(String(pageId))) {
      return {
        ...page,
        properties: {
          ...page.properties,
          Status: { type: 'status', status: { name: 'In Progress' } },
        },
      };
    }

    return page;
  }

  async updatePageProperties(pageId, properties) {
    const page = this.pages.find((candidate) => String(candidate.id) === String(pageId));
    if (!page) throw new Error(`Fixture page not found: ${pageId}`);

    this.updates.push({ pageId, properties });

    for (const [name, value] of Object.entries(properties)) {
      if (value.status) {
        page.properties[name] = { type: 'status', status: { name: value.status.name } };
      } else if (value.select) {
        page.properties[name] = { type: 'select', select: { name: value.select.name } };
      } else if (value.rich_text) {
        page.properties[name] = { type: 'rich_text', rich_text: value.rich_text };
      } else if (value.title) {
        page.properties[name] = { type: 'title', title: value.title };
      } else {
        page.properties[name] = value;
      }
    }

    return page;
  }
}

function makeBatchPages(count) {
  return Array.from({ length: count }, (_, index) => {
    const taskNumber = 24 + index;
    return page({
      id: `task-${taskNumber}`,
      task: `ENG-LOOP-${taskNumber} — Batch test task ${taskNumber}`,
      branch: `chore/eng-loop-${taskNumber}-batch-test`,
      priority: 'P1',
      createdAt: `2026-07-${String(index + 1).padStart(2, '0')}`,
    });
  });
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'garageos-eng-loop-'));
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

async function testSelectEligibleTasksUsesFirstFiveLimit() {
  const selected = runner.selectEligibleTasks(makeBatchPages(6), { limit: 5 });
  assert.equal(selected.length, 5);
  assert.equal(selected[0].id, 'task-24');
  assert.equal(selected[4].id, 'task-28');
}

async function testFirstFiveDryRunPlansOnly() {
  const cwd = makeTempDir();
  const client = new InMemoryTaskClient(makeBatchPages(6));
  const result = await runner.runFirstFiveDryRun({
    client,
    args: { actor: 'tester' },
    cwd,
  });

  assert.equal(result.status, 'planned');
  assert.equal(result.selected.length, 5);
  assert.equal(client.updates.length, 0);
  assert.equal(fs.existsSync(path.join(cwd, '.tmp', 'eng-loop-batch-summary.json')), true);
}

async function testFirstFiveProcessesFiveSuccesses() {
  const cwd = makeTempDir();
  const client = new InMemoryTaskClient(makeBatchPages(6));
  const result = await runner.runFirstFive({
    client,
    args: { actor: 'tester', staleClaimHours: 24, confirmFirstFive: true },
    cwd,
  });

  assert.equal(result.status, 'succeeded');
  assert.equal(result.summary.selected_count, 5);
  assert.equal(result.summary.processed_count, 5);
  assert.equal(result.summary.success_count, 5);
  assert.equal(result.summary.failure_count, 0);
  assert.equal(result.summary.stop_reason, 'max_count_reached');
  assert.equal(client.updates.length, 5);
}

async function testFirstFiveStopsOnClaimConflict() {
  const cwd = makeTempDir();
  const client = new InMemoryTaskClient(makeBatchPages(6), { conflictOnFetchIds: ['task-25'] });

  await assert.rejects(
    () =>
      runner.runFirstFive({
        client,
        args: { actor: 'tester', staleClaimHours: 24, confirmFirstFive: true },
        cwd,
      }),
    /Claim conflict/i,
  );

  const summary = JSON.parse(
    fs.readFileSync(path.join(cwd, '.tmp', 'eng-loop-batch-summary.json'), 'utf8'),
  );
  assert.equal(summary.status, 'failed');
  assert.equal(summary.stop_reason, 'claim_conflict');
  assert.equal(summary.success_count, 1);
  assert.equal(summary.failure_count, 1);
  assert.equal(client.updates.length, 1);
}

async function testFirstFiveZeroEligibleTasks() {
  const cwd = makeTempDir();
  const pages = makeBatchPages(3).map((candidate) =>
    page({ id: candidate.id, task: runner.taskFromPage(candidate).title, status: 'Done' }),
  );
  const client = new InMemoryTaskClient(pages);
  const result = await runner.runFirstFiveDryRun({
    client,
    args: { actor: 'tester' },
    cwd,
  });

  assert.equal(result.status, 'no_task');
  assert.equal(result.summary.stop_reason, 'zero_eligible_tasks');
  assert.equal(result.summary.selected_count, 0);
}

async function testFirstFiveRequiresConfirmation() {
  const client = new InMemoryTaskClient(makeBatchPages(1));

  await assert.rejects(
    () => runner.runFirstFive({ client, args: { actor: 'tester', staleClaimHours: 24 } }),
    /requires --confirm-first-5/i,
  );
}

const tests = [
  testTaskParsing,
  testEligibility,
  testDeterministicSelection,
  testClaimPatchUsesExistingNotionPropertyTypes,
  testClaimSummaryAndClaimExtraction,
  testLedgerLifecycle,
  testStaleClaimDetection,
  testSelectEligibleTasksUsesFirstFiveLimit,
  testFirstFiveDryRunPlansOnly,
  testFirstFiveProcessesFiveSuccesses,
  testFirstFiveStopsOnClaimConflict,
  testFirstFiveZeroEligibleTasks,
  testFirstFiveRequiresConfirmation,
];

async function runTests() {
  for (const test of tests) {
    await test();
    console.log(`passed: ${test.name}`);
  }

  console.log(`All ${tests.length} engineering loop runner tests passed.`);
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
