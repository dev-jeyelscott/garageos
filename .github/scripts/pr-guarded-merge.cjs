#!/usr/bin/env node
'use strict';

/**
 * ENG-LOOP-33 - guarded PR merge executor.
 *
 * This executor is manual-only and fail-closed. It consumes the deterministic
 * PR merge gate result, verifies the PR head SHA has not changed, and then
 * calls GitHub's normal pull request merge API. GitHub branch protection and
 * repository permissions remain authoritative.
 */

const fs = require('node:fs');
const path = require('node:path');
const gate = require('./pr-merge-gate.cjs');
const watcher = require('./eng-loop-ci-status-watcher.cjs');

const DEFAULT_GATE_RESULT_FILE = '.tmp/pr-merge-gate-result.json';
const DEFAULT_LEDGER_FILE = '.tmp/eng-loop-run-ledger.json';
const DEFAULT_RESULT_FILE = '.tmp/pr-guarded-merge-result.json';
const DEFAULT_SUMMARY_FILE = '.tmp/pr-guarded-merge-summary.md';
const MANUAL_CONFIRMATION = 'ENG-LOOP-33-MERGE';
const ALLOWED_MERGE_METHODS = new Set(['merge', 'squash', 'rebase']);

function nowIso() {
  return new Date().toISOString();
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  return raw ? JSON.parse(raw) : null;
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

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function parsePrNumber(value) {
  if (value === undefined || value === null || value === '') return null;
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

function normalizeMergeMethod(value) {
  const method = String(value || 'squash').trim().toLowerCase();
  if (!ALLOWED_MERGE_METHODS.has(method)) {
    throw new Error(`Unsupported merge method "${value}". Use merge, squash, or rebase.`);
  }
  return method;
}

function resolveRuntimeOptions(args = {}, env = process.env, cwd = process.cwd()) {
  const gateResultFile = args.gateResult || args.gate || DEFAULT_GATE_RESULT_FILE;
  const gateResult = readJsonIfExists(path.resolve(cwd, gateResultFile));
  const repository = firstDefined(
    args.repo,
    args.repository,
    gateResult && gateResult.repository,
    env.GITHUB_REPOSITORY,
  );
  const prNumber = parsePrNumber(
    firstDefined(args.pr, args.prNumber, gateResult && gateResult.pr_number),
  );

  return {
    mode: args.mode || env.INPUT_MERGE_MODE || 'dry-run',
    confirmation: args.confirm || args.confirmation || env.INPUT_MERGE_CONFIRMATION || '',
    repository,
    prNumber,
    expectedHeadSha: firstDefined(args.sha, args.headSha, gateResult && gateResult.head_sha),
    mergeMethod: normalizeMergeMethod(args.mergeMethod || env.INPUT_MERGE_METHOD || 'squash'),
    gateResult,
    gateResultFile,
    resultFile: args.out || args.output || DEFAULT_RESULT_FILE,
    summaryFile: args.summary || DEFAULT_SUMMARY_FILE,
    ledgerFile: args.ledger || DEFAULT_LEDGER_FILE,
    token: firstDefined(args.token, env.GITHUB_TOKEN, env.GH_TOKEN),
    json: Boolean(args.json),
  };
}

function buildResult(status, reason, message, options, extra = {}) {
  return {
    status,
    merge_executed: status === 'guarded_merge_merged',
    reason,
    message,
    evaluated_at: extra.evaluatedAt || nowIso(),
    repository: options.repository || null,
    pr_number: options.prNumber || null,
    expected_head_sha: options.expectedHeadSha || null,
    merge_method: options.mergeMethod,
    gate_result_file: options.gateResultFile,
    gate_status: options.gateResult ? options.gateResult.status || null : null,
    gate_merge_allowed: Boolean(options.gateResult && options.gateResult.merge_allowed),
    pull_request: extra.pullRequest || null,
    github_response: extra.githubResponse || null,
    non_goals: [
      'does_not_bypass_branch_protection',
      'does_not_override_required_checks',
      'does_not_approve_pr',
      'does_not_change_branch_protection',
      'does_not_merge_without_manual_confirmation',
    ],
  };
}

function blocked(reason, message, options, extra) {
  return buildResult('guarded_merge_blocked', reason, message, options, extra);
}

function validatePreconditions(options) {
  if (options.mode !== 'manual') {
    return blocked(
      'manual_mode_required',
      'Guarded merge execution requires --mode=manual.',
      options,
    );
  }

  if (options.confirmation !== MANUAL_CONFIRMATION) {
    return blocked(
      'manual_confirmation_required',
      `Guarded merge execution requires confirmation ${MANUAL_CONFIRMATION}.`,
      options,
    );
  }

  if (!options.gateResult) {
    return blocked('merge_gate_result_missing', 'PR merge gate result is missing.', options);
  }

  if (options.gateResult.status !== 'merge_gate_passed' || options.gateResult.merge_allowed !== true) {
    return blocked(
      'merge_gate_not_passed',
      'Deterministic PR merge gate did not pass.',
      options,
    );
  }

  if (!options.repository) {
    return blocked('repository_unresolved', 'Repository could not be resolved.', options);
  }

  try {
    resolveRepositoryParts(options.repository);
  } catch (error) {
    return blocked('repository_invalid', error.message, options);
  }

  if (!options.prNumber) {
    return blocked('pr_number_unresolved', 'Pull request number could not be resolved.', options);
  }

  if (!options.expectedHeadSha) {
    return blocked('head_sha_unresolved', 'Expected PR head SHA could not be resolved.', options);
  }

  if (!options.token) {
    return blocked('github_token_missing', 'Missing GitHub token. Set GITHUB_TOKEN or GH_TOKEN.', options);
  }

  return null;
}

async function githubRequest(apiPath, { token, method = 'GET', body, fetchImpl = globalThis.fetch }) {
  if (!fetchImpl) {
    throw new Error('global fetch is unavailable. Use Node 18+ or provide a fetch implementation.');
  }
  if (!token) {
    throw new Error('Missing GitHub token. Set GITHUB_TOKEN or GH_TOKEN.');
  }

  const url = apiPath.startsWith('http') ? apiPath : `https://api.github.com${apiPath}`;
  const response = await fetchImpl(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'garageos-pr-guarded-merge',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(
      payload && payload.message
        ? `GitHub API returned ${response.status}: ${payload.message}`
        : `GitHub API returned ${response.status}`,
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function summarizePullRequest(pull) {
  return {
    number: pull.number || null,
    state: pull.state || null,
    draft: Boolean(pull.draft),
    mergeable_state: pull.mergeable_state || null,
    html_url: pull.html_url || null,
    head_ref: pull.head && pull.head.ref ? pull.head.ref : null,
    head_sha: pull.head && pull.head.sha ? pull.head.sha : null,
    base_ref: pull.base && pull.base.ref ? pull.base.ref : null,
  };
}

async function executeGuardedMerge(options, dependencies = {}) {
  const preconditionFailure = validatePreconditions(options);
  if (preconditionFailure) return preconditionFailure;

  const repoParts = resolveRepositoryParts(options.repository);
  const request = dependencies.githubRequest || githubRequest;

  try {
    const pull = await request(`/repos/${repoParts.owner}/${repoParts.repo}/pulls/${options.prNumber}`, {
      token: options.token,
      fetchImpl: dependencies.fetchImpl,
    });
    const pullSummary = summarizePullRequest(pull);

    if (pullSummary.state !== 'open') {
      return blocked('pr_not_open', 'Pull request is not open.', options, {
        pullRequest: pullSummary,
      });
    }

    if (pullSummary.draft) {
      return blocked('pr_is_draft', 'Draft pull requests cannot be merged by this executor.', options, {
        pullRequest: pullSummary,
      });
    }

    if (pullSummary.head_sha !== options.expectedHeadSha) {
      return blocked(
        'head_sha_mismatch',
        'Pull request head SHA changed after the merge gate was evaluated.',
        options,
        { pullRequest: pullSummary },
      );
    }

    const githubResponse = await request(
      `/repos/${repoParts.owner}/${repoParts.repo}/pulls/${options.prNumber}/merge`,
      {
        token: options.token,
        method: 'PUT',
        body: {
          sha: options.expectedHeadSha,
          merge_method: options.mergeMethod,
        },
        fetchImpl: dependencies.fetchImpl,
      },
    );

    return buildResult(
      'guarded_merge_merged',
      'github_merge_api_succeeded',
      'GitHub accepted the guarded pull request merge.',
      options,
      {
        evaluatedAt: dependencies.now ? dependencies.now() : nowIso(),
        pullRequest: pullSummary,
        githubResponse: {
          sha: githubResponse.sha || null,
          merged: Boolean(githubResponse.merged),
          message: githubResponse.message || null,
        },
      },
    );
  } catch (error) {
    return buildResult(
      'guarded_merge_failed',
      'github_merge_api_failed',
      error && error.message ? error.message : 'GitHub guarded merge request failed.',
      options,
      {
        evaluatedAt: dependencies.now ? dependencies.now() : nowIso(),
        githubResponse: error && error.payload ? error.payload : null,
      },
    );
  }
}

function buildMarkdownSummary(result) {
  const lines = [
    '## PR Guarded Merge',
    '',
    `Status: ${result.status}`,
    `Merge executed: ${result.merge_executed ? 'yes' : 'no'}`,
    `Reason: ${result.reason}`,
    `Repository: ${result.repository || 'unresolved'}`,
    `PR: ${result.pr_number || 'unresolved'}`,
    `Expected head SHA: ${result.expected_head_sha || 'unresolved'}`,
    `Merge method: ${result.merge_method}`,
    `Gate status: ${result.gate_status || 'unresolved'}`,
    `Gate merge allowed: ${result.gate_merge_allowed ? 'yes' : 'no'}`,
    `Evaluated at: ${result.evaluated_at}`,
    '',
    `Message: ${result.message}`,
    '',
    'This executor uses GitHub pull request merge APIs; branch protection and repository permissions remain authoritative.',
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function mergeGuardedMergeIntoLedger(existing, result, timestamp = nowIso()) {
  const ledger =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};

  ledger.pr_guarded_merge = {
    status: result.status,
    merge_executed: result.merge_executed,
    reason: result.reason,
    message: result.message,
    repository: result.repository,
    pr_number: result.pr_number,
    expected_head_sha: result.expected_head_sha,
    merge_method: result.merge_method,
    evaluated_at: result.evaluated_at,
  };
  ledger.updated_at = timestamp;
  ledger.events = Array.isArray(ledger.events) ? ledger.events.slice() : [];
  ledger.events.push({
    timestamp,
    type: result.status,
    message: result.message,
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
  writeJson(ledgerFile, mergeGuardedMergeIntoLedger(existingLedger, result));

  return { resultFile, summaryFile, ledgerFile };
}

async function main() {
  try {
    const args = watcher.parseArgs(process.argv.slice(2));
    const options = resolveRuntimeOptions(args);
    if (!options.gateResult && args.runGate) {
      const gateOptions = gate.resolveGateOptions(args);
      options.gateResult = await gate.evaluateMergeGate(gateOptions);
      gate.writeOutputs(options.gateResult, gateOptions);
    }

    const result = await executeGuardedMerge(options);
    const artifacts = writeOutputs(result, options);

    if (options.json) {
      console.log(JSON.stringify({ result, artifacts }, null, 2));
    } else {
      console.log(`PR guarded merge result: ${result.status}`);
      console.log(`Result JSON: ${path.resolve(artifacts.resultFile)}`);
      console.log(`Summary Markdown: ${path.resolve(artifacts.summaryFile)}`);
      console.log(`Run ledger: ${path.resolve(artifacts.ledgerFile)}`);
    }

    if (result.status !== 'guarded_merge_merged') {
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(`::error::${error && error.message ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_GATE_RESULT_FILE,
  DEFAULT_LEDGER_FILE,
  DEFAULT_RESULT_FILE,
  DEFAULT_SUMMARY_FILE,
  MANUAL_CONFIRMATION,
  buildMarkdownSummary,
  executeGuardedMerge,
  mergeGuardedMergeIntoLedger,
  normalizeMergeMethod,
  resolveRuntimeOptions,
  validatePreconditions,
  writeOutputs,
};
