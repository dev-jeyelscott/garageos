#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const SECTION_HEADING_PATTERN = /^#{1,6}\s+(?<title>.+?)\s*#*\s*$/gm;

const CONFIG = {
  sectionTitlePatterns: [
    /^validation\s+evidence$/i,
    /^validation$/i,
    /^validation\s+commands$/i,
    /^testing\s+evidence$/i,
    /^test\s+evidence$/i,
  ],
  placeholderPatterns: [
    /^\s*(n\/?a|none|todo|tbd|pending|not\s+run|not\s+tested|coming\s+soon|\-|_)\s*$/i,
    /\b(todo|tbd|pending|coming\s+soon)\b/i,
    /<!--\s*.*?\s*-->/gs,
  ],
  commandPattern:
    /(?:^|[\s>*-])(?:pnpm|npm|yarn|node|npx|tsx|turbo|tsc|eslint|vitest|jest|playwright|docker|make|bash|sh|pytest|go\s+test|cargo\s+test)\b/im,
  passResultPattern:
    /\b(pass(?:ed|es)?|success(?:ful|fully)?|succeeded|green|completed|ok)\b|✅|✔/i,
  failResultPattern: /\b(fail(?:ed|ing)?|error|errored|red|broken)\b|❌|✘/i,
  docsOnlyJustificationPattern:
    /\b(?:docs?-only|documentation-only|markdown-only|runbook-only)\b[\s\S]{0,160}\b(?:manual(?:ly)?\s+review(?:ed)?|review(?:ed)?|no\s+runtime|not\s+applicable|not\s+required)\b/i,
  notApplicableJustificationPattern:
    /\bnot\s+applicable\b[\s\S]{0,160}\b(?:because|docs?|documentation|markdown|runbook|no\s+runtime)\b/i,
  waiverPattern: /\bwaiv(?:ed|er)\b[\s\S]{0,240}\b(?:reason|approved|approver|owner|risk)\b/i,
};

function readBodyFromArgs(argv, env) {
  const bodyFileIndex = argv.indexOf('--body-file');
  if (bodyFileIndex !== -1) {
    const bodyFile = argv[bodyFileIndex + 1];
    if (!bodyFile) {
      throw new Error('Missing value for --body-file.');
    }
    return fs.readFileSync(bodyFile, 'utf8');
  }

  const bodyArgIndex = argv.indexOf('--body');
  if (bodyArgIndex !== -1) {
    const body = argv[bodyArgIndex + 1];
    if (body === undefined) {
      throw new Error('Missing value for --body.');
    }
    return body;
  }

  return env.PR_BODY || '';
}

function normalizeMarkdown(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function stripComments(text) {
  return text.replace(/<!--([\s\S]*?)-->/g, '').trim();
}

function normalizeEvidenceContent(text) {
  return stripComments(text)
    .replace(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .trim();
}

function extractSections(markdown) {
  const sections = [];
  const matches = [];
  let match;

  SECTION_HEADING_PATTERN.lastIndex = 0;
  while ((match = SECTION_HEADING_PATTERN.exec(markdown)) !== null) {
    matches.push({
      title: match.groups.title.trim(),
      index: match.index,
      contentStart: SECTION_HEADING_PATTERN.lastIndex,
    });
  }

  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];
    sections.push({
      title: current.title,
      content: markdown.slice(current.contentStart, next ? next.index : markdown.length).trim(),
    });
  }

  return sections;
}

function findValidationSection(markdown) {
  const sections = extractSections(markdown);
  return (
    sections.find((section) =>
      CONFIG.sectionTitlePatterns.some((pattern) => pattern.test(section.title)),
    ) || null
  );
}

function isPlaceholderOnly(sectionContent) {
  const cleaned = normalizeEvidenceContent(sectionContent)
    .replace(/^\s*[-*]\s*\[[ xX]\]\s*/gm, '')
    .replace(/^\s*[-*]\s*/gm, '')
    .trim();

  if (cleaned.length < 12) {
    return true;
  }

  return CONFIG.placeholderPatterns.some((pattern) => pattern.test(cleaned));
}

function evaluateValidationEvidence(markdown) {
  const body = normalizeMarkdown(markdown);
  const errors = [];
  const warnings = [];

  if (!body) {
    return {
      ok: false,
      errors: [
        'PR body is empty. Add a Validation Evidence section with commands/results or an explicit docs-only/waiver rationale.',
      ],
      warnings,
    };
  }

  const section = findValidationSection(body);
  if (!section) {
    return {
      ok: false,
      errors: [
        'Missing required Validation Evidence section. Add a heading named "Validation Evidence" and include commands/results.',
      ],
      warnings,
    };
  }

  const content = normalizeEvidenceContent(section.content);

  if (isPlaceholderOnly(content)) {
    errors.push(
      'Validation Evidence section is empty or placeholder-only. Paste real command results, a docs-only rationale, or a waiver with reason/approver.',
    );
  }

  const hasCommand = CONFIG.commandPattern.test(content);
  const hasPassResult = CONFIG.passResultPattern.test(content);
  const hasFailResult = CONFIG.failResultPattern.test(content);
  const hasDocsOnlyJustification =
    CONFIG.docsOnlyJustificationPattern.test(content) ||
    CONFIG.notApplicableJustificationPattern.test(content);
  const hasWaiver = CONFIG.waiverPattern.test(content);

  if (hasFailResult && !hasWaiver) {
    errors.push(
      'Validation Evidence mentions a failed result without a waiver. Fix the failure or document an approved waiver with reason/approver.',
    );
  }

  if (hasCommand && !hasPassResult && !hasWaiver) {
    errors.push(
      'Validation Evidence includes command(s) but no passing result. Add PASS/passed/succeeded evidence or an approved waiver.',
    );
  }

  if (!hasCommand && !hasDocsOnlyJustification && !hasWaiver) {
    errors.push(
      'Validation Evidence must include validation command results, a docs-only/manual-review rationale, or an approved waiver.',
    );
  }

  if (hasDocsOnlyJustification) {
    warnings.push(
      'Documentation-only/manual-review rationale detected. Ensure the PR is truly docs-only before merging.',
    );
  }

  if (hasWaiver) {
    warnings.push('Validation waiver detected. Ensure waiver is approved before merging.');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function printResult(result) {
  for (const warning of result.warnings) {
    console.warn(`::warning::${warning}`);
  }

  if (result.ok) {
    console.log('PR validation evidence guard passed.');
    return;
  }

  for (const error of result.errors) {
    console.error(`::error::${error}`);
  }
}

function main() {
  try {
    const body = readBodyFromArgs(process.argv.slice(2), process.env);
    const result = evaluateValidationEvidence(body);
    printResult(result);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  evaluateValidationEvidence,
  extractSections,
  findValidationSection,
};
