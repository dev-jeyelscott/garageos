# GarageOS Working Instructions

Follow these instructions throughout the GarageOS project.

These instructions are optimized for safe, accurate, step-by-step execution without redoing completed work.

---

## 1. Source of Truth

Always follow this priority order:

1. Project documentation
2. Approved architecture decisions / ADRs
3. Existing repository implementation when available
4. Previous chat handoff context
5. User-provided command output, screenshots, patches, ZIPs, pasted code, or uploaded files

Do not invent requirements, workflows, routes, schema fields, permissions, architecture behavior, or undocumented implementation details.

If documentation conflicts with repository implementation:

- Identify the conflict.
- Follow the approved documentation by default.
- Do not change documented behavior unless I explicitly approve a documentation update.

If repository state conflicts with previous chat context:

- Treat the current verified repository state as the implementation source of truth.
- If repository access is unavailable or GitHub appears behind my local state, ask for the minimum needed files, command output, screenshots, patch, or ZIP before giving code-specific changes.

---

## 2. Repository Access and GitHub Safety Rules

Repository reference:

```text
https://github.com/dev-jeyelscott/garageos
```

The GitHub repository is read-only for AI-assisted work.

Do not assume you can clone, refresh, modify, commit, push, or directly update the GitHub repository unless tool access actually proves that capability in the current chat.

For every coding, debugging, refactoring, implementation, or file-update session:

1. Inspect available repository files only when repository access is actually available in the current chat/tool environment.
2. If repository access is unavailable, clearly say so.
3. Ask for the minimum needed files, command output, screenshots, patch, ZIP, or pasted code before giving code-specific changes.
4. Use user-provided files and command output as the current implementation source of truth.
5. Review only the files relevant to the current step unless a broader issue appears.
6. Confirm existing file paths and current implementation patterns before proposing changes.
7. Verify whether the last completed step is committed/pushed only from user-provided `git status`, logs, screenshots, or repository output.
8. Try proposed changes locally only when tool access allows.
9. Run validation commands only when tool access allows.
10. Do not claim validation passed unless it actually ran and passed.

Allowed:

- Inspect repository files if accessible.
- Read user-provided repository files, command output, screenshots, patches, ZIPs, or pasted code.
- Make local sandbox changes only when tool access allows.
- Run local validation commands only when tool access allows.
- Provide patches, replacement files, diffs, commands, and commit messages for the user to apply locally.

Not allowed:

- Do not run `git push`.
- Do not create, update, or delete remote branches.
- Do not open, update, merge, or close pull requests.
- Do not commit directly to GitHub.
- Do not edit files through the GitHub UI, GitHub API, GitHub MCP, or any remote repository write tool.
- Do not change GitHub repository settings, secrets, workflows, issues, releases, tags, or permissions.
- Do not perform any action that mutates the remote repository.

All implementation changes must be returned as instructions, patches, diffs, commands, or code blocks.

The user is responsible for applying, committing, and pushing changes.

---

## 3. Continuity Rules

Continue from the last completed step, not from the beginning.

Do not restart the project explanation unless I ask.

Do not re-explain completed milestones or completed steps.

Do not redo completed work unless:

- The verified repository state shows it is missing.
- Tests or typecheck prove it is broken.
- A later requirement requires a targeted refactor.
- I explicitly ask to revisit it.

When continuing from a previous step, first identify:

- Last completed step
- Current milestone
- Next incomplete step
- Files likely affected
- Validation commands to run

Then proceed directly.

When I provide an error, failed test, typecheck output, screenshot, or file content:

- Diagnose the failure.
- Focus on the smallest safe fix.
- Do not redesign unrelated areas.
- Do not move to the next step until the current failure is fixed or explicitly deferred.

When I say:

```text
all pass
```

Treat the current step as completed and provide:

1. Short completion confirmation
2. Meaningful commit message
3. Next recommended step
4. Copy-paste next-chat handoff prompt

---

## 4. Execution Modes

Use the mode that matches the request.

### Planning Mode

Use when starting a milestone, defining a feature, or creating a specification.

Use this format:

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

Use when implementing a step.

Use this format:

```md
## Step X.Y — Step Name

### Objective

### Repository Review

### Documentation Alignment

### Files to Update

### Implementation

### Validation Commands

### Expected Result

### Risks / Notes

### Commit Message

### Next-Chat Handoff Prompt
```

If repository access is unavailable, the `Repository Review` section must clearly state what was unavailable and what user-provided files/output were used instead.

### Debugging Mode

Use when I provide an error, failed test, broken command, or screenshot.

Use this format:

```md
## Diagnosis

## Root Cause

## Minimal Fix

## Files to Update

## Validation Commands

## Expected Result

## Commit Message
```

Focus only on the failing area unless the failure proves a larger design issue.

### Status Mode

Use when I ask what is done, what remains, or how far we are.

Use a compact checklist or table.

Mark items as:

- Done
- In progress
- Not started
- Blocked
- Needs repo verification

Do not include code patches in Status Mode unless I ask.

---

## 5. Step Sizing Rules

Work in small, safe, testable increments.

Each step should be independently understandable, testable, and commit-ready.

Prefer one focused step per response, especially during Milestone 2 and other foundation work.

A good step usually includes:

- One primary objective
- A small set of affected files
- Unit tests or contract tests where practical
- Typecheck/test validation
- One meaningful commit message
- One next-chat handoff prompt

Do not bundle unrelated changes just to move faster.

Speed comes from avoiding rework, not unsafe batching.

---

## 6. Implementation Standards

All recommendations must be production-ready.

Always consider:

- Security
- Tenant isolation
- Branch access
- Permission enforcement
- Subscription status gates
- Validation
- Error handling
- Idempotency
- Optimistic locking or row locking where required
- Transaction boundaries
- Audit logging
- Observability
- Testing
- Backward compatibility
- Deployment impact
- Maintainability

Backend and database enforcement are authoritative.

UI checks are helpful but must never be the only enforcement.

---

## 7. GarageOS Architecture Rules

Respect the approved GarageOS architecture:

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

## 8. Validation Rules

For every implemented step, provide exact validation commands.

Prefer commands that match the repository scripts.

Common commands:

```bash
pnpm --filter @garageos/api typecheck
pnpm --filter @garageos/api test
pnpm --filter @garageos/api test -- --reporter=verbose
pnpm lint
```

Never say validation passed unless it actually ran and passed.

If validation cannot be run in the current chat/tool environment, say:

```text
Validation not run here. Please run:
[commands]
```

When validation fails:

- Diagnose from the output.
- Provide the minimal fix.
- Do not move to the next step until fixed or explicitly deferred.

When validation passes:

- Mark the step ready for commit.
- Provide a meaningful commit message.
- Provide the next-chat handoff prompt.

---

## 9. Commit Message Rule

At the end of every completed step, provide one meaningful commit message.

Use this format:

```bash
git commit -m "type(scope): short summary"
```

Examples:

```bash
git commit -m "feat(auth): add tenant context resolver scaffold"
git commit -m "test(auth): cover refresh session rotation policy"
git commit -m "fix(api): preserve correlation id in error envelopes"
git commit -m "refactor(shared): centralize transaction boundary helper"
```

Allowed conventional commit types include:

- `feat`
- `fix`
- `test`
- `refactor`
- `docs`
- `chore`

Commit messages are suggestions for the user to run locally.

The assistant must not commit or push to the actual GitHub repository.

---

## 10. Next-Chat Handoff Prompt Rule

After every completed step, provide a copy-paste next-chat handoff prompt.

The handoff prompt is the only place where the full completion ledger and tracking block must appear.

The generated handoff prompt must always include:

1. Project context
2. Repository URL
3. Current milestone
4. Last completed step
5. Current / next step
6. Full completion ledger with icons
7. Known validation status
8. Known repository caveats
9. Files changed or likely affected
10. Exact validation commands
11. Any failing output or unresolved issue, if applicable
12. Meaningful commit message already provided
13. Instruction to inspect available repository context before coding
14. Instruction to ask for files/output if repository access is unavailable
15. Instruction to verify whether the last step is committed and pushed using user-provided repository output
16. Instruction not to redo completed work unless repo verification shows it is missing or broken
17. Instruction that the GitHub repository is read-only for AI-assisted work
18. Instruction that all changes must be returned as patches, commands, or code blocks

Use this icon format inside the generated handoff prompt:

```md
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

- None / GitHub main may be behind local state / repository access unavailable / describe caveat
```

Use this required next-chat handoff prompt format:

````md
Continue GarageOS Milestone [N] from after Step [X.Y].

Repository:
https://github.com/dev-jeyelscott/garageos

Important:
Do not update GitHub directly. Use repository inspection only when available. Return patches/instructions for me to apply locally.

Important repository access rule:
Do not assume you can clone, refresh, modify, commit, push, or directly update the GitHub repository. Inspect repository files only if they are available in the current chat/tool environment. If repository access is unavailable, ask for the minimum needed files, command output, screenshots, patch, or ZIP before giving code-specific patches.

Important GitHub safety rule:
The GitHub repository is read-only for AI-assisted work. Do not update the actual GitHub repository directly. Do not push, create remote branches, open pull requests, edit GitHub files, update GitHub settings, or use any remote write operation. Return all changes as local patches, commands, or code blocks for the user to apply.

Before coding:
Inspect available repository context, user-provided files, command output, package scripts, tests, and implementation patterns. Use verified repository state as the current implementation source of truth alongside the GarageOS documentation.

Verify whether Step [X.Y] is committed/pushed using available repository output or user-provided command output before proposing changes. If the repo is missing recent local changes, ask for the current files, command output, screenshots, patch, or ZIP before giving code-specific patches.

Current milestone:
Milestone [N] — [Milestone Name]

Last completed step:
✅ Step [X.Y] — [Step Name]

Current / ongoing:
🔄 Step [X.Y] — [Step Name]

Pending:
🕒 Step [X.Y] — [Step Name]

Next task:
Implement Step [X.Y] — [Step Name] safely and incrementally.

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

- None / GitHub main may be behind local state / repository access unavailable / describe caveat

Files changed in last step:

- path/to/file.ts
- path/to/file.spec.ts

Files likely affected next:

- path/to/file.ts
- path/to/file.spec.ts

Validation commands:

```bash
pnpm --filter @garageos/api typecheck
pnpm --filter @garageos/api test
pnpm --filter @garageos/api test -- --reporter=verbose
```

Last commit message provided:

```bash
git commit -m "type(scope): short summary"
```

Rules:

- Do not redo completed steps unless verified repo state shows they are missing or broken.
- Follow GarageOS documentation, approved architecture decisions, and existing repository patterns.
- Keep changes incremental, production-ready, and test-covered.
- Consider security, tenant isolation, permissions, validation, transactions, audit logs, observability, testing, and maintainability.
- Do not claim validation passed unless it actually ran and passed.
- Do not update the actual GitHub repository directly.
- Do not push, open pull requests, create remote branches, or use any remote write operation.
- Return exact file changes, validation commands, expected result, commit message, and the next-chat handoff prompt.
````

---

## 11. Current Milestone 2 Handoff Prompt Seed

Use this as the current next-chat prompt until Step 2.34 is completed. Update the ledger after each completed step.

````md
Continue GarageOS Milestone 2 from after Step 2.33.

Repository:
https://github.com/dev-jeyelscott/garageos

Important:
Do not update GitHub directly. Use repository inspection only when available. Return patches/instructions for me to apply locally.

Important repository access rule:
Do not assume you can clone, refresh, modify, commit, push, or directly update the GitHub repository. Inspect repository files only if they are available in the current chat/tool environment. If repository access is unavailable, ask for the minimum needed files, command output, screenshots, patch, or ZIP before giving code-specific patches.

Important GitHub safety rule:
The GitHub repository is read-only for AI-assisted work. Do not update the actual GitHub repository directly. Do not push, create remote branches, open pull requests, edit GitHub files, update GitHub settings, or use any remote write operation. Return all changes as local patches, commands, or code blocks for the user to apply.

Before coding:
Inspect available repository context, user-provided files, command output, package scripts, tests, and implementation patterns. Use verified repository state as the current implementation source of truth alongside the GarageOS documentation.

Verify whether Step 2.33 is committed/pushed using available repository output or user-provided command output before proposing changes. If the repo is missing recent local changes, ask for the current files, command output, screenshots, patch, or ZIP before giving code-specific patches.

Current milestone:
Milestone 2 — API Foundation, Auth, Tenant Context, RBAC.

Last completed step:
✅ Step 2.33 — session endpoint with real authenticated context.

Current / ongoing:
🔄 Step 2.34 — route-level auth/tenant/permission/branch guard wiring.

Pending:
🕒 Step 2.35 — idempotency persistence integration.
🕒 Step 2.36 — audit persistence integration for auth/access events.
🕒 Step 2.37 — integration/security test hardening.
🕒 Step 2.38 — auth/session UI screens, if Milestone 2 includes frontend closure.

Next task:
Implement Step 2.34 — route-level auth/tenant/permission/branch guard wiring safely and incrementally.

## Completion Ledger

### Completed

- ✅ Step 2.1 — NestJS API uses `/api/v1`.
- ✅ Step 2.2 — response envelope, error envelope, request_id/correlation_id middleware/interceptor/filter added.
- ✅ Step 2.3 — stable API error codes and `GarageOsApiException` classes added.
- ✅ Step 2.4 — `ZodValidationPipe` added and fixed for `exactOptionalPropertyTypes`.
- ✅ Step 2.5 — Auth module skeleton added.
- ✅ Step 2.6 — documented `/api/v1/auth/*` route stubs added.
- ✅ Step 2.7 — auth DTO/schema validation aligned with API contracts.
- ✅ Step 2.8 — password hashing boundary added.
- ✅ Step 2.9 — access token signing boundary added.
- ✅ Step 2.10 — refresh session persistence boundary added.
- ✅ Step 2.11 — login context repository boundary added.
- ✅ Step 2.12 — auth module provider wiring added.
- ✅ Step 2.13 — login service behavior scaffolded.
- ✅ Step 2.14 — refresh token service behavior scaffolded.
- ✅ Step 2.15 — auth controller cookie handling added.
- ✅ Step 2.16 — auth response contract alignment.
- ✅ Step 2.17 — auth tests hardened.
- ✅ Step 2.18 — tenant context scaffold.
- ✅ Step 2.19 — tenant status guard scaffold.
- ✅ Step 2.20 — permission guard scaffold.
- ✅ Step 2.21 — branch access policy scaffold.
- ✅ Step 2.22 — platform support access policy.
- ✅ Step 2.23 — auth repository integration.
- ✅ Step 2.24 — refresh session repository integration.
- ✅ Step 2.25 — authorization module provider boundary.
- ✅ Step 2.26 — auth rate-limit policy boundary.
- ✅ Step 2.27 — auth session repository/service wiring plan.
- ✅ Step 2.28 — login real behavior with password verification.
- ✅ Step 2.29 — refresh-token rotation.
- ✅ Step 2.30 — logout/logout-all session revocation.
- ✅ Step 2.31 — forgot/reset/change password behavior.
- ✅ Step 2.32 — email verification behavior.
- ✅ Step 2.33 — session endpoint with real authenticated context.

### Current / Ongoing

- 🔄 Step 2.34 — route-level auth/tenant/permission/branch guard wiring.

### Pending Queue

- 🕒 Step 2.35 — idempotency persistence integration.
- 🕒 Step 2.36 — audit persistence integration for auth/access events.
- 🕒 Step 2.37 — integration/security test hardening.
- 🕒 Step 2.38 — auth/session UI screens, if Milestone 2 includes frontend closure.

### Known Validation Status

- typecheck: pass from previous step
- tests: pass from previous step
- lint: unknown
- git status: unknown

### Known Repository Caveats

- Repository access may be unavailable in the current chat/tool environment.
- GitHub main may be behind local state; verify using user-provided repository output before code-specific patches.

Files likely affected next:

- `apps/api/src/modules/auth/**`
- `apps/api/src/modules/authorization/**`
- `apps/api/src/common/**`
- Existing controller/spec files for protected route wiring
- Relevant guard/decorator/test files discovered during repository review

Validation commands:

```bash
pnpm --filter @garageos/api typecheck
pnpm --filter @garageos/api test
pnpm --filter @garageos/api test -- --reporter=verbose
```

Last commit message provided:

```bash
git commit -m "feat(auth): add authenticated session endpoint"
```

Rules:

- Do not redo completed steps unless verified repo state shows they are missing or broken.
- Follow GarageOS documentation, approved architecture decisions, and existing repository patterns.
- Keep changes incremental, production-ready, and test-covered.
- Consider security, tenant isolation, permissions, validation, transactions, audit logs, observability, testing, and maintainability.
- Do not claim validation passed unless it actually ran and passed.
- Do not update the actual GitHub repository directly.
- Do not push, open pull requests, create remote branches, or use any remote write operation.
- Return exact file changes, validation commands, expected result, commit message, and the next-chat handoff prompt.
````
