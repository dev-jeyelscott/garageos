#!/usr/bin/env node
'use strict';

/**
 * ENG-LOOP-30 - advisory PR risk classifier.
 *
 * This classifies changed paths against the documented GarageOS R0-R8 risk
 * matrix. It emits local evidence only and does not approve, block, merge, or
 * change GitHub branch protection.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_LEDGER_FILE = '.tmp/eng-loop-run-ledger.json';
const DEFAULT_RESULT_FILE = '.tmp/pr-risk-classifier-result.json';
const DEFAULT_SUMMARY_FILE = '.tmp/pr-risk-classifier-summary.md';

const RISK_CLASSES = [
  {
    id: 'R0',
    rank: 0,
    label: 'Docs-only',
    required_validation: ['pnpm validate:quick'],
    additional_evidence: ['Explain why no runtime validation is required.'],
  },
  {
    id: 'R1',
    rank: 1,
    label: 'Tooling / CI metadata',
    required_validation: ['pnpm validate:quick'],
    additional_evidence: ['Confirm existing CI gates are not weakened.'],
  },
  {
    id: 'R2',
    rank: 2,
    label: 'Web UI only',
    required_validation: ['pnpm validate:quick', 'pnpm validate:web'],
    conditional_validation: ['pnpm validate:e2e when the changed path is covered by E2E'],
    additional_evidence: ['Provide UI verification notes or screenshots where applicable.'],
  },
  {
    id: 'R3',
    rank: 3,
    label: 'API / service logic',
    required_validation: ['pnpm validate:quick', 'pnpm validate:api'],
    additional_evidence: ['Identify affected endpoints, services, DTOs, guards, and tests.'],
  },
  {
    id: 'R4',
    rank: 4,
    label: 'Database / persistence',
    required_validation: ['pnpm validate:quick', 'pnpm validate:api', 'pnpm validate:db'],
    additional_evidence: [
      'Document migration, constraint, transaction, locking, rollback, and data-integrity considerations.',
    ],
  },
  {
    id: 'R5',
    rank: 5,
    label: 'Auth / tenant / RBAC / branch / plan gates',
    required_validation: ['pnpm validate:quick', 'pnpm validate:security', 'pnpm validate:api'],
    conditional_validation: [
      'pnpm validate:db when persistence is affected',
      'pnpm validate:web when UI access behavior is affected',
    ],
    additional_evidence: [
      'Provide targeted auth/access/security evidence and explicit reviewer notes.',
    ],
  },
  {
    id: 'R6',
    rank: 6,
    label: 'Financial / inventory / workflow-critical',
    required_validation: ['pnpm validate:quick', 'pnpm validate:api', 'pnpm validate:db'],
    conditional_validation: [
      'pnpm validate:web when UI is affected',
      'pnpm validate:e2e when the workflow path is covered by E2E',
    ],
    additional_evidence: [
      'Provide targeted financial/inventory/workflow tests, concurrency/idempotency evidence, and rollback notes.',
    ],
  },
  {
    id: 'R7',
    rank: 7,
    label: 'Background jobs / exports / operational reliability',
    required_validation: ['pnpm validate:quick'],
    conditional_validation: [
      'relevant package tests',
      'pnpm validate:api where API behavior is affected',
      'pnpm validate:db where persistence is affected',
    ],
    additional_evidence: [
      'Provide job retry, idempotency, logging, failure-state, operational visibility, and runbook evidence where applicable.',
    ],
  },
  {
    id: 'R8',
    rank: 8,
    label: 'Release candidate / milestone closure',
    required_validation: ['pnpm validate:full'],
    conditional_validation: ['all relevant implemented profile commands'],
    additional_evidence: [
      'Provide security validation, E2E/manual workflow evidence, rollback notes, and signoff evidence as applicable.',
    ],
  },
];

const RISK_BY_ID = new Map(RISK_CLASSES.map((riskClass) => [riskClass.id, riskClass]));

const RULES = [
  {
    risk: 'R8',
    reason: 'Release candidate or milestone-closure evidence changed.',
    pathPatterns: [
      /^docs\/releases?\//i,
      /^docs\/release-/i,
      /^docs\/.*milestone.*closure/i,
      /^docs\/progress-tracker\.md$/i,
    ],
    keywordPattern: /\b(release candidate|milestone closure|production readiness|final signoff)\b/i,
  },
  {
    risk: 'R7',
    reason: 'Background job, export, scheduler, worker, or operational reliability path changed.',
    pathPatterns: [
      /^apps\/worker\//i,
      /^apps\/scheduler\//i,
      /\/(?:worker|workers|scheduler|jobs|background|exports?|observability)\//i,
      /^docs\/engineering\/observability/i,
      /^\.github\/scripts\/validate-observability-profile\.cjs$/i,
    ],
    keywordPattern: /\b(background job|worker|scheduler|cron|export|observability|operational reliability|retry)\b/i,
  },
  {
    risk: 'R6',
    reason: 'Financial, inventory, or workflow-critical area changed.',
    pathPatterns: [
      /\/(?:inventory|fifo|invoice|invoices|payment|payments|receipt|receipts|refund|refunds|void|voids|billing|purchase|purchases|supplier-return|supplier-returns|job-order|job-orders)\//i,
      /^docs\/.*(?:inventory|fifo|invoice|payment|receipt|refund|billing|purchase|supplier-return|job-order)/i,
    ],
    keywordPattern:
      /\b(financial|inventory|fifo|invoice|payment|receipt|refund|void|billing|purchase|supplier return|job order|workflow-critical|overpayment|overbilling|stock)\b/i,
  },
  {
    risk: 'R5',
    reason: 'Auth, tenant isolation, RBAC, branch access, plan gate, or sensitive-data area changed.',
    pathPatterns: [
      /\/(?:auth|authentication|authorization|rbac|roles|permissions|tenant|tenants|subscription|subscriptions|plan|plans|branch-access|platform-admin|support-access|security)\//i,
      /^docs\/.*(?:permission|tenant|subscription|branch|security|auth|rbac|support-access)/i,
      /^\.github\/workflows\/(?:dependency-security|static-security-analysis)\.yml$/i,
    ],
    keywordPattern:
      /\b(auth|authentication|authorization|rbac|permission|tenant isolation|branch access|subscription|plan gate|support access|sensitive data|secret|token|password)\b/i,
  },
  {
    risk: 'R4',
    reason: 'Database, migration, repository persistence, or schema path changed.',
    pathPatterns: [
      /^packages\/db\//i,
      /\/(?:migrations?|persistence|repositories|repository|schema|seed|seeds)\//i,
      /^docs\/(?:database-design|database-schema)\.md$/i,
    ],
    keywordPattern: /\b(database|migration|schema|constraint|index|foreign key|transaction|repository|persistence)\b/i,
  },
  {
    risk: 'R3',
    reason: 'API, controller, service, DTO, or backend application logic path changed.',
    pathPatterns: [/^apps\/api\//i, /^packages\/api-client\//i, /^docs\/api-contracts\.md$/i],
    keywordPattern: /\b(api|controller|service|dto|guard|endpoint|request|response envelope)\b/i,
  },
  {
    risk: 'R2',
    reason: 'Web UI path changed.',
    pathPatterns: [/^apps\/web\//i, /^e2e\//i, /^docs\/(?:ux-sreen-map|ui-registry|ui-tokens)\.md$/i],
    keywordPattern: /\b(web ui|frontend|pwa|screen|component|layout|offline read-only)\b/i,
  },
  {
    risk: 'R1',
    reason: 'Tooling, CI metadata, template, or runbook path changed.',
    pathPatterns: [
      /^\.github\//i,
      /^scripts\//i,
      /^\.husky\//i,
      /^package\.json$/i,
      /^pnpm-lock\.yaml$/i,
      /^pnpm-workspace\.yaml$/i,
      /^docs\/runbooks\//i,
      /^docs\/engineering\/validation-profiles\.md$/i,
      /^docs\/engineering\/ci-status-checks\.md$/i,
    ],
    keywordPattern: /\b(tooling|ci|workflow|runbook|pr template|branch protection|validation profile)\b/i,
  },
];

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

function normalizePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function asLines(value) {
  return String(value || '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function uniq(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function readTextIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return '';
  }

  return fs.readFileSync(filePath, 'utf8');
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

function isMarkdownPath(filePath) {
  return /\.mdx?$/i.test(filePath);
}

function riskRank(riskId) {
  const riskClass = RISK_BY_ID.get(riskId);
  return riskClass ? riskClass.rank : -1;
}

function highestRisk(riskIds) {
  return riskIds.reduce((highest, riskId) => {
    if (!highest || riskRank(riskId) > riskRank(highest)) {
      return riskId;
    }

    return highest;
  }, 'R0');
}

function classifyPath(filePath) {
  const normalized = normalizePath(filePath);
  const matches = [];

  for (const rule of RULES) {
    if (rule.pathPatterns.some((pattern) => pattern.test(normalized))) {
      matches.push({
        risk: rule.risk,
        reason: rule.reason,
        source: 'path',
      });
    }
  }

  if (matches.length === 0 && isMarkdownPath(normalized)) {
    matches.push({
      risk: 'R0',
      reason: 'Markdown documentation path changed.',
      source: 'path',
    });
  }

  if (matches.length === 0) {
    matches.push({
      risk: 'R1',
      reason: 'Unrecognized repository path; classify as tooling/metadata until reviewed.',
      source: 'path',
    });
  }

  const risk = highestRisk(matches.map((match) => match.risk));

  return {
    path: normalized,
    risk,
    matches,
  };
}

function selectedRiskFromBody(markdown) {
  const body = String(markdown || '');
  if (!body.trim()) {
    return null;
  }

  const selectedCheckbox = body.match(/-\s*\[[xX]\]\s*(R[0-8])\b/u);
  if (selectedCheckbox) {
    return selectedCheckbox[1];
  }

  const explicitRisk = body.match(/\bRisk class:\s*(R[0-8])\b/iu);
  if (explicitRisk) {
    return explicitRisk[1].toUpperCase();
  }

  return null;
}

function bodyWithoutRiskSelectionText(markdown) {
  return String(markdown || '')
    .split(/\r?\n/u)
    .filter((line) => !/^\s*-\s*\[[ xX]\]\s*R[0-8]\b/u.test(line))
    .filter((line) => !/^\s*Risk class:\s*R[0-8]\b/iu.test(line))
    .join('\n');
}

function bodyKeywordMatches(markdown) {
  const body = bodyWithoutRiskSelectionText(markdown);
  if (!body.trim()) {
    return [];
  }

  return RULES.filter((rule) => rule.keywordPattern && rule.keywordPattern.test(body)).map(
    (rule) => ({
      risk: rule.risk,
      reason: rule.reason,
      source: 'body_keyword',
    }),
  );
}

function validationForRisk(riskId) {
  const riskClass = RISK_BY_ID.get(riskId) || RISK_BY_ID.get('R1');
  return {
    required_validation: riskClass.required_validation || [],
    conditional_validation: riskClass.conditional_validation || [],
    additional_evidence: riskClass.additional_evidence || [],
  };
}

function classifyPrRisk({ changedFiles = [], prBody = '', evaluatedAt = nowIso() }) {
  const files = uniq(changedFiles.map(normalizePath)).filter(Boolean);
  const pathClassifications = files.map(classifyPath);
  const pathRisk = highestRisk(pathClassifications.map((entry) => entry.risk));
  const keywordMatches = bodyKeywordMatches(prBody);
  const keywordRisk = keywordMatches.length
    ? highestRisk(keywordMatches.map((entry) => entry.risk))
    : null;
  const computedRisk = highestRisk([pathRisk, keywordRisk].filter(Boolean));
  const selectedRisk = selectedRiskFromBody(prBody);
  const warnings = [];

  if (selectedRisk && riskRank(selectedRisk) < riskRank(computedRisk)) {
    warnings.push(
      `PR body selects ${selectedRisk}, which is lower than computed ${computedRisk}. Use the highest applicable risk class.`,
    );
  }

  if (files.length === 0) {
    warnings.push('No changed files were provided or resolved; classification used R0 baseline only.');
  }

  const riskClass = RISK_BY_ID.get(computedRisk);

  return {
    status: 'risk_classified',
    risk_class: computedRisk,
    risk_label: riskClass.label,
    selected_risk_class: selectedRisk,
    selected_risk_matches_computed:
      selectedRisk === null ? null : riskRank(selectedRisk) >= riskRank(computedRisk),
    evaluated_at: evaluatedAt,
    changed_files: files,
    path_classifications: pathClassifications,
    body_keyword_matches: keywordMatches,
    warnings,
    ...validationForRisk(computedRisk),
    source: 'docs/engineering/validation-profiles.md',
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
    '## PR Risk Classifier',
    '',
    `Status: ${result.status}`,
    `Computed risk class: ${result.risk_class} - ${result.risk_label}`,
    `Selected risk class: ${result.selected_risk_class || 'not provided'}`,
    `Selected risk acceptable: ${
      result.selected_risk_matches_computed === null
        ? 'not evaluated'
        : result.selected_risk_matches_computed
          ? 'yes'
          : 'no'
    }`,
    `Evaluated at: ${result.evaluated_at}`,
    '',
    '### Required Implemented Validation',
    '',
  ];

  for (const command of result.required_validation) {
    lines.push(`- ${command}`);
  }

  if (result.conditional_validation.length > 0) {
    lines.push('', '### Conditional Validation', '');
    for (const command of result.conditional_validation) {
      lines.push(`- ${command}`);
    }
  }

  lines.push('', '### Changed Files', '');

  if (result.path_classifications.length === 0) {
    lines.push('- No changed files provided.');
  } else {
    for (const entry of result.path_classifications) {
      lines.push(`- ${entry.path}: ${entry.risk}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('', '### Warnings', '');
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  lines.push('', 'This classifier is advisory evidence only; deterministic CI and human review remain authoritative.', '');

  return `${lines.join('\n')}\n`;
}

function mergeRiskIntoLedger(existing, result, timestamp = nowIso()) {
  const ledger =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};

  ledger.pr_risk_classifier = {
    status: result.status,
    risk_class: result.risk_class,
    risk_label: result.risk_label,
    selected_risk_class: result.selected_risk_class,
    selected_risk_matches_computed: result.selected_risk_matches_computed,
    required_validation: result.required_validation,
    conditional_validation: result.conditional_validation,
    warnings: result.warnings,
    evaluated_at: result.evaluated_at,
  };
  ledger.updated_at = timestamp;
  ledger.events = Array.isArray(ledger.events) ? ledger.events.slice() : [];
  ledger.events.push({
    timestamp,
    type: 'pr_risk_classified',
    message: `PR risk classified as ${result.risk_class}.`,
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
  writeJson(ledgerFile, mergeRiskIntoLedger(existingLedger, result));

  return { resultFile, summaryFile, ledgerFile };
}

function gitChangedFiles(baseRef, cwd = process.cwd()) {
  const args = ['diff', '--name-only'];
  if (baseRef) {
    args.push(`${baseRef}...HEAD`);
  }

  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(
      `Failed to resolve changed files from git diff: ${result.stderr || result.stdout || result.status}`,
    );
  }

  return asLines(result.stdout);
}

function resolveRuntimeOptions(args, cwd = process.cwd()) {
  const body = args.bodyFile
    ? readTextIfExists(path.resolve(cwd, args.bodyFile))
    : args.body || process.env.PR_BODY || '';

  let changedFiles = [];
  if (args.changedFiles) {
    changedFiles = asLines(args.changedFiles)
      .flatMap((line) => line.split(','))
      .map((line) => line.trim());
  } else if (args.changedFilesFile) {
    changedFiles = asLines(readTextIfExists(path.resolve(cwd, args.changedFilesFile)));
  } else if (args.git || args.base) {
    changedFiles = gitChangedFiles(args.base || 'origin/develop', cwd);
  }

  return {
    prBody: body,
    changedFiles,
    resultFile: args.out || args.output || DEFAULT_RESULT_FILE,
    summaryFile: args.summary || DEFAULT_SUMMARY_FILE,
    ledgerFile: args.ledger || DEFAULT_LEDGER_FILE,
    json: Boolean(args.json),
  };
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const options = resolveRuntimeOptions(args);
    const result = classifyPrRisk(options);
    const artifacts = writeOutputs(result, options);

    if (options.json) {
      console.log(JSON.stringify({ result, artifacts }, null, 2));
    } else {
      console.log(`PR risk classifier result: ${result.risk_class} - ${result.risk_label}`);
      console.log(`Result JSON: ${path.resolve(artifacts.resultFile)}`);
      console.log(`Summary Markdown: ${path.resolve(artifacts.summaryFile)}`);
      console.log(`Run ledger: ${path.resolve(artifacts.ledgerFile)}`);
      for (const warning of result.warnings) {
        console.warn(`::warning::${warning}`);
      }
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
  DEFAULT_SUMMARY_FILE,
  RISK_CLASSES,
  buildMarkdownSummary,
  classifyPath,
  classifyPrRisk,
  gitChangedFiles,
  mergeRiskIntoLedger,
  parseArgs,
  resolveRuntimeOptions,
  selectedRiskFromBody,
  writeOutputs,
};
