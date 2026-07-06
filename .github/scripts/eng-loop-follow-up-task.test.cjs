#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const followUp = require('./eng-loop-follow-up-task.cjs');

function sourceTask(overrides = {}) {
  return {
    id: 'task-22',
    title: 'ENG-LOOP-22 — Add follow-up task creation',
    url: 'https://app.notion.com/p/task-22',
    branch: 'chore/eng-loop-22-follow-up-task-creation',
    repository: 'dev-jeyelscott/garageos',
    priority: 'P1',
    ...overrides,
  };
}

function validationInput(overrides = {}) {
  return {
    source: 'validation',
    sourceTask: sourceTask(),
    ledgerPath: '.tmp/eng-loop-run-ledger.json',
    validation: {
      command: 'pnpm validate:quick',
      status: 'failed',
      classification: 'validation_failed',
      exitCode: 1,
      stderrSummary: 'apps/api lint failed on src/modules/example.ts',
      stdoutSummary: '',
    },
    ...overrides,
  };
}

function ciInput(overrides = {}) {
  return {
    source: 'ci',
    sourceTask: sourceTask(),
    ledgerPath: '.tmp/eng-loop-run-ledger.json',
    ci: {
      status: 'ci_failed',
      message: 'One or more required GitHub checks failed.',
      safe_to_mark_done: false,
      failed_checks: [
        {
          name: 'validate / validate-quick',
          conclusion: 'failure',
        },
      ],
    },
    ...overrides,
  };
}

function schema() {
  return {
    Task: { type: 'title' },
    Status: { type: 'status' },
    'Codex Ready': { type: 'checkbox' },
    Branch: { type: 'rich_text' },
    Repository: { type: 'rich_text' },
    Priority: { type: 'select' },
    Category: { type: 'select' },
    'Item Type': { type: 'select' },
    Milestone: { type: 'select' },
    Dependencies: { type: 'rich_text' },
    'Progress Source': { type: 'rich_text' },
    'Validation Commands': { type: 'rich_text' },
    'Commit Message': { type: 'rich_text' },
  };
}

class FakeClient {
  constructor({ existingPage = null, safe = true } = {}) {
    this.existingPage = existingPage;
    this.safe = safe;
    this.created = [];
  }

  async fetchDatabase() {
    return this.safe ? schema() : {};
  }

  async findExistingFollowUp() {
    return {
      dedupeSafe: this.safe,
      existingPage: this.existingPage,
    };
  }

  async createFollowUpTask(page) {
    this.created.push(page);
    return {
      id: 'created-follow-up',
      url: 'https://app.notion.com/p/created-follow-up',
    };
  }
}

function testValidationFailureCreatesFollowUpPayload() {
  const input = validationInput();
  const fingerprint = followUp.buildFollowUpFingerprint(input);
  const payload = followUp.buildFollowUpTaskPayload(input, {
    fingerprint,
    schema: schema(),
    detectedAt: '2026-07-06T00:00:00.000Z',
  });

  assert.equal(fingerprint.startsWith(followUp.FINGERPRINT_PREFIX), true);
  assert.equal(payload.model.category, 'Testing');
  assert.equal(payload.model.priority, 'P1');
  assert.equal(payload.model.itemType, 'Bug Fix');
  assert.equal(payload.model.status, 'Backlog');
  assert.equal(payload.model.codexReady, true);
  assert.equal(payload.properties.Status.status.name, 'Backlog');
  assert.equal(payload.properties['Codex Ready'].checkbox, true);
  assert.equal(payload.model.title.includes('ENG-LOOP-22-FOLLOW-UP'), true);
}

function testCiFailureCreatesFollowUpPayload() {
  const input = ciInput();
  const payload = followUp.buildFollowUpTaskPayload(input, { schema: schema() });

  assert.equal(payload.model.category, 'Reliability');
  assert.equal(payload.model.priority, 'P1');
  assert.equal(payload.model.commandOrCheck, 'validate / validate-quick');
  assert.equal(
    payload.model.failureSummary.includes('Failed checks: validate / validate-quick'),
    true,
  );
}

function testMissingRequirementCreatesFollowUpPayload() {
  const input = {
    source: 'manual',
    sourceTask: sourceTask(),
    failureKind: 'missing_requirement',
    failureSummary: 'Task implementation missed the documented dedupe stop condition.',
  };
  const payload = followUp.buildFollowUpTaskPayload(input, { schema: schema() });

  assert.equal(payload.model.category, 'Correctness');
  assert.equal(payload.model.itemType, 'Implementation Task');
  assert.equal(payload.model.priority, 'P1');
}

function testDiscoveredBugCreatesFollowUpPayload() {
  const input = {
    source: 'manual',
    sourceTask: sourceTask(),
    failureKind: 'discovered_bug',
    failureSummary: 'Follow-up task content omits run ledger reference.',
  };
  const payload = followUp.buildFollowUpTaskPayload(input, { schema: schema() });

  assert.equal(payload.model.category, 'Correctness');
  assert.equal(payload.model.itemType, 'Bug Fix');
}

function testFlakyAutomationCreatesFollowUpPayload() {
  const input = {
    source: 'manual',
    sourceTask: sourceTask(),
    failureKind: 'flaky_automation',
    failureSummary:
      'CI watcher intermittently reports missing required checks before GitHub posts checks.',
  };
  const payload = followUp.buildFollowUpTaskPayload(input, { schema: schema() });

  assert.equal(payload.model.category, 'Reliability');
  assert.equal(payload.model.priority, 'P2');
}

function testPassedValidationSkipsFollowUp() {
  const decision = followUp.shouldCreateFollowUp(
    validationInput({
      validation: {
        command: 'pnpm validate:quick',
        status: 'passed',
        classification: 'validation_passed',
      },
    }),
  );

  assert.equal(decision.create, false);
}

function testPassedCiSkipsFollowUp() {
  const decision = followUp.shouldCreateFollowUp(
    ciInput({
      ci: {
        status: 'ci_passed',
        safe_to_mark_done: true,
      },
    }),
  );

  assert.equal(decision.create, false);
}

async function testDuplicateFingerprintSuppressesTaskCreation() {
  const client = new FakeClient({ existingPage: { url: 'https://app.notion.com/p/existing' } });
  const result = await followUp.executeFollowUpCreation(validationInput(), {
    client,
    now: () => '2026-07-06T00:00:00.000Z',
  });

  assert.equal(result.status, 'deduped');
  assert.equal(client.created.length, 0);
  assert.equal(result.task_url, 'https://app.notion.com/p/existing');
}

async function testUniqueFailureCreatesExactlyOneTask() {
  const client = new FakeClient();
  const result = await followUp.executeFollowUpCreation(validationInput(), {
    client,
    now: () => '2026-07-06T00:00:00.000Z',
  });

  assert.equal(result.status, 'created');
  assert.equal(client.created.length, 1);
  assert.equal(result.task_url, 'https://app.notion.com/p/created-follow-up');
}

function testSensitiveOutputIsRedacted() {
  const sanitized = followUp.sanitizeFollowUpText(
    'token=github_pat_1234567890abcdefghijklmnop password=supersecret Bearer abc.def.ghi',
  );

  assert.equal(sanitized.includes('github_pat_1234567890'), false);
  assert.equal(sanitized.includes('supersecret'), false);
  assert.equal(sanitized.includes('Bearer abc.def.ghi'), false);
  assert.equal(sanitized.includes('[REDACTED'), true);
}

function testLedgerRecordsCreatedFollowUp() {
  const ledger = followUp.mergeFollowUpIntoLedger(
    { events: [] },
    {
      status: 'created',
      reason: 'validation_result_requires_follow_up',
      fingerprint: 'eng-loop-follow-up:abc123',
      task_title: 'ENG-LOOP-22-FOLLOW-UP-abc123 — Validation failure',
      task_url: 'https://app.notion.com/p/created-follow-up',
      created_at: '2026-07-06T00:00:00.000Z',
      message: 'Created one follow-up task.',
    },
    '2026-07-06T00:01:00.000Z',
  );

  assert.equal(ledger.follow_up_task.status, 'created');
  assert.equal(ledger.follow_up_task.fingerprint, 'eng-loop-follow-up:abc123');
  assert.equal(ledger.events.at(-1).type, 'follow_up_task_created');
}

async function testDedupeFailureFailsClosed() {
  const client = new FakeClient({ safe: false });

  await assert.rejects(
    () => followUp.executeFollowUpCreation(validationInput(), { client }),
    /no safe dedupe property/i,
  );
  assert.equal(client.created.length, 0);
}

async function run() {
  const tests = [
    testValidationFailureCreatesFollowUpPayload,
    testCiFailureCreatesFollowUpPayload,
    testMissingRequirementCreatesFollowUpPayload,
    testDiscoveredBugCreatesFollowUpPayload,
    testFlakyAutomationCreatesFollowUpPayload,
    testPassedValidationSkipsFollowUp,
    testPassedCiSkipsFollowUp,
    testDuplicateFingerprintSuppressesTaskCreation,
    testUniqueFailureCreatesExactlyOneTask,
    testSensitiveOutputIsRedacted,
    testLedgerRecordsCreatedFollowUp,
    testDedupeFailureFailsClosed,
  ];

  for (const test of tests) {
    await test();
    console.log(`passed: ${test.name}`);
  }

  console.log(`All ${tests.length} follow-up task creation tests passed.`);
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
