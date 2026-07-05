#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DOCUMENTED_TASK_SCHEMA_DISPLAY_PATH = 'docs/engineering/notion-task-schema.md';
const DOCUMENTED_TASK_SCHEMA_PATH = path.join(
  process.cwd(),
  'docs',
  'engineering',
  'notion-task-schema.md',
);

function resolveEngineeringLoopTaskSchemaSource() {
  if (fs.existsSync(DOCUMENTED_TASK_SCHEMA_PATH)) {
    return {
      source: DOCUMENTED_TASK_SCHEMA_DISPLAY_PATH,
      version: 'eng-loop-16-notion-task-schema',
    };
  }

  return {
    source: resolveEngineeringLoopTaskSchemaSource().source,
    version: resolveEngineeringLoopTaskSchemaSource().version,
  };
}

const DEFAULT_TASK_SCHEMA = Object.freeze({
  version: 'eng-loop-task-schema-fallback-v1',
  requiredFields: [
    'Task',
    'Status',
    'Priority',
    'Category',
    'Dependencies',
    'Codex Ready',
    'Branch',
    'Repository',
    'Validation Commands',
    'Commit Message',
    'Source Alignment',
    'Progress Source',
  ],
  eligibleStatuses: ['Backlog'],
  doneStatuses: ['Done'],
  blockedStatuses: ['In Progress', 'Blocked', 'Review', 'Merged', 'Cancelled'],
  priorityOrder: ['P0', 'P1', 'P2', 'P3'],
});

const DEFAULT_SCHEMA_PATHS = [
  'docs/engineering/notion-task-schema.json',
  'docs/engineering/engineering-loop-task-schema.json',
  'docs/engineering/automatic-engineering-loop-task-schema.json',
  'docs/engineering/notion-engineering-task-schema.json',
  '.github/scripts/engineering-loop-task-schema.json',
];

const DEFAULT_FIXTURE_PATH = '.github/scripts/fixtures/engineering-loop-tasks.json';

function parseArgs(argv) {
  const args = {
    dryRun: true,
    json: false,
    tasksFile: undefined,
    schemaFile: undefined,
    cwd: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (value === '--json') {
      args.json = true;
      continue;
    }

    if (value === '--tasks-file') {
      args.tasksFile = argv[index + 1];
      index += 1;
      continue;
    }

    if (value.startsWith('--tasks-file=')) {
      args.tasksFile = value.slice('--tasks-file='.length);
      continue;
    }

    if (value === '--schema-file') {
      args.schemaFile = argv[index + 1];
      index += 1;
      continue;
    }

    if (value.startsWith('--schema-file=')) {
      args.schemaFile = value.slice('--schema-file='.length);
      continue;
    }

    if (value === '--cwd') {
      args.cwd = argv[index + 1];
      index += 1;
      continue;
    }

    if (value.startsWith('--cwd=')) {
      args.cwd = value.slice('--cwd='.length);
      continue;
    }

    throw new Error(`Unknown argument: ${value}`);
  }

  return args;
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read JSON file ${filePath}: ${error.message}`);
  }
}

function resolveExistingFile(cwd, candidates) {
  for (const candidate of candidates) {
    const absolutePath = path.resolve(cwd, candidate);
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  return undefined;
}

function normalizeSchema(rawSchema, source) {
  const requiredFields = Array.isArray(rawSchema.requiredFields)
    ? rawSchema.requiredFields
    : Array.isArray(rawSchema.required_fields)
      ? rawSchema.required_fields
      : rawSchema.fields && typeof rawSchema.fields === 'object'
        ? Object.entries(rawSchema.fields)
            .filter(([, value]) => value && value.required === true)
            .map(([key]) => key)
        : rawSchema.properties && typeof rawSchema.properties === 'object'
          ? Object.entries(rawSchema.properties)
              .filter(([, value]) => value && value.required === true)
              .map(([key]) => key)
          : DEFAULT_TASK_SCHEMA.requiredFields;

  const eligibleStatuses = Array.isArray(rawSchema.eligibleStatuses)
    ? rawSchema.eligibleStatuses
    : Array.isArray(rawSchema.eligible_statuses)
      ? rawSchema.eligible_statuses
      : DEFAULT_TASK_SCHEMA.eligibleStatuses;

  const doneStatuses = Array.isArray(rawSchema.doneStatuses)
    ? rawSchema.doneStatuses
    : Array.isArray(rawSchema.done_statuses)
      ? rawSchema.done_statuses
      : DEFAULT_TASK_SCHEMA.doneStatuses;

  const blockedStatuses = Array.isArray(rawSchema.blockedStatuses)
    ? rawSchema.blockedStatuses
    : Array.isArray(rawSchema.blocked_statuses)
      ? rawSchema.blocked_statuses
      : DEFAULT_TASK_SCHEMA.blockedStatuses;

  const priorityOrder = Array.isArray(rawSchema.priorityOrder)
    ? rawSchema.priorityOrder
    : Array.isArray(rawSchema.priority_order)
      ? rawSchema.priority_order
      : DEFAULT_TASK_SCHEMA.priorityOrder;

  return {
    source,
    version:
      rawSchema.version ||
      rawSchema.schemaVersion ||
      rawSchema.schema_version ||
      DEFAULT_TASK_SCHEMA.version,
    requiredFields,
    eligibleStatuses,
    doneStatuses,
    blockedStatuses,
    priorityOrder,
  };
}

function loadTaskSchema({ cwd = process.cwd(), schemaFile } = {}) {
  if (schemaFile) {
    const absolutePath = path.resolve(cwd, schemaFile);
    return normalizeSchema(readJsonFile(absolutePath), path.relative(cwd, absolutePath));
  }

  const schemaPath = resolveExistingFile(cwd, DEFAULT_SCHEMA_PATHS);
  if (schemaPath) {
    return normalizeSchema(readJsonFile(schemaPath), path.relative(cwd, schemaPath));
  }

  const documentedMarkdownSchemaPath = path.resolve(
    cwd,
    'docs',
    'engineering',
    'notion-task-schema.md',
  );

  if (fs.existsSync(documentedMarkdownSchemaPath)) {
    return normalizeSchema(
      {
        ...DEFAULT_TASK_SCHEMA,
        version: 'eng-loop-16-notion-task-schema',
      },
      path.relative(cwd, documentedMarkdownSchemaPath),
    );
  }

  return normalizeSchema(DEFAULT_TASK_SCHEMA, 'built-in fallback schema');
}

function normalizeBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === 'number') return value === 1;
  if (typeof value !== 'string') return false;

  const normalized = value.trim().toLowerCase();
  return (
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'y' ||
    normalized === '1' ||
    normalized === '__yes__' ||
    normalized === 'checked'
  );
}

function normalizeString(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(String).join(', ');
  return String(value).trim();
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter(Boolean);
  }

  const text = normalizeString(value);
  if (!text) return [];
  return text
    .split(/[;,\n]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractTaskId(taskTitle) {
  const match = normalizeString(taskTitle).match(/\bENG-LOOP-\d+\b/u);
  return match ? match[0] : '';
}

function extractTaskNumber(taskTitle) {
  const id = extractTaskId(taskTitle);
  if (!id) return Number.MAX_SAFE_INTEGER;
  const numberText = id.replace('ENG-LOOP-', '');
  const parsed = Number.parseInt(numberText, 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function normalizeTask(rawTask) {
  return {
    id: extractTaskId(rawTask.Task || rawTask.task || rawTask.title),
    task: normalizeString(rawTask.Task || rawTask.task || rawTask.title),
    status: normalizeString(rawTask.Status || rawTask.status),
    priority: normalizeString(rawTask.Priority || rawTask.priority),
    category: normalizeString(rawTask.Category || rawTask.category),
    dependencies: normalizeList(rawTask.Dependencies || rawTask.dependencies),
    codexReady: normalizeBoolean(
      rawTask['Codex Ready'] ?? rawTask.codexReady ?? rawTask.codex_ready,
    ),
    branch: normalizeString(rawTask.Branch || rawTask.branch),
    repository: normalizeString(rawTask.Repository || rawTask.repository),
    validationCommands: normalizeList(
      rawTask['Validation Commands'] || rawTask.validationCommands || rawTask.validation_commands,
    ),
    commitMessage: normalizeString(
      rawTask['Commit Message'] || rawTask.commitMessage || rawTask.commit_message,
    ),
    sourceAlignment: normalizeString(
      rawTask['Source Alignment'] || rawTask.sourceAlignment || rawTask.source_alignment,
    ),
    progressSource: normalizeString(
      rawTask['Progress Source'] || rawTask.progressSource || rawTask.progress_source,
    ),
    raw: rawTask,
  };
}

function hasRequiredValue(rawTask, fieldName) {
  const aliases = {
    Task: ['Task', 'task', 'title'],
    Status: ['Status', 'status'],
    Priority: ['Priority', 'priority'],
    Category: ['Category', 'category'],
    Dependencies: ['Dependencies', 'dependencies'],
    'Codex Ready': ['Codex Ready', 'codexReady', 'codex_ready'],
    Branch: ['Branch', 'branch'],
    Repository: ['Repository', 'repository'],
    'Validation Commands': ['Validation Commands', 'validationCommands', 'validation_commands'],
    'Commit Message': ['Commit Message', 'commitMessage', 'commit_message'],
    'Source Alignment': ['Source Alignment', 'sourceAlignment', 'source_alignment'],
    'Progress Source': ['Progress Source', 'progressSource', 'progress_source'],
  };

  const candidates = aliases[fieldName] || [fieldName];
  return candidates.some((candidate) => {
    const value = rawTask[candidate];
    if (typeof value === 'boolean') return true;
    if (Array.isArray(value)) return value.length > 0 || fieldName === 'Dependencies';
    return value !== null && value !== undefined && String(value).trim() !== '';
  });
}

function validateRawTasks(rawTasks, schema) {
  if (!Array.isArray(rawTasks)) {
    return [{ index: -1, task: '<root>', reason: 'Task input must be a JSON array.' }];
  }

  const issues = [];
  rawTasks.forEach((rawTask, index) => {
    if (!rawTask || typeof rawTask !== 'object' || Array.isArray(rawTask)) {
      issues.push({ index, task: `<row ${index}>`, reason: 'Task row must be an object.' });
      return;
    }

    const missingFields = schema.requiredFields.filter(
      (fieldName) => !hasRequiredValue(rawTask, fieldName),
    );
    if (missingFields.length > 0) {
      issues.push({
        index,
        task: normalizeString(rawTask.Task || rawTask.task || rawTask.title || `<row ${index}>`),
        reason: `Missing required field(s): ${missingFields.join(', ')}`,
      });
    }
  });

  return issues;
}

function buildDoneTaskSet(tasks, schema) {
  const doneStatuses = new Set(schema.doneStatuses.map((status) => status.toLowerCase()));
  const doneTaskIds = new Set();

  for (const task of tasks) {
    if (task.id && doneStatuses.has(task.status.toLowerCase())) {
      doneTaskIds.add(task.id);
    }
  }

  return doneTaskIds;
}

function describeEligibility(task, doneTaskIds, schema) {
  const eligibleStatuses = new Set(schema.eligibleStatuses.map((status) => status.toLowerCase()));

  if (!task.id) {
    return { eligible: false, reason: 'Task title does not contain an ENG-LOOP id.' };
  }

  if (!eligibleStatuses.has(task.status.toLowerCase())) {
    return { eligible: false, reason: `Status is ${task.status || '<empty>'}, not eligible.` };
  }

  if (!task.codexReady) {
    return { eligible: false, reason: 'Codex Ready is not checked.' };
  }

  const incompleteDependencies = task.dependencies.filter((dependency) => {
    const dependencyId = extractTaskId(dependency) || dependency;
    return dependencyId && !doneTaskIds.has(dependencyId);
  });

  if (incompleteDependencies.length > 0) {
    return {
      eligible: false,
      reason: `Incomplete dependency/dependencies: ${incompleteDependencies.join(', ')}`,
    };
  }

  return { eligible: true, reason: 'Eligible.' };
}

function priorityRank(priority, schema) {
  const normalizedPriority = normalizeString(priority).toUpperCase();
  const normalizedOrder = schema.priorityOrder.map((value) => normalizeString(value).toUpperCase());
  const index = normalizedOrder.indexOf(normalizedPriority);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function selectEligibleTask(rawTasks, schema) {
  const validationIssues = validateRawTasks(rawTasks, schema);
  if (validationIssues.length > 0) {
    const details = validationIssues
      .map((issue) => `row ${issue.index}: ${issue.task} — ${issue.reason}`)
      .join('\n');
    throw new Error(`Malformed engineering-loop task data.\n${details}`);
  }

  const tasks = rawTasks.map(normalizeTask);
  const doneTaskIds = buildDoneTaskSet(tasks, schema);
  const evaluatedTasks = tasks.map((task) => ({
    task,
    ...describeEligibility(task, doneTaskIds, schema),
  }));

  const eligibleTasks = evaluatedTasks
    .filter((entry) => entry.eligible)
    .map((entry) => entry.task)
    .sort((left, right) => {
      const priorityDelta =
        priorityRank(left.priority, schema) - priorityRank(right.priority, schema);
      if (priorityDelta !== 0) return priorityDelta;

      const taskNumberDelta = extractTaskNumber(left.task) - extractTaskNumber(right.task);
      if (taskNumberDelta !== 0) return taskNumberDelta;

      return left.task.localeCompare(right.task);
    });

  return {
    selectedTask: eligibleTasks[0] || null,
    eligibleCount: eligibleTasks.length,
    evaluatedTasks,
  };
}

function buildExecutionPlan(selectedTask, schema) {
  const plannedActions = selectedTask
    ? [
        { action: 'claim_task_in_notion', mode: 'skipped_dry_run_only', target: selectedTask.task },
        { action: 'create_branch', mode: 'planned', target: selectedTask.branch },
        { action: 'load_source_docs', mode: 'planned', target: 'GarageOS source documentation' },
        { action: 'implement_task', mode: 'planned', target: selectedTask.task },
        {
          action: 'run_local_validation',
          mode: 'planned',
          target: selectedTask.validationCommands.join(' && '),
        },
        { action: 'create_pr_body', mode: 'planned', target: selectedTask.commitMessage },
        { action: 'watch_github_ci', mode: 'planned', target: selectedTask.repository },
        { action: 'update_progress_tracker', mode: 'planned', target: 'docs/progress-tracker.md' },
        {
          action: 'mark_notion_done_on_success',
          mode: 'skipped_dry_run_only',
          target: selectedTask.task,
        },
      ]
    : [];

  return {
    mode: 'dry_run',
    schema: {
      source: schema.source,
      version: schema.version,
    },
    selected_task: selectedTask
      ? {
          id: selectedTask.id,
          task: selectedTask.task,
          priority: selectedTask.priority,
          status: selectedTask.status,
          branch: selectedTask.branch,
          repository: selectedTask.repository,
          validation_commands: selectedTask.validationCommands,
          commit_message: selectedTask.commitMessage,
        }
      : null,
    planned_actions: plannedActions,
    mutations: {
      notion: 0,
      github: 0,
      git: 0,
      files: 0,
    },
  };
}

function formatTextReport(plan, selectionResult) {
  const lines = [];
  lines.push('Engineering Loop Dry Run');
  lines.push('========================');
  lines.push('');
  lines.push(`Mode: ${plan.mode}`);
  lines.push(`Schema: ${plan.schema.source} (${plan.schema.version})`);
  lines.push('');

  if (plan.selected_task) {
    lines.push('Selected task:');
    lines.push(`- ${plan.selected_task.task}`);
    lines.push(`  Priority: ${plan.selected_task.priority}`);
    lines.push(`  Branch: ${plan.selected_task.branch}`);
    lines.push(`  Repository: ${plan.selected_task.repository}`);
    lines.push(`  Validation: ${plan.selected_task.validation_commands.join(' && ')}`);
  } else {
    lines.push('Selected task:');
    lines.push('- No eligible task selected.');
  }

  lines.push('');
  lines.push('Task evaluation:');
  selectionResult.evaluatedTasks.forEach((entry) => {
    const marker = entry.eligible ? 'eligible' : 'skipped';
    lines.push(`- ${entry.task.task}: ${marker} — ${entry.reason}`);
  });

  lines.push('');
  lines.push('Planned actions:');
  if (plan.planned_actions.length === 0) {
    lines.push('- None.');
  } else {
    plan.planned_actions.forEach((entry, index) => {
      lines.push(`${index + 1}. ${entry.action}: ${entry.mode} (${entry.target})`);
    });
  }

  lines.push('');
  lines.push('Mutation summary:');
  lines.push(`- Notion writes: ${plan.mutations.notion}`);
  lines.push(`- GitHub writes: ${plan.mutations.github}`);
  lines.push(`- Git writes: ${plan.mutations.git}`);
  lines.push(`- File writes: ${plan.mutations.files}`);

  lines.push('');
  lines.push('Machine-readable plan:');
  lines.push(JSON.stringify(plan, null, 2));

  return `${lines.join('\n')}\n`;
}

function loadTaskInput({ cwd = process.cwd(), tasksFile } = {}) {
  const environmentInput = process.env.ENGINEERING_LOOP_TASKS_JSON;
  if (environmentInput && environmentInput.trim()) {
    try {
      return JSON.parse(environmentInput);
    } catch (error) {
      throw new Error(`ENGINEERING_LOOP_TASKS_JSON is not valid JSON: ${error.message}`);
    }
  }

  const resolvedTasksFile = path.resolve(cwd, tasksFile || DEFAULT_FIXTURE_PATH);
  return readJsonFile(resolvedTasksFile);
}

function run(
  argv = process.argv.slice(2),
  io = { stdout: process.stdout, stderr: process.stderr },
) {
  try {
    const args = parseArgs(argv);
    if (!args.dryRun) {
      throw new Error('Only dry-run mode is supported by ENG-LOOP-17.');
    }

    const schema = loadTaskSchema({ cwd: args.cwd, schemaFile: args.schemaFile });
    const rawTasks = loadTaskInput({ cwd: args.cwd, tasksFile: args.tasksFile });
    const selectionResult = selectEligibleTask(rawTasks, schema);
    const plan = buildExecutionPlan(selectionResult.selectedTask, schema);

    io.stdout.write(
      args.json ? `${JSON.stringify(plan, null, 2)}\n` : formatTextReport(plan, selectionResult),
    );
    return 0;
  } catch (error) {
    io.stderr.write(`Engineering loop dry-run failed: ${error.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = run();
}

module.exports = {
  DEFAULT_TASK_SCHEMA,
  normalizeBoolean,
  normalizeList,
  normalizeTask,
  validateRawTasks,
  loadTaskSchema,
  selectEligibleTask,
  buildExecutionPlan,
  formatTextReport,
  run,
};
