#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  executeValidation,
  getTaskValidationCommand,
  isCommandAllowed,
  mergeValidationIntoLedger,
  parseCommandLine,
  resolveSpawnInvocation,
  sanitizeCommandOutput,
  writeValidationArtifacts,
} = require('./eng-loop-validation-executor.cjs');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'garageos-eng-loop-validation-'));
}

function quote(value) {
  const raw = String(value);
  if (/^[A-Za-z0-9_./:@=+-]+$/.test(raw)) return raw;
  return JSON.stringify(raw);
}

function createScript(dir, fileName, content) {
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, content);
  return filePath;
}

test('parseCommandLine supports quoted executable and arguments', () => {
  const parsed = parseCommandLine('"/path with spaces/node" "script with spaces.cjs" --flag');
  assert.equal(parsed.executable, '/path with spaces/node');
  assert.deepEqual(parsed.args, ['script with spaces.cjs', '--flag']);
});

test('isCommandAllowed requires exact normalized command match', () => {
  assert.equal(isCommandAllowed('pnpm   validate:quick', ['pnpm validate:quick']), true);
  assert.equal(
    isCommandAllowed('pnpm validate:quick && echo unsafe', ['pnpm validate:quick']),
    false,
  );
});

test('getTaskValidationCommand reads Notion-style Validation Commands property', () => {
  assert.equal(
    getTaskValidationCommand({ properties: { 'Validation Commands': 'pnpm validate:quick' } }),
    'pnpm validate:quick',
  );
});

test('executeValidation returns passed result for an allowlisted successful command', async () => {
  const dir = makeTempDir();
  const script = createScript(dir, 'pass.cjs', 'console.log("validation ok");\n');
  const command = quote(process.execPath) + ' ' + quote(script);

  const result = await executeValidation({
    command,
    allowedCommands: [command],
    cwd: dir,
    timeoutMs: 3000,
  });

  assert.equal(result.status, 'passed');
  assert.equal(result.classification, 'validation_passed');
  assert.equal(result.exitCode, 0);
  assert.match(result.stdoutSummary, /validation ok/);
});

test('executeValidation returns validation_failed for an allowlisted non-zero command', async () => {
  const dir = makeTempDir();
  const script = createScript(
    dir,
    'fail.cjs',
    'console.error("validation failed"); process.exit(7);\n',
  );
  const command = quote(process.execPath) + ' ' + quote(script);

  const result = await executeValidation({
    command,
    allowedCommands: [command],
    cwd: dir,
    timeoutMs: 3000,
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.classification, 'validation_failed');
  assert.equal(result.exitCode, 7);
  assert.match(result.stderrSummary, /validation failed/);
});

test('CLI ignores pnpm forwarded -- sentinel before options', () => {
  const dir = makeTempDir();
  const script = createScript(dir, 'cli-pass.cjs', 'console.log("cli validation ok");\n');
  const command = quote(process.execPath) + ' ' + quote(script);
  const executor = path.join(__dirname, 'eng-loop-validation-executor.cjs');

  const result = spawnSync(
    process.execPath,
    [executor, '--', '--command', command, '--allow-command', command, '--cwd', dir, '--json'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /validation_passed/);
  assert.match(result.stdout, /cli validation ok/);
});

test('resolveSpawnInvocation uses npm_execpath for pnpm on Windows', () => {
  const invocation = resolveSpawnInvocation(
    { executable: 'pnpm', args: ['validate:quick'] },
    {
      platform: 'win32',
      env: { npm_execpath: 'C:\\tools\\pnpm.cjs' },
      execPath: 'C:\\node\\node.exe',
    },
  );

  assert.equal(invocation.executable, 'C:\\node\\node.exe');
  assert.deepEqual(invocation.args, ['C:\\tools\\pnpm.cjs', 'validate:quick']);
  assert.equal(invocation.shell, false);
});

test('resolveSpawnInvocation falls back to pnpm.cmd shell shim on Windows', () => {
  const invocation = resolveSpawnInvocation(
    { executable: 'pnpm', args: ['validate:quick'] },
    { platform: 'win32', env: {}, execPath: 'C:\\node\\node.exe' },
  );

  assert.equal(invocation.executable, 'pnpm.cmd');
  assert.deepEqual(invocation.args, ['validate:quick']);
  assert.equal(invocation.shell, true);
});

test('executeValidation captures synchronous spawn errors as executor_failed', async () => {
  const command = 'bad\u0000command';
  const result = await executeValidation({
    command,
    allowedCommands: [command],
    timeoutMs: 500,
  });

  assert.equal(result.status, 'error');
  assert.equal(result.classification, 'executor_failed');
  assert.match(result.stderrSummary, /null bytes|invalid|argument/i);
});

test('executeValidation blocks disallowed commands before execution', async () => {
  const result = await executeValidation({
    command: 'node definitely-should-not-run.cjs',
    allowedCommands: ['pnpm validate:quick'],
    timeoutMs: 1000,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.classification, 'disallowed_command');
});

test('executeValidation returns timeout for long-running commands', async () => {
  const dir = makeTempDir();
  const script = createScript(dir, 'timeout.cjs', 'setTimeout(() => {}, 10000);\n');
  const command = quote(process.execPath) + ' ' + quote(script);

  const result = await executeValidation({
    command,
    allowedCommands: [command],
    cwd: dir,
    timeoutMs: 100,
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.classification, 'timeout');
});

test('executeValidation classifies missing command as command_not_found', async () => {
  const command = 'garageos-missing-validation-command --version';

  const result = await executeValidation({
    command,
    allowedCommands: [command],
    timeoutMs: 1000,
  });

  assert.equal(result.status, 'error');
  assert.equal(result.classification, 'command_not_found');
});

test('sanitizeCommandOutput redacts token-like and secret-like output', () => {
  const sanitized = sanitizeCommandOutput(
    'token=abc12345678901234567890\nAuthorization: Bearer abcdef1234567890',
  );
  assert.match(sanitized, /token=\[REDACTED\]/i);
  assert.match(sanitized, /Bearer \[REDACTED\]/);
  assert.doesNotMatch(sanitized, /abcdef1234567890/);
});

test('writeValidationArtifacts writes result, evidence, and ledger validation event', () => {
  const dir = makeTempDir();
  const result = {
    command: 'pnpm validate:quick',
    status: 'passed',
    classification: 'validation_passed',
    exitCode: 0,
    signal: null,
    durationMs: 12,
    startedAt: '2026-07-06T00:00:00.000Z',
    finishedAt: '2026-07-06T00:00:00.012Z',
    stdoutSummary: 'ok',
    stderrSummary: '',
  };

  const artifacts = writeValidationArtifacts(result, { cwd: dir });

  assert.equal(fs.existsSync(artifacts.resultPath), true);
  assert.equal(fs.existsSync(artifacts.evidencePath), true);
  assert.equal(fs.existsSync(artifacts.ledgerPath), true);

  const ledger = JSON.parse(fs.readFileSync(artifacts.ledgerPath, 'utf8'));
  assert.equal(ledger.validation.classification, 'validation_passed');
  assert.equal(ledger.validationEvents.length, 1);
});

test('mergeValidationIntoLedger preserves existing object metadata', () => {
  const merged = mergeValidationIntoLedger({ runId: 'eng-loop-test' }, { status: 'passed' });
  assert.equal(merged.runId, 'eng-loop-test');
  assert.equal(merged.validation.status, 'passed');
  assert.equal(merged.validationEvents.length, 1);
});
