#!/usr/bin/env node
'use strict';

const taskScopePolicy = require('./eng-loop-task-scope.cjs');
const ACTIVE_TASK_SCOPE = taskScopePolicy.parseTaskScopeFromArgs(
  process.argv.slice(2),
  process.env,
);
process.env.ENG_LOOP_TASK_SCOPE = ACTIVE_TASK_SCOPE;

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_ALLOWED_STATUSES = ['backlog', 'ready', 'todo', 'to do'];
const DEFAULT_STALE_CLAIM_HOURS = 24;
const FIRST_FIVE_BATCH_LIMIT = 5;
const LEDGER_STATUSES = new Set(['started', 'claimed', 'succeeded', 'failed', 'aborted']);

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeComparable(value) {
  return normalizeText(value).toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const args = {
    mode: 'dry-run',
    actor:
      process.env.ENG_LOOP_ACTOR ||
      process.env.GITHUB_ACTOR ||
      process.env.USER ||
      process.env.USERNAME ||
      'local',
    staleClaimHours: Number(process.env.ENG_LOOP_STALE_CLAIM_HOURS || DEFAULT_STALE_CLAIM_HOURS),
    maxTasks: 100,
    confirmFirstFive: false,
    firstFiveConfirmation: '',
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
      case '--actor':
        args.actor = nextValue;
        if (inlineValue === undefined) index += 1;
        break;
      case '--database-id':
      case '--notion-database-id':
        args.databaseId = nextValue;
        if (inlineValue === undefined) index += 1;
        break;
      case '--token':
      case '--notion-token':
        args.token = nextValue;
        if (inlineValue === undefined) index += 1;
        break;
      case '--tasks-file':
        args.tasksFile = nextValue;
        if (inlineValue === undefined) index += 1;
        break;
      case '--stale-claim-hours':
        args.staleClaimHours = Number(nextValue);
        if (inlineValue === undefined) index += 1;
        break;
      case '--max-tasks':
        args.maxTasks = Number(nextValue);
        if (inlineValue === undefined) index += 1;
        break;
      case '--confirm-first-5':
        args.confirmFirstFive = true;
        break;
      case '--first-5-confirmation':
        args.firstFiveConfirmation = nextValue;
        if (inlineValue === undefined) index += 1;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        if (raw.startsWith('--')) {
          throw new Error(`Unknown argument: ${raw}`);
        }
    }
  }

  if (!Number.isFinite(args.staleClaimHours) || args.staleClaimHours <= 0) {
    throw new Error('--stale-claim-hours must be a positive number.');
  }

  if (!Number.isFinite(args.maxTasks) || args.maxTasks <= 0) {
    throw new Error('--max-tasks must be a positive number.');
  }

  return args;
}

function printHelp() {
  console.log(`GarageOS engineering loop runner

Usage:
  node ./.github/scripts/eng-loop-runner.cjs --mode=dry-run
  node ./.github/scripts/eng-loop-runner.cjs --mode=claim
  node ./.github/scripts/eng-loop-runner.cjs --mode=first-5-dry-run
  node ./.github/scripts/eng-loop-runner.cjs --mode=first-5 --confirm-first-5

Modes:
  dry-run          Read eligible tasks and print the deterministic selected task. No writes.
  claim            Claim exactly one eligible Notion task and initialize a run ledger.
  run              Alias for claim mode when invoked by the manual workflow.
  first-5-dry-run  Read eligible tasks and write an ordered first-five batch plan. No Notion writes.
  first-5          Claim up to five eligible tasks sequentially. Requires explicit confirmation.

Environment:
  GARAGEOS_NOTION_TOKEN or NOTION_TOKEN
  GARAGEOS_NOTION_TASK_DATABASE_ID or NOTION_TASK_DATABASE_ID
  ENG_LOOP_ACTOR
  ENG_LOOP_STALE_CLAIM_HOURS

Options:
  --tasks-file <path>           Read a local Notion-like fixture file for dry-run/test use.
  --actor <name>                Actor name recorded in the claim and ledger.
  --database-id <id>            Notion task database id.
  --token <token>               Notion integration token.
  --stale-claim-hours <hours>   Stale claim threshold. Default: ${DEFAULT_STALE_CLAIM_HOURS}.
`);
}

function createRunId(date = new Date(), randomHex = crypto.randomBytes(3).toString('hex')) {
  const stamp = date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
    .replace('T', '-');
  return `eng-loop-${stamp}-${randomHex}`;
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
    case 'email':
      return property.email ?? '';
    case 'phone_number':
      return property.phone_number ?? '';
    case 'number':
      return property.number == null ? '' : String(property.number);
    case 'date':
      return property.date?.start ?? '';
    case 'formula':
      return textFromProperty(property.formula);
    case 'rollup':
      return textFromProperty(property.rollup);
    default:
      if ('name' in property) return String(property.name ?? '');
      if ('plain_text' in property) return String(property.plain_text ?? '');
      if ('value' in property) return String(property.value ?? '');
      return '';
  }
}

function booleanFromProperty(property) {
  if (!property) return false;
  if (typeof property === 'boolean') return property;
  if (property.type === 'checkbox') return Boolean(property.checkbox);
  const value = normalizeComparable(textFromProperty(property));
  return ['true', 'yes', 'y', '1', '__yes__', 'ready'].includes(value);
}

function firstProperty(properties, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(properties, name)) {
      return properties[name];
    }
  }
  return undefined;
}

function firstPropertyName(properties, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(properties, name)) {
      return name;
    }
  }
  return undefined;
}

function taskNumberFromTitle(title) {
  const match = /ENG-LOOP-(\d+)/i.exec(title);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]);
}

function taskFromPage(page) {
  const properties = page?.properties ?? page ?? {};
  const taskProperty = firstProperty(properties, ['Task', 'Name', 'Title', 'title']);
  const statusProperty = firstProperty(properties, ['Status', 'status']);
  const codexReadyProperty = firstProperty(properties, [
    'Codex Ready',
    'CodexReady',
    'codex_ready',
  ]);
  const branchProperty = firstProperty(properties, ['Branch', 'branch']);
  const repositoryProperty = firstProperty(properties, ['Repository', 'repository']);
  const priorityProperty = firstProperty(properties, ['Priority', 'priority']);
  const dependenciesProperty = firstProperty(properties, ['Dependencies', 'dependencies']);
  const progressSourceProperty = firstProperty(properties, [
    'Progress Source',
    'ProgressSource',
    'progress_source',
  ]);
  const createdAtProperty = firstProperty(properties, ['Created At', 'created_at']);

  const title = normalizeText(textFromProperty(taskProperty));
  const status = normalizeText(textFromProperty(statusProperty));
  const progressSource = normalizeText(textFromProperty(progressSourceProperty));

  return {
    id: page.id ?? page.page_id ?? page.url ?? title,
    url: page.url,
    title,
    status,
    codexReady: booleanFromProperty(codexReadyProperty),
    branch: normalizeText(textFromProperty(branchProperty)),
    repository: normalizeText(textFromProperty(repositoryProperty)),
    priority: normalizeText(textFromProperty(priorityProperty)),
    dependencies: normalizeText(textFromProperty(dependenciesProperty)),
    progressSource,
    createdAt: normalizeText(textFromProperty(createdAtProperty)) || page.created_time || '',
    raw: page,
  };
}

function extractClaimFromProgressSource(progressSource) {
  const text = normalizeText(progressSource);
  const runMatch = /engineering loop run\s+([a-z0-9-]+)/i.exec(text);
  const timestampMatch = /at\s+([0-9]{4}-[0-9]{2}-[0-9]{2}T[^\s.]+(?:\.\d{3})?Z)/i.exec(text);
  return {
    hasClaimMarker: /Claimed by engineering loop run/i.test(text),
    runId: runMatch?.[1] ?? '',
    claimedAt: timestampMatch?.[1] ?? '',
  };
}

function isClaimStale(
  task,
  staleClaimHours = DEFAULT_STALE_CLAIM_HOURS,
  referenceDate = new Date(),
) {
  const claim = extractClaimFromProgressSource(task.progressSource);
  if (!claim.hasClaimMarker || !claim.claimedAt) return false;
  const claimedAt = new Date(claim.claimedAt);
  if (Number.isNaN(claimedAt.getTime())) return false;
  const ageMs = referenceDate.getTime() - claimedAt.getTime();
  return ageMs > staleClaimHours * 60 * 60 * 1000;
}

function isEligibleTask(task, options = {}) {
  const allowedStatuses = (options.allowedStatuses ?? DEFAULT_ALLOWED_STATUSES).map(
    normalizeComparable,
  );
  const status = normalizeComparable(task.status);
  const title = normalizeText(task.title);

  if (!title || !/ENG-LOOP-\d+/i.test(title)) return false;
  if (!task.codexReady) return false;
  if (!allowedStatuses.includes(status)) return false;

  const claim = extractClaimFromProgressSource(task.progressSource);
  if (claim.hasClaimMarker) return false;

  return true;
}

function compareTasks(left, right) {
  const leftNumber = taskNumberFromTitle(left.title);
  const rightNumber = taskNumberFromTitle(right.title);
  if (leftNumber !== rightNumber) return leftNumber - rightNumber;

  const priorityCompare = normalizeText(left.priority).localeCompare(normalizeText(right.priority));
  if (priorityCompare !== 0) return priorityCompare;

  const createdCompare = normalizeText(left.createdAt).localeCompare(
    normalizeText(right.createdAt),
  );
  if (createdCompare !== 0) return createdCompare;

  return normalizeText(left.title).localeCompare(normalizeText(right.title));
}

function selectEligibleTasks(pages, options = {}) {
  const limit = Number(options.limit ?? FIRST_FIVE_BATCH_LIMIT);

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('Eligible task selection limit must be a positive integer.');
  }

  const tasks = pages.map(taskFromPage).filter((task) => isEligibleTask(task, options));
  tasks.sort(compareTasks);
  return tasks.slice(0, limit);
}

function selectEligibleTask(pages, options = {}) {
  return selectEligibleTasks(pages, { ...options, limit: 1 })[0] ?? null;
}

function propertyPatchFromExistingProperty(existingProperty, value) {
  if (!existingProperty?.type) {
    return { rich_text: [{ type: 'text', text: { content: String(value) } }] };
  }

  switch (existingProperty.type) {
    case 'status':
      return { status: { name: String(value) } };
    case 'select':
      return { select: { name: String(value) } };
    case 'rich_text':
      return { rich_text: [{ type: 'text', text: { content: String(value) } }] };
    case 'title':
      return { title: [{ type: 'text', text: { content: String(value) } }] };
    case 'checkbox':
      return { checkbox: Boolean(value) };
    case 'url':
      return { url: String(value) };
    case 'email':
      return { email: String(value) };
    case 'phone_number':
      return { phone_number: String(value) };
    case 'date':
      return { date: { start: String(value) } };
    default:
      return { rich_text: [{ type: 'text', text: { content: String(value) } }] };
  }
}

function buildClaimSummary({ runId, actor, mode, branch, timestamp }) {
  return [
    `Claimed by engineering loop run ${runId} at ${timestamp}.`,
    `Actor: ${actor || 'local'}.`,
    `Mode: ${mode}.`,
    `Branch: ${branch || 'not specified'}.`,
    'Scope: task claim and run-ledger initialization only; no product task implementation performed by ENG-LOOP-18.',
  ].join(' ');
}

function buildClaimPatch(page, claimSummary) {
  const properties = page.properties ?? {};
  const statusName = firstPropertyName(properties, ['Status', 'status']);
  const progressName = firstPropertyName(properties, [
    'Progress Source',
    'ProgressSource',
    'progress_source',
  ]);

  if (!statusName) {
    throw new Error('Cannot claim task because the Notion page does not expose a Status property.');
  }

  const patch = {
    [statusName]: propertyPatchFromExistingProperty(properties[statusName], 'In Progress'),
  };

  if (progressName) {
    patch[progressName] = propertyPatchFromExistingProperty(properties[progressName], claimSummary);
  }

  return patch;
}

function createLedgerRecord({
  runId,
  mode,
  actor,
  task,
  status = 'started',
  summary,
  timestamp = nowIso(),
}) {
  if (!LEDGER_STATUSES.has(status)) {
    throw new Error(`Invalid run ledger status: ${status}`);
  }

  return {
    schema_version: 1,
    run_id: runId,
    mode,
    actor,
    status,
    task: task
      ? {
          id: task.id,
          title: task.title,
          branch: task.branch,
          repository: task.repository,
          url: task.url,
        }
      : null,
    started_at: timestamp,
    completed_at: null,
    summary: summary ?? '',
    events: [
      {
        timestamp,
        type: 'run_started',
        message: summary ?? 'Engineering loop run started.',
      },
    ],
  };
}

function addLedgerEvent(record, type, message, timestamp = nowIso()) {
  return {
    ...record,
    events: [
      ...(record.events ?? []),
      {
        timestamp,
        type,
        message,
      },
    ],
  };
}

function completeLedgerRecord(record, status, summary, timestamp = nowIso()) {
  if (!LEDGER_STATUSES.has(status)) {
    throw new Error(`Invalid run ledger status: ${status}`);
  }

  return addLedgerEvent(
    {
      ...record,
      status,
      completed_at: ['failed', 'aborted', 'succeeded'].includes(status)
        ? timestamp
        : record.completed_at,
      summary,
    },
    `run_${status}`,
    summary,
    timestamp,
  );
}

async function writeJsonAtomic(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fsp.rename(tmpPath, filePath);
}

async function writeRunLedger(record, cwd = process.cwd()) {
  const filePath = path.join(cwd, '.tmp', 'eng-loop-runs', `${record.run_id}.json`);
  await writeJsonAtomic(filePath, record);
  return filePath;
}

function summarizeBatchTask(task, status = 'planned') {
  return {
    id: task.id,
    title: task.title,
    branch: task.branch,
    repository: task.repository,
    url: task.url,
    status,
    run_id: null,
    ledger_path: null,
    completed_at: null,
  };
}

function createBatchSummary({
  mode,
  dryRun,
  actor,
  maxTasks = FIRST_FIVE_BATCH_LIMIT,
  selectedTasks = [],
  timestamp = nowIso(),
}) {
  return {
    schema_version: 1,
    batch_id: createRunId(),
    mode,
    dry_run: Boolean(dryRun),
    actor: actor || 'local',
    status: 'started',
    max_tasks: maxTasks,
    selected_count: selectedTasks.length,
    processed_count: 0,
    success_count: 0,
    failure_count: 0,
    skipped_count: selectedTasks.length,
    stop_reason: '',
    started_at: timestamp,
    completed_at: null,
    tasks: selectedTasks.map((task) => summarizeBatchTask(task)),
  };
}

function batchSummaryMarkdown(summary) {
  const lines = [
    '# Engineering Loop First-5 Batch Summary',
    '',
    `- Batch id: ${summary.batch_id}`,
    `- Mode: ${summary.mode}`,
    `- Dry run: ${summary.dry_run}`,
    `- Status: ${summary.status}`,
    `- Max tasks: ${summary.max_tasks}`,
    `- Selected: ${summary.selected_count}`,
    `- Processed: ${summary.processed_count}`,
    `- Succeeded: ${summary.success_count}`,
    `- Failed: ${summary.failure_count}`,
    `- Skipped: ${summary.skipped_count}`,
    `- Stop reason: ${summary.stop_reason || '(none)'}`,
    '',
    '## Tasks',
    '',
  ];

  if (!summary.tasks.length) {
    lines.push('- No eligible tasks selected.');
  } else {
    for (const [index, task] of summary.tasks.entries()) {
      lines.push(
        `${index + 1}. ${task.status} — ${task.title} — ${task.id}${task.ledger_path ? ` — ${task.ledger_path}` : ''}`,
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

async function writeBatchSummary(summary, cwd = process.cwd()) {
  const jsonPath = path.join(cwd, '.tmp', 'eng-loop-batch-summary.json');
  const markdownPath = path.join(cwd, '.tmp', 'eng-loop-batch-summary.md');
  await writeJsonAtomic(jsonPath, summary);
  await fsp.writeFile(markdownPath, batchSummaryMarkdown(summary), 'utf8');
  return { jsonPath, markdownPath };
}

function classifyBatchStopReason(error) {
  const message = normalizeComparable(error?.message || error);

  if (message.includes('claim conflict')) return 'claim_conflict';
  if (message.includes('validation')) return 'validation_failed';
  if (message.includes('ci')) return 'ci_failed';
  if (message.includes('malformed')) return 'malformed_task';
  if (message.includes('unsafe')) return 'unsafe_state';
  if (message.includes('follow-up')) return 'follow_up_created';

  return 'unexpected_error';
}

class NotionTaskClient {
  constructor({ token, databaseId, notionVersion = '2022-06-28', maxTasks = 100 }) {
    if (!token) throw new Error('Missing Notion token. Set GARAGEOS_NOTION_TOKEN or NOTION_TOKEN.');
    if (!databaseId) {
      throw new Error(
        'Missing Notion task database id. Set GARAGEOS_NOTION_TASK_DATABASE_ID or NOTION_TASK_DATABASE_ID.',
      );
    }

    this.token = token;
    this.databaseId = databaseId;
    this.notionVersion = notionVersion;
    this.maxTasks = maxTasks;
  }

  async request(method, endpoint, body) {
    if (typeof fetch !== 'function') {
      throw new Error('Global fetch is unavailable. Use Node.js 18 or newer.');
    }

    const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
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

  async listTaskPages() {
    const pages = [];
    let cursor;

    do {
      const payload = await this.request('POST', `/databases/${this.databaseId}/query`, {
        page_size: Math.min(100, Math.max(1, this.maxTasks - pages.length)),
        start_cursor: cursor,
      });

      pages.push(...(payload.results ?? []));
      cursor = payload.has_more && pages.length < this.maxTasks ? payload.next_cursor : undefined;
    } while (cursor && pages.length < this.maxTasks);

    return pages;
  }

  async fetchPage(pageId) {
    return this.request('GET', `/pages/${pageId}`);
  }

  async updatePageProperties(pageId, properties) {
    return this.request('PATCH', `/pages/${pageId}`, { properties });
  }
}

class LocalFixtureTaskClient {
  constructor({ tasksFile }) {
    if (!tasksFile) throw new Error('Missing --tasks-file.');
    this.tasksFile = tasksFile;
  }

  async listTaskPages() {
    const payload = JSON.parse(await fsp.readFile(this.tasksFile, 'utf8'));
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.results)) return payload.results;
    throw new Error('Tasks fixture must be an array or an object with a results array.');
  }

  async fetchPage(pageId) {
    const pages = await this.listTaskPages();
    const page = pages.find((candidate) => String(candidate.id) === String(pageId));
    if (!page) throw new Error(`Fixture page not found: ${pageId}`);
    return page;
  }

  async updatePageProperties() {
    throw new Error(
      'Local fixture task client is read-only. Use Notion credentials for claim mode.',
    );
  }
}

function createClientFromArgs(args) {
  if (args.tasksFile) {
    return new LocalFixtureTaskClient({ tasksFile: args.tasksFile });
  }

  return new NotionTaskClient({
    token: args.token || process.env.GARAGEOS_NOTION_TOKEN || process.env.NOTION_TOKEN,
    databaseId:
      args.databaseId ||
      process.env.GARAGEOS_NOTION_TASK_DATABASE_ID ||
      process.env.NOTION_TASK_DATABASE_ID ||
      process.env.NOTION_DATABASE_ID,
    maxTasks: args.maxTasks,
  });
}

async function runDryRun({ client, args, cwd = process.cwd() }) {
  void cwd;
  const pages = await client.listTaskPages();
  const selected = selectEligibleTask(pages);

  console.log('Engineering loop dry-run mode');
  console.log(`Scanned task pages: ${pages.length}`);

  if (!selected) {
    console.log('Selected task: none');
    console.log('Result: no eligible task found. No mutations performed.');
    return { status: 'no_task', selected: null };
  }

  console.log(`Selected task: ${selected.title}`);
  console.log(`Task id: ${selected.id}`);
  console.log(`Branch: ${selected.branch || '(not specified)'}`);
  console.log(`Repository: ${selected.repository || '(not specified)'}`);
  console.log('Result: dry-run only. No Notion writes and no run ledger created.');

  return { status: 'selected', selected, actor: args.actor };
}

async function claimSelectedTask({ client, args, cwd = process.cwd(), selected, mode = 'claim' }) {
  if (!selected) {
    throw new Error('claimSelectedTask requires a selected task.');
  }

  const runId = createRunId();
  const timestamp = nowIso();
  let ledger = createLedgerRecord({
    runId,
    mode,
    actor: args.actor,
    task: selected,
    status: 'started',
    timestamp,
    summary: `Selected ${selected.title} for ${mode} claim initialization.`,
  });

  const ledgerPath = await writeRunLedger(ledger, cwd);
  console.log(`Run id: ${runId}`);
  console.log(`Selected task: ${selected.title}`);
  console.log(`Ledger started: ${ledgerPath}`);

  try {
    const beforePage = await client.fetchPage(selected.id);
    const beforeTask = taskFromPage(beforePage);

    if (!isEligibleTask(beforeTask)) {
      const stale = isClaimStale(beforeTask, args.staleClaimHours);
      const message = stale
        ? `Claim conflict: selected task has a stale or existing claim. Manual recovery required before reuse. Task status is ${beforeTask.status}.`
        : `Claim conflict: selected task is no longer eligible. Task status is ${beforeTask.status}.`;
      ledger = completeLedgerRecord(ledger, 'aborted', message);
      await writeRunLedger(ledger, cwd);
      throw new Error(message);
    }

    ledger = addLedgerEvent(
      ledger,
      'task_refetched',
      `Verified selected task is still eligible: ${beforeTask.title}.`,
    );
    await writeRunLedger(ledger, cwd);

    const claimSummary = buildClaimSummary({
      runId,
      actor: args.actor,
      mode,
      branch: beforeTask.branch,
      timestamp: nowIso(),
    });

    const patch = buildClaimPatch(beforePage, claimSummary);
    await client.updatePageProperties(beforeTask.id, patch);

    ledger = addLedgerEvent(
      ledger,
      'claim_write_completed',
      'Notion claim update completed. Verifying claim ownership.',
    );
    await writeRunLedger(ledger, cwd);

    const afterPage = await client.fetchPage(beforeTask.id);
    const afterTask = taskFromPage(afterPage);
    const afterStatus = normalizeComparable(afterTask.status);
    const claim = extractClaimFromProgressSource(afterTask.progressSource);

    if (afterStatus !== 'in progress') {
      const message = `Claim verification failed: expected Status to be In Progress, received ${afterTask.status || '(empty)'}.`;
      ledger = completeLedgerRecord(ledger, 'failed', message);
      await writeRunLedger(ledger, cwd);
      throw new Error(message);
    }

    if (afterTask.progressSource && claim.runId && claim.runId !== runId) {
      const message = `Claim verification failed: task claim belongs to ${claim.runId}, expected ${runId}.`;
      ledger = completeLedgerRecord(ledger, 'failed', message);
      await writeRunLedger(ledger, cwd);
      throw new Error(message);
    }

    ledger = completeLedgerRecord(
      ledger,
      'claimed',
      `Claim verified for ${afterTask.title}. Future loop steps may continue from run ${runId}.`,
    );
    await writeRunLedger(ledger, cwd);

    console.log(`Claim verified: ${afterTask.title}`);
    console.log(`Ledger updated: ${ledgerPath}`);
    console.log('Result: one task claimed and run ledger initialized.');

    return { status: 'claimed', selected: afterTask, runId, ledgerPath };
  } catch (error) {
    if (ledger.status !== 'failed' && ledger.status !== 'aborted') {
      ledger = completeLedgerRecord(
        ledger,
        'failed',
        error.message || 'Claim initialization failed.',
      );
      await writeRunLedger(ledger, cwd).catch(() => undefined);
    }
    throw error;
  }
}

async function runClaim({ client, args, cwd = process.cwd() }) {
  if (client instanceof LocalFixtureTaskClient) {
    throw new Error(
      'Claim mode requires Notion credentials. Local fixture mode is read-only by design.',
    );
  }

  const pages = await client.listTaskPages();
  const selected = selectEligibleTask(pages);

  console.log('Engineering loop claim mode');
  console.log(`Scanned task pages: ${pages.length}`);

  if (!selected) {
    console.log('Selected task: none');
    console.log('Result: no eligible task found. No mutations performed.');
    return { status: 'no_task', selected: null };
  }

  return claimSelectedTask({ client, args, cwd, selected, mode: 'claim' });
}

async function runFirstFiveDryRun({ client, args, cwd = process.cwd() }) {
  const pages = await client.listTaskPages();
  const selectedTasks = selectEligibleTasks(pages, { limit: FIRST_FIVE_BATCH_LIMIT });
  const summary = createBatchSummary({
    mode: 'first-5-dry-run',
    dryRun: true,
    actor: args.actor,
    selectedTasks,
  });

  summary.status = selectedTasks.length ? 'planned' : 'succeeded';
  summary.stop_reason = selectedTasks.length ? 'dry_run_plan_created' : 'zero_eligible_tasks';
  summary.completed_at = nowIso();
  summary.skipped_count = 0;

  const summaryPaths = await writeBatchSummary(summary, cwd);

  console.log('Engineering loop first-5 dry-run mode');
  console.log(`Scanned task pages: ${pages.length}`);
  console.log(`Planned tasks: ${selectedTasks.length}`);

  if (!selectedTasks.length) {
    console.log('Result: no eligible task found. No mutations performed.');
  } else {
    for (const [index, task] of selectedTasks.entries()) {
      console.log(`${index + 1}. ${task.title} (${task.id})`);
    }
    console.log('Result: first-5 dry-run only. No Notion writes and no run ledger created.');
  }

  console.log(`Batch summary: ${summaryPaths.jsonPath}`);
  return {
    status: selectedTasks.length ? 'planned' : 'no_task',
    selected: selectedTasks,
    summary,
    summaryPaths,
  };
}

async function runFirstFive({ client, args, cwd = process.cwd() }) {
  if (client instanceof LocalFixtureTaskClient) {
    throw new Error(
      'First-5 mode requires Notion credentials. Local fixture mode is read-only by design.',
    );
  }

  if (!args.confirmFirstFive && args.firstFiveConfirmation !== 'ENG-LOOP-24-FIRST-5') {
    throw new Error(
      'Mutation-capable first-5 mode requires --confirm-first-5 or --first-5-confirmation ENG-LOOP-24-FIRST-5.',
    );
  }

  const pages = await client.listTaskPages();
  const selectedTasks = selectEligibleTasks(pages, { limit: FIRST_FIVE_BATCH_LIMIT });
  const summary = createBatchSummary({
    mode: 'first-5',
    dryRun: false,
    actor: args.actor,
    selectedTasks,
  });

  console.log('Engineering loop first-5 batch mode');
  console.log(`Scanned task pages: ${pages.length}`);
  console.log(`Selected tasks: ${selectedTasks.length}`);

  if (!selectedTasks.length) {
    summary.status = 'succeeded';
    summary.stop_reason = 'zero_eligible_tasks';
    summary.completed_at = nowIso();
    summary.skipped_count = 0;
    const summaryPaths = await writeBatchSummary(summary, cwd);
    console.log('Result: no eligible task found. No mutations performed.');
    console.log(`Batch summary: ${summaryPaths.jsonPath}`);
    return { status: 'no_task', selected: [], summary, summaryPaths };
  }

  for (const [index, task] of selectedTasks.entries()) {
    console.log(`Processing batch task ${index + 1}/${selectedTasks.length}: ${task.title}`);

    try {
      const result = await claimSelectedTask({
        client,
        args,
        cwd,
        selected: task,
        mode: 'first-5',
      });
      summary.processed_count += 1;
      summary.success_count += 1;
      summary.skipped_count = Math.max(0, selectedTasks.length - summary.processed_count);
      summary.tasks[index] = {
        ...summary.tasks[index],
        status: 'succeeded',
        run_id: result.runId,
        ledger_path: result.ledgerPath,
        completed_at: nowIso(),
      };
      await writeBatchSummary(summary, cwd);
    } catch (error) {
      summary.processed_count += 1;
      summary.failure_count += 1;
      summary.skipped_count = Math.max(0, selectedTasks.length - summary.processed_count);
      summary.status = 'failed';
      summary.stop_reason = classifyBatchStopReason(error);
      summary.completed_at = nowIso();
      summary.tasks[index] = {
        ...summary.tasks[index],
        status: 'failed',
        error: error.message || 'First-5 task failed.',
        completed_at: nowIso(),
      };
      const summaryPaths = await writeBatchSummary(summary, cwd);
      console.log(`Batch stopped: ${summary.stop_reason}`);
      console.log(`Batch summary: ${summaryPaths.jsonPath}`);
      throw error;
    }
  }

  summary.status = 'succeeded';
  summary.stop_reason =
    selectedTasks.length >= FIRST_FIVE_BATCH_LIMIT
      ? 'max_count_reached'
      : 'selected_tasks_exhausted';
  summary.completed_at = nowIso();
  summary.skipped_count = 0;
  const summaryPaths = await writeBatchSummary(summary, cwd);

  console.log(
    `Batch completed: ${summary.success_count} succeeded, ${summary.failure_count} failed.`,
  );
  console.log(`Batch summary: ${summaryPaths.jsonPath}`);

  return { status: 'succeeded', selected: selectedTasks, summary, summaryPaths };
}

async function main() {
  const args = parseCliArgs();

  if (args.help) {
    printHelp();
    return;
  }

  if (!['dry-run', 'claim', 'run', 'first-5-dry-run', 'first-5'].includes(args.mode)) {
    throw new Error(
      `Unsupported mode: ${args.mode}. Use dry-run, claim, run, first-5-dry-run, or first-5.`,
    );
  }

  const client = createClientFromArgs(args);

  if (args.mode === 'dry-run') {
    await runDryRun({ client, args });
    return;
  }

  if (args.mode === 'first-5-dry-run') {
    await runFirstFiveDryRun({ client, args });
    return;
  }

  if (args.mode === 'first-5') {
    await runFirstFive({ client, args });
    return;
  }

  await runClaim({ client, args });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_ALLOWED_STATUSES,
  DEFAULT_STALE_CLAIM_HOURS,
  FIRST_FIVE_BATCH_LIMIT,
  LEDGER_STATUSES,
  LocalFixtureTaskClient,
  NotionTaskClient,
  addLedgerEvent,
  booleanFromProperty,
  buildClaimPatch,
  buildClaimSummary,
  claimSelectedTask,
  classifyBatchStopReason,
  compareTasks,
  createBatchSummary,
  completeLedgerRecord,
  createLedgerRecord,
  createRunId,
  extractClaimFromProgressSource,
  isClaimStale,
  isEligibleTask,
  parseCliArgs,
  propertyPatchFromExistingProperty,
  runFirstFive,
  runFirstFiveDryRun,
  selectEligibleTask,
  selectEligibleTasks,
  taskFromPage,
  taskNumberFromTitle,
  textFromProperty,
  writeBatchSummary,
  writeJsonAtomic,
  writeRunLedger,
};

// ENG-LOOP-26 task-scope integration marker
// The reusable task-scope policy lives in .github/scripts/eng-loop-task-scope.cjs.
// Runner implementations should call taskScopePolicy.explainTrackerTaskEligibility(task, { taskScope: ACTIVE_TASK_SCOPE, mode }).
