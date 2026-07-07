#!/usr/bin/env node
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, '.github', 'scripts', 'eng-loop-workflow-preflight.cjs');

function runPreflight(env) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      INPUT_MODE: 'dry-run',
      INPUT_MAX_TASKS: '1',
      INPUT_DRY_RUN: 'true',
      INPUT_CREATE_BRANCH: 'false',
      INPUT_CREATE_PR_BODY: 'true',
      INPUT_MUTATE_NOTION: 'false',
      INPUT_RUN_VALIDATION: 'true',
      INPUT_VALIDATION_COMMAND: 'pnpm validate:quick',
      INPUT_MUTATION_CONFIRMATION: '',
      INPUT_MERGE_PR: 'false',
      INPUT_MERGE_CONFIRMATION: '',
      INPUT_MERGE_METHOD: 'squash',
      NOTION_TOKEN: '',
      NOTION_API_KEY: '',
      GITHUB_TOKEN: 'unit-test-github-token',
      ...env,
    },
    encoding: 'utf8',
  });
}

function assertPassed(name, env) {
  const result = runPreflight(env);
  assert.equal(
    result.status,
    0,
    `${name} expected pass
STDOUT:
${result.stdout}
STDERR:
${result.stderr}`,
  );
  console.log(`passed: ${name}`);
  return result;
}

function assertFailed(name, env, expectedText) {
  const result = runPreflight(env);
  assert.notEqual(result.status, 0, `${name} expected failure`);
  const output = `${result.stdout}
${result.stderr}`;
  assert.match(
    output,
    expectedText,
    `${name} expected output to match ${expectedText}
${output}`,
  );
  console.log(`passed: ${name}`);
  return result;
}

assertPassed('testDefaultDryRunIsAllowed', {});

assertFailed('testMaxTasksAboveOneIsRejected', { INPUT_MAX_TASKS: '5' }, /requires max_tasks=1/i);

assertFailed(
  'testDryRunCannotDisableDryRunFlag',
  { INPUT_DRY_RUN: 'false' },
  /dry_run must remain true/i,
);

assertFailed(
  'testDryRunCannotCreateBranch',
  { INPUT_CREATE_BRANCH: 'true' },
  /create_branch cannot be true/i,
);

assertFailed(
  'testDryRunCannotMutateNotion',
  { INPUT_MUTATE_NOTION: 'true' },
  /mutate_notion cannot be true/i,
);

assertFailed(
  'testRunModeRequiresDryRunFalse',
  { INPUT_MODE: 'run', INPUT_DRY_RUN: 'true', INPUT_MUTATION_CONFIRMATION: 'ENG-LOOP-23-RUN' },
  /requires dry_run=false/i,
);

assertFailed(
  'testRunModeRequiresConfirmation',
  { INPUT_MODE: 'run', INPUT_DRY_RUN: 'false' },
  /requires mutation_confirmation=ENG-LOOP-23-RUN/i,
);

assertFailed(
  'testMutateNotionRequiresSecret',
  {
    INPUT_MODE: 'run',
    INPUT_DRY_RUN: 'false',
    INPUT_MUTATION_CONFIRMATION: 'ENG-LOOP-23-RUN',
    INPUT_MUTATE_NOTION: 'true',
    NOTION_TOKEN: '',
    NOTION_API_KEY: '',
  },
  /requires NOTION_TOKEN or NOTION_API_KEY/i,
);

assertPassed('testMutateNotionWithSecretIsAllowed', {
  INPUT_MODE: 'run',
  INPUT_DRY_RUN: 'false',
  INPUT_MUTATION_CONFIRMATION: 'ENG-LOOP-23-RUN',
  INPUT_MUTATE_NOTION: 'true',
  NOTION_TOKEN: 'unit-test-secret-token',
});

assertPassed('testFirstFiveDryRunIsAllowed', {
  INPUT_MODE: 'first-5-dry-run',
  INPUT_MAX_TASKS: '5',
  INPUT_DRY_RUN: 'true',
});

assertFailed(
  'testFirstFiveDryRunRequiresMaxTasksFive',
  { INPUT_MODE: 'first-5-dry-run', INPUT_MAX_TASKS: '1' },
  /requires max_tasks=5/i,
);

assertFailed(
  'testFirstFiveRunRequiresConfirmation',
  { INPUT_MODE: 'first-5', INPUT_MAX_TASKS: '5', INPUT_DRY_RUN: 'false' },
  /requires mutation_confirmation=ENG-LOOP-24-FIRST-5/i,
);

assertPassed('testFirstFiveRunWithConfirmationIsAllowed', {
  INPUT_MODE: 'first-5',
  INPUT_MAX_TASKS: '5',
  INPUT_DRY_RUN: 'false',
  INPUT_MUTATION_CONFIRMATION: 'ENG-LOOP-24-FIRST-5',
});

assertFailed(
  'testUnsafeValidationCommandIsRejected',
  { INPUT_VALIDATION_COMMAND: 'pnpm validate:quick && echo unsafe' },
  /must not contain shell metacharacters/i,
);

assertFailed(
  'testDryRunCannotMergePr',
  { INPUT_MERGE_PR: 'true', INPUT_MERGE_CONFIRMATION: 'ENG-LOOP-33-MERGE' },
  /merge_pr cannot be true in dry-run mode/i,
);

assertFailed(
  'testMergePrRequiresRunMode',
  {
    INPUT_MODE: 'first-5',
    INPUT_MAX_TASKS: '5',
    INPUT_DRY_RUN: 'false',
    INPUT_MUTATION_CONFIRMATION: 'ENG-LOOP-24-FIRST-5',
    INPUT_MERGE_PR: 'true',
    INPUT_MERGE_CONFIRMATION: 'ENG-LOOP-33-MERGE',
  },
  /merge_pr requires mode=run/i,
);

assertFailed(
  'testMergePrRequiresConfirmation',
  {
    INPUT_MODE: 'run',
    INPUT_DRY_RUN: 'false',
    INPUT_MUTATION_CONFIRMATION: 'ENG-LOOP-23-RUN',
    INPUT_MERGE_PR: 'true',
  },
  /requires merge_confirmation=ENG-LOOP-33-MERGE/i,
);

assertFailed(
  'testInvalidMergeMethodRejected',
  { INPUT_MERGE_METHOD: 'octopus' },
  /merge_method must be merge, squash, or rebase/i,
);

assertPassed('testMergePrWithConfirmationIsAllowed', {
  INPUT_MODE: 'run',
  INPUT_DRY_RUN: 'false',
  INPUT_MUTATION_CONFIRMATION: 'ENG-LOOP-23-RUN',
  INPUT_MERGE_PR: 'true',
  INPUT_MERGE_CONFIRMATION: 'ENG-LOOP-33-MERGE',
});

const secretResult = assertPassed('testSecretValueIsNotPrinted', {
  INPUT_MODE: 'run',
  INPUT_DRY_RUN: 'false',
  INPUT_MUTATION_CONFIRMATION: 'ENG-LOOP-23-RUN',
  INPUT_MUTATE_NOTION: 'true',
  NOTION_TOKEN: 'super-secret-token-that-must-not-print',
});
const combinedOutput = `${secretResult.stdout}
${secretResult.stderr}`;
assert.equal(combinedOutput.includes('super-secret-token-that-must-not-print'), false);

console.log('All 20 engineering loop manual workflow preflight tests passed.');
