#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).trim().toLowerCase());
}

function fail(message) {
  console.error(`::error::${message}`);
  process.exitCode = 1;
}

function safeValue(value) {
  if (value === undefined || value === null || value === '') return '';
  return String(value).trim();
}

const input = {
  mode: safeValue(process.env.INPUT_MODE || 'dry-run'),
  taskId: safeValue(process.env.INPUT_TASK_ID || ''),
  maxTasks: Number.parseInt(safeValue(process.env.INPUT_MAX_TASKS || '1'), 10),
  dryRun: asBool(process.env.INPUT_DRY_RUN, true),
  createBranch: asBool(process.env.INPUT_CREATE_BRANCH, false),
  createPrBody: asBool(process.env.INPUT_CREATE_PR_BODY, true),
  mutateNotion: asBool(process.env.INPUT_MUTATE_NOTION, false),
  runValidation: asBool(process.env.INPUT_RUN_VALIDATION, true),
  validationCommand: safeValue(process.env.INPUT_VALIDATION_COMMAND || 'pnpm validate:quick'),
  mutationConfirmation: safeValue(process.env.INPUT_MUTATION_CONFIRMATION || ''),
};

const notionTokenPresent = Boolean(process.env.NOTION_TOKEN || process.env.NOTION_API_KEY);
const githubTokenPresent = Boolean(process.env.GITHUB_TOKEN);
const allowedModes = new Set(['dry-run', 'run']);
const mutationRequested =
  input.mode === 'run' || input.createBranch || input.mutateNotion || input.dryRun === false;
const confirmationValue = 'ENG-LOOP-23-RUN';

if (!allowedModes.has(input.mode)) {
  fail(`Unsupported mode "${input.mode}". Allowed values: dry-run, run.`);
}

if (!Number.isInteger(input.maxTasks) || input.maxTasks !== 1) {
  fail('ENG-LOOP-23 allows max_tasks=1 only. First-5 or batch execution belongs to ENG-LOOP-24.');
}

if (input.mode === 'dry-run' && input.dryRun !== true) {
  fail('dry_run must remain true when mode=dry-run.');
}

if (input.mode === 'dry-run' && input.createBranch) {
  fail('create_branch cannot be true in dry-run mode.');
}

if (input.mode === 'dry-run' && input.mutateNotion) {
  fail('mutate_notion cannot be true in dry-run mode.');
}

if (input.mode === 'run' && input.dryRun !== false) {
  fail('mode=run requires dry_run=false to make mutation-capable behavior explicit.');
}

if (mutationRequested && input.mutationConfirmation !== confirmationValue) {
  fail(`Mutation-capable behavior requires mutation_confirmation=${confirmationValue}.`);
}

if (input.createBranch && !githubTokenPresent) {
  fail('create_branch=true requires GITHUB_TOKEN to be available.');
}

if (input.mutateNotion && !notionTokenPresent) {
  fail(
    'mutate_notion=true requires NOTION_TOKEN or NOTION_API_KEY to be configured as a repository secret.',
  );
}

if (!input.validationCommand) {
  fail('validation_command is required.');
}

if (!/^(pnpm|node|npm|npx)\s+[A-Za-z0-9_./:@=\s-]+$/.test(input.validationCommand)) {
  fail(
    'validation_command must start with pnpm, node, npm, or npx and must not contain shell metacharacters.',
  );
}

const tmpDir = path.join(process.cwd(), '.tmp');
fs.mkdirSync(tmpDir, { recursive: true });

const sanitizedInputs = {
  mode: input.mode,
  task_id: input.taskId || null,
  max_tasks: input.maxTasks,
  dry_run: input.dryRun,
  create_branch: input.createBranch,
  create_pr_body: input.createPrBody,
  mutate_notion: input.mutateNotion,
  run_validation: input.runValidation,
  validation_command: input.validationCommand,
  mutation_confirmation_present: Boolean(input.mutationConfirmation),
  github_token_present: githubTokenPresent,
  notion_token_present: notionTokenPresent,
};

const runnerMode = input.mode === 'run' ? 'run' : 'dry-run';
const commandPlan = [
  '# ENG-LOOP-23 Manual Workflow Command Plan',
  '',
  `- Mode: ${input.mode}`,
  `- Runner mode: ${runnerMode}`,
  `- Task ID: ${input.taskId || '(auto-select eligible task)'}`,
  `- Max tasks: ${input.maxTasks}`,
  `- Dry run: ${input.dryRun}`,
  `- Create branch: ${input.createBranch}`,
  `- Create PR body/evidence: ${input.createPrBody}`,
  `- Mutate Notion: ${input.mutateNotion}`,
  `- Run validation: ${input.runValidation}`,
  `- Validation command: ${input.validationCommand}`,
  `- GitHub token present: ${githubTokenPresent}`,
  `- Notion token present: ${notionTokenPresent}`,
  '',
  '## Planned commands',
  '',
  '```bash',
  `node ./.github/scripts/eng-loop-runner.cjs --mode=${runnerMode}`,
  input.runValidation
    ? `node ./.github/scripts/eng-loop-validation-executor.cjs -- --command "${input.validationCommand}"`
    : '# validation skipped by input',
  input.createPrBody
    ? 'node ./.github/scripts/eng-loop-pr-automation.cjs --task .tmp/eng-loop-task.json'
    : '# PR body/evidence generation skipped by input',
  '```',
  '',
  '## Safety notes',
  '',
  '- max_tasks is locked to 1 until ENG-LOOP-24 implements batch mode.',
  '- dry-run is the default and safest mode.',
  '- Mutation-capable behavior requires explicit confirmation and required secrets.',
  '- This plan intentionally does not print secret values.',
].join('\n');

fs.writeFileSync(
  path.join(tmpDir, 'eng-loop-workflow-inputs.json'),
  `${JSON.stringify(sanitizedInputs, null, 2)}\n`,
  'utf8',
);
fs.writeFileSync(
  path.join(tmpDir, 'eng-loop-workflow-command-plan.md'),
  `${commandPlan}\n`,
  'utf8',
);

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('Manual engineering loop workflow preflight passed.');
console.log(`Mode: ${input.mode}`);
console.log(`Max tasks: ${input.maxTasks}`);
console.log(`Validation command: ${input.validationCommand}`);
console.log(`Command plan: ${path.join('.tmp', 'eng-loop-workflow-command-plan.md')}`);
