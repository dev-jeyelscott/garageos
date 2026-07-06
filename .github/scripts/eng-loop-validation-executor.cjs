#!/usr/bin/env node
'use strict';

/**
 * ENG-LOOP-19 — Local validation executor.
 *
 * This module executes only allowlisted validation commands, captures bounded
 * sanitized evidence, and writes structured output that can be consumed by the
 * engineering loop ledger and future PR-body automation.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DEFAULT_VALIDATION_COMMAND = 'pnpm validate:quick';
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_OUTPUT_LIMIT_BYTES = 12 * 1024;

const DEFAULT_ALLOWED_VALIDATION_COMMANDS = Object.freeze([
  'pnpm validate:quick',
  'pnpm format:check',
  'pnpm lint',
  'pnpm typecheck',
  'pnpm validate:e2e',
  'pnpm eng-loop:test',
  'pnpm eng-loop:dry-run',
  'pnpm eng-loop:validation-executor:test',
]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeCommand(command) {
  return String(command || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function quoteForDisplay(value) {
  const raw = String(value || '');
  if (/^[A-Za-z0-9_./:@=+-]+$/.test(raw)) return raw;
  return JSON.stringify(raw);
}

function parseCommandLine(commandLine) {
  const command = String(commandLine || '');
  const args = [];
  let current = '';
  let quote = null;
  let escaping = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];

    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    // Treat backslash as an escape only inside double-quoted command fragments.
    // This keeps unquoted Windows paths such as C:\Users\... intact while still
    // supporting JSON-style quoted paths emitted by the test harness.
    if (char === '\\' && quote === '"') {
      escaping = true;
      continue;
    }

    if ((char === '"' || char === "'") && quote === null) {
      quote = char;
      continue;
    }

    if (char === quote) {
      quote = null;
      continue;
    }

    if (/\s/.test(char) && quote === null) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaping) current += '\\';

  if (quote !== null) {
    throw new Error('Invalid validation command: unmatched quote.');
  }

  if (current.length > 0) args.push(current);
  if (args.length === 0) {
    throw new Error('Invalid validation command: command is empty.');
  }

  return {
    executable: args[0],
    args: args.slice(1),
  };
}

function resolveExecutableForPlatform(executable) {
  if (process.platform !== 'win32') return executable;
  if (executable === 'pnpm') return 'pnpm.cmd';
  if (executable === 'npm') return 'npm.cmd';
  if (executable === 'yarn') return 'yarn.cmd';
  if (executable === 'npx') return 'npx.cmd';
  return executable;
}

function resolvePackageManagerScript(executable, env) {
  const npmExecPath = env && env.npm_execpath;
  if (!npmExecPath) return null;

  const packageManager = String(executable || '').toLowerCase();
  const basename = path.basename(String(npmExecPath)).toLowerCase();

  if (packageManager === 'pnpm' && basename.includes('pnpm')) return npmExecPath;
  if (packageManager === 'npm' && basename.includes('npm')) return npmExecPath;
  if (packageManager === 'yarn' && basename.includes('yarn')) return npmExecPath;
  if (packageManager === 'npx' && basename.includes('npx')) return npmExecPath;

  return null;
}

function resolveSpawnInvocation(parsed, runtime = {}) {
  const platform = runtime.platform || process.platform;
  const env = runtime.env || process.env;
  const nodeExecutable = runtime.execPath || process.execPath;
  const executable = String(parsed.executable || '');
  const executableLower = executable.toLowerCase();
  const args = Array.isArray(parsed.args) ? parsed.args : [];

  if (platform === 'win32' && ['pnpm', 'npm', 'yarn', 'npx'].includes(executableLower)) {
    const packageManagerScript = resolvePackageManagerScript(executableLower, env);

    if (packageManagerScript) {
      return {
        executable: nodeExecutable,
        args: [packageManagerScript, ...args],
        shell: false,
      };
    }

    return {
      executable: executableLower + '.cmd',
      args,
      shell: true,
    };
  }

  return {
    executable: resolveExecutableForPlatform(executable),
    args,
    shell: false,
  };
}

function truncateOutput(value, limitBytes = DEFAULT_OUTPUT_LIMIT_BYTES) {
  const text = String(value || '');
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.length <= limitBytes) return text;

  const truncated = buffer.subarray(Math.max(0, buffer.length - limitBytes)).toString('utf8');
  return '[output truncated to last ' + limitBytes + ' bytes]\n' + truncated;
}

function sanitizeCommandOutput(value, options = {}) {
  const limitBytes = Number.isFinite(options.limitBytes)
    ? options.limitBytes
    : DEFAULT_OUTPUT_LIMIT_BYTES;
  const truncated = truncateOutput(value, limitBytes);

  return truncated
    .replace(
      /(ghp_|github_pat_|glpat-|xox[baprs]-|sk-[A-Za-z0-9])[A-Za-z0-9_\-]{8,}/g,
      '[REDACTED_TOKEN]',
    )
    .replace(/\b[A-Za-z0-9._%+-]+:[A-Za-z0-9._%+\-/=]{16,}@/g, '[REDACTED_CREDENTIAL]@')
    .replace(
      /\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)\b\s*[:=]\s*[^\s]+/gi,
      '$1=[REDACTED]',
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+\-/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[REDACTED_PRIVATE_KEY]');
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getTaskValidationCommand(taskLike) {
  if (!taskLike || typeof taskLike !== 'object') return '';

  const candidates = [
    taskLike.validationCommand,
    taskLike.validation_command,
    taskLike.validationCommands,
    taskLike.validation_commands,
    taskLike['Validation Commands'],
    taskLike.properties && taskLike.properties.validationCommand,
    taskLike.properties && taskLike.properties.validation_command,
    taskLike.properties && taskLike.properties.validationCommands,
    taskLike.properties && taskLike.properties.validation_commands,
    taskLike.properties && taskLike.properties['Validation Commands'],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;
    if (Array.isArray(candidate) && candidate.length > 0) {
      const first = candidate.find((item) => typeof item === 'string' && item.trim().length > 0);
      if (first) return first;
    }
  }

  return '';
}

function isCommandAllowed(command, allowedCommands = DEFAULT_ALLOWED_VALIDATION_COMMANDS) {
  const normalized = normalizeCommand(command);
  const allowed = new Set(Array.from(allowedCommands, normalizeCommand));
  return allowed.has(normalized);
}

function createBlockedResult(command, classification, message) {
  const timestamp = nowIso();
  return {
    command: normalizeCommand(command),
    status: 'blocked',
    classification,
    exitCode: null,
    signal: null,
    durationMs: 0,
    startedAt: timestamp,
    finishedAt: timestamp,
    stdoutSummary: '',
    stderrSummary: message,
  };
}

function classifySpawnError(error) {
  if (error && error.code === 'ENOENT') return 'command_not_found';
  return 'executor_failed';
}

function createSpawnErrorResult(command, startedAt, startedMs, stdout, error, outputLimitBytes) {
  const finishedAt = nowIso();
  const classification = classifySpawnError(error);

  return {
    command,
    status: 'error',
    classification,
    exitCode: null,
    signal: null,
    durationMs: Date.now() - startedMs,
    startedAt,
    finishedAt,
    stdoutSummary: sanitizeCommandOutput(stdout, { limitBytes: outputLimitBytes }),
    stderrSummary: sanitizeCommandOutput(String(error && error.message ? error.message : error), {
      limitBytes: outputLimitBytes,
    }),
  };
}

async function executeValidation(options = {}) {
  const command = normalizeCommand(options.command || DEFAULT_VALIDATION_COMMAND);
  const allowedCommands = options.allowedCommands || DEFAULT_ALLOWED_VALIDATION_COMMANDS;
  const cwd = options.cwd || process.cwd();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const outputLimitBytes = Number.isFinite(options.outputLimitBytes)
    ? options.outputLimitBytes
    : DEFAULT_OUTPUT_LIMIT_BYTES;

  if (!isCommandAllowed(command, allowedCommands)) {
    return createBlockedResult(
      command,
      'disallowed_command',
      'Validation command is not allowlisted: ' + command,
    );
  }

  let parsed;
  try {
    parsed = parseCommandLine(command);
  } catch (error) {
    return createBlockedResult(command, 'disallowed_command', error.message);
  }

  const startedAt = nowIso();
  const startedMs = Date.now();
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let settled = false;

  return new Promise((resolve) => {
    let child;

    try {
      const invocation = resolveSpawnInvocation(parsed);
      child = spawn(invocation.executable, invocation.args, {
        cwd,
        env: process.env,
        shell: invocation.shell,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      settled = true;
      resolve(
        createSpawnErrorResult(command, startedAt, startedMs, stdout, error, outputLimitBytes),
      );
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      if (!child.killed) child.kill('SIGTERM');
      setTimeout(() => {
        if (!settled && !child.killed) child.kill('SIGKILL');
      }, 1000).unref();
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      stdout = truncateOutput(stdout, outputLimitBytes * 2);
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      stderr = truncateOutput(stderr, outputLimitBytes * 2);
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(
        createSpawnErrorResult(command, startedAt, startedMs, stdout, error, outputLimitBytes),
      );
    });

    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const finishedAt = nowIso();
      const durationMs = Date.now() - startedMs;
      const classification = timedOut
        ? 'timeout'
        : exitCode === 0
          ? 'validation_passed'
          : 'validation_failed';
      const status = timedOut ? 'failed' : exitCode === 0 ? 'passed' : 'failed';

      resolve({
        command,
        status,
        classification,
        exitCode,
        signal,
        durationMs,
        startedAt,
        finishedAt,
        stdoutSummary: sanitizeCommandOutput(stdout, { limitBytes: outputLimitBytes }),
        stderrSummary: sanitizeCommandOutput(stderr, { limitBytes: outputLimitBytes }),
      });
    });
  });
}

function formatValidationEvidenceMarkdown(result) {
  const lines = [
    '## Validation Evidence',
    '',
    '- Command: `' + result.command + '`',
    '- Result: `' + result.status + '`',
    '- Classification: `' + result.classification + '`',
    '- Exit code: `' + String(result.exitCode) + '`',
    '- Duration: `' + String(result.durationMs) + 'ms`',
  ];

  if (result.stderrSummary) {
    lines.push('', '### stderr summary', '', '```text', result.stderrSummary, '```');
  }

  if (result.stdoutSummary) {
    lines.push('', '### stdout summary', '', '```text', result.stdoutSummary, '```');
  }

  return lines.join('\n') + '\n';
}

function mergeValidationIntoLedger(existing, result) {
  const event = {
    type: 'validation',
    createdAt: nowIso(),
    validation: result,
  };

  if (Array.isArray(existing)) {
    return existing.concat([event]);
  }

  if (existing && typeof existing === 'object') {
    const validationEvents = Array.isArray(existing.validationEvents)
      ? existing.validationEvents.concat([event])
      : [event];

    return Object.assign({}, existing, {
      updatedAt: nowIso(),
      validation: result,
      validationEvents,
    });
  }

  return {
    updatedAt: nowIso(),
    validation: result,
    validationEvents: [event],
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function writeValidationArtifacts(result, options = {}) {
  const cwd = options.cwd || process.cwd();
  const resultPath =
    options.resultPath || path.join(cwd, '.tmp', 'eng-loop-validation-result.json');
  const evidencePath =
    options.evidencePath || path.join(cwd, '.tmp', 'eng-loop-validation-evidence.md');
  const ledgerPath = options.ledgerPath || path.join(cwd, '.tmp', 'eng-loop-run-ledger.json');

  writeJson(resultPath, result);
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, formatValidationEvidenceMarkdown(result));

  let existingLedger = {};
  if (fs.existsSync(ledgerPath)) {
    try {
      existingLedger = readJsonFile(ledgerPath);
    } catch (error) {
      existingLedger = {
        ledgerReadError: String(error && error.message ? error.message : error),
      };
    }
  }

  const nextLedger = mergeValidationIntoLedger(existingLedger, result);
  writeJson(ledgerPath, nextLedger);

  return {
    resultPath,
    evidencePath,
    ledgerPath,
  };
}

function parseCliArgs(argv) {
  const parsed = {
    allowedCommands: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => {
      index += 1;
      return argv[index];
    };

    if (token === '--') continue;
    if (token === '--command') parsed.command = next();
    else if (token === '--task') parsed.taskPath = next();
    else if (token === '--ledger') parsed.ledgerPath = next();
    else if (token === '--result') parsed.resultPath = next();
    else if (token === '--evidence') parsed.evidencePath = next();
    else if (token === '--cwd') parsed.cwd = next();
    else if (token === '--timeout-ms') parsed.timeoutMs = Number(next());
    else if (token === '--allow-command') parsed.allowedCommands.push(next());
    else if (token === '--json') parsed.json = true;
    else if (token === '--help' || token === '-h') parsed.help = true;
    else throw new Error('Unknown argument: ' + token);
  }

  return parsed;
}

function printHelp() {
  console.log(
    [
      'ENG-LOOP-19 local validation executor',
      '',
      'Usage:',
      '  node ./.github/scripts/eng-loop-validation-executor.cjs [options]',
      '',
      'Options:',
      '  --command <command>        Validation command to run. Defaults to task command or pnpm validate:quick.',
      '  --task <path>              Optional JSON task file containing Validation Commands.',
      '  --ledger <path>            Ledger JSON file to update. Defaults to .tmp/eng-loop-run-ledger.json.',
      '  --result <path>            Result JSON output path. Defaults to .tmp/eng-loop-validation-result.json.',
      '  --evidence <path>          Markdown evidence path. Defaults to .tmp/eng-loop-validation-evidence.md.',
      '  --timeout-ms <number>      Timeout in milliseconds. Defaults to 600000.',
      '  --allow-command <command>  Extra exact command to allow. May be repeated.',
      '  --json                     Print result as JSON.',
    ].join('\n'),
  );
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
  let taskCommand = '';

  if (args.taskPath) {
    const task = readJsonFile(path.resolve(cwd, args.taskPath));
    taskCommand = getTaskValidationCommand(task);
  }

  const command = normalizeCommand(
    args.command ||
      process.env.ENG_LOOP_VALIDATION_COMMAND ||
      taskCommand ||
      DEFAULT_VALIDATION_COMMAND,
  );

  const allowedCommands = DEFAULT_ALLOWED_VALIDATION_COMMANDS.concat(args.allowedCommands || []);
  const result = await executeValidation({
    command,
    allowedCommands,
    cwd,
    timeoutMs: args.timeoutMs,
  });

  const artifacts = writeValidationArtifacts(result, {
    cwd,
    ledgerPath: args.ledgerPath ? path.resolve(cwd, args.ledgerPath) : undefined,
    resultPath: args.resultPath ? path.resolve(cwd, args.resultPath) : undefined,
    evidencePath: args.evidencePath ? path.resolve(cwd, args.evidencePath) : undefined,
  });

  if (args.json) {
    console.log(JSON.stringify({ result, artifacts }, null, 2));
  } else {
    console.log('Validation command: ' + result.command);
    console.log('Validation result: ' + result.status + ' (' + result.classification + ')');
    console.log('Result JSON: ' + artifacts.resultPath);
    console.log('Evidence Markdown: ' + artifacts.evidencePath);
    console.log('Ledger JSON: ' + artifacts.ledgerPath);
  }

  process.exitCode = result.status === 'passed' ? 0 : 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_ALLOWED_VALIDATION_COMMANDS,
  DEFAULT_VALIDATION_COMMAND,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_OUTPUT_LIMIT_BYTES,
  executeValidation,
  formatValidationEvidenceMarkdown,
  getTaskValidationCommand,
  isCommandAllowed,
  mergeValidationIntoLedger,
  normalizeCommand,
  parseCommandLine,
  resolveSpawnInvocation,
  sanitizeCommandOutput,
  writeValidationArtifacts,
};
