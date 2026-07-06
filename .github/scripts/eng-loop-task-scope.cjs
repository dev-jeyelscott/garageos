'use strict';

const DEFAULT_TASK_SCOPE = 'all';
const TASK_SCOPES = new Set(['all', 'eng-loop']);

const DONE_STATUSES = new Set(['done', 'complete', 'completed', 'closed', 'merged']);
const BLOCKED_STATUSES = new Set([
  'blocked',
  'on hold',
  'hold',
  'deferred',
  'cancelled',
  'canceled',
]);
const SELECTABLE_STATUSES = new Set([
  'backlog',
  'ready',
  'todo',
  'to do',
  'not started',
  'open',
  'selected',
]);

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeTaskScope(value) {
  const normalized = normalizeLower(value || DEFAULT_TASK_SCOPE);
  if (!TASK_SCOPES.has(normalized)) {
    throw new Error(
      `Unsupported task scope "${value}". Supported scopes: ${Array.from(TASK_SCOPES).join(', ')}`,
    );
  }
  return normalized;
}

function parseTaskScopeFromArgs(argv = [], env = process.env) {
  const args = Array.isArray(argv) ? argv : [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--task-scope') return normalizeTaskScope(args[index + 1]);
    if (arg.startsWith('--task-scope='))
      return normalizeTaskScope(arg.slice('--task-scope='.length));
    if (arg === '--eng-loop-only') return 'eng-loop';
    if (arg === '--all-tasks') return 'all';
  }

  return normalizeTaskScope(env.ENG_LOOP_TASK_SCOPE || DEFAULT_TASK_SCOPE);
}

function unwrapNotionValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value;

  if (Array.isArray(value)) {
    return value.map(unwrapNotionValue).filter(Boolean).join(', ');
  }

  if (typeof value !== 'object') return String(value);

  if (Object.prototype.hasOwnProperty.call(value, 'name')) return value.name;
  if (Object.prototype.hasOwnProperty.call(value, 'plain_text')) return value.plain_text;
  if (Object.prototype.hasOwnProperty.call(value, 'content')) return value.content;
  if (Object.prototype.hasOwnProperty.call(value, 'checkbox')) return value.checkbox;
  if (Object.prototype.hasOwnProperty.call(value, 'select')) return unwrapNotionValue(value.select);
  if (Object.prototype.hasOwnProperty.call(value, 'status')) return unwrapNotionValue(value.status);
  if (Object.prototype.hasOwnProperty.call(value, 'title')) return unwrapNotionValue(value.title);
  if (Object.prototype.hasOwnProperty.call(value, 'rich_text'))
    return unwrapNotionValue(value.rich_text);
  if (Object.prototype.hasOwnProperty.call(value, 'multi_select'))
    return unwrapNotionValue(value.multi_select);
  if (Object.prototype.hasOwnProperty.call(value, 'url')) return value.url;
  if (Object.prototype.hasOwnProperty.call(value, 'email')) return value.email;
  if (Object.prototype.hasOwnProperty.call(value, 'phone_number')) return value.phone_number;
  if (Object.prototype.hasOwnProperty.call(value, 'number')) return value.number;
  if (Object.prototype.hasOwnProperty.call(value, 'formula'))
    return unwrapNotionValue(value.formula);

  return '';
}

function propertyValue(task, names) {
  const candidates = Array.isArray(names) ? names : [names];
  const props =
    task?.properties && typeof task.properties === 'object' ? task.properties : task || {};

  for (const name of candidates) {
    if (Object.prototype.hasOwnProperty.call(props, name)) return unwrapNotionValue(props[name]);
  }

  return '';
}

function truthyProperty(task, names) {
  const value = propertyValue(task, names);
  if (typeof value === 'boolean') return value;
  const normalized = normalizeLower(value);
  return (
    normalized === '__yes__' ||
    normalized === 'yes' ||
    normalized === 'true' ||
    normalized === '1' ||
    normalized === 'checked'
  );
}

function getTaskTitle(task) {
  return normalizeText(
    propertyValue(task, ['Task', 'Name', 'Title', 'Task Name']) ||
      task?.title ||
      task?.display_title ||
      task?.name,
  );
}

function getTaskKey(task) {
  const explicit = normalizeText(
    propertyValue(task, ['Task Key', 'Key', 'Ticket', 'Ticket ID', 'Issue Key', 'ID']),
  );
  if (explicit) return explicit;

  const title = getTaskTitle(task);
  const match = title.match(/^([A-Z][A-Z0-9]*(?:[-_.][A-Z0-9]+)*\d*(?:\.\d+)*)\b/i);
  return match ? match[1] : '';
}

function getTaskStatus(task) {
  return normalizeText(propertyValue(task, ['Status', 'State']));
}

function isEngLoopTask(task) {
  return /^ENG-LOOP-\d+\b/i.test(getTaskKey(task) || getTaskTitle(task));
}

function isReviewOnlyTask(task) {
  return /^\[Review\]/i.test(getTaskTitle(task));
}

function isManualOnlyTask(task) {
  const manualOnly = truthyProperty(task, ['Manual Only', 'Manual-only', 'Manual Review Only']);
  const category = normalizeLower(propertyValue(task, ['Category', 'Type', 'Task Type']));
  const labels = normalizeLower(propertyValue(task, ['Labels', 'Tags']));
  return (
    manualOnly ||
    category.includes('manual') ||
    labels.includes('manual-only') ||
    labels.includes('manual only')
  );
}

function hasActiveClaim(task) {
  const claim = normalizeLower(
    propertyValue(task, ['Claim', 'Claimed By', 'Progress Source', 'Run Claim', 'Active Claim']),
  );
  if (!claim) return false;
  if (claim.includes('released') || claim.includes('claim released')) return false;
  return (
    claim.includes('claimed by') || claim.includes('active claim') || claim.includes('eng-loop-')
  );
}

function hasRequiredAutomationMetadata(task, options = {}) {
  const missing = [];
  const mutationCapable = Boolean(options.mutationCapable || options.mode === 'live');
  const strictMetadata = Boolean(options.strictMetadata || mutationCapable);

  if (
    options.requireCodexReady !== false &&
    !truthyProperty(task, ['Codex Ready', 'Automation Ready', 'Ready for Codex'])
  ) {
    missing.push('Codex Ready');
  }

  if (strictMetadata && !normalizeText(propertyValue(task, ['Repository', 'Repo'])))
    missing.push('Repository');
  if (
    mutationCapable &&
    !normalizeText(propertyValue(task, ['Branch', 'Target Branch', 'Implementation Branch']))
  )
    missing.push('Branch');
  if (
    strictMetadata &&
    !normalizeText(
      propertyValue(task, ['Validation Commands', 'Validation', 'Required Validation']),
    )
  ) {
    missing.push('Validation Commands');
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}

function explainTrackerTaskEligibility(task, options = {}) {
  const taskScope = normalizeTaskScope(options.taskScope || options.scope || DEFAULT_TASK_SCOPE);
  const status = normalizeLower(getTaskStatus(task));
  const title = getTaskTitle(task);
  const key = getTaskKey(task);

  if (!title) return { eligible: false, reason: 'missing_title' };
  if (DONE_STATUSES.has(status)) return { eligible: false, reason: 'done_status' };
  if (BLOCKED_STATUSES.has(status)) return { eligible: false, reason: 'blocked_status' };
  if (status && !SELECTABLE_STATUSES.has(status) && !options.allowAnySelectableStatus) {
    return { eligible: false, reason: `unsupported_status:${status}` };
  }
  if (hasActiveClaim(task)) return { eligible: false, reason: 'active_claim' };
  if (isReviewOnlyTask(task)) return { eligible: false, reason: 'review_only' };
  if (isManualOnlyTask(task)) return { eligible: false, reason: 'manual_only' };

  if (taskScope === 'eng-loop' && !isEngLoopTask(task)) {
    return { eligible: false, reason: 'outside_eng_loop_scope' };
  }

  const metadata = hasRequiredAutomationMetadata(task, options);
  if (!metadata.ok) {
    return { eligible: false, reason: `missing_metadata:${metadata.missing.join(',')}` };
  }

  return { eligible: true, reason: 'eligible', taskScope, taskKey: key, title };
}

function isEligibleTrackerTask(task, options = {}) {
  return explainTrackerTaskEligibility(task, options).eligible;
}

function priorityRank(priority) {
  const value = normalizeLower(priority);
  if (value === 'p0') return 0;
  if (value === 'p1') return 1;
  if (value === 'p2') return 2;
  if (value === 'p3') return 3;
  if (value === 'p4') return 4;
  return 99;
}

function compareTrackerTasks(a, b) {
  const priorityDelta =
    priorityRank(propertyValue(a, ['Priority'])) - priorityRank(propertyValue(b, ['Priority']));
  if (priorityDelta !== 0) return priorityDelta;

  const aMilestone = normalizeText(propertyValue(a, ['Milestone']));
  const bMilestone = normalizeText(propertyValue(b, ['Milestone']));
  if (aMilestone !== bMilestone)
    return aMilestone.localeCompare(bMilestone, undefined, { numeric: true });

  const aKey = getTaskKey(a) || getTaskTitle(a);
  const bKey = getTaskKey(b) || getTaskTitle(b);
  return aKey.localeCompare(bKey, undefined, { numeric: true });
}

function taskKeyPatternForScope(scope) {
  const taskScope = normalizeTaskScope(scope);
  if (taskScope === 'eng-loop') return /^ENG-LOOP-\d+\b/i;
  return /^[A-Z][A-Z0-9]*(?:[-_.][A-Z0-9]+)*\d*(?:\.\d+)*\b/i;
}

module.exports = {
  DEFAULT_TASK_SCOPE,
  TASK_SCOPES,
  compareTrackerTasks,
  explainTrackerTaskEligibility,
  getTaskKey,
  getTaskStatus,
  getTaskTitle,
  hasRequiredAutomationMetadata,
  isEligibleTrackerTask,
  isEngLoopTask,
  normalizeTaskScope,
  parseTaskScopeFromArgs,
  propertyValue,
  taskKeyPatternForScope,
  truthyProperty,
};
