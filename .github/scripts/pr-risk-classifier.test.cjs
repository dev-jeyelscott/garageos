#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const classifier = require('./pr-risk-classifier.cjs');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pr-risk-classifier-'));
}

function testDocsOnlyClassifiesR0() {
  const result = classifier.classifyPrRisk({
    changedFiles: ['docs/engineering/ai-reviewer-merge-readiness-audit.md'],
    evaluatedAt: '2026-07-07T00:00:00.000Z',
  });

  assert.equal(result.risk_class, 'R0');
  assert.equal(result.risk_label, 'Docs-only');
  assert.deepEqual(result.required_validation, ['pnpm validate:quick']);
}

function testToolingClassifiesR1() {
  const result = classifier.classifyPrRisk({
    changedFiles: ['.github/workflows/pr-validation-evidence.yml'],
  });

  assert.equal(result.risk_class, 'R1');
  assert.equal(result.risk_label, 'Tooling / CI metadata');
}

function testWebClassifiesR2() {
  const result = classifier.classifyPrRisk({
    changedFiles: ['apps/web/app/dashboard/page.tsx'],
  });

  assert.equal(result.risk_class, 'R2');
  assert.equal(result.required_validation.includes('pnpm validate:web'), true);
}

function testApiClassifiesR3() {
  const result = classifier.classifyPrRisk({
    changedFiles: ['apps/api/src/modules/customers/api/customers.controller.ts'],
  });

  assert.equal(result.risk_class, 'R3');
  assert.equal(result.required_validation.includes('pnpm validate:api'), true);
}

function testDatabaseClassifiesR4() {
  const result = classifier.classifyPrRisk({
    changedFiles: ['packages/db/migrations/202607070001_add_customers.ts'],
  });

  assert.equal(result.risk_class, 'R4');
  assert.equal(result.required_validation.includes('pnpm validate:db'), true);
}

function testAuthClassifiesR5() {
  const result = classifier.classifyPrRisk({
    changedFiles: ['apps/api/src/modules/auth/application/login.service.ts'],
  });

  assert.equal(result.risk_class, 'R5');
  assert.equal(result.required_validation.includes('pnpm validate:security'), true);
}

function testInventoryClassifiesR6() {
  const result = classifier.classifyPrRisk({
    changedFiles: ['apps/api/src/modules/inventory/application/receive-stock.service.ts'],
  });

  assert.equal(result.risk_class, 'R6');
  assert.equal(result.required_validation.includes('pnpm validate:db'), true);
}

function testWorkerClassifiesR7() {
  const result = classifier.classifyPrRisk({
    changedFiles: ['apps/worker/src/export-jobs.worker.ts'],
  });

  assert.equal(result.risk_class, 'R7');
  assert.equal(result.conditional_validation.includes('relevant package tests'), true);
}

function testReleaseClassifiesR8() {
  const result = classifier.classifyPrRisk({
    changedFiles: ['docs/progress-tracker.md'],
  });

  assert.equal(result.risk_class, 'R8');
  assert.deepEqual(result.required_validation, ['pnpm validate:full']);
}

function testHighestApplicableRiskWins() {
  const result = classifier.classifyPrRisk({
    changedFiles: ['docs/architecture.md', 'apps/web/app/inventory/page.tsx'],
  });

  assert.equal(result.risk_class, 'R6');
}

function testSelectedRiskMismatchWarns() {
  const result = classifier.classifyPrRisk({
    changedFiles: ['apps/api/src/modules/auth/application/login.service.ts'],
    prBody: ['## Risk Class and Validation Profile', '', '- [x] R1 - Tooling / CI metadata'].join(
      '\n',
    ),
  });

  assert.equal(result.risk_class, 'R5');
  assert.equal(result.selected_risk_class, 'R1');
  assert.equal(result.selected_risk_matches_computed, false);
  assert.match(result.warnings.join('\n'), /lower than computed R5/);
}

function testSelectedHigherRiskIsAccepted() {
  const result = classifier.classifyPrRisk({
    changedFiles: ['.github/scripts/pr-risk-classifier.cjs'],
    prBody: '- [x] R3 - API / service logic',
  });

  assert.equal(result.risk_class, 'R1');
  assert.equal(result.selected_risk_class, 'R3');
  assert.equal(result.selected_risk_matches_computed, true);
}

function testBodyKeywordsCanRaiseRisk() {
  const result = classifier.classifyPrRisk({
    changedFiles: ['docs/notes.md'],
    prBody: 'This change affects tenant isolation and branch access.',
  });

  assert.equal(result.risk_class, 'R5');
  assert.equal(result.body_keyword_matches.some((match) => match.risk === 'R5'), true);
}

function testWriteOutputsUpdatesLedger() {
  const dir = makeTempDir();
  const result = classifier.classifyPrRisk({
    changedFiles: ['.github/scripts/pr-risk-classifier.cjs'],
    evaluatedAt: '2026-07-07T00:00:00.000Z',
  });
  const artifacts = classifier.writeOutputs(result, {
    resultFile: path.join(dir, 'result.json'),
    summaryFile: path.join(dir, 'summary.md'),
    ledgerFile: path.join(dir, 'ledger.json'),
  });

  const savedResult = JSON.parse(fs.readFileSync(artifacts.resultFile, 'utf8'));
  const summary = fs.readFileSync(artifacts.summaryFile, 'utf8');
  const ledger = JSON.parse(fs.readFileSync(artifacts.ledgerFile, 'utf8'));

  assert.equal(savedResult.risk_class, 'R1');
  assert.match(summary, /PR Risk Classifier/);
  assert.match(summary, /advisory evidence only/);
  assert.equal(ledger.pr_risk_classifier.risk_class, 'R1');
  assert.equal(ledger.events.at(-1).type, 'pr_risk_classified');
}

function testResolveRuntimeOptionsReadsFilesAndCommaList() {
  const dir = makeTempDir();
  const bodyFile = path.join(dir, 'body.md');
  fs.writeFileSync(bodyFile, 'Risk class: R1\n', 'utf8');

  const options = classifier.resolveRuntimeOptions(
    {
      bodyFile,
      changedFiles: '.github/scripts/pr-risk-classifier.cjs,package.json',
      out: 'risk.json',
      summary: 'risk.md',
      ledger: 'ledger.json',
    },
    dir,
  );

  assert.equal(options.prBody, 'Risk class: R1\n');
  assert.deepEqual(options.changedFiles, [
    '.github/scripts/pr-risk-classifier.cjs',
    'package.json',
  ]);
  assert.equal(options.resultFile, 'risk.json');
  assert.equal(options.summaryFile, 'risk.md');
  assert.equal(options.ledgerFile, 'ledger.json');
}

function testNonGoalsPreserveAdvisoryBoundary() {
  const result = classifier.classifyPrRisk({
    changedFiles: ['.github/scripts/pr-risk-classifier.cjs'],
  });

  assert.equal(result.non_goals.includes('does_not_merge'), true);
  assert.equal(result.non_goals.includes('does_not_block_pr'), true);
  assert.equal(result.non_goals.includes('does_not_make_ai_review_authoritative'), true);
}

async function run() {
  const tests = [
    testDocsOnlyClassifiesR0,
    testToolingClassifiesR1,
    testWebClassifiesR2,
    testApiClassifiesR3,
    testDatabaseClassifiesR4,
    testAuthClassifiesR5,
    testInventoryClassifiesR6,
    testWorkerClassifiesR7,
    testReleaseClassifiesR8,
    testHighestApplicableRiskWins,
    testSelectedRiskMismatchWarns,
    testSelectedHigherRiskIsAccepted,
    testBodyKeywordsCanRaiseRisk,
    testWriteOutputsUpdatesLedger,
    testResolveRuntimeOptionsReadsFilesAndCommaList,
    testNonGoalsPreserveAdvisoryBoundary,
  ];

  for (const test of tests) {
    await test();
    console.log(`passed: ${test.name}`);
  }

  console.log(`All ${tests.length} PR risk classifier tests passed.`);
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
