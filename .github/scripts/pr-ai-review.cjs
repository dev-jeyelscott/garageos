#!/usr/bin/env node
'use strict';

/**
 * ENG-LOOP-31 - advisory AI PR review runner.
 *
 * This runner reuses scripts/ai-pr-review.mjs and records local evidence. It
 * does not approve, block, merge, or make AI review authoritative.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_LEDGER_FILE = '.tmp/eng-loop-run-ledger.json';
const DEFAULT_RESULT_FILE = '.tmp/pr-ai-review-result.json';
const DEFAULT_SUMMARY_FILE = '.tmp/pr-ai-review-summary.md';
const DEFAULT_REVIEW_SCRIPT = 'scripts/ai-pr-review.mjs';

function nowIso() {
  return new Date().toISOString();
}

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

function redactSecrets(input) {
  return String(input || '')
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED_GITHUB_PAT]')
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_OPENAI_KEY]')
    .replace(
      /\b(api[_-]?key|authorization|bearer|client[_-]?secret|password|private[_-]?key|secret|token)\b\s*[:=]\s*['"]?[^'"\s]+/gi,
      '$1=[REDACTED_SECRET]',
    );
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

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

function resolveRuntimeOptions(args = {}, env = process.env) {
  return {
    repository: args.repo || args.repository || env.GITHUB_REPOSITORY || null,
    prNumber: args.pr || args.prNumber || env.PR_NUMBER || null,
    reviewScript: args.script || DEFAULT_REVIEW_SCRIPT,
    resultFile: args.out || args.output || DEFAULT_RESULT_FILE,
    summaryFile: args.summary || DEFAULT_SUMMARY_FILE,
    ledgerFile: args.ledger || DEFAULT_LEDGER_FILE,
    json: Boolean(args.json),
    skipIfMissingKey: args.skipIfMissingKey !== false && args.failIfMissingKey !== true,
    env,
  };
}

function buildSkippedResult(options, evaluatedAt = nowIso()) {
  return {
    status: 'ai_review_skipped',
    advisory: true,
    reason: 'openai_key_missing',
    message: 'OPENAI_API_KEY is not configured; advisory AI PR review was skipped.',
    evaluated_at: evaluatedAt,
    repository: options.repository,
    pr_number: options.prNumber ? Number(options.prNumber) : null,
    review_script: options.reviewScript,
    exit_code: 0,
    stdout: '',
    stderr: '',
    non_goals: [
      'does_not_merge',
      'does_not_approve',
      'does_not_block_pr',
      'does_not_change_branch_protection',
      'does_not_make_ai_review_authoritative',
    ],
  };
}

function buildSpawnResult(spawnResult, options, evaluatedAt = nowIso()) {
  const exitCode = Number.isInteger(spawnResult.status) ? spawnResult.status : 1;
  const signal = spawnResult.signal || null;
  const stdout = redactSecrets(spawnResult.stdout || '');
  const stderr = redactSecrets(spawnResult.stderr || '');
  const passed = exitCode === 0 && !signal;

  return {
    status: passed ? 'ai_review_completed' : 'ai_review_failed',
    advisory: true,
    reason: passed ? 'review_script_completed' : 'review_script_failed',
    message: passed
      ? 'Advisory AI PR review runner completed.'
      : 'Advisory AI PR review runner failed while invoking the review script.',
    evaluated_at: evaluatedAt,
    repository: options.repository,
    pr_number: options.prNumber ? Number(options.prNumber) : null,
    review_script: options.reviewScript,
    exit_code: exitCode,
    signal,
    stdout,
    stderr,
    non_goals: [
      'does_not_merge',
      'does_not_approve',
      'does_not_block_pr',
      'does_not_change_branch_protection',
      'does_not_make_ai_review_authoritative',
    ],
  };
}

function buildMarkdownSummary(result) {
  const lines = [
    '## PR AI Review Runner',
    '',
    `Status: ${result.status}`,
    `Advisory: ${result.advisory ? 'yes' : 'no'}`,
    `Reason: ${result.reason}`,
    `Repository: ${result.repository || 'unresolved'}`,
    `PR: ${result.pr_number || 'unresolved'}`,
    `Review script: ${result.review_script}`,
    `Exit code: ${result.exit_code}`,
    `Evaluated at: ${result.evaluated_at}`,
    '',
    `Message: ${result.message}`,
    '',
    'This runner reuses `scripts/ai-pr-review.mjs`; deterministic CI and human review remain authoritative.',
    '',
  ];

  if (result.stdout) {
    lines.push('### Stdout', '', '```text', result.stdout.slice(0, 4_000), '```', '');
  }

  if (result.stderr) {
    lines.push('### Stderr', '', '```text', result.stderr.slice(0, 4_000), '```', '');
  }

  return `${lines.join('\n')}\n`;
}

function mergeAiReviewIntoLedger(existing, result, timestamp = nowIso()) {
  const ledger =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};

  ledger.pr_ai_review = {
    status: result.status,
    advisory: result.advisory,
    reason: result.reason,
    message: result.message,
    repository: result.repository,
    pr_number: result.pr_number,
    review_script: result.review_script,
    exit_code: result.exit_code,
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
  writeJson(ledgerFile, mergeAiReviewIntoLedger(existingLedger, result));

  return { resultFile, summaryFile, ledgerFile };
}

function runAiReview(options, dependencies = {}) {
  const env = options.env || process.env;
  const evaluatedAt = dependencies.now ? dependencies.now() : nowIso();

  if (!env.OPENAI_API_KEY && options.skipIfMissingKey) {
    return buildSkippedResult(options, evaluatedAt);
  }

  const spawn = dependencies.spawnSync || spawnSync;
  const spawnResult = spawn(process.execPath, [options.reviewScript], {
    cwd: dependencies.cwd || process.cwd(),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });

  return buildSpawnResult(spawnResult, options, evaluatedAt);
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const options = resolveRuntimeOptions(args);
    const result = runAiReview(options);
    const artifacts = writeOutputs(result, options);

    if (options.json) {
      console.log(JSON.stringify({ result, artifacts }, null, 2));
    } else {
      console.log(`PR AI review runner result: ${result.status}`);
      console.log(`Result JSON: ${path.resolve(artifacts.resultFile)}`);
      console.log(`Summary Markdown: ${path.resolve(artifacts.summaryFile)}`);
      console.log(`Run ledger: ${path.resolve(artifacts.ledgerFile)}`);
    }

    if (result.status === 'ai_review_failed') {
      process.exitCode = result.exit_code || 1;
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
  DEFAULT_LEDGER_FILE,
  DEFAULT_RESULT_FILE,
  DEFAULT_REVIEW_SCRIPT,
  DEFAULT_SUMMARY_FILE,
  buildMarkdownSummary,
  buildSkippedResult,
  buildSpawnResult,
  mergeAiReviewIntoLedger,
  parseArgs,
  redactSecrets,
  resolveRuntimeOptions,
  runAiReview,
  writeOutputs,
};
