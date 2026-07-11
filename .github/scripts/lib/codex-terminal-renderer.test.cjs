'use strict';

const assert = require('node:assert/strict');
const {
  createCodexTerminalRenderer,
  redactForTerminal,
  shouldUseRawCodexEvents,
} = require('./codex-terminal-renderer.cjs');

function createMemoryStream() {
  const chunks = [];

  return {
    text() {
      return chunks.join('');
    },
    write(value) {
      chunks.push(String(value));
    },
  };
}

async function runCodexTerminalRendererTests() {
  assert.equal(shouldUseRawCodexEvents({ CODEX_OUTPUT: 'raw' }), true);
  assert.equal(shouldUseRawCodexEvents({ CODEX_OUTPUT: 'jsonl' }), true);
  assert.equal(shouldUseRawCodexEvents({ CODEX_OUTPUT: 'pretty' }), false);
  assert.equal(
    redactForTerminal('token=ghp_abcdefghijklmnopqrstuvwxyz123456'),
    'token=[redacted-github-token]',
  );
  assert.equal(
    redactForTerminal('api_key=sk-abcdefghijklmnopqrstuvwxyz123456'),
    'api_key=[redacted-api-key]',
  );
  assert.equal(redactForTerminal('token=plain-secret'), 'token=[redacted]');

  const stream = createMemoryStream();
  const renderer = createCodexTerminalRenderer({ stream });

  const line1 = JSON.stringify({
    item: { text: 'The metadata header is clean.', type: 'agent_message' },
    type: 'item.completed',
  });
  const line2 = JSON.stringify({
    item: {
      command: 'git diff --check',
      id: 'cmd-1',
      type: 'command_execution',
    },
    type: 'item.started',
  });
  const line3 = JSON.stringify({
    item: {
      command: 'git diff --check',
      exit_code: 0,
      id: 'cmd-1',
      type: 'command_execution',
    },
    type: 'item.completed',
  });
  const line4 = JSON.stringify({
    item: {
      command: 'pnpm validate:quick',
      exit_code: 1,
      id: 'cmd-2',
      stderr: 'dependency fetch blocked',
      type: 'command_execution',
    },
    type: 'item.completed',
  });
  renderer.write(line1.slice(0, 18));
  renderer.write(line1.slice(18) + '\n' + line2 + '\n' + line3 + '\n');
  renderer.write(line4);
  await renderer.end();

  const output = stream.text();
  assert.match(output, /Codex execution/);
  assert.match(output, /Codex/);
  assert.match(output, /metadata header is clean/);
  assert.match(output, /Check/);
  assert.match(output, /git diff --check/);
  assert.match(output, /Check passed/);
  assert.match(output, /Check failed/);
  assert.match(output, /dependency fetch blocked/);

  const disabledStream = createMemoryStream();
  const disabledRenderer = createCodexTerminalRenderer({
    enabled: false,
    stream: disabledStream,
  });
  disabledRenderer.write(line1 + '\n');
  await disabledRenderer.end();
  assert.equal(disabledStream.text(), '');
}

if (require.main === module) {
  runCodexTerminalRendererTests()
    .then(() => {
      console.log('✓ codex terminal renderer tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  runCodexTerminalRendererTests,
};
