#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const automation = require('./eng-loop-pr-automation.cjs');

function baseTask(overrides = {}) {
  return {
    Task: 'ENG-LOOP-20 — Add PR body and branch automation',
    Branch: 'chore/eng-loop-20-pr-branch-automation',
    'Commit Message': 'chore(engineering): add PR body and branch automation',
    Repository: 'dev-jeyelscott/garageos',
    Dependencies: 'ENG-LOOP-19',
    Priority: 'P1',
    Category: 'Maintainability',
    Milestone: 'M0',
    'Source Alignment':
      'Engineering-loop automation only. Adds branch naming, commit metadata, and PR body preparation automation using existing PR evidence rules.',
    'Validation Commands': 'pnpm validate:quick',
    ...overrides,
  };
}

function validationEvidence() {
  return {
    validationCommand: 'pnpm validate:quick',
    validationResultFile: '.tmp/eng-loop-validation-result.json',
    validationEvidenceFile: '.tmp/eng-loop-validation-evidence.md',
    evidenceMarkdown: '- `pnpm validate:quick` — Passed.',
    passed: true,
  };
}

function testExplicitMetadataResolution() {
  const metadata = automation.resolveAutomationMetadata(baseTask());

  assert.equal(metadata.task_id, 'ENG-LOOP-20');
  assert.equal(metadata.branch_name, 'chore/eng-loop-20-pr-branch-automation');
  assert.equal(metadata.commit_message, 'chore(engineering): add PR body and branch automation');
  assert.equal(metadata.pr_title, 'ENG-LOOP-20 — Add PR body and branch automation');
  assert.equal(metadata.repository, 'dev-jeyelscott/garageos');
  assert.equal(metadata.remote_mutation_enabled, false);
}

function testFallbackMetadataResolution() {
  const task = baseTask({ Branch: '', 'Commit Message': '' });
  const metadata = automation.resolveAutomationMetadata(task);

  assert.equal(metadata.branch_name, 'chore/eng-loop-20-add-pr-body-and-branch-automation');
  assert.equal(metadata.commit_message, 'chore(engineering): add PR body and branch automation');
  assert.equal(automation.isSafeBranchName(metadata.branch_name), true);
}

function testUnsafeBranchRejected() {
  assert.throws(
    () => automation.resolveAutomationMetadata(baseTask({ Branch: 'chore/../bad branch' })),
    /Unsafe branch name/,
  );
}

function testNestedNotionProperties() {
  const metadata = automation.resolveAutomationMetadata({
    properties: {
      Task: 'ENG-LOOP-20 — Add PR body and branch automation',
      Branch: 'chore/eng-loop-20-pr-branch-automation',
      'Commit Message': 'chore(engineering): add PR body and branch automation',
      Repository: 'dev-jeyelscott/garageos',
      'Validation Commands': 'pnpm validate:quick',
    },
  });

  assert.equal(metadata.branch_name, 'chore/eng-loop-20-pr-branch-automation');
  assert.equal(metadata.validation_commands, 'pnpm validate:quick');
}

function testPrBodyContainsRequiredSections() {
  const metadata = automation.resolveAutomationMetadata(baseTask());
  const body = automation.renderPrBody(metadata, validationEvidence());

  for (const section of [
    '## Summary',
    '## Source Alignment',
    '## Scope',
    '## Validation Evidence',
    '## Risk Class',
    '## Tracker Updates',
    '## Notes',
  ]) {
    assert.ok(body.includes(section), `Expected PR body to include ${section}`);
  }

  assert.ok(body.includes('`pnpm validate:quick` — Passed'));
  assert.ok(body.includes('`node ./.github/scripts/validate-pr-evidence.cjs` — Passed'));
  assert.ok(body.includes('Remote GitHub mutation remains intentionally gated'));
}

function testValidationEvidenceHeadingIsStripped() {
  const normalized = automation.normalizeValidationEvidenceMarkdown(
    ['## Validation Evidence', '', '- `pnpm validate:quick` — Passed.', ''].join('\n'),
    'pnpm validate:quick',
  );

  assert.equal(normalized.startsWith('## Validation Evidence'), false);
  assert.ok(normalized.includes('`pnpm validate:quick` — Passed'));

  const metadata = automation.resolveAutomationMetadata(baseTask());
  const body = automation.renderPrBody(metadata, {
    evidenceMarkdown: normalized,
  });

  const firstHeading = body.indexOf('## Validation Evidence');
  const secondHeading = body.indexOf('## Validation Evidence', firstHeading + 1);

  assert.notEqual(firstHeading, -1);
  assert.equal(secondHeading, -1);
}

function testPrBodyPassesExistingGuardWhenAvailable() {
  const guardPath = path.join(__dirname, 'validate-pr-evidence.cjs');
  if (!fs.existsSync(guardPath)) {
    console.log('skipped: testPrBodyPassesExistingGuardWhenAvailable; guard file not present');
    return;
  }

  const metadata = automation.resolveAutomationMetadata(baseTask());
  const body = automation.renderPrBody(metadata, validationEvidence());
  const result = spawnSync(process.execPath, [guardPath], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, PR_BODY: body },
    encoding: 'utf8',
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.equal(result.status, 0);
}

const tests = [
  testExplicitMetadataResolution,
  testFallbackMetadataResolution,
  testUnsafeBranchRejected,
  testNestedNotionProperties,
  testPrBodyContainsRequiredSections,
  testValidationEvidenceHeadingIsStripped,
  testPrBodyPassesExistingGuardWhenAvailable,
];

for (const test of tests) {
  test();
  console.log(`passed: ${test.name}`);
}

console.log(`All ${tests.length} engineering loop PR automation tests passed.`);
