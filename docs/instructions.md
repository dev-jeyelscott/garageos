# GarageOS Working Instructions

Always read this file before GarageOS work. Keep responses accurate, source-aligned, and concise.

---

## 1. Source of Truth

Follow this priority order:

1. Project documentation
2. Accepted ADRs / architecture decisions
3. Verified repository implementation, when available
4. Previous chat handoff context
5. User-provided command output, screenshots, ZIPs, pasted code, uploaded files, or local file contents

Rules:

- Do not invent requirements, routes, workflows, schema fields, permissions, architecture behavior, or undocumented implementation details.
- If documentation conflicts with implementation, identify the conflict and follow approved documentation unless I explicitly approve a documentation change.
- If repo state conflicts with chat history, trust verified repo state.
- If repo access is unavailable or GitHub may be behind local state, ask only for the minimum needed files/output before giving code-specific changes.

---

## 2. Repository and GitHub Safety

Repository:

```text
https://github.com/dev-jeyelscott/garageos
```

The GitHub repository is read-only for AI-assisted work.

Do:

- Inspect repository files only when tool access is available.
- Use user-provided files/output as the current implementation source when repo access is unavailable.
- Review only files relevant to the current step unless a broader issue is proven.
- Confirm paths, package scripts, tests, naming conventions, module boundaries, and current implementation patterns before proposing code changes.
- Run local validation only when tool access allows.
- State clearly when validation was not run.

Do not:

- Push, commit, create branches, open PRs, edit GitHub files, change settings/secrets/workflows, or perform any remote write operation.
- Claim validation passed unless it actually ran and passed.
- Return Git patch files, `.patch` files, `git apply` instructions, or unified-diff output unless I explicitly ask for a patch.

Implementation changes must be returned as copy-paste-ready code blocks and local instructions. I apply, validate, commit, and push changes.

---

## 3. Continuity Rules

Continue from the last completed step. Do not restart the project explanation or redo completed work unless:

- Verified repo state shows the work is missing.
- Tests/typecheck prove it is broken.
- A later requirement requires a targeted refactor.
- I explicitly ask to revisit it.

When continuing, first identify:

- Last completed step
- Current milestone
- Next incomplete step
- Likely affected files
- Validation commands

When I provide an error, failed command, screenshot, or file content:

- Diagnose the failure.
- Fix the smallest safe area.
- Do not redesign unrelated code.
- Do not move to the next step until the issue is fixed or explicitly deferred.

When I say `all pass`, treat the current step as complete and provide:

1. Short completion confirmation
2. Commit message
3. Next recommended step
4. Next-chat handoff prompt

---

## 4. Execution Modes

### Planning Mode

Use for milestones, feature definitions, and specifications.

```md
## Understanding

## Documentation Alignment

## Impact

## Risks

## Proposed Plan

## Validation

## Acceptance Criteria
```

### Coding Mode

Use for implementation, refactoring, tests, or file updates.

```md
## Step X.Y — Step Name

### Objective

### Repository Review

### Documentation Alignment

### Files to Update

### Copy-Paste Changes

### Implementation Summary

### Validation Commands

### Expected Result

### Risks / Notes

### Commit Message

### Next-Chat Handoff Prompt
```

`Copy-Paste Changes` must include exact paths, action labels, and complete code blocks. If repo access is unavailable, state what was unavailable and which user-provided files/output were used.

### Debugging Mode

Use for errors, failed tests, broken commands, or screenshots.

```md
## Diagnosis

## Root Cause

## Minimal Fix

## Files to Update

## Copy-Paste Fix

## Validation Commands

## Expected Result

## Commit Message
```

### Status Mode

Use for progress/status questions. Provide a compact checklist or table using:

- Done
- In progress
- Not started
- Blocked
- Needs repo verification

Do not include code changes in Status Mode unless asked.

---

## 5. Copy-Paste Coding Delivery

Use the smallest safe format.

### Replace block

````md
### File: path/to/file.ts

Action: Replace block

Find this code:

```ts
old code
```

Replace it with:

```ts
new code();
```
````

### Insert block

````md
### File: path/to/file.ts

Action: Insert block

Insert this code after `specific existing line or block`:

```ts
new code();
```
````

### Remove block

````md
### File: path/to/file.ts

Action: Remove block

Remove this code:

```ts
old code
```
````

### Create file

````md
### File: path/to/new-file.ts

Action: Create file

```ts
full file content
```
````

### Replace entire file

````md
### File: path/to/file.ts

Action: Replace entire file

```ts
full file content
```
````

Rules:

- Always include exact file paths.
- Prefer targeted replacements over full-file replacement for large files.
- Keep code blocks syntactically complete and include required imports.
- Do not use placeholders unless clearly marked.
- Do not provide partial code that cannot compile unless the task is explanatory only.
- State surrounding placement when needed.
- Never say copy-paste changes were validated unless validation actually ran and passed.

Every implementation response should include files to update, copy-paste changes, validation commands, expected result, commit message, and next-chat handoff prompt.

---

## 6. Step Sizing

Work in small, safe, testable increments.

A good step has:

- One objective
- A small affected file set
- Tests where practical
- Exact validation commands
- Copy-paste-ready changes
- One commit message
- One next-chat handoff prompt

Do not bundle unrelated changes. Speed comes from avoiding rework, not unsafe batching.

---

## 7. Production Standards

Always consider:

- Security
- Tenant isolation
- Branch access
- Permission enforcement
- Subscription status gates
- Validation and error handling
- Idempotency
- Optimistic locking or row locking where required
- Transaction boundaries
- Audit logging
- Observability
- Testing
- Backward compatibility
- Deployment impact
- Maintainability

Backend and database enforcement are authoritative. UI checks improve UX but must never be the only enforcement.

---

## 8. GarageOS Architecture Rules

Respect the approved architecture:

- Mobile-first PWA
- TypeScript monorepo
- NestJS API
- REST API under `/api/v1`
- PostgreSQL 16+
- Modular monolith first
- Strict tenant isolation
- Branch-specific records scoped by both `tenant_id` and `branch_id`
- Response and error envelopes
- Request ID and correlation ID
- Zod validation where established
- Command/query separation where appropriate
- Idempotency for critical retryable writes
- Audit logging for critical actions
- Shared transaction wrapper for multi-record writes
- No excluded product scope

Do not introduce:

- Native mobile app scope
- Offline write sync
- Customer portal
- Standalone POS checkout
- Payroll
- Full accounting/general ledger
- Automatic subscription payment collection
- Two-factor authentication
- Microservices-first architecture
- Undocumented routes, permissions, schema fields, or workflows

---

## 9. Validation Rules

For implemented steps, provide exact validation commands matching repository scripts.

Common commands:

```bash
pnpm --filter @garageos/api typecheck
pnpm --filter @garageos/api test
pnpm --filter @garageos/api test -- --reporter=verbose
pnpm lint
```

If validation cannot be run here, say:

```text
Validation not run here. Please run:
[commands]
```

When validation fails:

- Diagnose from output.
- Provide the minimal fix.
- Keep scope limited to the failing area unless a larger issue is proven.

When validation passes:

- Mark the step ready for commit.
- Provide the commit message.
- Provide the next-chat handoff prompt.

---

## 10. Commit Message Rule

At the end of every completed step, provide one suggested local commit message:

```bash
git commit -m "type(scope): short summary"
```

Allowed types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`.

The assistant must not commit or push.

---

## 11. Next-Chat Handoff Prompt Rule

After every completed step, provide a copy-paste handoff prompt. Keep the full completion ledger inside the handoff prompt only.

The handoff must include:

- Project context and repository URL
- Current milestone
- Last completed step
- Current/next step
- Completion ledger with icons
- Validation status
- Repository caveats
- Files changed and likely affected next
- Summary of copy-paste changes
- Exact validation commands and expected result
- Failing output or unresolved issues, if any
- Commit message already provided
- Instructions to inspect repo context, ask for files/output if repo access is unavailable, verify commit/push status from user-provided output, avoid redoing completed work, keep GitHub read-only, and return copy-paste-ready changes by default

Use this compact template:

````md
Continue GarageOS Milestone [N] from after Step [X.Y].

Repository:
https://github.com/dev-jeyelscott/garageos

Important:
GitHub is read-only for AI-assisted work. Do not push, commit, create branches, open PRs, edit GitHub files/settings, or use remote write operations. Inspect available repo context first. If repo access is unavailable or behind local state, ask for the minimum needed files/output. Return copy-paste-ready code blocks by default; no patch files unless explicitly requested.

Current milestone:
Milestone [N] — [Milestone Name]

Last completed:
✅ Step [X.Y] — [Step Name]

Current / next:
🔄 Step [X.Y] — [Step Name]

## Completion Ledger

### Completed

- ✅ Step X.Y — short title

### Current / Ongoing

- 🔄 Step X.Y — short title

### Pending Queue

- 🕒 Step X.Y — short title

### Known Validation Status

- typecheck: pass/fail/not run
- tests: pass/fail/not run
- lint: pass/fail/not run
- git status: clean/dirty/unknown

### Known Repository Caveats

- None / GitHub may be behind local state / repo access unavailable / describe caveat

Files changed in last step:

- path/to/file.ts

Files likely affected next:

- path/to/file.ts

Copy-paste changes from last step:

- Created/updated/replaced: path/to/file.ts
- Summary: short summary

Validation commands:

```bash
pnpm --filter @garageos/api typecheck
pnpm --filter @garageos/api test
pnpm --filter @garageos/api test -- --reporter=verbose
```

Expected result:

```text
Typecheck passes.
Relevant tests pass.
No unrelated regressions are introduced.
```

Last commit message provided:

```bash
git commit -m "type(scope): short summary"
```

Rules:

- Do not redo completed work unless verified repo state shows it is missing or broken.
- Follow GarageOS docs, accepted ADRs, and existing repo patterns.
- Keep changes incremental, production-ready, test-covered, tenant-safe, permission-safe, auditable, observable, and maintainable.
- Do not claim validation passed unless it actually ran and passed.
````

---

## 12. Final Rule

Do not guess. Do not invent undocumented behavior. Do not update GitHub directly. Do not return patch files by default. Always align responses, recommendations, specs, and implementation guidance with GarageOS documentation.
