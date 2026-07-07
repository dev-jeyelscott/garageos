'use strict';

const DEFAULT_MAX_TEXT_LENGTH = 1600;

function shouldUseRawCodexEvents(env = process.env) {
  const value = String(env.CODEX_OUTPUT || env.CODEX_EVENTS || '')
    .trim()
    .toLowerCase();

  return value === 'raw' || value === 'jsonl' || value === '1' || env.RAW_CODEX_EVENTS === '1';
}

function redactForTerminal(value) {
  return String(value || '')
    .replace(/(gh[pousr]_[A-Za-z0-9_]+)/g, '[redacted-github-token]')
    .replace(/(sk-[A-Za-z0-9_-]{16,})/g, '[redacted-api-key]')
    .replace(
      /((?:password|token|secret|api[_-]?key)\s*[:=]\s*)(?!\[redacted[^\]]*\])[^\s"']+/gi,
      '$1[redacted]',
    );
}

function createCodexTerminalRenderer(options = {}) {
  const stream = options.stream || process.stdout;
  const enabled = options.enabled !== false;
  const maxTextLength = Number.isFinite(options.maxTextLength)
    ? options.maxTextLength
    : DEFAULT_MAX_TEXT_LENGTH;

  let buffer = '';
  let hasPrintedHeader = false;
  const activeCommands = new Map();

  function writeRaw(text) {
    if (!enabled) return;
    stream.write(text);
  }

  function nowLabel() {
    return new Date().toTimeString().slice(0, 8);
  }

  function ensureHeader() {
    if (hasPrintedHeader) return;
    hasPrintedHeader = true;
    writeRaw('\nCodex execution\n');
  }

  function writeBlock(title, body, blockOptions = {}) {
    if (!enabled) return;

    ensureHeader();

    const icon = blockOptions.icon ? blockOptions.icon + ' ' : '';
    writeRaw('\n[' + nowLabel() + '] ' + icon + title + '\n');

    const text = redactForTerminal(body).trim();
    if (!text) return;

    const trimmed =
      text.length > maxTextLength
        ? text.slice(0, maxTextLength).trimEnd() +
          '\n  ... output truncated; see codex-stdout.jsonl for full details'
        : text;

    for (const line of trimmed.split(/\r?\n/)) {
      writeRaw('  ' + line + '\n');
    }
  }

  function normalizeCommand(command) {
    const raw = Array.isArray(command) ? command.join(' ') : String(command || '').trim();

    if (!raw) return 'command';

    let normalized = raw
      .replace(/\\/g, '/')
      .replace(/\s+/g, ' ')
      .replace(
        /^"?C:\/WINDOWS\/System32\/WindowsPowerShell\/v1\.0\/powershell\.exe"?\s+-Command\s+/i,
        'powershell ',
      )
      .replace(/^"?powershell(?:\.exe)?"?\s+-Command\s+/i, 'powershell ')
      .trim();

    if (normalized.length > 180) {
      normalized = normalized.slice(0, 177).trimEnd() + '...';
    }

    return normalized;
  }

  function getText(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;

    if (Array.isArray(value)) {
      return value
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          if (entry && typeof entry.text === 'string') return entry.text;
          if (entry && typeof entry.content === 'string') return entry.content;
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }

    if (typeof value.text === 'string') return value.text;
    if (typeof value.content === 'string') return value.content;
    if (Array.isArray(value.content)) return getText(value.content);

    return '';
  }

  function getItem(event) {
    return event && typeof event === 'object' ? event.item || event.data || event : {};
  }

  function getItemType(event, item) {
    return String(item.type || event.item_type || event.type || '').toLowerCase();
  }

  function getCommandKey(item) {
    return String(
      item.id || item.call_id || item.command_id || item.name || item.command || Math.random(),
    );
  }

  function renderCommand(event, item, itemType) {
    const command = normalizeCommand(
      item.command || item.cmd || item.argv || item.args || item.name,
    );
    const key = getCommandKey(item);
    const eventType = String(event.type || '').toLowerCase();
    const status = String(item.status || event.status || '').toLowerCase();
    const exitCode = item.exit_code ?? item.exitCode ?? item.code ?? item.return_code;
    const output =
      getText(item.output) || getText(item.stdout) || getText(item.stderr) || getText(item.result);

    if (eventType.includes('started') || status === 'running' || status === 'started') {
      activeCommands.set(key, command);
      writeBlock('Check', command);
      return true;
    }

    const remembered = activeCommands.get(key) || command;
    activeCommands.delete(key);

    if (
      exitCode === 0 ||
      status === 'success' ||
      status === 'succeeded' ||
      status === 'completed'
    ) {
      writeBlock('Check passed', remembered, { icon: '✓' });
      return true;
    }

    if (exitCode != null || status === 'failed' || status === 'error') {
      const summary = [remembered, exitCode != null ? 'exit code: ' + exitCode : '', output]
        .filter(Boolean)
        .join('\n');

      writeBlock('Check failed', summary, { icon: '✗' });
      return true;
    }

    if (itemType.includes('command')) {
      writeBlock('Check', remembered + (output ? '\n' + output : ''));
      return true;
    }

    return false;
  }

  function renderFileChange(event, item, itemType) {
    const filePath = item.path || item.file || item.filename || item.name;

    if (
      !filePath ||
      !(itemType.includes('file') || itemType.includes('patch') || itemType.includes('diff'))
    ) {
      return false;
    }

    const action = String(item.action || item.status || event.action || '').toLowerCase();
    let title = 'Changed';

    if (action.includes('create') || action === 'added') title = 'Created';
    if (action.includes('delete') || action === 'removed') title = 'Deleted';
    if (action.includes('rename')) title = 'Renamed';

    writeBlock(title, String(filePath).replace(/\\/g, '/'));
    return true;
  }

  function renderAgentMessage(event, item, itemType) {
    if (
      !itemType.includes('message') &&
      !itemType.includes('reasoning') &&
      !itemType.includes('agent')
    ) {
      return false;
    }

    const text =
      getText(item.text) ||
      getText(item.message) ||
      getText(item.content) ||
      getText(event.text) ||
      getText(event.message);

    if (!text.trim()) return false;

    writeBlock(itemType.includes('reasoning') ? 'Reasoning' : 'Codex', text);
    return true;
  }

  function renderTurnSummary(event) {
    const eventType = String(event.type || '').toLowerCase();
    if (!eventType.includes('turn') && !eventType.includes('session')) {
      return false;
    }

    const usage = event.usage || event.token_usage || event.tokens || {};
    const lines = [];

    if (event.status) lines.push('status: ' + event.status);

    if (usage.input_tokens || usage.output_tokens || usage.total_tokens) {
      lines.push(
        'tokens: input=' +
          (usage.input_tokens || 0) +
          ', output=' +
          (usage.output_tokens || 0) +
          ', total=' +
          (usage.total_tokens || 0),
      );
    }

    if (!lines.length && !eventType.includes('completed')) return false;

    writeBlock('Codex summary', lines.join('\n') || eventType);
    return true;
  }

  function renderError(event, item) {
    const eventType = String(event.type || '').toLowerCase();
    if (!eventType.includes('error') && !item.error && !event.error) return false;

    const errorText =
      getText(item.error) ||
      getText(event.error) ||
      getText(item.message) ||
      getText(event.message) ||
      'Unknown Codex error';

    writeBlock('Codex error', errorText, { icon: '✗' });
    return true;
  }

  function renderEvent(event) {
    const item = getItem(event);
    const itemType = getItemType(event, item);

    if (renderError(event, item)) return;
    if (renderCommand(event, item, itemType)) return;
    if (renderFileChange(event, item, itemType)) return;
    if (renderAgentMessage(event, item, itemType)) return;
    if (renderTurnSummary(event)) return;

    const text = getText(event.text) || getText(event.message);
    if (text.trim()) writeBlock('Codex', text);
  }

  function renderLine(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return;

    try {
      renderEvent(JSON.parse(trimmed));
    } catch {
      writeBlock('Codex output', trimmed);
    }
  }

  function write(chunk) {
    if (!enabled) return;

    buffer += String(chunk || '');

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      renderLine(line);
    }
  }

  async function end() {
    if (enabled && buffer.trim()) {
      renderLine(buffer);
    }

    buffer = '';
  }

  return {
    end,
    renderEvent,
    renderLine,
    write,
  };
}

module.exports = {
  createCodexTerminalRenderer,
  redactForTerminal,
  shouldUseRawCodexEvents,
};
