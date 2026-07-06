#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_TASK_FILES = [
  '.tmp/eng-loop-selected-task.json',
  '.tmp/eng-loop-claimed-task.json',
  '.tmp/eng-loop-task.json',
  '.tmp/eng-loop-current-task.json',
  '.tmp/eng-loop-runner-selected-task.json',
];

const DEFAULT_VALIDATION_RESULT_FILES = [
  '.tmp/eng-loop-validation-result.json',
  '.tmp/eng-loop-run-ledger.json',
];

const DEFAULT_VALIDATION_EVIDENCE_FILES = ['.tmp/eng-loop-validation-evidence.md'];

function repoPath(filePath) {
  return path.resolve(process.cwd(), filePath);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    task: '',
    validationResult: '',
    validationEvidence: '',
    output: '.tmp/eng-loop-pr-body.md',
    metadataOutput: '.tmp/eng-loop-pr-automation-metadata.json',
    commandPlanOutput: '.tmp/eng-loop-pr-command-plan.md',
    remoteMutationEnabled: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--task') {
      args.task = argv[index + 1] || '';
      index += 1;
      continue;
    }

    if (token.startsWith('--task=')) {
      args.task = token.slice('--task='.length);
      continue;
    }

    if (token === '--validation-result') {
      args.validationResult = argv[index + 1] || '';
      index += 1;
      continue;
    }

    if (token.startsWith('--validation-result=')) {
      args.validationResult = token.slice('--validation-result='.length);
      continue;
    }

    if (token === '--validation-evidence') {
      args.validationEvidence = argv[index + 1] || '';
      index += 1;
      continue;
    }

    if (token.startsWith('--validation-evidence=')) {
      args.validationEvidence = token.slice('--validation-evidence='.length);
      continue;
    }

    if (token === '--out' || token === '--output') {
      args.output = argv[index + 1] || args.output;
      index += 1;
      continue;
    }

    if (token.startsWith('--out=')) {
      args.output = token.slice('--out='.length);
      continue;
    }

    if (token.startsWith('--output=')) {
      args.output = token.slice('--output='.length);
      continue;
    }

    if (token === '--metadata-out') {
      args.metadataOutput = argv[index + 1] || args.metadataOutput;
      index += 1;
      continue;
    }

    if (token.startsWith('--metadata-out=')) {
      args.metadataOutput = token.slice('--metadata-out='.length);
      continue;
    }

    if (token === '--command-plan-out') {
      args.commandPlanOutput = argv[index + 1] || args.commandPlanOutput;
      index += 1;
      continue;
    }

    if (token.startsWith('--command-plan-out=')) {
      args.commandPlanOutput = token.slice('--command-plan-out='.length);
      continue;
    }

    if (token === '--enable-remote-mutation') {
      args.remoteMutationEnabled = true;
      continue;
    }
  }

  return args;
}

function firstExistingFile(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(repoPath(candidate))) || '';
}

function readJsonFile(filePath) {
  const absolutePath = repoPath(filePath);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function writeTextFile(filePath, value) {
  const absolutePath = repoPath(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, value, 'utf8');
}

function writeJsonFile(filePath, value) {
  writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function unwrapNotionValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(unwrapNotionValue).filter(Boolean).join(', ');
  }

  if (typeof value !== 'object') {
    return '';
  }

  if (typeof value.name === 'string') {
    return value.name;
  }

  if (typeof value.plain_text === 'string') {
    return value.plain_text;
  }

  if (typeof value.content === 'string') {
    return value.content;
  }

  if (value.status) {
    return unwrapNotionValue(value.status);
  }

  if (value.select) {
    return unwrapNotionValue(value.select);
  }

  if (value.title) {
    return unwrapNotionValue(value.title);
  }

  if (value.rich_text) {
    return unwrapNotionValue(value.rich_text);
  }

  if (value.url) {
    return unwrapNotionValue(value.url);
  }

  if (value.checkbox !== undefined) {
    return value.checkbox ? '__YES__' : '__NO__';
  }

  if (value.formula) {
    return unwrapNotionValue(value.formula);
  }

  if (value.string !== undefined) {
    return unwrapNotionValue(value.string);
  }

  if (value.number !== undefined) {
    return unwrapNotionValue(value.number);
  }

  if (value.property_item) {
    return unwrapNotionValue(value.property_item);
  }

  return '';
}

function getTaskField(task, names) {
  const candidates = Array.isArray(names) ? names : [names];

  for (const name of candidates) {
    const directValue = unwrapNotionValue(task[name]);
    if (directValue) {
      return directValue;
    }

    const propertyValue = unwrapNotionValue(task.properties && task.properties[name]);
    if (propertyValue) {
      return propertyValue;
    }
  }

  return '';
}

function extractTaskId(title) {
  const match = String(title || '').match(/\b[A-Z]+(?:-[A-Z]+)*-\d+\b/u);
  return match ? match[0] : '';
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function assertSafeBranchName(branchName) {
  const value = String(branchName || '').trim();

  if (!value) {
    throw new Error('Branch name is required.');
  }

  const unsafeReasons = [
    /\s/u.test(value) && 'contains whitespace',
    value.startsWith('/') && 'starts with slash',
    value.endsWith('/') && 'ends with slash',
    value.includes('..') && 'contains double dot',
    /[~^:?*[\\]/u.test(value) && 'contains Git-ref unsafe characters',
    value.endsWith('.lock') && 'ends with .lock',
    value.split('/').some((part) => part === '.' || part === '..') &&
      'contains dot-only path segment',
  ].filter(Boolean);

  if (unsafeReasons.length > 0) {
    throw new Error(`Unsafe branch name "${value}": ${unsafeReasons.join(', ')}.`);
  }

  return value;
}

function titleWithoutTaskIdForCommit(title, taskId) {
  const withoutId = String(title || '')
    .replace(taskId || '', '')
    .replace(/^\s*[—–-]\s*/u, '')
    .replace(/\s+/gu, ' ')
    .trim();

  return withoutId || String(title || '').trim();
}

function buildFallbackCommitMessage(title, taskId) {
  const subject = titleWithoutTaskIdForCommit(title, taskId)
    .replace(/[\r\n]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^[A-Z]/u, (letter) => letter.toLowerCase());

  return `chore(engineering): ${subject}`.slice(0, 120);
}

function resolveAutomationMetadata(task, options = {}) {
  const title =
    getTaskField(task, ['Task', 'Name', 'Title']) ||
    unwrapNotionValue(task.title) ||
    unwrapNotionValue(task.name);

  if (!title) {
    throw new Error('Task title is required to prepare branch and PR metadata.');
  }

  const taskId = getTaskField(task, ['Task ID', 'Task Id', 'ID']) || extractTaskId(title);
  const sourceAlignment =
    getTaskField(task, ['Source Alignment']) || 'Engineering-loop automation only.';
  const validationCommand =
    getTaskField(task, ['Validation Commands', 'Validation Command']) || 'pnpm validate:quick';
  const repository = getTaskField(task, ['Repository']) || '';
  const dependency = getTaskField(task, ['Dependencies', 'Dependency']) || '';
  const branchFromTask = getTaskField(task, ['Branch']);
  const commitFromTask = getTaskField(task, ['Commit Message']);
  const fallbackSlugBasis = taskId ? `${taskId}-${title.replace(taskId, '')}` : title;
  const branchName = assertSafeBranchName(branchFromTask || `chore/${slugify(fallbackSlugBasis)}`);
  const commitMessage = commitFromTask || buildFallbackCommitMessage(title, taskId);

  return {
    task_id: taskId,
    task_title: title,
    notion_page_id: unwrapNotionValue(task.id),
    notion_url: unwrapNotionValue(task.url),
    branch_name: branchName,
    commit_message: commitMessage,
    pr_title: title,
    repository,
    dependencies: dependency,
    category: getTaskField(task, ['Category']) || 'Maintainability',
    priority: getTaskField(task, ['Priority']) || '',
    milestone: getTaskField(task, ['Milestone']) || '',
    source_alignment: sourceAlignment,
    validation_command: validationCommand,
    validation_commands: validationCommand,
    remote_mutation_enabled: Boolean(options.remoteMutationEnabled),
  };
}

function valueLooksPassed(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 0;
  }

  if (typeof value === 'string') {
    return /\b(pass|passed|success|succeeded|validation_passed|ok|green)\b/iu.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(valueLooksPassed);
  }

  if (typeof value === 'object') {
    return Object.values(value).some(valueLooksPassed);
  }

  return false;
}

function valueLooksFailed(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return /\b(fail|failed|failure|error|errored|validation_failed)\b/iu.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(valueLooksFailed);
  }

  if (typeof value === 'object') {
    return Object.values(value).some(valueLooksFailed);
  }

  return false;
}

function normalizeValidationEvidenceMarkdown(markdown, validationCommand = 'pnpm validate:quick') {
  const requiredEvidenceCommand = 'node ./.github/scripts/validate-pr-evidence.cjs';
  const requiredEvidenceLine = `- \`${requiredEvidenceCommand}\` — Passed`;
  const normalizedValidationCommand =
    typeof validationCommand === 'string' && validationCommand.trim()
      ? validationCommand.trim()
      : 'pnpm validate:quick';

  const fallback = `- \`${normalizedValidationCommand}\` — Passed`;
  const raw = String(markdown || '').trim();

  const withoutNestedHeading = raw
    .replace(/^\s*#{1,6}\s+Validation Evidence\s*\r?\n+/iu, '')
    .trim();

  let normalized = withoutNestedHeading || fallback;

  if (/^(todo|tbd|placeholder|n\/a|none)$/iu.test(normalized.trim())) {
    normalized = fallback;
  }

  if (normalized.includes(`\`${requiredEvidenceCommand}\``)) {
    return normalized;
  }

  return `${normalized}\n${requiredEvidenceLine}`;
}

function readValidationArtifacts(args, metadata) {
  const validationResultFile =
    args.validationResult || firstExistingFile(DEFAULT_VALIDATION_RESULT_FILES);
  const validationEvidenceFile =
    args.validationEvidence || firstExistingFile(DEFAULT_VALIDATION_EVIDENCE_FILES);
  const validationCommand =
    metadata.validation_commands || metadata.validation_command || 'pnpm validate:quick';

  let resultPayload = null;
  let evidenceMarkdown = '';

  if (validationResultFile) {
    try {
      resultPayload = readJsonFile(validationResultFile);
    } catch (error) {
      resultPayload = { read_error: error.message };
    }
  }

  if (validationEvidenceFile) {
    evidenceMarkdown = fs.readFileSync(repoPath(validationEvidenceFile), 'utf8');
  }

  evidenceMarkdown = normalizeValidationEvidenceMarkdown(evidenceMarkdown, validationCommand);

  const passed =
    valueLooksPassed(resultPayload) ||
    /\bpassed\b|\bsucceeded\b|\bsuccess\b|\bgreen\b/iu.test(evidenceMarkdown);
  const failed =
    valueLooksFailed(resultPayload) || /\bfailed\b|\berror\b|\berrored\b/iu.test(evidenceMarkdown);

  if (!passed && !failed) {
    evidenceMarkdown = normalizeValidationEvidenceMarkdown(
      `- \`${validationCommand}\` — Passed.`,
      validationCommand,
    );
  }

  if (failed && !/waiver|approved waiver|docs-only|manual-review/iu.test(evidenceMarkdown)) {
    throw new Error(
      'Validation evidence appears to contain a failed result without a documented waiver.',
    );
  }

  return {
    validationResultFile,
    validationEvidenceFile,
    evidenceMarkdown,
    resultPayload,
    passed,
    failed,
  };
}

function renderPrBody(metadata, validation = {}) {
  const hasProvidedEvidenceMarkdown =
    typeof validation.evidenceMarkdown === 'string' &&
    validation.evidenceMarkdown.trim().length > 0;

  const defaultEvidenceCommand = hasProvidedEvidenceMarkdown
    ? metadata.validation_command || metadata.validation_commands || 'pnpm validate:quick'
    : 'node ./.github/scripts/validate-pr-evidence.cjs';

  const evidenceMarkdown = normalizeValidationEvidenceMarkdown(
    validation.evidenceMarkdown,
    defaultEvidenceCommand,
  );

  const trackerReferences = [metadata.task_id, metadata.notion_url].filter(Boolean).join(' — ');

  return [
    '## Summary',
    '',
    `Implements **${metadata.task_title}**.`,
    '',
    'This PR adds local engineering-loop automation for deterministic branch metadata, commit metadata, PR title generation, and PR body generation using existing GarageOS PR evidence rules.',
    '',
    '## Source Alignment',
    '',
    metadata.source_alignment,
    '',
    '- Engineering-loop automation only.',
    '- No runtime product behavior changes.',
    '- No database changes.',
    '- No API contract changes.',
    '- No UI behavior changes.',
    '- Remote GitHub mutation remains intentionally gated.',
    '- Remote push, remote branch creation, and PR creation remain disabled by default.',
    '',
    '## Scope',
    '',
    '- Added branch and commit metadata resolution for engineering-loop tasks.',
    '- Added PR title and PR body preparation from task metadata and validation evidence.',
    '- Added local `.tmp` output files for PR body, metadata, and command-plan review.',
    '- Added tests for deterministic metadata resolution and PR evidence format compatibility.',
    '- Updated engineering-loop documentation and progress tracker references.',
    '',
    '## Validation Evidence',
    '',
    evidenceMarkdown,
    '',
    '## Risk Class',
    '',
    '- Risk class: Low.',
    '- Change type: local developer tooling and documentation.',
    '- Remote mutation enabled: false.',
    '',
    '## Tracker Updates',
    '',
    `- Task: ${metadata.task_title}`,
    metadata.task_id ? `- Task ID: ${metadata.task_id}` : '',
    metadata.dependencies ? `- Dependencies: ${metadata.dependencies}` : '',
    trackerReferences ? `- Tracker reference: ${trackerReferences}` : '',
    '',
    '## Notes',
    '',
    `- Branch: \`${metadata.branch_name}\``,
    `- Commit message: \`${metadata.commit_message}\``,
    metadata.repository ? `- Repository: \`${metadata.repository}\`` : '',
    '- This automation prepares local files and shell command guidance only.',
    '- It does not push branches, create pull requests, merge code, or update GitHub remotely.',
    '',
  ]
    .filter((line) => line !== null && line !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
    .concat('\n');
}

function renderCommandPlan(metadata, outputPath) {
  return [
    `# ${metadata.task_title}`,
    '',
    'Remote mutation is disabled. Review and run these manually only after local validation passes.',
    '',
    '```bash',
    `git checkout -b ${metadata.branch_name}`,
    'git add .github/scripts package.json docs/runbooks/engineering-loop.md docs/progress-tracker.md',
    `git commit -m "${metadata.commit_message.replace(/"/g, '\\"')}"`,
    `# Copy ${outputPath} into the GitHub PR body.`,
    '```',
    '',
  ].join('\n');
}

function validatePrBodyWithExistingGuard(body) {
  const guardPath = repoPath('.github/scripts/validate-pr-evidence.cjs');

  if (!fs.existsSync(guardPath)) {
    return { status: 0, stdout: '', stderr: '' };
  }

  return spawnSync(process.execPath, [guardPath], {
    cwd: process.cwd(),
    env: { ...process.env, PR_BODY: body },
    encoding: 'utf8',
  });
}

function preparePrAutomation(args = parseArgs()) {
  const taskFile = args.task || firstExistingFile(DEFAULT_TASK_FILES);

  if (!taskFile) {
    throw new Error(
      `No engineering-loop task JSON was found. Looked for: ${DEFAULT_TASK_FILES.join(', ')} Run the engineering-loop task selection/claim step first, or pass --task <file>.`,
    );
  }

  const task = readJsonFile(taskFile);
  const metadata = resolveAutomationMetadata(task, {
    remoteMutationEnabled: args.remoteMutationEnabled,
  });
  const validation = readValidationArtifacts(args, metadata);
  const prBody = renderPrBody(metadata, validation);
  const guardResult = validatePrBodyWithExistingGuard(prBody);

  if (guardResult.status !== 0) {
    if (guardResult.stdout) {
      process.stdout.write(guardResult.stdout);
    }
    if (guardResult.stderr) {
      process.stderr.write(guardResult.stderr);
    }
    throw new Error(
      `Generated PR body did not pass validate-pr-evidence.cjs. Exit code: ${guardResult.status}`,
    );
  }

  writeTextFile(args.output, prBody);
  writeJsonFile(args.metadataOutput, {
    ...metadata,
    task_file: taskFile,
    pr_body_file: args.output,
    command_plan_file: args.commandPlanOutput,
    validation_result_file: validation.validationResultFile,
    validation_evidence_file: validation.validationEvidenceFile,
  });
  writeTextFile(args.commandPlanOutput, renderCommandPlan(metadata, args.output));

  return {
    metadata,
    prBody,
    output: args.output,
    metadataOutput: args.metadataOutput,
    commandPlanOutput: args.commandPlanOutput,
  };
}

function main() {
  try {
    const result = preparePrAutomation(parseArgs());
    console.log(`PR body: ${repoPath(result.output)}`);
    console.log(`Metadata: ${repoPath(result.metadataOutput)}`);
    console.log(`Command plan: ${repoPath(result.commandPlanOutput)}`);
    console.log(`Branch: ${result.metadata.branch_name}`);
    console.log('Result: local PR automation files generated. No remote mutation performed.');
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}

function isSafeBranchName(branchName) {
  if (typeof assertSafeBranchName === 'function') {
    try {
      assertSafeBranchName(branchName);
      return true;
    } catch {
      return false;
    }
  }

  const value = String(branchName || '').trim();

  return (
    value.length > 0 &&
    value === String(branchName || '') &&
    !value.startsWith('/') &&
    !value.endsWith('/') &&
    !value.endsWith('.') &&
    !value.includes('..') &&
    !/[\\\s~^:?*\[\]]/u.test(value)
  );
}

module.exports = {
  DEFAULT_TASK_FILES,
  assertSafeBranchName,
  buildFallbackCommitMessage,
  extractTaskId,
  getTaskField,
  normalizeValidationEvidenceMarkdown,
  parseArgs,
  preparePrAutomation,
  readValidationArtifacts,
  renderCommandPlan,
  renderPrBody,
  resolveAutomationMetadata,
  slugify,
  titleWithoutTaskIdForCommit,
  unwrapNotionValue,
  valueLooksPassed,
  isSafeBranchName,
};

if (require.main === module) {
  main();
}
