#!/usr/bin/env node
'use strict';

/**
 * ENG-LOOP-22 — Follow-up task creation.
 *
 * Creates one actionable Notion Backlog task per unique engineering-loop failure
 * fingerprint. This script is intentionally fail-closed: if it cannot dedupe
 * safely, it does not create a task.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_TASK_FILE = '.tmp/eng-loop-task.json';
const DEFAULT_LEDGER_FILE = '.tmp/eng-loop-run-ledger.json';
const DEFAULT_VALIDATION_RESULT_FILE = '.tmp/eng-loop-validation-result.json';
const DEFAULT_CI_RESULT_FILE = '.tmp/eng-loop-ci-status-result.json';
const DEFAULT_RESULT_FILE = '.tmp/eng-loop-follow-up-task-result.json';
const DEFAULT_SUMMARY_FILE = '.tmp/eng-loop-follow-up-task-summary.md';
const DEFAULT_NOTION_VERSION = '2022-06-28';
const FINGERPRINT_PREFIX = 'eng-loop-follow-up:';
const TEXT_LIMIT = 1900;
const SUMMARY_LIMIT = 8000;

const VALIDATION_CREATE_CLASSIFICATIONS = new Set([
  'validation_failed',
  'timeout',
  'command_not_found',
  'executor_failed',
  'disallowed_command',
]);

const CI_CREATE_STATUSES = new Set([
  'ci_failed',
  'ci_cancelled',
  'ci_timed_out',
  'ci_missing_required_check',
  'ci_unknown',
  'github_api_error',
  'metadata_unresolved',
  'required_checks_unresolved',
]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeComparable(value) {
  return normalizeText(value).toLowerCase();
}

function limitText(value, limit = TEXT_LIMIT) {
  const text = normalizeText(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 24))}\n[truncated by ENG-LOOP-22]`;
}

function normalizeFailureText(value) {
  return normalizeText(value)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, SUMMARY_LIMIT);
}

function sanitizeFollowUpText(value) {
  return normalizeFailureText(value)
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

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return null;
  return JSON.parse(raw);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(`${filePath}.tmp`, filePath);
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(`${filePath}.tmp`, value.endsWith('\n') ? value : `${value}\n`, 'utf8');
  fs.renameSync(`${filePath}.tmp`, filePath);
}

function textFromRichText(items) {
  if (!Array.isArray(items)) return '';
  return items.map((item) => item?.plain_text ?? item?.text?.content ?? '').join('');
}

function textFromProperty(property) {
  if (!property) return '';

  if (
    typeof property === 'string' ||
    typeof property === 'number' ||
    typeof property === 'boolean'
  ) {
    return String(property);
  }

  switch (property.type) {
    case 'title':
      return textFromRichText(property.title);
    case 'rich_text':
      return textFromRichText(property.rich_text);
    case 'select':
      return property.select?.name ?? '';
    case 'status':
      return property.status?.name ?? '';
    case 'checkbox':
      return property.checkbox ? 'true' : 'false';
    case 'url':
      return property.url ?? '';
    case 'date':
      return property.date?.start ?? '';
    case 'number':
      return property.number == null ? '' : String(property.number);
    default:
      if ('plain_text' in property) return String(property.plain_text ?? '');
      if ('name' in property) return String(property.name ?? '');
      if ('value' in property) return String(property.value ?? '');
      return '';
  }
}

function firstProperty(properties, names) {
  const source = properties || {};
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(source, name)) return source[name];
  }
  return undefined;
}

function sourceTaskFromJson(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const properties = raw.properties && typeof raw.properties === 'object' ? raw.properties : {};
  const nestedTask = raw.task && typeof raw.task === 'object' ? raw.task : {};

  const title =
    normalizeText(raw.title) ||
    normalizeText(raw.Task) ||
    normalizeText(nestedTask.title) ||
    normalizeText(textFromProperty(firstProperty(properties, ['Task', 'Name', 'Title', 'title'])));

  return {
    id: normalizeText(raw.id || raw.page_id || nestedTask.id || raw.task_id),
    title,
    url: normalizeText(raw.url || nestedTask.url),
    branch:
      normalizeText(raw.branch || raw.Branch || nestedTask.branch) ||
      normalizeText(textFromProperty(firstProperty(properties, ['Branch', 'branch']))),
    repository:
      normalizeText(raw.repository || raw.Repository || raw.repo || nestedTask.repository) ||
      normalizeText(textFromProperty(firstProperty(properties, ['Repository', 'repository']))),
    priority:
      normalizeText(raw.priority || raw.Priority || nestedTask.priority) ||
      normalizeText(textFromProperty(firstProperty(properties, ['Priority', 'priority']))),
  };
}

function taskCodeFromTitle(title) {
  const match = /ENG-LOOP-\d+/i.exec(String(title || ''));
  return match ? match[0].toUpperCase() : '';
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return '';
}

function classifyValidationFollowUp(validation) {
  const classification = normalizeText(
    validation?.classification || validation?.status || 'validation_failed',
  );

  if (classification === 'validation_failed') {
    return {
      kind: 'validation_failure',
      label: 'Validation failure',
      category: 'Testing',
      priority: 'P1',
      itemType: 'Bug Fix',
      reason: 'validation_failed',
    };
  }

  if (classification === 'disallowed_command') {
    return {
      kind: 'validation_command_blocked',
      label: 'Validation command blocked',
      category: 'Reliability',
      priority: 'P1',
      itemType: 'Bug Fix',
      reason: 'validation_command_blocked',
    };
  }

  return {
    kind: 'validation_executor_failure',
    label: 'Validation executor failure',
    category: 'Reliability',
    priority: 'P1',
    itemType: 'Bug Fix',
    reason: classification || 'validation_executor_failure',
  };
}

function classifyCiFollowUp(ci) {
  const status = normalizeText(ci?.status || 'ci_failed');

  if (status === 'ci_failed') {
    return {
      kind: 'ci_failure',
      label: 'CI failure',
      category: 'Reliability',
      priority: 'P1',
      itemType: 'Bug Fix',
      reason: 'ci_failed',
    };
  }

  if (status === 'ci_missing_required_check' || status === 'required_checks_unresolved') {
    return {
      kind: 'required_check_unresolved',
      label: 'Required check unresolved',
      category: 'Observability',
      priority: 'P1',
      itemType: 'Implementation Task',
      reason: status,
    };
  }

  if (status === 'metadata_unresolved' || status === 'github_api_error') {
    return {
      kind: 'ci_metadata_failure',
      label: 'CI metadata/API failure',
      category: 'Reliability',
      priority: 'P1',
      itemType: 'Bug Fix',
      reason: status,
    };
  }

  if (status === 'ci_cancelled' || status === 'ci_timed_out') {
    return {
      kind: 'ci_incomplete_terminal',
      label: 'CI incomplete terminal state',
      category: 'Reliability',
      priority: 'P1',
      itemType: 'Bug Fix',
      reason: status,
    };
  }

  return {
    kind: 'ci_unknown',
    label: 'CI status unknown',
    category: 'Observability',
    priority: 'P1',
    itemType: 'Bug Fix',
    reason: status || 'ci_unknown',
  };
}

function classifyManualFollowUp(input) {
  const kind = normalizeComparable(input.failureKind || input.kind || 'discovered_bug').replace(
    /[^a-z0-9]+/g,
    '_',
  );

  if (kind === 'missing_requirement') {
    return {
      kind,
      label: 'Missing requirement',
      category: 'Correctness',
      priority: 'P1',
      itemType: 'Implementation Task',
      reason: kind,
    };
  }

  if (kind === 'flaky_automation') {
    return {
      kind,
      label: 'Flaky automation',
      category: 'Reliability',
      priority: 'P2',
      itemType: 'Bug Fix',
      reason: kind,
    };
  }

  return {
    kind: kind || 'discovered_bug',
    label: 'Discovered bug',
    category: 'Correctness',
    priority: 'P1',
    itemType: 'Bug Fix',
    reason: kind || 'discovered_bug',
  };
}

function classifyFollowUpFailure(input) {
  const source = normalizeComparable(input?.source);
  if (source === 'validation')
    return classifyValidationFollowUp(input.validation || input.validationResult || {});
  if (source === 'ci' || source === 'github')
    return classifyCiFollowUp(input.ci || input.ciResult || {});
  return classifyManualFollowUp(input || {});
}

function validationShouldCreate(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.status === 'passed' || result.classification === 'validation_passed') return false;
  return (
    VALIDATION_CREATE_CLASSIFICATIONS.has(result.classification) ||
    ['failed', 'blocked', 'error'].includes(result.status)
  );
}

function ciShouldCreate(result) {
  if (!result || typeof result !== 'object') return false;
  if (
    result.safe_to_mark_done === true ||
    result.status === 'ci_passed' ||
    result.status === 'ci_pending'
  ) {
    return false;
  }
  return CI_CREATE_STATUSES.has(result.status);
}

function shouldCreateFollowUp(input) {
  const source = normalizeComparable(input?.source);

  if (source === 'validation') {
    const create = validationShouldCreate(input.validation || input.validationResult);
    return {
      create,
      reason: create
        ? 'validation_result_requires_follow_up'
        : 'validation_result_does_not_require_follow_up',
    };
  }

  if (source === 'ci' || source === 'github') {
    const create = ciShouldCreate(input.ci || input.ciResult);
    return {
      create,
      reason: create ? 'ci_result_requires_follow_up' : 'ci_result_does_not_require_follow_up',
    };
  }

  const kind = normalizeText(input?.failureKind || input?.kind || input?.failureSummary);
  return {
    create: Boolean(kind),
    reason: kind ? 'manual_failure_requires_follow_up' : 'manual_failure_missing_kind',
  };
}

function validationEvidenceSummary(result) {
  return sanitizeFollowUpText(
    firstNonEmpty(
      result?.stderrSummary,
      result?.stdoutSummary,
      result?.classification,
      result?.status,
      'Validation failed without output summary.',
    ),
  );
}

function ciEvidenceSummary(result) {
  const failed = Array.isArray(result?.failed_checks)
    ? result.failed_checks.map((check) => check.name || check.matched_name).filter(Boolean)
    : [];
  const missing = Array.isArray(result?.missing_required_checks)
    ? result.missing_required_checks
    : [];
  const timedOut = Array.isArray(result?.timed_out_checks)
    ? result.timed_out_checks.map((check) => check.name || check.matched_name).filter(Boolean)
    : [];
  const unknown = Array.isArray(result?.unknown_checks)
    ? result.unknown_checks.map((check) => check.name || check.matched_name).filter(Boolean)
    : [];

  return sanitizeFollowUpText(
    [
      result?.message,
      failed.length ? `Failed checks: ${failed.join(', ')}` : '',
      missing.length ? `Missing required checks: ${missing.join(', ')}` : '',
      timedOut.length ? `Timed out checks: ${timedOut.join(', ')}` : '',
      unknown.length ? `Unknown checks: ${unknown.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n') || 'CI status requires follow-up but did not include detailed check output.',
  );
}

function commandOrCheckFromInput(input) {
  const source = normalizeComparable(input?.source);

  if (source === 'validation') {
    return normalizeText(
      (input.validation || input.validationResult || {}).command || 'pnpm validate:quick',
    );
  }

  if (source === 'ci' || source === 'github') {
    const ci = input.ci || input.ciResult || {};
    const failed = Array.isArray(ci.failed_checks) ? ci.failed_checks[0] : null;
    const missing = Array.isArray(ci.missing_required_checks)
      ? ci.missing_required_checks[0]
      : null;
    const timedOut = Array.isArray(ci.timed_out_checks) ? ci.timed_out_checks[0] : null;
    const unknown = Array.isArray(ci.unknown_checks) ? ci.unknown_checks[0] : null;
    return normalizeText(
      failed?.name ||
        failed?.matched_name ||
        missing ||
        timedOut?.name ||
        timedOut?.matched_name ||
        unknown?.name ||
        unknown?.matched_name ||
        ci.status ||
        'github-ci',
    );
  }

  return normalizeText(input.command || input.check || input.failureKind || 'manual-follow-up');
}

function failureSummaryFromInput(input) {
  const source = normalizeComparable(input?.source);

  if (source === 'validation')
    return validationEvidenceSummary(input.validation || input.validationResult || {});
  if (source === 'ci' || source === 'github')
    return ciEvidenceSummary(input.ci || input.ciResult || {});
  return sanitizeFollowUpText(
    firstNonEmpty(input.failureSummary, input.summary, input.message, input.failureKind),
  );
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalize(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function buildFollowUpFingerprint(input) {
  const sourceTask = input.sourceTask || sourceTaskFromJson(input.task || {});
  const classification = classifyFollowUpFailure(input);
  const affectedFiles = Array.isArray(input.affectedFiles)
    ? input.affectedFiles.map(normalizeText).filter(Boolean).sort()
    : [];

  const payload = canonicalize({
    source_task_id: sourceTask.id || null,
    source_task_title: sourceTask.title || null,
    source: normalizeComparable(input.source || 'manual'),
    failure_kind: classification.kind,
    command_or_check: commandOrCheckFromInput(input),
    normalized_failure_summary: normalizeFailureText(failureSummaryFromInput(input)).toLowerCase(),
    affected_files: affectedFiles,
  });

  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 16);
  return `${FINGERPRINT_PREFIX}${digest}`;
}

function buildFollowUpTaskTitle(input, fingerprint) {
  const sourceTask = input.sourceTask || sourceTaskFromJson(input.task || {});
  const sourceCode = taskCodeFromTitle(sourceTask.title) || 'ENG-LOOP-FOLLOW-UP';
  const classification = classifyFollowUpFailure(input);
  const summary = failureSummaryFromInput(input)
    .replace(/\n/g, ' ')
    .replace(/`/g, '')
    .slice(0, 72)
    .trim();
  const suffix = summary || classification.label;
  const shortFingerprint = String(fingerprint || '')
    .replace(FINGERPRINT_PREFIX, '')
    .slice(0, 8);

  return `${sourceCode}-FOLLOW-UP-${shortFingerprint} — ${classification.label}: ${suffix}`;
}

function buildFollowUpBranch(input, fingerprint) {
  const sourceTask = input.sourceTask || sourceTaskFromJson(input.task || {});
  const sourceCode = taskCodeFromTitle(sourceTask.title) || 'eng-loop-follow-up';
  const suffix = String(fingerprint || '')
    .replace(FINGERPRINT_PREFIX, '')
    .slice(0, 8);
  return `fix/${slugify(sourceCode)}-follow-up-${suffix}`;
}

function buildFollowUpCommitMessage(input) {
  const sourceTask = input.sourceTask || sourceTaskFromJson(input.task || {});
  const sourceCode = taskCodeFromTitle(sourceTask.title) || 'engineering loop';
  return `fix(engineering): resolve ${sourceCode} follow-up`;
}

function validationCommandFromInput(input) {
  if (normalizeComparable(input?.source) === 'validation') {
    return (
      normalizeText((input.validation || input.validationResult || {}).command) ||
      'pnpm validate:quick'
    );
  }

  return normalizeText(input.validationCommand || input.command) || 'pnpm validate:quick';
}

function buildFollowUpTaskModel(input, options = {}) {
  const detectedAt = options.detectedAt || nowIso();
  const sourceTask = input.sourceTask || sourceTaskFromJson(input.task || {});
  const classification = classifyFollowUpFailure(input);
  const fingerprint = options.fingerprint || buildFollowUpFingerprint(input);
  const title = buildFollowUpTaskTitle(input, fingerprint);
  const failureSummary = failureSummaryFromInput(input);
  const commandOrCheck = commandOrCheckFromInput(input);
  const sourceCode = taskCodeFromTitle(sourceTask.title);
  const affectedFiles = Array.isArray(input.affectedFiles)
    ? input.affectedFiles.map(normalizeText).filter(Boolean)
    : [];
  const ledgerPath = normalizeText(
    input.ledgerPath || input.sourceLedgerPath || DEFAULT_LEDGER_FILE,
  );

  return {
    title,
    fingerprint,
    status: 'Backlog',
    codexReady: true,
    branch: buildFollowUpBranch(input, fingerprint),
    repository: sourceTask.repository || input.repository || 'dev-jeyelscott/garageos',
    priority: classification.priority,
    category: classification.category,
    itemType: classification.itemType,
    milestone: input.milestone || 'M0',
    dependencies: sourceCode || sourceTask.title || '',
    progressSource: [
      'Generated by ENG-LOOP-22 follow-up task creation.',
      sourceTask.title ? `Source task: ${sourceTask.title}.` : '',
      sourceTask.url ? `Source URL: ${sourceTask.url}.` : '',
      `Fingerprint: ${fingerprint}.`,
      `Detected at: ${detectedAt}.`,
      ledgerPath ? `Run ledger: ${ledgerPath}.` : '',
    ]
      .filter(Boolean)
      .join(' '),
    validationCommand: validationCommandFromInput(input),
    commitMessage: buildFollowUpCommitMessage(input),
    sourceTask,
    classification,
    commandOrCheck,
    failureSummary,
    affectedFiles,
    ledgerPath,
    detectedAt,
  };
}

function richTextValue(value) {
  const content = limitText(value);
  return content ? [{ type: 'text', text: { content } }] : [];
}

function propertyValueFromSchema(schemaProperty, value) {
  const type = schemaProperty?.type;

  switch (type) {
    case 'title':
      return { title: richTextValue(value) };
    case 'rich_text':
      return { rich_text: richTextValue(value) };
    case 'status':
      return { status: { name: String(value) } };
    case 'select':
      return { select: { name: String(value) } };
    case 'checkbox':
      return { checkbox: Boolean(value) };
    case 'url':
      return { url: value ? String(value) : null };
    case 'date':
      return { date: { start: String(value) } };
    case 'number':
      return { number: Number(value) };
    default:
      return null;
  }
}

function defaultTaskSchema() {
  return {
    Task: { type: 'title' },
    Status: { type: 'status' },
    'Codex Ready': { type: 'checkbox' },
    Branch: { type: 'rich_text' },
    Repository: { type: 'rich_text' },
    Priority: { type: 'select' },
    Category: { type: 'select' },
    'Item Type': { type: 'select' },
    Milestone: { type: 'select' },
    Dependencies: { type: 'rich_text' },
    'Progress Source': { type: 'rich_text' },
    'Validation Commands': { type: 'rich_text' },
    'Commit Message': { type: 'rich_text' },
  };
}

function findSchemaPropertyName(schema, candidates, typeHint) {
  const properties = schema || {};

  for (const name of candidates) {
    if (Object.prototype.hasOwnProperty.call(properties, name)) {
      if (!typeHint || properties[name]?.type === typeHint) return name;
    }
  }

  if (typeHint) {
    const found = Object.entries(properties).find(([, property]) => property?.type === typeHint);
    if (found) return found[0];
  }

  return '';
}

function buildFollowUpTaskProperties(model, schema = defaultTaskSchema()) {
  const properties = schema && Object.keys(schema).length > 0 ? schema : defaultTaskSchema();
  const output = {};

  function set(candidates, value, typeHint) {
    const name = findSchemaPropertyName(properties, candidates, typeHint);
    if (!name) return;
    const encoded = propertyValueFromSchema(properties[name], value);
    if (encoded) output[name] = encoded;
  }

  set(['Task', 'Name', 'Title', 'title'], model.title, 'title');
  set(['Status', 'status'], model.status);
  set(['Codex Ready', 'CodexReady', 'codex_ready'], model.codexReady, 'checkbox');
  set(['Branch', 'branch'], model.branch);
  set(['Repository', 'repository'], model.repository);
  set(['Priority', 'priority'], model.priority);
  set(['Category', 'category'], model.category);
  set(['Item Type', 'ItemType', 'item_type'], model.itemType);
  set(['Milestone', 'milestone'], model.milestone);
  set(['Dependencies', 'dependencies'], model.dependencies);
  set(['Progress Source', 'ProgressSource', 'progress_source'], model.progressSource);
  set(
    ['Validation Commands', 'Validation Command', 'validation_commands'],
    model.validationCommand,
  );
  set(['Commit Message', 'commit_message'], model.commitMessage);

  return output;
}

function paragraphBlock(value) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: richTextValue(value),
    },
  };
}

function headingBlock(level, value) {
  const key = level === 3 ? 'heading_3' : level === 2 ? 'heading_2' : 'heading_1';
  return {
    object: 'block',
    type: key,
    [key]: {
      rich_text: richTextValue(value),
    },
  };
}

function bulletBlock(value) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: richTextValue(value),
    },
  };
}

function codeBlock(value) {
  return {
    object: 'block',
    type: 'code',
    code: {
      language: 'plain text',
      rich_text: richTextValue(value),
    },
  };
}

function buildFollowUpTaskContent(model) {
  const sourceTask = model.sourceTask || {};
  const blocks = [
    headingBlock(2, 'Follow-up Context'),
    bulletBlock(`Source task: ${sourceTask.title || 'unknown'}`),
    bulletBlock(`Source task URL: ${sourceTask.url || 'not provided'}`),
    bulletBlock(`Source run ledger: ${model.ledgerPath || 'not provided'}`),
    bulletBlock(`Source branch: ${sourceTask.branch || 'not provided'}`),
    bulletBlock(
      `Source repository: ${model.repository || sourceTask.repository || 'not provided'}`,
    ),
    headingBlock(2, 'Failure Summary'),
    bulletBlock(`Failure type: ${model.classification.label}`),
    bulletBlock(`Fingerprint: ${model.fingerprint}`),
    bulletBlock(`Detected at: ${model.detectedAt}`),
    headingBlock(2, 'Evidence'),
    bulletBlock(`Validation command / CI check: ${model.commandOrCheck}`),
    codeBlock(model.failureSummary || 'No failure summary was provided.'),
    headingBlock(2, 'Reproduction'),
    bulletBlock(
      `Checkout branch: ${sourceTask.branch || model.branch || 'source branch not provided'}`,
    ),
    bulletBlock(`Run command: ${model.validationCommand || 'pnpm validate:quick'}`),
    bulletBlock('Observe the failure summarized above.'),
    headingBlock(2, 'Proposed Next Action'),
    bulletBlock('Investigate the failing command/check and make the smallest source-aligned fix.'),
    bulletBlock(
      model.affectedFiles.length > 0
        ? `Affected files: ${model.affectedFiles.join(', ')}`
        : 'Affected files: not known from automation context.',
    ),
    bulletBlock(`Validation command: ${model.validationCommand || 'pnpm validate:quick'}`),
    headingBlock(2, 'Safety Notes'),
    bulletBlock('Original task must not be marked Done while this follow-up remains unresolved.'),
    bulletBlock('This follow-up was generated by GarageOS engineering-loop automation.'),
  ];

  return blocks.filter((block) => {
    const payload = block[block.type];
    return payload && Array.isArray(payload.rich_text) && payload.rich_text.length > 0;
  });
}

function buildFollowUpTaskPayload(input, options = {}) {
  const model = buildFollowUpTaskModel(input, options);
  const schema = options.schema || defaultTaskSchema();

  return {
    model,
    properties: buildFollowUpTaskProperties(model, schema),
    children: buildFollowUpTaskContent(model),
  };
}

function buildMarkdownSummary(result) {
  const lines = [
    '## Engineering Loop Follow-up Task',
    '',
    `Status: ${result.status}`,
    `Reason: ${result.reason || 'n/a'}`,
    `Fingerprint: ${result.fingerprint || 'n/a'}`,
    `Task: ${result.task_title || 'n/a'}`,
    `URL: ${result.task_url || 'n/a'}`,
    `Created at: ${result.created_at || 'n/a'}`,
    '',
    result.message ? `Message: ${result.message}` : '',
  ].filter((line) => line !== '');

  return `${lines.join('\n')}\n`;
}

function safeLedgerFollowUpStatus(result) {
  return {
    status: result.status,
    reason: result.reason || null,
    fingerprint: result.fingerprint || null,
    task_title: result.task_title || null,
    task_url: result.task_url || null,
    created_at: result.created_at || null,
    message: result.message || null,
  };
}

function mergeFollowUpIntoLedger(existing, result, timestamp = nowIso()) {
  const ledger =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
  const eventType = `follow_up_task_${result.status}`;
  const message =
    result.message ||
    `Follow-up task ${result.status}${result.fingerprint ? ` for ${result.fingerprint}` : ''}.`;

  ledger.follow_up_task = safeLedgerFollowUpStatus(result);
  ledger.updated_at = timestamp;
  ledger.events = Array.isArray(ledger.events) ? ledger.events.slice() : [];
  ledger.events.push({
    timestamp,
    type: eventType,
    message,
  });

  return ledger;
}

function writeOutputs(result, options = {}) {
  const resultFile = options.resultFile || DEFAULT_RESULT_FILE;
  const summaryFile = options.summaryFile || DEFAULT_SUMMARY_FILE;
  const ledgerFile = options.ledgerFile || DEFAULT_LEDGER_FILE;

  writeJson(resultFile, result);
  writeText(summaryFile, buildMarkdownSummary(result));

  const existingLedger = readJsonIfExists(ledgerFile) || {};
  writeJson(ledgerFile, mergeFollowUpIntoLedger(existingLedger, result));

  return { resultFile, summaryFile, ledgerFile };
}

function notionFilterForProperty(name, type, fingerprint) {
  if (type === 'title') return { property: name, title: { contains: fingerprint } };
  if (type === 'rich_text') return { property: name, rich_text: { contains: fingerprint } };
  return null;
}

function buildDedupeFilter(schema, fingerprint) {
  const properties = schema || {};
  const candidates = [];
  const preferredNames = [
    'Progress Source',
    'ProgressSource',
    'progress_source',
    'Task',
    'Name',
    'Title',
    'title',
  ];

  for (const name of preferredNames) {
    const property = properties[name];
    const filter = notionFilterForProperty(name, property?.type, fingerprint);
    if (filter) candidates.push(filter);
  }

  if (candidates.length === 0) {
    for (const [name, property] of Object.entries(properties)) {
      const filter = notionFilterForProperty(name, property?.type, fingerprint);
      if (filter) candidates.push(filter);
      if (candidates.length >= 3) break;
    }
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  return { or: candidates };
}

class NotionFollowUpClient {
  constructor({
    token,
    databaseId,
    notionVersion = DEFAULT_NOTION_VERSION,
    fetchImpl = globalThis.fetch,
  }) {
    if (!token) throw new Error('Missing Notion token. Set GARAGEOS_NOTION_TOKEN or NOTION_TOKEN.');
    if (!databaseId) {
      throw new Error(
        'Missing Notion task database id. Set GARAGEOS_NOTION_TASK_DATABASE_ID or NOTION_TASK_DATABASE_ID.',
      );
    }
    if (!fetchImpl) throw new Error('Global fetch is unavailable. Use Node.js 18 or newer.');

    this.token = token;
    this.databaseId = databaseId;
    this.notionVersion = notionVersion;
    this.fetchImpl = fetchImpl;
  }

  async request(method, endpoint, body) {
    const response = await this.fetchImpl(`https://api.notion.com/v1${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Notion-Version': this.notionVersion,
        'Content-Type': 'application/json',
      },
      body: body == null ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const message = payload?.message || response.statusText || 'Notion API request failed';
      throw new Error(`${method} ${endpoint} failed: ${message}`);
    }

    return payload;
  }

  async fetchDatabase() {
    const database = await this.request('GET', `/databases/${this.databaseId}`);
    return database.properties || {};
  }

  async queryDatabase(filter) {
    const payload = await this.request('POST', `/databases/${this.databaseId}/query`, {
      page_size: 10,
      filter,
    });
    return payload.results || [];
  }

  async findExistingFollowUp({ schema, fingerprint }) {
    const filter = buildDedupeFilter(schema, fingerprint);
    if (!filter) {
      return {
        dedupeSafe: false,
        existingPage: null,
      };
    }

    const matches = await this.queryDatabase(filter);
    return {
      dedupeSafe: true,
      existingPage: matches[0] || null,
    };
  }

  async createFollowUpTask({ properties, children }) {
    return this.request('POST', '/pages', {
      parent: { database_id: this.databaseId },
      properties,
      children,
    });
  }
}

async function executeFollowUpCreation(input, options = {}) {
  const decision = shouldCreateFollowUp(input);
  const timestamp = options.now ? options.now() : nowIso();

  if (!decision.create) {
    return {
      status: 'skipped',
      reason: decision.reason,
      fingerprint: null,
      task_title: null,
      task_url: null,
      created_at: timestamp,
      message: 'No follow-up task is required for this result.',
    };
  }

  const fingerprint = buildFollowUpFingerprint(input);

  if (options.dryRun) {
    const payload = buildFollowUpTaskPayload(input, { detectedAt: timestamp, fingerprint });
    return {
      status: 'dry_run',
      reason: decision.reason,
      fingerprint,
      task_title: payload.model.title,
      task_url: null,
      created_at: timestamp,
      message: 'Dry-run only. No Notion task was created.',
      payload,
    };
  }

  const client = options.client;
  if (!client) {
    throw new Error('Follow-up creation requires a Notion client unless --dry-run is used.');
  }

  const schema = await client.fetchDatabase();
  const duplicate = await client.findExistingFollowUp({ schema, fingerprint });

  if (!duplicate.dedupeSafe) {
    throw new Error(
      'Cannot create follow-up task because no safe dedupe property was found in the Notion task schema.',
    );
  }

  const payload = buildFollowUpTaskPayload(input, { detectedAt: timestamp, fingerprint, schema });

  if (duplicate.existingPage) {
    return {
      status: 'deduped',
      reason: decision.reason,
      fingerprint,
      task_title: payload.model.title,
      task_url: duplicate.existingPage.url || null,
      created_at: timestamp,
      message: 'Duplicate follow-up fingerprint already exists. No new task was created.',
    };
  }

  const created = await client.createFollowUpTask({
    properties: payload.properties,
    children: payload.children,
  });

  return {
    status: 'created',
    reason: decision.reason,
    fingerprint,
    task_title: payload.model.title,
    task_url: created.url || null,
    created_at: timestamp,
    message: 'Created one follow-up task for this unique failure fingerprint.',
  };
}

function parseArgs(argv) {
  const args = { affectedFiles: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);

    const [rawKey, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const value = inlineValue === undefined ? argv[index + 1] : inlineValue;

    if (['dryRun', 'help', 'json'].includes(key)) {
      args[key] = true;
      continue;
    }

    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${rawKey}`);
    }

    if (key === 'affectedFile') args.affectedFiles.push(value);
    else if (key === 'affectedFiles')
      args.affectedFiles.push(...value.split(',').map((item) => item.trim()));
    else args[key] = value;

    if (inlineValue === undefined) index += 1;
  }

  return args;
}

function printHelp() {
  console.log(
    [
      'ENG-LOOP-22 follow-up task creation',
      '',
      'Usage:',
      '  node ./.github/scripts/eng-loop-follow-up-task.cjs --source validation',
      '  node ./.github/scripts/eng-loop-follow-up-task.cjs --source ci',
      '  node ./.github/scripts/eng-loop-follow-up-task.cjs --source manual --failure-kind missing_requirement --failure-summary "..."',
      '',
      'Options:',
      '  --source <validation|ci|manual>       Failure source.',
      '  --task <path>                         Source task JSON. Default: .tmp/eng-loop-task.json.',
      '  --ledger <path>                       Run ledger JSON. Default: .tmp/eng-loop-run-ledger.json.',
      '  --validation-result <path>            Validation result JSON.',
      '  --ci-result <path>                    CI status result JSON.',
      '  --failure-kind <kind>                 Manual failure kind.',
      '  --failure-summary <summary>           Manual failure summary.',
      '  --affected-file <path>                Affected file. May be repeated.',
      '  --affected-files <a,b,c>              Comma-separated affected files.',
      '  --database-id <id>                    Notion task database id.',
      '  --token <token>                       Notion token.',
      '  --out <path>                          Result JSON output path.',
      '  --summary <path>                      Summary Markdown output path.',
      '  --dry-run                             Build payload and ledger output without Notion writes.',
      '  --json                                Print JSON result.',
    ].join('\n'),
  );
}

function buildInputFromArgs(args, cwd = process.cwd()) {
  const source = normalizeComparable(args.source || 'validation');
  const taskPath = path.resolve(cwd, args.task || DEFAULT_TASK_FILE);
  const ledgerPath = path.resolve(cwd, args.ledger || DEFAULT_LEDGER_FILE);
  const task = readJsonIfExists(taskPath) || {};
  const ledger = readJsonIfExists(ledgerPath) || {};
  const sourceTask = sourceTaskFromJson(task.task || task);

  const input = {
    source,
    sourceTask,
    task,
    ledger,
    ledgerPath: args.ledger || DEFAULT_LEDGER_FILE,
    affectedFiles: args.affectedFiles || [],
    failureKind: args.failureKind,
    failureSummary: args.failureSummary,
    command: args.command,
    validationCommand: args.validationCommand,
    repository: args.repository,
    milestone: args.milestone,
  };

  if (source === 'validation') {
    const validationPath = path.resolve(
      cwd,
      args.validationResult || DEFAULT_VALIDATION_RESULT_FILE,
    );
    input.validation = readJsonIfExists(validationPath) || {};
  } else if (source === 'ci' || source === 'github') {
    const ciPath = path.resolve(cwd, args.ciResult || DEFAULT_CI_RESULT_FILE);
    input.source = 'ci';
    input.ci = readJsonIfExists(ciPath) || {};
  }

  return input;
}

function createClientFromArgs(args) {
  return new NotionFollowUpClient({
    token:
      args.token ||
      args.notionToken ||
      process.env.GARAGEOS_NOTION_TOKEN ||
      process.env.NOTION_TOKEN,
    databaseId:
      args.databaseId ||
      args.notionDatabaseId ||
      process.env.GARAGEOS_NOTION_TASK_DATABASE_ID ||
      process.env.NOTION_TASK_DATABASE_ID ||
      process.env.NOTION_DATABASE_ID,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
  const input = buildInputFromArgs(args, cwd);
  const ledgerFile = path.resolve(cwd, args.ledger || DEFAULT_LEDGER_FILE);
  const resultFile = path.resolve(cwd, args.out || args.output || DEFAULT_RESULT_FILE);
  const summaryFile = path.resolve(cwd, args.summary || DEFAULT_SUMMARY_FILE);

  let result;
  try {
    result = await executeFollowUpCreation(input, {
      dryRun: Boolean(args.dryRun),
      client: args.dryRun ? null : createClientFromArgs(args),
    });
  } catch (error) {
    result = {
      status: 'failed',
      reason: 'follow_up_creation_failed',
      fingerprint: null,
      task_title: null,
      task_url: null,
      created_at: nowIso(),
      message: error && error.message ? error.message : String(error),
    };
    writeOutputs(result, { resultFile, summaryFile, ledgerFile });
    throw error;
  }

  const artifacts = writeOutputs(result, { resultFile, summaryFile, ledgerFile });

  if (args.json) {
    console.log(JSON.stringify({ result, artifacts }, null, 2));
  } else {
    console.log(`Follow-up task result: ${result.status}`);
    console.log(`Result JSON: ${artifacts.resultFile}`);
    console.log(`Summary Markdown: ${artifacts.summaryFile}`);
    console.log(`Run ledger: ${artifacts.ledgerFile}`);
  }

  if (result.status === 'failed') process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`::error::${error && error.message ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  CI_CREATE_STATUSES,
  DEFAULT_CI_RESULT_FILE,
  DEFAULT_LEDGER_FILE,
  DEFAULT_RESULT_FILE,
  DEFAULT_SUMMARY_FILE,
  DEFAULT_TASK_FILE,
  DEFAULT_VALIDATION_RESULT_FILE,
  FINGERPRINT_PREFIX,
  NotionFollowUpClient,
  VALIDATION_CREATE_CLASSIFICATIONS,
  buildDedupeFilter,
  buildFollowUpFingerprint,
  buildFollowUpTaskContent,
  buildFollowUpTaskModel,
  buildFollowUpTaskPayload,
  buildFollowUpTaskProperties,
  buildFollowUpTaskTitle,
  buildMarkdownSummary,
  classifyFollowUpFailure,
  executeFollowUpCreation,
  failureSummaryFromInput,
  mergeFollowUpIntoLedger,
  normalizeFailureText,
  sanitizeFollowUpText,
  shouldCreateFollowUp,
  sourceTaskFromJson,
  writeOutputs,
};
