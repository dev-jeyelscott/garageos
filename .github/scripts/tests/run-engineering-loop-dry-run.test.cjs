#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const runner = require('../run-engineering-loop-dry-run.cjs');

function validTask(overrides = {}) {
  return {
    Task: 'ENG-LOOP-17 — Add engineering loop runner dry-run mode',
    Status: 'Backlog',
    Priority: 'P1',
    Category: 'Maintainability',
    Dependencies: 'ENG-LOOP-16',
    'Codex Ready': '__YES__',
    Branch: 'chore/eng-loop-17-runner-dry-run',
    Repository: 'dev-jeyelscott/garageos',
    'Validation Commands': 'pnpm validate:quick',
    'Commit Message': 'chore(engineering): add loop runner dry-run mode',
    'Source Alignment': 'Engineering-loop automation only.',
    'Progress Source': 'Test fixture.',
    ...overrides,
  };
}

function doneDependency() {
  return validTask({
    Task: 'ENG-LOOP-16 — Add machine-readable Notion task schema',
    Status: 'Done',
    Dependencies: 'ENG-LOOP-15',
    Branch: 'docs/eng-loop-16-notion-task-schema',
    'Commit Message': 'docs(engineering): add notion task schema',
  });
}

test('selectEligibleTask selects exactly one eligible task deterministically', () => {
  const schema = runner.DEFAULT_TASK_SCHEMA;
  const result = runner.selectEligibleTask([doneDependency(), validTask()], schema);

  assert.equal(result.eligibleCount, 1);
  assert.equal(result.selectedTask.id, 'ENG-LOOP-17');
  assert.equal(result.selectedTask.branch, 'chore/eng-loop-17-runner-dry-run');
});

test('selectEligibleTask skips incomplete dependencies', () => {
  const schema = runner.DEFAULT_TASK_SCHEMA;
  const result = runner.selectEligibleTask([validTask()], schema);

  assert.equal(result.eligibleCount, 0);
  assert.equal(result.selectedTask, null);
  assert.match(result.evaluatedTasks[0].reason, /Incomplete dependency/u);
});

test('selectEligibleTask skips tasks that are not Codex ready', () => {
  const schema = runner.DEFAULT_TASK_SCHEMA;
  const result = runner.selectEligibleTask(
    [doneDependency(), validTask({ 'Codex Ready': '__NO__' })],
    schema,
  );

  assert.equal(result.eligibleCount, 0);
  assert.equal(result.selectedTask, null);
  assert.match(result.evaluatedTasks[1].reason, /Codex Ready/u);
});

test('selectEligibleTask rejects malformed task data', () => {
  const schema = runner.DEFAULT_TASK_SCHEMA;
  assert.throws(
    () => runner.selectEligibleTask([{ Task: 'ENG-LOOP-99 — Broken task' }], schema),
    /Malformed engineering-loop task data/u,
  );
});

test('buildExecutionPlan always reports zero mutations in ENG-LOOP-17 dry-run mode', () => {
  const schema = runner.DEFAULT_TASK_SCHEMA;
  const result = runner.selectEligibleTask([doneDependency(), validTask()], schema);
  const plan = runner.buildExecutionPlan(result.selectedTask, schema);

  assert.deepEqual(plan.mutations, {
    notion: 0,
    github: 0,
    git: 0,
    files: 0,
  });
  assert.equal(plan.mode, 'dry_run');
});

test('CLI dry-run succeeds with explicit task fixture', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eng-loop-dry-run-'));
  const fixturePath = path.join(tempDir, 'tasks.json');
  fs.writeFileSync(fixturePath, JSON.stringify([doneDependency(), validTask()], null, 2));

  const result = spawnSync(
    process.execPath,
    [
      path.resolve(__dirname, '../run-engineering-loop-dry-run.cjs'),
      '--dry-run',
      '--tasks-file',
      fixturePath,
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Engineering Loop Dry Run/u);
  assert.match(result.stdout, /ENG-LOOP-17/u);
  assert.match(result.stdout, /Notion writes: 0/u);
});
