'use strict';

const assert = require('node:assert/strict');
const policy = require('./eng-loop-task-scope.cjs');

function task(overrides = {}) {
  return {
    properties: {
      Task: 'M10.01 — Implement expense categories',
      Status: 'Ready',
      Priority: 'P1',
      Milestone: 'M10',
      Repository: 'dev-jeyelscott/garageos',
      Branch: 'feat/m10-01-expense-categories',
      'Codex Ready': '__YES__',
      'Validation Commands': 'pnpm validate:quick',
      ...overrides,
    },
  };
}

function testParseTaskScope() {
  assert.equal(policy.parseTaskScopeFromArgs(['--task-scope=all'], {}), 'all');
  assert.equal(policy.parseTaskScopeFromArgs(['--task-scope', 'eng-loop'], {}), 'eng-loop');
  assert.equal(policy.parseTaskScopeFromArgs(['--eng-loop-only'], {}), 'eng-loop');
  assert.equal(policy.parseTaskScopeFromArgs([], { ENG_LOOP_TASK_SCOPE: 'all' }), 'all');
  assert.throws(
    () => policy.parseTaskScopeFromArgs(['--task-scope=unsafe'], {}),
    /Unsupported task scope/,
  );
}

function testAllScopeAllowsNonEngLoopTasks() {
  assert.equal(policy.isEligibleTrackerTask(task(), { taskScope: 'all', mode: 'dry-run' }), true);
  assert.equal(
    policy.explainTrackerTaskEligibility(task(), { taskScope: 'all', mode: 'dry-run' }).reason,
    'eligible',
  );
}

function testEngLoopScopeRejectsNonEngLoopTasks() {
  assert.equal(
    policy.isEligibleTrackerTask(task(), { taskScope: 'eng-loop', mode: 'dry-run' }),
    false,
  );
  assert.equal(
    policy.explainTrackerTaskEligibility(task(), { taskScope: 'eng-loop', mode: 'dry-run' }).reason,
    'outside_eng_loop_scope',
  );
}

function testEngLoopScopeKeepsEngLoopTasks() {
  assert.equal(
    policy.isEligibleTrackerTask(
      task({
        Task: 'ENG-LOOP-26 — Generalize engineering loop task selection to all tracker tasks',
      }),
      { taskScope: 'eng-loop', mode: 'dry-run' },
    ),
    true,
  );
}

function testFailClosedSkipsUnsafeTasks() {
  assert.equal(
    policy.explainTrackerTaskEligibility(task({ Status: 'Done' }), { taskScope: 'all' }).reason,
    'done_status',
  );
  assert.equal(
    policy.explainTrackerTaskEligibility(task({ Status: 'Blocked' }), { taskScope: 'all' }).reason,
    'blocked_status',
  );
  assert.equal(
    policy.explainTrackerTaskEligibility(
      task({ 'Progress Source': 'Claimed by engineering loop run abc' }),
      { taskScope: 'all' },
    ).reason,
    'active_claim',
  );
  assert.equal(
    policy.explainTrackerTaskEligibility(task({ Task: '[Review] garageos@abc — 1 finding' }), {
      taskScope: 'all',
    }).reason,
    'review_only',
  );
  assert.equal(
    policy.explainTrackerTaskEligibility(task({ 'Codex Ready': '__NO__' }), { taskScope: 'all' })
      .reason,
    'missing_metadata:Codex Ready',
  );
  assert.equal(
    policy.explainTrackerTaskEligibility(task({ Branch: '' }), { taskScope: 'all', mode: 'live' })
      .reason,
    'missing_metadata:Branch',
  );
}

function testDeterministicOrdering() {
  const tasks = [
    task({ Task: 'UI-002 — Build tenant shell', Priority: 'P2', Milestone: 'M1' }),
    task({ Task: 'DB-001 — Add tenant migrations', Priority: 'P1', Milestone: 'M1' }),
    task({ Task: 'API-001 — Add auth routes', Priority: 'P1', Milestone: 'M0' }),
  ];

  tasks.sort(policy.compareTrackerTasks);
  assert.deepEqual(
    tasks.map((item) => policy.getTaskKey(item)),
    ['API-001', 'DB-001', 'UI-002'],
  );
}

const tests = [
  testParseTaskScope,
  testAllScopeAllowsNonEngLoopTasks,
  testEngLoopScopeRejectsNonEngLoopTasks,
  testEngLoopScopeKeepsEngLoopTasks,
  testFailClosedSkipsUnsafeTasks,
  testDeterministicOrdering,
];

for (const run of tests) {
  run();
  console.log(`passed: ${run.name}`);
}

console.log(`All ${tests.length} task-scope tests passed.`);
