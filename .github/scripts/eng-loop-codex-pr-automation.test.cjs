#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const automation = require('./eng-loop-codex-pr-automation.cjs');

function task(overrides = {}) {
  return {
    id: 'task-25',
    title: 'ENG-LOOP-25 — Add Codex-powered first-5 PR automation',
    branch: 'chore/eng-loop-25-codex-powered-first-five-pr-automation',
    repository: 'dev-jeyelscott/garageos',
    url: 'https://app.notion.com/p/task-25',
    raw: { properties: {} },
    ...overrides,
  };
}

function testParseCliArgs() {
  const parsed = automation.parseCliArgs(['--mode=dry-run', '--limit=5', '--scan-limit=250'], {});
  assert.equal(parsed.mode, 'dry-run');
  assert.equal(parsed.limit, 5);
  assert.equal(parsed.scanLimit, 250);
  assert.equal(parsed.baseBranch, 'develop');
}

function testRejectsUnsafeModeAndLimit() {
  assert.throws(() => automation.parseCliArgs(['--mode=delete'], {}), /dry-run or live/);
  assert.throws(() => automation.parseCliArgs(['--limit=6'], {}), /integer from 1 to 5/);
}

function testSafeBranchValidation() {
  assert.equal(
    automation.validateSafeBranchName('chore/eng-loop-25-codex-powered-first-five-pr-automation'),
    'chore/eng-loop-25-codex-powered-first-five-pr-automation',
  );
  assert.throws(() => automation.validateSafeBranchName('-bad'), /Unsafe branch/);
  assert.throws(() => automation.validateSafeBranchName('bad;rm-rf'), /Unsafe branch/);
  assert.throws(() => automation.validateSafeBranchName('bad..branch'), /Unsafe branch/);
  assert.throws(() => automation.validateSafeBranchName('bad//branch'), /Unsafe branch/);
}

function testValidationCommandGuard() {
  assert.equal(
    automation.validateSafeValidationCommand('pnpm validate:quick'),
    'pnpm validate:quick',
  );
  assert.equal(
    automation.validateSafeValidationCommand('node ./.github/scripts/eng-loop-runner.test.cjs'),
    'node ./.github/scripts/eng-loop-runner.test.cjs',
  );
  assert.throws(
    () => automation.validateSafeValidationCommand('pnpm validate:quick && echo unsafe'),
    /must not contain shell metacharacters/,
  );
}

function testPromptIncludesAutomationBoundaries() {
  const prompt = automation.buildCodexPrompt({
    task: task(),
    validationCommand: 'pnpm validate:quick',
    baseBranch: 'develop',
  });

  assert.match(prompt, /Implement exactly one claimed GarageOS engineering-loop task/);
  assert.match(prompt, /Do not commit/);
  assert.match(prompt, /Do not push/);
  assert.match(prompt, /Do not create a PR/);
  assert.match(prompt, /pnpm validate:quick/);
}

function testPrBodyContainsRequiredSections() {
  const body = automation.buildPrBody({
    task: task(),
    validationCommand: 'pnpm validate:quick',
    validationOutput: 'All checks passed.',
    codexFinalMessage: 'Implemented task and ran validation.',
  });

  assert.match(body, /## Summary/);
  assert.match(body, /## Source Alignment/);
  assert.match(body, /## Changes/);
  assert.match(body, /## Validation Evidence/);
  assert.match(body, /## Risk Review/);
  assert.match(body, /## Rollback Plan/);
  assert.match(body, /`pnpm validate:quick` — Passed/);
}

function testPlanMarkdownIncludesCodexFlow() {
  const markdown = automation.createPlanMarkdown({
    args: {
      mode: 'dry-run',
      limit: 5,
      baseBranch: 'develop',
      repository: 'dev-jeyelscott/garageos',
      validationCommand: 'pnpm validate:quick',
    },
    selectedTasks: [task()],
  });

  assert.match(markdown, /Codex-Powered First-5 PR Automation Plan/);
  assert.match(markdown, /claim → worktree → Codex exec → validation → commit → push → PR/);
}

function testRedactsSensitiveOutput() {
  const output = automation.redactSensitiveText(
    'NOTION_TOKEN=secret_abc Authorization: Bearer xyz',
  );
  assert.equal(output.includes('secret_abc'), false);
  assert.equal(output.includes('Bearer xyz'), false);
}

function testTaskKeyExtraction() {
  assert.equal(automation.taskKeyFromTitle('ENG-LOOP-25 — Add Codex executor'), 'ENG-LOOP-25');
  assert.equal(automation.taskKeyFromTitle('M10.01 — Implement expense categories'), 'M10.01');
}

const tests = [
  testParseCliArgs,
  testRejectsUnsafeModeAndLimit,
  testSafeBranchValidation,
  testValidationCommandGuard,
  testPromptIncludesAutomationBoundaries,
  testPrBodyContainsRequiredSections,
  testPlanMarkdownIncludesCodexFlow,
  testRedactsSensitiveOutput,
  testTaskKeyExtraction,
];

for (const test of tests) {
  test();
  console.log(`passed: ${test.name}`);
}

console.log(`All ${tests.length} Codex PR automation tests passed.`);
