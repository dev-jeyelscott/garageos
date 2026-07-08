#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const runner = require('./eng-loop-runner.cjs');
const taskScopePolicy = require('./eng-loop-task-scope.cjs');
const {
  createCodexTerminalRenderer,
  shouldUseRawCodexEvents,
} = require('./lib/codex-terminal-renderer.cjs');

const DEFAULT_LIMIT = 5;
const DEFAULT_SCAN_LIMIT = 250;
const DEFAULT_BASE_BRANCH = 'develop';
const DEFAULT_REPOSITORY = 'dev-jeyelscott/garageos';
const DEFAULT_FORMAT_COMMAND = 'corepack pnpm format';
const DEFAULT_VALIDATION_COMMAND = 'corepack pnpm validate:quick';
const LIVE_CONFIRMATION = 'RUN_CODEX_AND_CREATE_PRS';
const SENSITIVE_TEXT_PATTERN =
  /(?:secret|token|api[_-]?key|authorization|bearer|password|passwd|pwd)\s*[:=]\s*[^\s'\"]+/gi;

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeCommand(value) {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function forceCorepackPnpmCommand(command) {
  const value = normalizeCommand(command || DEFAULT_VALIDATION_COMMAND);
  if (value === 'pnpm' || value.startsWith('pnpm ')) return `corepack ${value}`;
  return value;
}

function nowIso() {
  return new Date().toISOString();
}

function parseCliArgs(argv = process.argv.slice(2), env = process.env) {
  const args = {
    mode: 'dry-run',
    limit: Number(env.ENG_LOOP_LIMIT || DEFAULT_LIMIT),
    scanLimit: Number(env.ENG_LOOP_SCAN_LIMIT || DEFAULT_SCAN_LIMIT),
    baseBranch: normalizeText(env.ENG_LOOP_BASE_BRANCH || DEFAULT_BASE_BRANCH),
    repository: normalizeText(env.ENG_LOOP_REPOSITORY || DEFAULT_REPOSITORY),
    actor: normalizeText(
      env.ENG_LOOP_ACTOR || env.GITHUB_ACTOR || env.USER || env.USERNAME || 'local',
    ),
    validationCommand: forceCorepackPnpmCommand(
      env.ENG_LOOP_VALIDATION_COMMAND || DEFAULT_VALIDATION_COMMAND,
    ),
    confirmCodexPr: false,
    allowDirty: false,
    tasksFile: '',
    token: normalizeText(env.GARAGEOS_NOTION_TOKEN || env.NOTION_TOKEN || ''),
    databaseId: normalizeText(
      env.GARAGEOS_NOTION_TASK_DATABASE_ID ||
        env.NOTION_TASK_DATABASE_ID ||
        env.NOTION_DATABASE_ID ||
        '',
    ),
    taskScope: taskScopePolicy.parseTaskScopeFromArgs(argv, env),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const [key, inlineValue] = raw.includes('=') ? raw.split(/=(.*)/s, 2) : [raw, undefined];
    const nextValue = inlineValue ?? argv[index + 1];

    switch (key) {
      case '--mode':
        args.mode = nextValue;
        if (inlineValue === undefined) index += 1;
        break;
      case '--limit':
      case '--max-tasks':
        args.limit = Number(nextValue);
        if (inlineValue === undefined) index += 1;
        break;
      case '--scan-limit':
        args.scanLimit = Number(nextValue);
        if (inlineValue === undefined) index += 1;
        break;
      case '--base-branch':
        args.baseBranch = nextValue;
        if (inlineValue === undefined) index += 1;
        break;
      case '--repository':
        args.repository = nextValue;
        if (inlineValue === undefined) index += 1;
        break;
      case '--validation-command':
        args.validationCommand = nextValue;
        if (inlineValue === undefined) index += 1;
        break;
      case '--tasks-file':
        args.tasksFile = nextValue;
        if (inlineValue === undefined) index += 1;
        break;
      case '--token':
      case '--notion-token':
        args.token = nextValue;
        if (inlineValue === undefined) index += 1;
        break;
      case '--database-id':
      case '--notion-database-id':
        args.databaseId = nextValue;
        if (inlineValue === undefined) index += 1;
        break;
      case '--confirm-codex-pr':
        args.confirmCodexPr = true;
        break;
      case '--task-scope':
        args.taskScope = taskScopePolicy.normalizeTaskScope(nextValue);
        if (inlineValue === undefined) index += 1;
        break;
      case '--eng-loop-only':
        args.taskScope = 'eng-loop';
        break;
      case '--all-tasks':
        args.taskScope = 'all';
        break;
      case '--allow-dirty':
        args.allowDirty = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        if (raw.startsWith('--')) throw new Error(`Unknown argument: ${raw}`);
    }
  }

  if (!['dry-run', 'live'].includes(args.mode)) {
    throw new Error('--mode must be dry-run or live.');
  }

  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > DEFAULT_LIMIT) {
    throw new Error(`--limit must be an integer from 1 to ${DEFAULT_LIMIT}.`);
  }

  if (!Number.isInteger(args.scanLimit) || args.scanLimit < args.limit) {
    throw new Error('--scan-limit must be an integer greater than or equal to --limit.');
  }

  args.validationCommand = validateSafeValidationCommand(args.validationCommand);

  return args;
}

function printHelp() {
  console.log(`GarageOS Codex-powered first-5 PR automation

Usage:
  node ./.github/scripts/eng-loop-codex-pr-automation.cjs --mode=dry-run --limit=5
  node ./.github/scripts/eng-loop-codex-pr-automation.cjs --mode=live --limit=5 --confirm-codex-pr

Live mode automatically claims each selected task, creates a task branch/worktree, runs Codex CLI,
runs formatting, runs validation, commits, pushes, creates a PR, and then moves to the next task.

Environment:
  GARAGEOS_NOTION_TOKEN or NOTION_TOKEN
  GARAGEOS_NOTION_TASK_DATABASE_ID or NOTION_TASK_DATABASE_ID
  ENG_LOOP_BASE_BRANCH=develop
  ENG_LOOP_REPOSITORY=dev-jeyelscott/garageos
  ENG_LOOP_VALIDATION_COMMAND=corepack pnpm validate:quick
  ENG_LOOP_TASK_SCOPE=all | eng-loop
`);
}

function redactSensitiveText(value) {
  return String(value ?? '').replace(SENSITIVE_TEXT_PATTERN, (match) => {
    const separator = match.includes('=') ? '=' : ':';
    return `${match.split(separator)[0]}${separator}[REDACTED]`;
  });
}

function runCommand(command, args = [], options = {}) {
  const shell = options.shell ?? false;
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    input: options.input,
    encoding: 'utf8',
    maxBuffer: options.maxBuffer || 1024 * 1024 * 20,
    shell,
    env: { ...process.env, ...(options.env || {}) },
  });

  const stdout = redactSensitiveText(result.stdout || '');
  const stderr = redactSensitiveText(result.stderr || '');

  return {
    command,
    args,
    cwd: options.cwd || process.cwd(),
    shell,
    status: result.status,
    signal: result.signal,
    error: result.error,
    stdout,
    stderr,
    ok: result.status === 0 && !result.error,
  };
}

function createRedactedArtifactWriter(filePath, options = {}) {
  const maxCaptureBytes = options.maxCaptureBytes || 1024 * 1024 * 40;
  const liveStream = options.liveStream || null;
  const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
  let pending = '';
  let captured = '';
  let capturedBytes = 0;

  function capture(value) {
    if (capturedBytes >= maxCaptureBytes) return;
    const remaining = maxCaptureBytes - capturedBytes;
    const chunk = Buffer.byteLength(value, 'utf8') > remaining ? value.slice(0, remaining) : value;
    captured += chunk;
    capturedBytes += Buffer.byteLength(chunk, 'utf8');
  }

  function writeRedacted(value) {
    if (!value) return;
    const redacted = redactSensitiveText(value);
    stream.write(redacted);
    if (liveStream) {
      liveStream.write(redacted);
    }
    capture(redacted);
  }

  return {
    write(chunk) {
      pending += String(chunk ?? '');
      let newlineIndex = pending.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = pending.slice(0, newlineIndex + 1);
        pending = pending.slice(newlineIndex + 1);
        writeRedacted(line);
        newlineIndex = pending.indexOf('\n');
      }
    },
    async end() {
      writeRedacted(pending);
      pending = '';
      await new Promise((resolve, reject) => {
        stream.once('error', reject);
        stream.end(resolve);
      });
      return captured;
    },
  };
}

function resolveCodexSpawnOptions() {
  if (process.platform === 'win32') {
    return {
      command: 'codex.cmd',
      shell: true,
    };
  }

  return {
    command: 'codex',
    shell: false,
  };
}

function resolveRequiredCommandSpawnOptions(command, runtime = {}) {
  const platform = runtime.platform || process.platform;
  const value = normalizeText(command).toLowerCase();
  const shell = runtime.shell === true;

  if (
    platform === 'win32' &&
    (value === 'corepack' || value.endsWith('.cmd') || value.endsWith('.bat'))
  ) {
    return { command, shell: true };
  }

  return { command, shell };
}

async function runStreamingCommand(command, args = [], options = {}) {
  const shell = options.shell ?? false;
  const cwd = options.cwd || process.cwd();
  if (!options.stdoutPath) throw new Error('Streaming command stdoutPath is required.');
  if (!options.stderrPath) throw new Error('Streaming command stderrPath is required.');
  const stdoutWriter = createRedactedArtifactWriter(options.stdoutPath, {
    maxCaptureBytes: options.maxCaptureBytes,
    liveStream: shouldUseRawCodexEvents() && options.streamStdout ? process.stdout : null,
  });
  const stderrWriter = createRedactedArtifactWriter(options.stderrPath, {
    maxCaptureBytes: options.maxCaptureBytes,
    liveStream: options.streamStderr ? process.stderr : null,
  });

  let status = null;
  let signal = null;
  let error = null;
  const stdoutTerminalRenderer = createCodexTerminalRenderer({
    enabled: options.streamStdout && !shouldUseRawCodexEvents(),
    stream: process.stdout,
  });

  await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdoutWriter.write(chunk);
      stdoutTerminalRenderer.write(chunk);
    });
    child.stderr.on('data', (chunk) => stderrWriter.write(chunk));
    child.on('error', (spawnError) => {
      error = spawnError;
      stderrWriter.write(`${spawnError.message}\n`);
    });
    child.on('close', (code, closeSignal) => {
      status = code;
      signal = closeSignal;
      resolve();
    });

    if (options.input !== undefined) {
      child.stdin.end(options.input);
    } else {
      child.stdin.end();
    }
  });
  await stdoutTerminalRenderer.end();
  const [stdout, stderr] = await Promise.all([stdoutWriter.end(), stderrWriter.end()]);

  return {
    command,
    args,
    cwd,
    shell,
    status,
    signal,
    error,
    stdout,
    stderr,
    ok: status === 0 && !error,
  };
}

function requireCommand(command, options = {}) {
  const spawnOptions = resolveRequiredCommandSpawnOptions(command, options);
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    shell: spawnOptions.shell,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error || result.status !== 0) {
    const stderr = result.stderr ? result.stderr.trim() : '';
    const errorMessage = result.error ? result.error.message : stderr;
    throw new Error(
      `Required command is unavailable or not authenticated: ${command}. STDERR: ${errorMessage}`,
    );
  }
}

function validateSafeBranchName(branch) {
  const value = normalizeText(branch);
  if (!value) throw new Error('Task branch is required for Codex PR automation.');
  if (value.startsWith('-')) throw new Error(`Unsafe branch name: ${value}`);
  if (!/^[A-Za-z0-9._/-]+$/.test(value)) throw new Error(`Unsafe branch name: ${value}`);
  if (
    value.includes('..') ||
    value.includes('//') ||
    value.includes('@{') ||
    value.includes('\\')
  ) {
    throw new Error(`Unsafe branch name: ${value}`);
  }
  return value;
}

function validateSafeValidationCommand(command) {
  const value = forceCorepackPnpmCommand(command || DEFAULT_VALIDATION_COMMAND);
  if (!/^(corepack\s+pnpm|node|npm|npx)\s+[A-Za-z0-9_./:@=\s-]+$/.test(value)) {
    throw new Error(
      'Validation command must start with corepack pnpm, node, npm, or npx and must not contain shell metacharacters.',
    );
  }
  return value;
}

function taskKeyFromTitle(title) {
  const match = /(ENG-LOOP-\d+|M\d+\.\d+)/i.exec(String(title || ''));
  return match ? match[1].toUpperCase() : 'TASK';
}

function safePathSegment(value) {
  return normalizeText(value)
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function getTaskPropertyText(task, names) {
  const properties = task?.raw?.properties ?? {};
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(properties, name)) {
      return runner.textFromProperty(properties[name]);
    }
  }
  return '';
}

function taskValidationCommand(task, fallback = DEFAULT_VALIDATION_COMMAND) {
  return validateSafeValidationCommand(
    getTaskPropertyText(task, [
      'Validation Commands',
      'Validation Command',
      'validation_commands',
    ]) || fallback,
  );
}

function taskCommitMessage(task) {
  const configured = getTaskPropertyText(task, [
    'Commit Message',
    'CommitMessage',
    'commit_message',
  ]);
  if (configured) return configured;
  return `chore(engineering): ${taskKeyFromTitle(task.title).toLowerCase()} automation task`;
}

function createTaskClient(args) {
  if (args.tasksFile) return new runner.LocalFixtureTaskClient({ tasksFile: args.tasksFile });
  return new runner.NotionTaskClient({
    token: args.token,
    databaseId: args.databaseId,
    maxTasks: args.scanLimit,
  });
}

function assertCleanGitTree(cwd, allowDirty = false) {
  const result = runCommand('git', ['status', '--short'], { cwd });
  if (!result.ok) throw new Error(`Unable to inspect git status: ${result.stderr}`);
  if (!allowDirty && result.stdout.trim()) {
    throw new Error('Working tree must be clean before running Codex PR automation.');
  }
}

function preflightLive(args, cwd = process.cwd()) {
  if (!args.confirmCodexPr) {
    throw new Error('Live Codex PR automation requires --confirm-codex-pr.');
  }

  if (!args.token && !args.tasksFile) {
    throw new Error('Missing Notion token. Set GARAGEOS_NOTION_TOKEN or NOTION_TOKEN.');
  }

  if (!args.databaseId && !args.tasksFile) {
    throw new Error(
      'Missing Notion task database id. Set GARAGEOS_NOTION_TASK_DATABASE_ID or NOTION_TASK_DATABASE_ID.',
    );
  }

  validateSafeValidationCommand(args.validationCommand);
  validateSafeBranchName(args.baseBranch);
  assertCleanGitTree(cwd, args.allowDirty);
  requireCommand('git');
  requireCommand('gh');
  requireCommand('corepack');
  const codexSpawnOptions = resolveCodexSpawnOptions();
  requireCommand(codexSpawnOptions.command, { shell: codexSpawnOptions.shell });

  const ghAuth = runCommand('gh', ['auth', 'status'], { cwd });
  if (!ghAuth.ok) throw new Error(`GitHub CLI auth is not ready: ${ghAuth.stderr}`);

  const baseCheck = runCommand('git', ['rev-parse', '--verify', args.baseBranch], { cwd });
  if (!baseCheck.ok) throw new Error(`Base branch is not available locally: ${args.baseBranch}`);
}

function buildCodexPrompt({ task, validationCommand, baseBranch }) {
  return `You are Codex CLI working in the GarageOS repository.

Implement exactly one claimed GarageOS tracker task.

## Task

- Title: ${task.title}
- Task id: ${task.id}
- Branch: ${task.branch || '(missing)'}
- Repository: ${task.repository || DEFAULT_REPOSITORY}
- Base branch: ${baseBranch}
- Validation command: ${validationCommand}

## Source of Truth

Follow GarageOS source-of-truth order:

1. Project documentation
2. Approved architecture decisions
3. Existing code patterns

## Rules

- Do not invent undocumented behavior.
- Reuse existing architecture and code patterns.
- Keep the change scoped to this task only.
- Do not commit.
- Do not push.
- Do not create a PR.
- The engineering-loop runner will validate, commit, push, and create the PR after you finish.
- Stop and report clearly if documentation is missing, requirements conflict, or implementation would expand scope.

## Required Work

1. Review relevant docs and current code.
2. Implement the task with the smallest safe change.
3. Run focused checks when useful.
4. Run ${DEFAULT_FORMAT_COMMAND} after implementation and any fixes.
5. Run ${validationCommand} after formatting.
6. Leave final notes describing changed files, validation commands, and any risks.

## Final Response Format

Return a concise implementation summary with:

- Files changed
- Validation run
- Known risks or follow-ups
`;
}

function formatFilesChanged(filesChanged) {
  const files = Array.isArray(filesChanged) ? filesChanged.map(normalizeText).filter(Boolean) : [];

  if (!files.length) {
    return '- See the PR diff for the complete file list.';
  }

  return files.map((file) => `- \`${file}\``).join('\n');
}

function changedFilesForPrBody(worktreePath) {
  const result = runCommand('git', ['status', '--short'], { cwd: worktreePath });
  if (!result.ok) {
    throw new Error(`Unable to collect changed files for PR body: ${result.stderr}`);
  }
  return result.stdout
    .split(/\r?\n/)
    .map(normalizeText)
    .map((line) => line.slice(3).trim())
    .map((file) => file.replace(/^.* -> /, '').trim())
    .filter(Boolean);
}

function buildPrBody({
  task,
  formatCommand = DEFAULT_FORMAT_COMMAND,
  formatOutput,
  validationCommand,
  validationOutput,
  codexFinalMessage,
  filesChanged = [],
}) {
  const title = task.title;
  return `## Summary

Implements **${title}**.

This PR was generated by the GarageOS Codex-powered engineering loop. Codex implemented the claimed task in an isolated task worktree; the runner then validated the change, committed it, pushed the task branch, and created this PR for maintainer review.

## Source Alignment

This is an engineering-loop automation task only.

- Uses the existing Notion task selection and claim path.
- Uses one branch and one PR per task.
- Keeps Codex execution scoped to a single claimed task.
- Keeps PR review human-owned.
- Does not auto-merge.
- Does not mark the task Done before CI/review success.

## Scope

- Claimed task: ${title}
- Task id: ${task.id || '(missing)'}
- Branch: ${task.branch || '(missing)'}
- Repository: ${task.repository || DEFAULT_REPOSITORY}

## Files Changed

${formatFilesChanged(filesChanged)}

## Runtime Impact

- Impact is limited to the claimed GarageOS tracker task and the files shown in this PR diff.
- The engineering-loop runner does not auto-merge and does not mark the task Done before CI/review success.

Codex final message:

\`\`\`text
${normalizeText(codexFinalMessage) || 'No final Codex message captured.'}
\`\`\`

## Validation Evidence

\`${formatCommand}\` — Passed

\`\`\`text
${normalizeText(formatOutput).slice(-3000) || 'Format command passed with no captured output.'}
\`\`\`

\`${validationCommand}\` — Passed

\`\`\`text
${normalizeText(validationOutput).slice(-6000) || 'Validation command passed with no captured output.'}
\`\`\`

## Risk Class

- Medium: AI-generated implementation requires maintainer review even after local validation passes.

## Failure/Follow-Up Notes

- No failed local validation was observed by the runner before PR creation.
- Follow-up is required if CI, maintainer review, or product QA identifies a gap.

## Manual Review Notes

- Human review remains required before merge.
- Verify the implementation matches the claimed task, approved GarageOS documentation, and the PR diff.
- Rollback plan: revert this PR if the implementation is incorrect or unsafe.

## Merge Readiness Checklist

- [x] Claimed task implemented in an isolated task worktree.
- [x] Local formatting completed successfully before validation.
- [x] Local validation command completed successfully before commit/push.
- [ ] CI completed successfully.
- [ ] Maintainer review completed.
`;
}

function createPlanMarkdown({ args, selectedTasks }) {
  const lines = [
    '# Codex-Powered First-5 PR Automation Plan',
    '',
    `- Mode: ${args.mode}`,
    `- Limit: ${args.limit}`,
    `- Base branch: ${args.baseBranch}`,
    `- Repository: ${args.repository}`,
    `- Validation command: ${args.validationCommand}`,
    `- Selected tasks: ${selectedTasks.length}`,
    '',
    '## Planned task executions',
    '',
  ];

  if (!selectedTasks.length) {
    lines.push('- No eligible tasks selected.');
  } else {
    for (const [index, task] of selectedTasks.entries()) {
      lines.push(`${index + 1}. ${task.title}`);
      lines.push(`   - Branch: ${task.branch || '(missing)'}`);
      lines.push(`   - Repository: ${task.repository || args.repository}`);
      lines.push(
        '   - Flow: claim → worktree → Codex exec → format → validation → commit → push → PR',
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

async function writeText(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, value, 'utf8');
}

async function writeJson(filePath, value) {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeDryRunPlan({ args, selectedTasks, cwd }) {
  const plan = {
    schema_version: 1,
    mode: args.mode,
    dry_run: true,
    limit: args.limit,
    scan_limit: args.scanLimit,
    base_branch: args.baseBranch,
    repository: args.repository,
    selected_count: selectedTasks.length,
    generated_at: nowIso(),
    tasks: selectedTasks.map((task) => ({
      id: task.id,
      title: task.title,
      branch: task.branch,
      repository: task.repository,
      url: task.url,
      validation_command: taskValidationCommand(task, args.validationCommand),
    })),
  };

  const jsonPath = path.join(cwd, '.tmp', 'eng-loop-codex-pr-plan.json');
  const markdownPath = path.join(cwd, '.tmp', 'eng-loop-codex-pr-plan.md');
  await writeJson(jsonPath, plan);
  await writeText(markdownPath, createPlanMarkdown({ args, selectedTasks }));
  return { jsonPath, markdownPath, plan };
}

function createWorktree({ cwd, task, baseBranch }) {
  const branch = validateSafeBranchName(task.branch);
  const worktreePath = path.join(
    cwd,
    '.tmp',
    'eng-loop-worktrees',
    safePathSegment(taskKeyFromTitle(task.title)),
  );

  if (fs.existsSync(worktreePath)) {
    throw new Error(`Task worktree already exists. Remove it before retrying: ${worktreePath}`);
  }

  const branchExists = runCommand('git', ['rev-parse', '--verify', branch], { cwd });
  if (branchExists.ok) throw new Error(`Task branch already exists locally: ${branch}`);

  const result = runCommand('git', ['worktree', 'add', '-b', branch, worktreePath, baseBranch], {
    cwd,
  });
  if (!result.ok) throw new Error(`Failed to create task worktree: ${result.stderr}`);

  return { branch, worktreePath };
}

async function runCodex({ worktreePath, prompt, runDir }) {
  const finalMessagePath = path.join(runDir, 'codex-final-message.md');
  const stdoutPath = path.join(runDir, 'codex-stdout.jsonl');
  const stderrPath = path.join(runDir, 'codex-stderr.txt');
  const codexSpawnOptions = resolveCodexSpawnOptions();

  const result = await runStreamingCommand(
    codexSpawnOptions.command,
    [
      '--ask-for-approval',
      'never',
      'exec',
      '--cd',
      worktreePath,
      '--sandbox',
      'workspace-write',
      '--json',
      '--output-last-message',
      finalMessagePath,
      '-',
    ],
    {
      input: prompt,
      cwd: worktreePath,
      shell: codexSpawnOptions.shell,
      stdoutPath,
      stderrPath,
      maxCaptureBytes: 1024 * 1024 * 40,
      streamStdout: true,
      streamStderr: true,
    },
  );

  if (!result.ok) {
    throw new Error(`Codex execution failed. See ${stdoutPath} and ${stderrPath}.`);
  }

  const finalMessage = fs.existsSync(finalMessagePath)
    ? fs.readFileSync(finalMessagePath, 'utf8')
    : '';

  return { finalMessagePath, stdoutPath, stderrPath, finalMessage };
}

function runFormat({ worktreePath, runDir }) {
  const result = runCommand(DEFAULT_FORMAT_COMMAND, [], {
    cwd: worktreePath,
    shell: true,
    maxBuffer: 1024 * 1024 * 40,
    env: { COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
  });
  const output = `${result.stdout}\n${result.stderr}`.trim();
  const outputPath = path.join(runDir, 'format-output.txt');
  fs.writeFileSync(outputPath, output, 'utf8');

  if (!result.ok) throw new Error(`Format failed. See ${outputPath}.`);
  return { output, outputPath };
}

function runValidation({ worktreePath, validationCommand, runDir }) {
  const command = validateSafeValidationCommand(validationCommand);
  const result = runCommand(command, [], {
    cwd: worktreePath,
    shell: true,
    maxBuffer: 1024 * 1024 * 40,
    env: { COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
  });
  const output = `${result.stdout}\n${result.stderr}`.trim();
  const outputPath = path.join(runDir, 'validation-output.txt');
  fs.writeFileSync(outputPath, output, 'utf8');

  if (!result.ok) throw new Error(`Validation failed. See ${outputPath}.`);
  return { command, output, outputPath };
}

function commitPushAndCreatePr({ task, args, worktreePath, runDir, prBodyPath }) {
  const branch = validateSafeBranchName(task.branch);
  const repository = normalizeText(task.repository || args.repository);
  const commitMessage = taskCommitMessage(task);

  const status = runCommand('git', ['status', '--short'], { cwd: worktreePath });
  if (!status.ok) throw new Error(`Unable to inspect task worktree git status: ${status.stderr}`);
  if (!status.stdout.trim()) throw new Error('Codex completed but produced no file changes.');

  const addResult = runCommand('git', ['add', '-A'], { cwd: worktreePath });
  if (!addResult.ok) throw new Error(`git add failed: ${addResult.stderr}`);

  const commitResult = runCommand('git', ['commit', '-m', commitMessage], { cwd: worktreePath });
  if (!commitResult.ok) throw new Error(`git commit failed: ${commitResult.stderr}`);

  const pushResult = runCommand('git', ['push', '-u', 'origin', branch], { cwd: worktreePath });
  if (!pushResult.ok) throw new Error(`git push failed: ${pushResult.stderr}`);

  const prTitle = task.title.replace(/^ENG-LOOP-\d+\s+—\s+/i, '').trim() || task.title;
  const prResult = runCommand(
    'gh',
    [
      'pr',
      'create',
      '--repo',
      repository,
      '--base',
      args.baseBranch,
      '--head',
      branch,
      '--title',
      prTitle,
      '--body-file',
      prBodyPath,
    ],
    { cwd: worktreePath, maxBuffer: 1024 * 1024 * 10 },
  );
  if (!prResult.ok) throw new Error(`gh pr create failed: ${prResult.stderr}`);

  const prUrl = normalizeText(
    prResult.stdout.split(/\r?\n/).find((line) => /^https?:\/\//.test(line)) || prResult.stdout,
  );
  fs.writeFileSync(path.join(runDir, 'pr-url.txt'), `${prUrl}\n`, 'utf8');

  return { branch, commitMessage, prUrl };
}

function progressPatchFromPage(page, value) {
  const properties = page.properties ?? {};
  const progressName = ['Progress Source', 'ProgressSource', 'progress_source'].find((name) =>
    Object.prototype.hasOwnProperty.call(properties, name),
  );
  if (!progressName) return null;
  return {
    [progressName]: runner.propertyPatchFromExistingProperty(properties[progressName], value),
  };
}

async function updateTaskProgressSource({ client, taskId, prUrl, runId }) {
  const page = await client.fetchPage(taskId);
  const patch = progressPatchFromPage(
    page,
    `PR created by engineering loop Codex automation for run ${runId} at ${nowIso()}. PR: ${prUrl}`,
  );
  if (!patch) return false;
  await client.updatePageProperties(taskId, patch);
  return true;
}

async function runLive({ args, client, selectedTasks, cwd = process.cwd() }) {
  preflightLive(args, cwd);

  const batch = {
    schema_version: 1,
    mode: 'live',
    limit: args.limit,
    selected_count: selectedTasks.length,
    processed_count: 0,
    success_count: 0,
    failure_count: 0,
    status: 'started',
    stop_reason: '',
    started_at: nowIso(),
    completed_at: null,
    tasks: [],
  };

  const summaryPath = path.join(cwd, '.tmp', 'eng-loop-codex-pr-summary.json');

  for (const [index, task] of selectedTasks.entries()) {
    console.log(`Processing Codex task ${index + 1}/${selectedTasks.length}: ${task.title}`);
    const taskResult = { id: task.id, title: task.title, branch: task.branch, status: 'started' };
    batch.tasks.push(taskResult);

    try {
      const claim = await runner.claimSelectedTask({
        client,
        args: { actor: args.actor, staleClaimHours: 24 },
        cwd,
        selected: task,
        mode: 'first-5-codex',
      });
      taskResult.run_id = claim.runId;
      taskResult.ledger_path = claim.ledgerPath;

      const runDir = path.join(cwd, '.tmp', 'eng-loop-runs', claim.runId);
      fs.mkdirSync(runDir, { recursive: true });

      const validationCommand = taskValidationCommand(claim.selected, args.validationCommand);
      const prompt = buildCodexPrompt({
        task: claim.selected,
        validationCommand,
        baseBranch: args.baseBranch,
      });
      const promptPath = path.join(runDir, 'codex-prompt.md');
      fs.writeFileSync(promptPath, prompt, 'utf8');

      const worktree = createWorktree({ cwd, task: claim.selected, baseBranch: args.baseBranch });
      taskResult.worktree_path = worktree.worktreePath;

      const codex = await runCodex({ worktreePath: worktree.worktreePath, prompt, runDir });
      const format = runFormat({ worktreePath: worktree.worktreePath, runDir });
      const validation = runValidation({
        worktreePath: worktree.worktreePath,
        validationCommand,
        runDir,
      });
      const filesChanged = changedFilesForPrBody(worktree.worktreePath);
      const prBody = buildPrBody({
        task: claim.selected,
        formatCommand: DEFAULT_FORMAT_COMMAND,
        formatOutput: format.output,
        validationCommand: validation.command,
        validationOutput: validation.output,
        codexFinalMessage: codex.finalMessage,
        filesChanged,
      });
      const prBodyPath = path.join(runDir, 'pr-body.md');
      fs.writeFileSync(prBodyPath, prBody, 'utf8');

      const pr = commitPushAndCreatePr({
        task: claim.selected,
        args,
        worktreePath: worktree.worktreePath,
        runDir,
        prBodyPath,
      });
      await updateTaskProgressSource({
        client,
        taskId: claim.selected.id,
        prUrl: pr.prUrl,
        runId: claim.runId,
      });

      taskResult.status = 'pr_created';
      taskResult.pr_url = pr.prUrl;
      taskResult.completed_at = nowIso();
      batch.processed_count += 1;
      batch.success_count += 1;
      await writeJson(summaryPath, batch);
    } catch (error) {
      taskResult.status = 'failed';
      taskResult.error = error.message || 'Task failed.';
      taskResult.completed_at = nowIso();
      batch.processed_count += 1;
      batch.failure_count += 1;
      batch.status = 'failed';
      batch.stop_reason = runner.classifyBatchStopReason(error);
      batch.completed_at = nowIso();
      await writeJson(summaryPath, batch);
      console.log(`Batch stopped: ${batch.stop_reason}`);
      throw error;
    }
  }

  batch.status = 'succeeded';
  batch.stop_reason =
    selectedTasks.length >= args.limit ? 'max_count_reached' : 'selected_tasks_exhausted';
  batch.completed_at = nowIso();
  await writeJson(summaryPath, batch);
  console.log(`Codex PR automation completed: ${batch.success_count} PR(s) created.`);
  console.log(`Summary: ${summaryPath}`);
  return batch;
}

async function runAutomation({ args, cwd = process.cwd() }) {
  const client = createTaskClient(args);
  const pages = await client.listTaskPages();
  const selectedTasks = runner.selectEligibleTasks(pages, {
    limit: args.limit,
    taskScope: args.taskScope,
    mode: args.mode,
    mutationCapable: args.mode === 'live',
  });

  console.log(`Scanned task pages: ${pages.length}`);
  console.log(`Selected tasks: ${selectedTasks.length}`);

  if (args.mode === 'dry-run') {
    const plan = await writeDryRunPlan({ args, selectedTasks, cwd });
    console.log(`Codex PR dry-run plan: ${plan.markdownPath}`);
    return { status: selectedTasks.length ? 'planned' : 'no_task', selectedTasks, plan };
  }

  if (!selectedTasks.length) {
    const plan = await writeDryRunPlan({ args, selectedTasks, cwd });
    console.log('No eligible tasks selected. No mutations performed.');
    console.log(`Plan: ${plan.markdownPath}`);
    return { status: 'no_task', selectedTasks, plan };
  }

  const batch = await runLive({ args, client, selectedTasks, cwd });
  return { status: batch.status, selectedTasks, batch };
}

async function main() {
  const args = parseCliArgs();
  if (args.help) {
    printHelp();
    return;
  }
  await runAutomation({ args });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_FORMAT_COMMAND,
  DEFAULT_VALIDATION_COMMAND,
  LIVE_CONFIRMATION,
  buildCodexPrompt,
  buildPrBody,
  changedFilesForPrBody,
  createPlanMarkdown,
  forceCorepackPnpmCommand,
  formatFilesChanged,
  parseCliArgs,
  redactSensitiveText,
  runCommand,
  runFormat,
  runStreamingCommand,
  resolveRequiredCommandSpawnOptions,
  taskKeyFromTitle,
  validateSafeBranchName,
  validateSafeValidationCommand,
};
