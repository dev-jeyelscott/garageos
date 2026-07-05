'use strict';

const fs = require('node:fs');
const path = require('node:path');

const workflowDir = '.github/workflows';
const expectedChecks = [
  'Advisory AI PR Review',
  'validation-${{ matrix.profile }}',
  'Dependency audit and security profile',
  'Validate PR evidence',
  'Semgrep static security scan',
];

function stripQuotes(value) {
  return String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

function extractWorkflowName(text, fallbackFile) {
  const match = text.match(/^name:\s*(.+?)\s*$/m);
  return match ? stripQuotes(match[1]) : fallbackFile;
}

function extractJobsBlock(text) {
  const lines = text.split(/\r?\n/);
  const jobsIndex = lines.findIndex((line) => /^jobs:\s*$/.test(line));

  if (jobsIndex === -1) return [];

  const result = [];
  for (let i = jobsIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^[A-Za-z0-9_-]+:\s*$/.test(line)) break;
    result.push(line);
  }
  return result;
}

function splitJobBlocks(jobsLines) {
  const blocks = [];
  let current = null;

  for (let i = 0; i < jobsLines.length; i += 1) {
    const line = jobsLines[i];
    const match = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*$/);

    if (match) {
      if (current) blocks.push(current);
      current = {
        jobId: match[1],
        startLine: i,
        lines: [line],
      };
      continue;
    }

    if (current) current.lines.push(line);
  }

  if (current) blocks.push(current);
  return blocks;
}

function extractMatrixProfiles(jobBlockText) {
  const profiles = [];

  const inline = jobBlockText.match(/^\s{8,}profile:\s*\[(.*?)\]\s*$/m);
  if (inline) {
    for (const raw of inline[1].split(',')) {
      const value = stripQuotes(raw);
      if (value) profiles.push(value);
    }
  }

  const lines = jobBlockText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s{8,}profile:\s*$/.test(lines[i])) continue;

    for (let j = i + 1; j < lines.length; j += 1) {
      const item = lines[j].match(/^\s{10,}-\s*(.+?)\s*$/);
      if (item) {
        const value = stripQuotes(item[1]);
        if (value) profiles.push(value);
        continue;
      }
      if (/^\s{0,8}\S/.test(lines[j])) break;
    }
  }

  return [...new Set(profiles)];
}

function getWorkflowFiles() {
  if (!fs.existsSync(workflowDir)) {
    console.error('Missing ' + workflowDir);
    process.exit(1);
  }
  return fs
    .readdirSync(workflowDir)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .sort();
}

function extractJobChecks() {
  const checks = [];
  for (const file of getWorkflowFiles()) {
    const fullPath = path.join(workflowDir, file);
    const text = fs.readFileSync(fullPath, 'utf8');
    const jobsLines = extractJobsBlock(text);
    const jobBlocks = splitJobBlocks(jobsLines);
    for (const block of jobBlocks) {
      const blockText = block.lines.join('\n');
      const nameMatch = blockText.match(/^\s{4}name:\s*(.+?)\s*$/m);
      const rawName = nameMatch ? stripQuotes(nameMatch[1]) : block.jobId;
      const profiles = extractMatrixProfiles(blockText);
      const marker = '${{' + ' matrix.profile ' + '}}';
      const expandedNames =
        rawName.includes(marker) && profiles.length > 0
          ? profiles.map((profile) => rawName.replace(marker, profile))
          : [rawName];
      for (const name of expandedNames)
        checks.push({ name, file: fullPath.replace(/\\/g, '/'), jobId: block.jobId });
    }
  }
  const unique = [];
  const seen = new Set();
  for (const check of checks) {
    if (seen.has(check.name)) continue;
    seen.add(check.name);
    unique.push(check);
  }
  return unique;
}

const found = extractJobChecks();
console.log('\nFound workflow job names after matrix expansion:\n');
for (const item of found) {
  console.log('- ' + item.name + ' (' + item.file + ' / ' + item.jobId + ')');
}
console.log('\nExpected documented required checks:\n');
for (const check of expectedChecks) {
  const exists = found.some((item) => item.name === check);
  console.log((exists ? 'OK   ' : 'MISS ') + check);
}
const missing = expectedChecks.filter((check) => !found.some((item) => item.name === check));
if (missing.length > 0) {
  console.error(
    '\nMismatch: documented required checks do not all match emitted GitHub Actions job names.',
  );
  process.exit(1);
}
console.log('\nAll documented required checks match workflow job names.');
