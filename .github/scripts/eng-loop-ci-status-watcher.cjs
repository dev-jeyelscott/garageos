#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_REQUIRED_CHECKS_FILE = '.github/scripts/eng-loop-required-checks.json';
const DEFAULT_METADATA_FILE = '.tmp/eng-loop-pr-automation-metadata.json';
const DEFAULT_TASK_FILE = '.tmp/eng-loop-task.json';
const DEFAULT_LEDGER_FILE = '.tmp/eng-loop-run-ledger.json';
const DEFAULT_RESULT_FILE = '.tmp/eng-loop-ci-status-result.json';
const DEFAULT_SUMMARY_FILE = '.tmp/eng-loop-ci-status-summary.md';

const TERMINAL_STATUSES = new Set([
  'ci_passed',
  'ci_failed',
  'ci_cancelled',
  'ci_timed_out',
  'ci_missing_required_check',
  'ci_unknown',
  'github_api_error',
  'metadata_unresolved',
  'required_checks_unresolved',
]);

const WAITABLE_STATUSES = new Set(['ci_pending', 'ci_missing_required_check']);

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());

    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) {
    return null;
  }

  return JSON.parse(raw);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(`${filePath}.tmp`, filePath);
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(`${filePath}.tmp`, value.endsWith('\n') ? value : `${value}\n`);
  fs.renameSync(`${filePath}.tmp`, filePath);
}

function normalizeCheckName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null || value === '') {
    return [];
  }

  return [value];
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return undefined;
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer but received: ${value}`);
  }

  return parsed;
}

function parsePrNumber(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid PR number: ${value}`);
  }

  return parsed;
}

function resolveRepositoryParts(repository) {
  const value = String(repository || '').trim();
  const parts = value.split('/');

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Repository must use owner/name format. Received: ${repository || '<empty>'}`);
  }

  return { owner: parts[0], repo: parts[1], fullName: `${parts[0]}/${parts[1]}` };
}

function loadRequiredChecks(requiredChecksFile = DEFAULT_REQUIRED_CHECKS_FILE) {
  const config = readJsonIfExists(requiredChecksFile);

  if (!config) {
    return {
      status: 'required_checks_unresolved',
      message: `Required-check config not found: ${requiredChecksFile}`,
      requiredChecks: [],
      aliases: {},
    };
  }

  const requiredChecks = asArray(config.required_checks || config.requiredChecks)
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (requiredChecks.length === 0) {
    return {
      status: 'required_checks_unresolved',
      message: `Required-check config contains no required_checks entries: ${requiredChecksFile}`,
      requiredChecks: [],
      aliases: {},
    };
  }

  return {
    status: 'ok',
    message: 'Required-check config loaded.',
    requiredChecks,
    aliases: config.aliases && typeof config.aliases === 'object' ? config.aliases : {},
  };
}

function extractMetadata(metadata, task) {
  const pr = metadata && typeof metadata.pr === 'object' ? metadata.pr : {};
  const git = metadata && typeof metadata.git === 'object' ? metadata.git : {};
  const taskGit = task && typeof task.git === 'object' ? task.git : {};
  const taskPr = task && typeof task.pr === 'object' ? task.pr : {};

  return {
    repository: firstDefined(
      metadata && metadata.repository,
      metadata && metadata.repo,
      metadata && metadata.github_repository,
      git.repository,
      task && task.Repository,
      task && task.repository,
      task && task.repo,
      taskGit.repository,
    ),
    branch: firstDefined(
      metadata && metadata.branch,
      metadata && metadata.branch_name,
      metadata && metadata.branchName,
      git.branch,
      pr.head && pr.head.ref,
      task && task.Branch,
      task && task.branch,
      taskGit.branch,
      taskPr.head && taskPr.head.ref,
    ),
    headSha: firstDefined(
      metadata && metadata.head_sha,
      metadata && metadata.headSha,
      metadata && metadata.commit_sha,
      metadata && metadata.commitSha,
      metadata && metadata.sha,
      git.head_sha,
      git.sha,
      pr.head && pr.head.sha,
      task && task['Commit SHA'],
      task && task.commit_sha,
      taskGit.sha,
      taskPr.head && taskPr.head.sha,
    ),
    prNumber: firstDefined(
      metadata && metadata.pr_number,
      metadata && metadata.prNumber,
      metadata && metadata.pull_request_number,
      metadata && metadata.pullRequestNumber,
      pr.number,
      task && task.pr_number,
      task && task.prNumber,
      taskPr.number,
    ),
  };
}

function resolveRuntimeOptions(args, cwd = process.cwd()) {
  const metadataFile = args.metadata || DEFAULT_METADATA_FILE;
  const taskFile = args.task || DEFAULT_TASK_FILE;
  const metadata = readJsonIfExists(path.resolve(cwd, metadataFile)) || {};
  const task = readJsonIfExists(path.resolve(cwd, taskFile)) || {};
  const extracted = extractMetadata(metadata, task);

  const repository = firstDefined(
    args.repo,
    args.repository,
    extracted.repository,
    process.env.GITHUB_REPOSITORY,
  );
  const branch = firstDefined(args.branch, extracted.branch);
  const headSha = firstDefined(args.sha, args.headSha, extracted.headSha, process.env.GITHUB_SHA);
  const prNumber = parsePrNumber(firstDefined(args.pr, args.prNumber, extracted.prNumber));

  const watch = Boolean(args.watch) && !Boolean(args.once);

  return {
    repository,
    branch,
    headSha,
    prNumber,
    metadataFile,
    taskFile,
    requiredChecksFile:
      args.requiredChecksFile || args.requiredChecks || DEFAULT_REQUIRED_CHECKS_FILE,
    ledgerFile: args.ledger || DEFAULT_LEDGER_FILE,
    resultFile: args.out || args.output || DEFAULT_RESULT_FILE,
    summaryFile: args.summary || DEFAULT_SUMMARY_FILE,
    watch,
    maxAttempts: parsePositiveInteger(args.maxAttempts, watch ? 20 : 1),
    pollIntervalMs: parsePositiveInteger(args.pollIntervalMs, 30_000),
    apiRetryCount: parsePositiveInteger(args.apiRetryCount, 3),
    apiRetryBaseDelayMs: parsePositiveInteger(args.apiRetryBaseDelayMs, 2_000),
    token: firstDefined(args.token, process.env.GITHUB_TOKEN, process.env.GH_TOKEN),
  };
}

function makeSafeFailure(status, message, options = {}) {
  const checkedAt = options.checkedAt || new Date().toISOString();

  return {
    status,
    message,
    repository: options.repository || null,
    branch: options.branch || null,
    pr_number: options.prNumber || null,
    head_sha: options.headSha || null,
    required_checks: [],
    missing_required_checks: [],
    failed_checks: [],
    pending_checks: [],
    cancelled_checks: [],
    unknown_checks: [],
    checked_at: checkedAt,
    source: 'github',
    safe_to_mark_done: false,
  };
}

function latestTimestamp(check) {
  const candidates = [
    check.completed_at,
    check.started_at,
    check.created_at,
    check.updated_at,
  ].filter(Boolean);
  const timestamp = candidates.length > 0 ? Date.parse(candidates[0]) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeCheckRuns(checkRuns) {
  return asArray(checkRuns).map((check) => ({
    source_type: 'check_run',
    name: check.name,
    normalized_name: normalizeCheckName(check.name),
    status: check.status || 'unknown',
    conclusion: check.conclusion || null,
    url: check.html_url || check.details_url || null,
    started_at: check.started_at || null,
    completed_at: check.completed_at || null,
    created_at: check.created_at || null,
    raw: check,
  }));
}

function normalizeCommitStatuses(statuses) {
  return asArray(statuses).map((status) => ({
    source_type: 'commit_status',
    name: status.context,
    normalized_name: normalizeCheckName(status.context),
    status:
      status.state === 'success' || status.state === 'failure' || status.state === 'error'
        ? 'completed'
        : 'in_progress',
    conclusion:
      status.state === 'success'
        ? 'success'
        : status.state === 'failure' || status.state === 'error'
          ? 'failure'
          : null,
    state: status.state || null,
    url: status.target_url || null,
    started_at: null,
    completed_at: null,
    created_at: status.created_at || null,
    raw: status,
  }));
}

function aliasesForRequired(requiredName, aliases) {
  const configured = asArray(aliases && aliases[requiredName]);
  const normalizedRequired = normalizeCheckName(requiredName);
  const values = new Set([normalizedRequired]);

  for (const alias of configured) {
    values.add(normalizeCheckName(alias));
  }

  return values;
}

function findMatchingCheck(requiredName, aliases, checks) {
  const acceptedNames = aliasesForRequired(requiredName, aliases);
  const matches = checks
    .filter((check) => acceptedNames.has(check.normalized_name))
    .sort((a, b) => latestTimestamp(b) - latestTimestamp(a));

  return matches[0] || null;
}

function summarizeMatchedCheck(requiredName, matched) {
  return {
    name: requiredName,
    matched_name: matched ? matched.name : null,
    source_type: matched ? matched.source_type : null,
    status: matched ? matched.status : 'missing',
    conclusion: matched ? matched.conclusion : null,
    state: matched ? matched.state || null : null,
    url: matched ? matched.url : null,
  };
}

function classifyMatchedCheck(check) {
  if (!check) {
    return 'missing';
  }

  if (
    check.status === 'queued' ||
    check.status === 'requested' ||
    check.status === 'waiting' ||
    check.status === 'pending' ||
    check.status === 'in_progress'
  ) {
    return 'pending';
  }

  if (check.status !== 'completed') {
    return 'unknown';
  }

  if (check.conclusion === 'success') {
    return 'success';
  }

  if (check.conclusion === 'cancelled') {
    return 'cancelled';
  }

  if (check.conclusion === 'timed_out') {
    return 'timed_out';
  }

  if (
    check.conclusion === 'failure' ||
    check.conclusion === 'startup_failure' ||
    check.conclusion === 'action_required'
  ) {
    return 'failed';
  }

  return 'unknown';
}

function classifyCiStatus({
  repository,
  branch,
  prNumber,
  headSha,
  requiredChecks,
  aliases,
  checks,
  checkedAt,
}) {
  const required = asArray(requiredChecks)
    .map((value) => String(value).trim())
    .filter(Boolean);
  const normalizedChecks = asArray(checks);
  const requiredSummaries = [];
  const missingRequiredChecks = [];
  const failedChecks = [];
  const pendingChecks = [];
  const cancelledChecks = [];
  const timedOutChecks = [];
  const unknownChecks = [];

  for (const requiredName of required) {
    const matched = findMatchingCheck(requiredName, aliases || {}, normalizedChecks);
    const summary = summarizeMatchedCheck(requiredName, matched);
    const classification = classifyMatchedCheck(matched);

    summary.classification = classification;
    requiredSummaries.push(summary);

    if (classification === 'missing') {
      missingRequiredChecks.push(requiredName);
    } else if (classification === 'failed') {
      failedChecks.push(summary);
    } else if (classification === 'pending') {
      pendingChecks.push(summary);
    } else if (classification === 'cancelled') {
      cancelledChecks.push(summary);
    } else if (classification === 'timed_out') {
      timedOutChecks.push(summary);
    } else if (classification === 'unknown') {
      unknownChecks.push(summary);
    }
  }

  let status = 'ci_passed';
  let message = 'All required GitHub checks passed.';

  if (missingRequiredChecks.length > 0) {
    status = 'ci_missing_required_check';
    message = 'One or more required GitHub checks were not found.';
  } else if (failedChecks.length > 0) {
    status = 'ci_failed';
    message = 'One or more required GitHub checks failed.';
  } else if (cancelledChecks.length > 0) {
    status = 'ci_cancelled';
    message = 'One or more required GitHub checks were cancelled.';
  } else if (timedOutChecks.length > 0) {
    status = 'ci_timed_out';
    message = 'One or more required GitHub checks timed out.';
  } else if (pendingChecks.length > 0) {
    status = 'ci_pending';
    message = 'One or more required GitHub checks are still pending.';
  } else if (unknownChecks.length > 0) {
    status = 'ci_unknown';
    message = 'One or more required GitHub checks could not be classified safely.';
  }

  return {
    status,
    message,
    repository: repository || null,
    branch: branch || null,
    pr_number: prNumber || null,
    head_sha: headSha || null,
    required_checks: requiredSummaries,
    missing_required_checks: missingRequiredChecks,
    failed_checks: failedChecks,
    pending_checks: pendingChecks,
    cancelled_checks: cancelledChecks,
    timed_out_checks: timedOutChecks,
    unknown_checks: unknownChecks,
    checked_at: checkedAt || new Date().toISOString(),
    source: 'github',
    safe_to_mark_done: status === 'ci_passed',
  };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function githubRequest(
  apiPath,
  { token, retryCount = 3, retryBaseDelayMs = 2_000, fetchImpl = globalThis.fetch } = {},
) {
  if (!fetchImpl) {
    throw new Error('global fetch is unavailable. Use Node 18+ or provide a fetch implementation.');
  }

  if (!token) {
    throw new Error('Missing GitHub token. Set GITHUB_TOKEN or GH_TOKEN.');
  }

  const url = apiPath.startsWith('http') ? apiPath : `https://api.github.com${apiPath}`;
  let lastError;

  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'garageos-eng-loop-ci-status-watcher',
        },
      });

      if (response.status === 404) {
        const error = new Error(`GitHub API returned 404 for ${apiPath}`);
        error.status = response.status;
        throw error;
      }

      if (response.status === 403 || response.status === 429 || response.status >= 500) {
        const retryableError = new Error(`GitHub API returned ${response.status} for ${apiPath}`);
        retryableError.status = response.status;
        throw retryableError;
      }

      if (!response.ok) {
        const error = new Error(`GitHub API returned ${response.status} for ${apiPath}`);
        error.status = response.status;
        throw error;
      }

      return await response.json();
    } catch (error) {
      lastError = error;

      const status = Number(error && error.status);
      const retryable = status === 403 || status === 429 || status >= 500 || !status;
      if (!retryable || attempt >= retryCount) {
        break;
      }

      await sleep(retryBaseDelayMs * attempt);
    }
  }

  throw lastError;
}

async function resolvePullRequest({
  repository,
  branch,
  prNumber,
  token,
  fetchImpl,
  apiRetryCount,
  apiRetryBaseDelayMs,
}) {
  const repoParts = resolveRepositoryParts(repository);

  if (prNumber) {
    const pull = await githubRequest(
      `/repos/${repoParts.owner}/${repoParts.repo}/pulls/${prNumber}`,
      {
        token,
        fetchImpl,
        retryCount: apiRetryCount,
        retryBaseDelayMs: apiRetryBaseDelayMs,
      },
    );

    return {
      prNumber: pull.number,
      headSha: pull.head && pull.head.sha,
      branch: pull.head && pull.head.ref ? pull.head.ref : branch,
      htmlUrl: pull.html_url,
    };
  }

  if (!branch) {
    return null;
  }

  const head = encodeURIComponent(`${repoParts.owner}:${branch}`);
  const pulls = await githubRequest(
    `/repos/${repoParts.owner}/${repoParts.repo}/pulls?head=${head}&state=open&per_page=10`,
    {
      token,
      fetchImpl,
      retryCount: apiRetryCount,
      retryBaseDelayMs: apiRetryBaseDelayMs,
    },
  );

  const pull = Array.isArray(pulls) ? pulls[0] : null;
  if (!pull) {
    return null;
  }

  return {
    prNumber: pull.number,
    headSha: pull.head && pull.head.sha,
    branch: pull.head && pull.head.ref ? pull.head.ref : branch,
    htmlUrl: pull.html_url,
  };
}

async function fetchGithubChecks({
  repository,
  headSha,
  token,
  fetchImpl,
  apiRetryCount,
  apiRetryBaseDelayMs,
}) {
  const repoParts = resolveRepositoryParts(repository);

  const checkRunPayload = await githubRequest(
    `/repos/${repoParts.owner}/${repoParts.repo}/commits/${headSha}/check-runs?per_page=100`,
    {
      token,
      fetchImpl,
      retryCount: apiRetryCount,
      retryBaseDelayMs: apiRetryBaseDelayMs,
    },
  );

  let statusPayload = { statuses: [] };
  try {
    statusPayload = await githubRequest(
      `/repos/${repoParts.owner}/${repoParts.repo}/commits/${headSha}/status`,
      {
        token,
        fetchImpl,
        retryCount: apiRetryCount,
        retryBaseDelayMs: apiRetryBaseDelayMs,
      },
    );
  } catch (error) {
    statusPayload = { statuses: [] };
  }

  return [
    ...normalizeCheckRuns(checkRunPayload.check_runs || []),
    ...normalizeCommitStatuses(statusPayload.statuses || []),
  ];
}

async function inspectOnce(options, dependencies = {}) {
  const checkedAt = dependencies.now ? dependencies.now() : new Date().toISOString();

  if (!options.repository) {
    return makeSafeFailure(
      'metadata_unresolved',
      'Repository could not be resolved from CLI args, metadata, task file, or GITHUB_REPOSITORY.',
      {
        branch: options.branch,
        prNumber: options.prNumber,
        headSha: options.headSha,
        checkedAt,
      },
    );
  }

  const requiredConfig = loadRequiredChecks(options.requiredChecksFile);
  if (requiredConfig.status !== 'ok') {
    return makeSafeFailure('required_checks_unresolved', requiredConfig.message, {
      repository: options.repository,
      branch: options.branch,
      prNumber: options.prNumber,
      headSha: options.headSha,
      checkedAt,
    });
  }

  if (!options.token && !dependencies.fetchGithubChecks) {
    return makeSafeFailure(
      'github_api_error',
      'Missing GitHub token. Set GITHUB_TOKEN or GH_TOKEN.',
      {
        repository: options.repository,
        branch: options.branch,
        prNumber: options.prNumber,
        headSha: options.headSha,
        checkedAt,
      },
    );
  }

  try {
    let prNumber = options.prNumber;
    let branch = options.branch;
    let headSha = options.headSha;

    if (!headSha) {
      const pull = await (dependencies.resolvePullRequest || resolvePullRequest)({
        repository: options.repository,
        branch: options.branch,
        prNumber: options.prNumber,
        token: options.token,
        fetchImpl: dependencies.fetchImpl,
        apiRetryCount: options.apiRetryCount,
        apiRetryBaseDelayMs: options.apiRetryBaseDelayMs,
      });

      if (!pull || !pull.headSha) {
        return makeSafeFailure(
          'metadata_unresolved',
          'PR/head SHA could not be resolved from branch or PR metadata.',
          {
            repository: options.repository,
            branch: options.branch,
            prNumber: options.prNumber,
            checkedAt,
          },
        );
      }

      prNumber = pull.prNumber || prNumber;
      branch = pull.branch || branch;
      headSha = pull.headSha;
    }

    const checks = await (dependencies.fetchGithubChecks || fetchGithubChecks)({
      repository: options.repository,
      headSha,
      token: options.token,
      fetchImpl: dependencies.fetchImpl,
      apiRetryCount: options.apiRetryCount,
      apiRetryBaseDelayMs: options.apiRetryBaseDelayMs,
    });

    return classifyCiStatus({
      repository: options.repository,
      branch,
      prNumber,
      headSha,
      requiredChecks: requiredConfig.requiredChecks,
      aliases: requiredConfig.aliases,
      checks,
      checkedAt,
    });
  } catch (error) {
    return makeSafeFailure(
      'github_api_error',
      error && error.message ? error.message : 'GitHub API request failed.',
      {
        repository: options.repository,
        branch: options.branch,
        prNumber: options.prNumber,
        headSha: options.headSha,
        checkedAt,
      },
    );
  }
}

async function runWatcher(options, dependencies = {}) {
  let lastResult = null;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    const result = await inspectOnce(options, dependencies);
    result.attempt = attempt;
    result.max_attempts = options.maxAttempts;
    lastResult = result;

    if (!options.watch || !WAITABLE_STATUSES.has(result.status)) {
      return result;
    }

    if (attempt < options.maxAttempts) {
      await (dependencies.sleep || sleep)(options.pollIntervalMs);
    }
  }

  if (lastResult && lastResult.status !== 'ci_passed') {
    return {
      ...lastResult,
      status:
        lastResult.status === 'ci_missing_required_check'
          ? 'ci_missing_required_check'
          : 'ci_timed_out',
      message:
        lastResult.status === 'ci_missing_required_check'
          ? 'One or more required GitHub checks were still missing after polling completed.'
          : 'Timed out while waiting for required GitHub checks to complete.',
      safe_to_mark_done: false,
    };
  }

  return lastResult;
}

function buildMarkdownSummary(result) {
  const lines = [
    '## GitHub CI Status',
    '',
    `Status: ${result.status}`,
    `Safe to mark Done: ${result.safe_to_mark_done ? 'yes' : 'no'}`,
    `Repository: ${result.repository || 'unresolved'}`,
    `Branch: ${result.branch || 'unresolved'}`,
    `PR: ${result.pr_number || 'unresolved'}`,
    `Head SHA: ${result.head_sha || 'unresolved'}`,
    `Checked at: ${result.checked_at}`,
    '',
    `Message: ${result.message || ''}`,
    '',
    '### Required Checks',
    '',
  ];

  if (!result.required_checks || result.required_checks.length === 0) {
    lines.push('- No required checks were resolved.');
  } else {
    for (const check of result.required_checks) {
      const conclusion = check.conclusion || check.state || check.classification || 'unknown';
      lines.push(
        `- ${check.name}: ${conclusion}${check.matched_name ? ` (${check.matched_name})` : ''}`,
      );
    }
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function safeLedgerCiStatus(result) {
  return {
    status: result.status,
    message: result.message || null,
    repository: result.repository || null,
    branch: result.branch || null,
    pr_number: result.pr_number || null,
    head_sha: result.head_sha || null,
    safe_to_mark_done: Boolean(result.safe_to_mark_done),
    checked_at: result.checked_at,
    required_checks: result.required_checks || [],
    missing_required_checks: result.missing_required_checks || [],
    failed_checks: result.failed_checks || [],
    pending_checks: result.pending_checks || [],
    cancelled_checks: result.cancelled_checks || [],
    timed_out_checks: result.timed_out_checks || [],
    unknown_checks: result.unknown_checks || [],
  };
}

function writeOutputs(result, options) {
  writeJson(options.resultFile, result);
  writeText(options.summaryFile, buildMarkdownSummary(result));

  const ledger = readJsonIfExists(options.ledgerFile) || {};
  ledger.ci_status = safeLedgerCiStatus(result);
  ledger.updated_at = new Date().toISOString();
  writeJson(options.ledgerFile, ledger);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const options = resolveRuntimeOptions(args);
  const result = await runWatcher(options);
  writeOutputs(result, options);

  console.log(`GitHub CI watcher result: ${result.status}`);
  console.log(`Result JSON: ${path.resolve(options.resultFile)}`);
  console.log(`Summary Markdown: ${path.resolve(options.summaryFile)}`);
  console.log(`Run ledger: ${path.resolve(options.ledgerFile)}`);

  if (result.status !== 'ci_passed') {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`::error::${error && error.message ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  readJsonIfExists,
  writeJson,
  normalizeCheckName,
  normalizeCheckRuns,
  normalizeCommitStatuses,
  loadRequiredChecks,
  extractMetadata,
  resolveRuntimeOptions,
  classifyCiStatus,
  inspectOnce,
  runWatcher,
  buildMarkdownSummary,
  writeOutputs,
  makeSafeFailure,
};
