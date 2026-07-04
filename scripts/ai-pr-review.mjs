#!/usr/bin/env node

const MARKER = '<!-- garageos-ai-review -->';
const DEFAULT_MAX_DIFF_CHARS = 60_000;
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';

const EXCLUDED_PATH_PATTERNS = [
  /(^|\/)node_modules\//i,
  /(^|\/)\.next\//i,
  /(^|\/)dist\//i,
  /(^|\/)build\//i,
  /(^|\/)coverage\//i,
  /(^|\/)\.turbo\//i,
  /(^|\/)\.cache\//i,
  /(^|\/)generated\//i,
  /(^|\/)__generated__\//i,
  /(^|\/)vendor\//i,
  /(^|\/)pnpm-lock\.yaml$/i,
  /(^|\/)package-lock\.json$/i,
  /(^|\/)yarn\.lock$/i,
  /(^|\/)bun\.lockb$/i,
  /(^|\/)npm-shrinkwrap\.json$/i,
  /\.generated\.[jt]sx?$/i,
  /\.min\.(js|css)$/i,
  /\.map$/i,
  /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|tgz|7z|rar|woff2?|ttf|eot|mp4|mov|avi|mp3|wav)$/i,
];

const SECRET_PATTERNS = [
  {
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },
  {
    pattern: /\bsk-[A-Za-z0-9_-]{10,}\b/g,
    replacement: '[REDACTED_OPENAI_KEY]',
  },
  {
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: '[REDACTED_AWS_ACCESS_KEY]',
  },
  {
    pattern: /\b(?:eyJ[A-Za-z0-9_-]{10,})\.(?:[A-Za-z0-9_-]{10,})\.(?:[A-Za-z0-9_-]{10,})\b/g,
    replacement: '[REDACTED_JWT]',
  },
  {
    pattern:
      /\b(api[_-]?key|authorization|bearer|client[_-]?secret|password|private[_-]?key|secret|token)\b\s*[:=]\s*['"]?[^'"\s]+/gi,
    replacement: '$1=[REDACTED_SECRET]',
  },
];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalIntEnv(name, fallback) {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer when provided.`);
  }

  return parsed;
}

function parseRepo(repository) {
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    throw new Error('GITHUB_REPOSITORY must be in owner/name form.');
  }

  return { owner, repo };
}

function buildGithubApiUrl(path) {
  const baseUrl = process.env.GITHUB_API_URL || 'https://api.github.com';
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

async function githubRequest(path, options = {}) {
  const token = requiredEnv('GITHUB_TOKEN');
  const response = await fetch(buildGithubApiUrl(path), {
    method: options.method || 'GET',
    headers: {
      Accept: options.accept || 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `GitHub API request failed: ${options.method || 'GET'} ${path} ` +
        `${response.status} ${response.statusText} ${responseText.slice(0, 500)}`,
    );
  }

  if (options.rawText) {
    return response.text();
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function githubPaginatedRequest(path) {
  const token = requiredEnv('GITHUB_TOKEN');
  let nextPath = path;
  const results = [];

  while (nextPath) {
    const response = await fetch(buildGithubApiUrl(nextPath), {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(
        `GitHub API request failed: GET ${nextPath} ` +
          `${response.status} ${response.statusText} ${responseText.slice(0, 500)}`,
      );
    }

    const page = await response.json();
    if (Array.isArray(page)) {
      results.push(...page);
    }

    nextPath = getNextPathFromLinkHeader(response.headers.get('link'));
  }

  return results;
}

function getNextPathFromLinkHeader(linkHeader) {
  if (!linkHeader) {
    return null;
  }

  const nextLink = linkHeader
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.endsWith('rel="next"'));

  if (!nextLink) {
    return null;
  }

  const match = nextLink.match(/<([^>]+)>/);
  if (!match) {
    return null;
  }

  const url = new URL(match[1]);
  return `${url.pathname}${url.search}`;
}

function getChangedFilePath(diffSection) {
  const firstLine = diffSection.split('\n', 1)[0] || '';
  const match = firstLine.match(/^diff --git a\/(.+?) b\/(.+)$/);

  if (!match) {
    return null;
  }

  return match[2] || match[1] || null;
}

function isExcludedPath(filePath) {
  return EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(filePath));
}

function filterDiff(diff) {
  const sections = diff.split(/(?=^diff --git )/m);
  const included = [];
  const excludedPaths = [];

  for (const section of sections) {
    if (section.trim() === '') {
      continue;
    }

    const filePath = getChangedFilePath(section);
    if (!filePath) {
      included.push(section);
      continue;
    }

    if (isExcludedPath(filePath)) {
      excludedPaths.push(filePath);
      continue;
    }

    included.push(section);
  }

  return {
    diff: included.join('').trim(),
    excludedPaths,
  };
}

function redactSecrets(input) {
  return SECRET_PATTERNS.reduce(
    (redacted, { pattern, replacement }) => redacted.replace(pattern, replacement),
    input,
  );
}

function truncateDiff(input, maxChars) {
  if (input.length <= maxChars) {
    return {
      text: input,
      truncated: false,
    };
  }

  return {
    text:
      input.slice(0, maxChars) +
      '\n\n[TRUNCATED: Diff exceeded MAX_DIFF_CHARS. Review may be incomplete.]',
    truncated: true,
  };
}

function buildPrompt({ pullRequest, filteredDiff, excludedPaths, truncated }) {
  const excludedSummary =
    excludedPaths.length === 0
      ? 'No generated/binary/lock/build artifacts were excluded.'
      : `Excluded ${excludedPaths.length} generated/binary/lock/build artifact(s): ${excludedPaths
          .slice(0, 30)
          .join(', ')}${excludedPaths.length > 30 ? ', ...' : ''}`;

  return `You are reviewing a GarageOS pull request as an advisory senior engineer.

GarageOS source-of-truth rules:
- Documentation, approved architecture decisions, and existing code patterns are authoritative.
- Do not recommend undocumented GarageOS scope.
- Preserve the modular monolith, tenant isolation, RBAC, branch access, subscription lifecycle gates, idempotency, auditability, transaction safety, financial immutability, ledger-first inventory, FIFO correctness, and mobile-first PWA constraints.
- Call out correctness, security, data integrity, authorization, reliability, observability, testing, and maintainability risks.
- Do not invent schema fields, permissions, routes, workflows, product features, or excluded capabilities.

Output requirements:
- Start with one concise verdict line.
- Then group findings by severity: Critical, High, Medium, Low.
- Use "No findings" for empty severity groups.
- For each finding include: file/path if known, risk, why it matters, and suggested fix.
- Keep this advisory and practical. Do not approve, block, or request changes.
- Do not include secrets, credentials, or raw tokens.

Pull request:
- Number: #${pullRequest.number}
- Title: ${pullRequest.title}
- Author: ${pullRequest.user?.login || 'unknown'}
- Base: ${pullRequest.base?.ref || 'unknown'}
- Head: ${pullRequest.head?.ref || 'unknown'}
- ${excludedSummary}
- Diff truncated: ${truncated ? 'yes' : 'no'}

PR description:
${pullRequest.body || '[No description provided]'}

Filtered and redacted diff:
${filteredDiff || '[No reviewable diff after filtering.]'}
`;
}

async function createOpenAiReview(prompt) {
  const apiKey = requiredEnv('OPENAI_API_KEY');
  const model = process.env.OPENAI_MODEL || process.env.OPENAI_REVIEW_MODEL || DEFAULT_OPENAI_MODEL;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions:
        'You are a careful, source-aligned code reviewer. Return only the requested PR review text.',
      input: prompt,
      max_output_tokens: 2_000,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `OpenAI Responses API request failed: ${response.status} ${response.statusText} ${responseText.slice(
        0,
        500,
      )}`,
    );
  }

  const data = await response.json();
  const outputText = extractOpenAiText(data);

  if (!outputText || outputText.trim() === '') {
    throw new Error('OpenAI response did not contain review text.');
  }

  return outputText.trim();
}

function extractOpenAiText(data) {
  if (typeof data.output_text === 'string') {
    return data.output_text;
  }

  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') {
        parts.push(content.text);
      }
    }
  }

  return parts.join('\n').trim();
}

function buildCommentBody({ review, pullRequest, diffStats }) {
  return `${MARKER}
## GarageOS AI PR Review

> Advisory only. Deterministic CI gates and human review remain authoritative.

${review}

---

**Review metadata**
- PR: #${pullRequest.number}
- Model: \`${process.env.OPENAI_MODEL || process.env.OPENAI_REVIEW_MODEL || DEFAULT_OPENAI_MODEL}\`
- Reviewable diff characters sent: ${diffStats.sentChars}
- Diff truncated: ${diffStats.truncated ? 'yes' : 'no'}
- Filtered artifacts: ${diffStats.excludedCount}
`;
}

async function upsertReviewComment({ owner, repo, prNumber, body }) {
  const comments = await githubPaginatedRequest(
    `/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`,
  );
  const existingComment = comments.find((comment) => comment.body?.includes(MARKER));

  if (existingComment) {
    await githubRequest(`/repos/${owner}/${repo}/issues/comments/${existingComment.id}`, {
      method: 'PATCH',
      body: { body },
    });

    console.log(`Updated existing GarageOS AI review comment ${existingComment.id}.`);
    return;
  }

  await githubRequest(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: 'POST',
    body: { body },
  });

  console.log('Created GarageOS AI review comment.');
}

async function main() {
  const repository = requiredEnv('GITHUB_REPOSITORY');
  const prNumber = requiredEnv('PR_NUMBER');
  const maxDiffChars = optionalIntEnv('MAX_DIFF_CHARS', DEFAULT_MAX_DIFF_CHARS);
  const { owner, repo } = parseRepo(repository);

  console.log(`Starting advisory GarageOS AI PR review for ${repository}#${prNumber}.`);

  const pullRequest = await githubRequest(`/repos/${owner}/${repo}/pulls/${prNumber}`);
  const rawDiff = await githubRequest(`/repos/${owner}/${repo}/pulls/${prNumber}`, {
    accept: 'application/vnd.github.v3.diff',
    rawText: true,
  });

  const { diff: filteredDiff, excludedPaths } = filterDiff(rawDiff);
  const redactedDiff = redactSecrets(filteredDiff);
  const { text: boundedDiff, truncated } = truncateDiff(redactedDiff, maxDiffChars);

  const prompt = buildPrompt({
    pullRequest,
    filteredDiff: boundedDiff,
    excludedPaths,
    truncated,
  });

  const review = await createOpenAiReview(prompt);
  const commentBody = buildCommentBody({
    review,
    pullRequest,
    diffStats: {
      sentChars: boundedDiff.length,
      truncated,
      excludedCount: excludedPaths.length,
    },
  });

  await upsertReviewComment({
    owner,
    repo,
    prNumber,
    body: commentBody,
  });

  console.log('Advisory GarageOS AI PR review completed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
