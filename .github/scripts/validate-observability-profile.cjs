#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = process.cwd();
const failures = [];
const warnings = [];
const passes = [];

function repoPath(...segments) {
  return path.join(repoRoot, ...segments);
}

function exists(relativePath) {
  return fs.existsSync(repoPath(relativePath));
}

function read(relativePath) {
  return fs.readFileSync(repoPath(relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function pass(message) {
  passes.push(message);
}

function requireFile(relativePath) {
  if (!exists(relativePath)) {
    fail(`Missing required file: ${relativePath}`);
    return false;
  }
  pass(`Found ${relativePath}`);
  return true;
}

function requireTerms(relativePath, terms, label) {
  if (!exists(relativePath)) {
    fail(`Cannot validate ${label}; missing ${relativePath}`);
    return;
  }

  const content = read(relativePath).toLowerCase();
  const missing = terms.filter((term) => !content.includes(term.toLowerCase()));

  if (missing.length > 0) {
    fail(`${label} is missing required terms in ${relativePath}: ${missing.join(', ')}`);
    return;
  }

  pass(`${label} includes required observability terms`);
}

function walkFiles(startDir, visitor) {
  const absoluteStart = repoPath(startDir);
  if (!fs.existsSync(absoluteStart)) {
    return;
  }

  const ignoredDirs = new Set([
    '.git',
    '.next',
    '.turbo',
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.pnpm-store',
  ]);
  const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.cjs', '.mjs', '.json', '.md']);
  const stack = [absoluteStart];

  while (stack.length > 0) {
    const current = stack.pop();
    const stat = fs.statSync(current);

    if (stat.isDirectory()) {
      const base = path.basename(current);
      if (ignoredDirs.has(base)) {
        continue;
      }
      for (const child of fs.readdirSync(current)) {
        stack.push(path.join(current, child));
      }
      continue;
    }

    if (!stat.isFile()) {
      continue;
    }

    const extension = path.extname(current);
    if (!allowedExtensions.has(extension) || stat.size > 1024 * 1024) {
      continue;
    }

    visitor(current);
  }
}

function findImplementationEvidence() {
  const roots = ['apps', 'packages'];
  const evidence = [];
  const patterns = [
    /request[_-]?id/i,
    /correlation[_-]?id/i,
    /structured\s+log/i,
    /logger/i,
    /redact/i,
    /background[_-]?job/i,
    /error\s+monitor/i,
  ];

  for (const root of roots) {
    walkFiles(root, (absoluteFilePath) => {
      const content = fs.readFileSync(absoluteFilePath, 'utf8');
      const matched = patterns.filter((pattern) => pattern.test(content));
      if (matched.length >= 2) {
        evidence.push(path.relative(repoRoot, absoluteFilePath).split(path.sep).join('/'));
      }
    });
  }

  return Array.from(new Set(evidence)).sort();
}

function validatePackageScript() {
  if (!requireFile('package.json')) {
    return;
  }

  const packageJson = JSON.parse(read('package.json'));
  const script = packageJson.scripts && packageJson.scripts['validate:observability'];

  if (!script) {
    fail('package.json is missing scripts.validate:observability');
    return;
  }

  if (!script.includes('validate-observability-profile.cjs')) {
    fail(
      'scripts.validate:observability must run ./.github/scripts/validate-observability-profile.cjs',
    );
    return;
  }

  pass('package.json exposes validate:observability');
}

function main() {
  validatePackageScript();

  requireFile('.github/scripts/validate-observability-profile.cjs');
  requireFile('docs/engineering/observability-validation-profile.md');
  requireFile('docs/engineering/validation-profiles.md');

  requireTerms(
    'docs/engineering/observability-validation-profile.md',
    [
      'validate:observability',
      'request_id',
      'correlation_id',
      'structured logs',
      'sensitive data',
      'background job',
      'coverage gaps',
      'static contract',
    ],
    'observability validation profile documentation',
  );

  requireTerms(
    'docs/engineering/validation-profiles.md',
    ['validate:observability', 'observability', 'correlation', 'request'],
    'validation profile index',
  );

  if (exists('docs/api-contracts.md')) {
    requireTerms(
      'docs/api-contracts.md',
      ['request_id', 'correlation_id'],
      'API contract observability trace',
    );
  } else if (exists('api-contracts.md')) {
    requireTerms(
      'api-contracts.md',
      ['request_id', 'correlation_id'],
      'API contract observability trace',
    );
  } else {
    warn(
      'API contract document not found at docs/api-contracts.md or api-contracts.md; skipped API trace validation.',
    );
  }

  const evidence = findImplementationEvidence();
  if (evidence.length === 0) {
    warn(
      'No implementation-level observability evidence detected yet. This profile currently validates the static observability contract and documented gaps only.',
    );
  } else {
    pass(
      `Detected implementation-level observability evidence in ${Math.min(evidence.length, 8)} file(s): ${evidence.slice(0, 8).join(', ')}`,
    );
  }

  console.log('Observability validation profile results:');
  for (const item of passes) {
    console.log(`✓ ${item}`);
  }
  for (const item of warnings) {
    console.warn(`::warning::${item}`);
  }

  if (failures.length > 0) {
    for (const item of failures) {
      console.error(`✗ ${item}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Observability validation profile guard passed.');
}

main();
