#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { evaluateValidationEvidence } = require('./validate-pr-evidence.cjs');

const cases = [
  {
    name: 'accepts passing pnpm command evidence',
    body: `# Summary\n\nTest PR.\n\n## Validation Evidence\n\n\`\`\`text\npnpm validate:quick — PASS\npnpm validate:security — passed\n\`\`\``,
    expected: true,
  },
  {
    name: 'rejects empty body',
    body: '',
    expected: false,
  },
  {
    name: 'rejects missing validation section',
    body: '# Summary\n\nNo validation section.',
    expected: false,
  },
  {
    name: 'rejects placeholder validation evidence',
    body: '# Summary\n\n## Validation Evidence\n\nTBD',
    expected: false,
  },
  {
    name: 'rejects command without result',
    body: '# Summary\n\n## Validation Evidence\n\n- pnpm validate:quick',
    expected: false,
  },
  {
    name: 'accepts docs-only rationale',
    body: '# Summary\n\n## Validation Evidence\n\nDocumentation-only change. Manual review completed; no runtime validation required.',
    expected: true,
  },
  {
    name: 'accepts approved waiver',
    body: '# Summary\n\n## Validation Evidence\n\nWaiver: approved by repository owner. Reason: GitHub settings-only change cannot be validated locally.',
    expected: true,
  },
  {
    name: 'rejects failed command without waiver',
    body: '# Summary\n\n## Validation Evidence\n\n- pnpm validate:quick — failed',
    expected: false,
  },
];

for (const testCase of cases) {
  const result = evaluateValidationEvidence(testCase.body);
  assert.equal(result.ok, testCase.expected, `${testCase.name}: ${JSON.stringify(result.errors)}`);
}

console.log(`validate-pr-evidence tests passed (${cases.length} cases).`);
