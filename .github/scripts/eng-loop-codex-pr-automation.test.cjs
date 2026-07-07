#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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
  const parsed = automation.parseCliArgs(
    ['--mode=dry-run', '--limit=5', '--scan-limit=250', '--task-scope=all'],
    {},
  );
  assert.equal(parsed.mode, 'dry-run');
  assert.equal(parsed.limit, 5);
  assert.equal(parsed.scanLimit, 250);
  assert.equal(parsed.baseBranch, 'develop');
  assert.equal(parsed.taskScope, 'all');
}

function testTaskScopeAliases() {
  assert.equal(
    automation.parseCliArgs(['--mode=dry-run', '--eng-loop-only'], {}).taskScope,
    'eng-loop',
  );
  assert.equal(automation.parseCliArgs(['--mode=dry-run', '--all-tasks'], {}).taskScope, 'all');
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

function testRunCommandDefaultsToArgvMode() {
  const commitMessage = 'chore(engineering): m10.01 automation task';
  const result = automation.runCommand(process.execPath, [
    '-e',
    'process.stdout.write(JSON.stringify(process.argv.slice(1)))',
    commitMessage,
  ]);

  assert.equal(result.shell, false);
  assert.equal(result.ok, true, result.stderr || result.error?.message || 'runCommand failed');
  assert.deepEqual(JSON.parse(result.stdout), [commitMessage]);
}

function testPromptIncludesAutomationBoundaries() {
  const prompt = automation.buildCodexPrompt({
    task: task(),
    validationCommand: 'pnpm validate:quick',
    baseBranch: 'develop',
  });

  assert.match(prompt, /Implement exactly one claimed GarageOS tracker task/);
  assert.doesNotMatch(prompt, /GarageOS GarageOS tracker task/);
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
    filesChanged: ['.github/scripts/eng-loop-codex-pr-automation.cjs'],
  });

  const requiredSections = [
    '## Summary',
    '## Source Alignment',
    '## Scope',
    '## Files Changed',
    '## Runtime Impact',
    '## Validation Evidence',
    '## Risk Class',
    '## Failure/Follow-Up Notes',
    '## Manual Review Notes',
    '## Merge Readiness Checklist',
  ];

  for (const section of requiredSections) {
    assert.match(body, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(body, /`pnpm validate:quick` — Passed/);
  assert.match(body, /`\.github\/scripts\/eng-loop-codex-pr-automation\.cjs`/);
  assert.match(body, /- \[ \] CI completed successfully\./);
  assert.doesNotMatch(body, /## Changes/);
  assert.doesNotMatch(body, /## Risk Review/);
  assert.doesNotMatch(body, /## Rollback Plan/);
}

function testFormatFilesChangedFallback() {
  assert.equal(automation.formatFilesChanged([]), '- See the PR diff for the complete file list.');
  assert.equal(
    automation.formatFilesChanged(['package.json', '', 'docs/runbooks/engineering-loop.md']),
    '- `package.json`\n- `docs/runbooks/engineering-loop.md`',
  );
}

function testChangedFilesForPrBodyIncludesUntrackedFiles() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eng-loop-codex-pr-files-'));
  const init = automation.runCommand('git', ['init'], { cwd: tmpDir });
  assert.equal(init.ok, true, init.stderr || init.error?.message || 'git init failed');

  fs.writeFileSync(path.join(tmpDir, 'new-file.txt'), 'new file\n', 'utf8');

  assert.deepEqual(automation.changedFilesForPrBody(tmpDir), ['new-file.txt']);
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

async function testStreamingCommandWritesRedactedArtifacts() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eng-loop-codex-stream-'));
  const stdoutPath = path.join(tmpDir, 'codex-stdout.jsonl');
  const stderrPath = path.join(tmpDir, 'codex-stderr.txt');

  const result = await automation.runStreamingCommand(
    process.execPath,
    [
      '-e',
      [
        'process.stdout.write(\'{"type":"started"}\\n\')',
        "process.stderr.write('NOTION_TOKEN=secret_abc\\n')",
        'setTimeout(() => { process.stdout.write(\'{"type":"finished"}\\n\') }, 10)',
      ].join(';'),
    ],
    { stdoutPath, stderrPath },
  );

  assert.equal(result.ok, true, result.stderr || result.error?.message || 'stream command failed');
  assert.match(fs.readFileSync(stdoutPath, 'utf8'), /"type":"started"/);
  assert.match(fs.readFileSync(stdoutPath, 'utf8'), /"type":"finished"/);
  assert.equal(fs.readFileSync(stderrPath, 'utf8').includes('secret_abc'), false);
  assert.match(fs.readFileSync(stderrPath, 'utf8'), /NOTION_TOKEN=\[REDACTED\]/);
}

async function testStreamingCommandPreservesFailureStatus() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eng-loop-codex-stream-failure-'));
  const stdoutPath = path.join(tmpDir, 'codex-stdout.jsonl');
  const stderrPath = path.join(tmpDir, 'codex-stderr.txt');

  const result = await automation.runStreamingCommand(
    process.execPath,
    ['-e', "process.stderr.write('codex failed\\n'); process.exit(7)"],
    { stdoutPath, stderrPath },
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 7);
  assert.match(fs.readFileSync(stderrPath, 'utf8'), /codex failed/);
}

const tests = [
  testParseCliArgs,
  testRejectsUnsafeModeAndLimit,
  testTaskScopeAliases,
  testSafeBranchValidation,
  testValidationCommandGuard,
  testRunCommandDefaultsToArgvMode,
  testPromptIncludesAutomationBoundaries,
  testPrBodyContainsRequiredSections,
  testFormatFilesChangedFallback,
  testChangedFilesForPrBodyIncludesUntrackedFiles,
  testPlanMarkdownIncludesCodexFlow,
  testRedactsSensitiveOutput,
  testTaskKeyExtraction,
  testStreamingCommandWritesRedactedArtifacts,
  testStreamingCommandPreservesFailureStatus,
];

async function main() {
  for (const test of tests) {
    await test();
    console.log(`passed: ${test.name}`);
  }

  console.log(`All ${tests.length} Codex PR automation tests passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
