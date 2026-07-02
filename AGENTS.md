# AGENTS.md

Guidance for AI agents, maintainers, and contributors working in this repository.

## Purpose

This file defines how AI-assisted work should be performed in GarageOS.

GarageOS is documentation-first. Approved product, architecture, schema, API, QA, UX, permission, and roadmap documents are binding implementation guidance. Agents must preserve scope, security, tenant isolation, branch isolation, data integrity, and existing repository conventions.

Do not use this file to introduce new product behavior. If this file conflicts with approved project documentation, the approved documentation wins.

---

## Token Budget and Response Control

Default to the smallest useful response that still preserves correctness, safety, and source alignment.

### Default Output Behavior

Use compact output by default for narrow tasks, including:

- Small bug fixes.
- Type errors.
- Failing tests with clear output.
- UI polish.
- Commit messages.
- Prompt revisions.
- Minor documentation wording updates.
- Single-file or small multi-file corrections.

For compact tasks:

- Do not restate GarageOS project background.
- Do not summarize source documents unless a conflict or risk is material to the change.
- Do not list unaffected architecture, database, API, UI, permission, or testing areas.
- Do not provide a next-chat handoff prompt unless the user asks for one or the step materially benefits from it.
- Do not output full files unless the file is small, the user requested full files, or a full replacement is safer than a targeted edit.
- Prefer root cause, changed files, minimal changes, validation commands, and commit message.

Use expanded output only when the task is high risk or explicitly asks for planning, architecture, or a full handoff.

### Expanded Output Triggers

Use expanded documentation-first output for:

- New milestones.
- New modules.
- Schema or migration changes.
- API contract changes.
- Authentication, authorization, RBAC, permissions, branch access, or tenant lifecycle changes.
- Financial workflows.
- Inventory, FIFO, reservations, transfers, or stock-affecting workflows.
- Supplier returns, payments, receipts, refunds, voids, exports, tenant deletion, or audit-sensitive workflows.
- Security-sensitive changes.
- Architecture decisions, ADRs, or cross-cutting refactors.
- Production-readiness reviews.
- Any task where missing context could create unsafe or undocumented behavior.

### Documentation Use

Always follow the approved documentation, but read and cite only the documentation that is relevant to the current task. Do not reload or restate every source document when the change is narrow and the applicable behavior is already clear.

---

## Project Snapshot

GarageOS is a TypeScript `pnpm` monorepo for a mobile-first motorcycle shop management SaaS.

- Frontend: `apps/web` — Next.js + React PWA.
- API: `apps/api` — NestJS modular monolith.
- Background workers: `apps/worker`.
- Scheduled jobs: `apps/scheduler`.
- Shared packages: `packages/shared`, `packages/api-client`, `packages/config`, `packages/db`, `packages/test-utils`.
- Database: PostgreSQL 16+.
- Migrations: versioned `node-pg-migrate` migrations in `packages/db/migrations`.

The approved architecture is modular monolith first, PostgreSQL-backed, REST/JSON under `/api/v1`, tenant-isolated, branch-aware, audit-friendly, idempotent for critical writes, and mobile-first.

---

## Required First Step

Before planning, reviewing, coding, debugging, or generating a handoff:

1. Read `Instructions.txt` if present.
2. Check `git status -sb` if repository access is available.
3. Identify the current milestone, current slice, and last completed step from the user’s latest handoff or verified repository state.
4. Read only the relevant documentation and files for the current task.
5. Proceed with the smallest safe change.

Do not restart the project explanation unless explicitly requested.

---

## Source of Truth

When behavior, schema, API shape, scope, permissions, or workflow is unclear, follow this order:

1. Approved product requirements:

   - `docs/requirements-v2.4.md`
   - or the latest approved `docs/requirements*.md`

2. Database design:

   - `docs/database-design.md`

3. Database schema:

   - `docs/database-schema.md`

4. Architecture:

   - `docs/architecture.md`

5. API contracts:

   - `docs/api-contracts.md`

6. Requirements traceability:

   - `docs/requirements-traceability-matrix.md`

7. User stories:

   - `docs/user-stories.md`

8. Permission matrix:

   - `docs/permission-matrix.md`

9. UX screen map:

   - `docs/ux-sreen-map.md`
   - Keep the existing filename spelling if that is the repository filename.

10. QA and acceptance plan:

- `docs/qa-acceptance-test-plan.md`

11. Tech stack:

- `docs/tech-stack.md`

12. Accepted ADRs / ARDs:

- `docs/adr/*`
- `docs/garageos-architecture-records.md`

13. Build roadmap:

- `docs/garageos-build-roadmap-v1.3.md`
- or the latest approved roadmap document

14. Existing implementation in the current checkout
15. User-provided command output, pasted files, screenshots, ZIPs, or local file contents

If implementation conflicts with higher-priority documentation:

- Call out the conflict.
- Follow the approved documentation by default.
- Do not change documented behavior unless the user explicitly approves a documentation update.

If repository state conflicts with previous chat context:

- Treat the current verified repository state as implementation truth.
- Ask for the minimum missing files or command output only when necessary.

---

## Scope Guardrails

GarageOS must stay within approved scope.

Allowed scope includes the documented mobile-first PWA, multi-tenant SaaS backend, PostgreSQL schema, tenant lifecycle, subscriptions, platform administration, auth, RBAC, branch access, shop operations, service workflows, inventory/FIFO, purchases/AP, invoicing/payments/AR, expenses, reminders, notifications, files, exports, reports, audit logs, background jobs, observability, backup, and launch readiness.

Do not implement, imply, scaffold, or expose undocumented features, including:

- Native iOS or Android apps.
- Offline writes, mutation queues, sync conflict resolution, or offline approvals.
- Customer portal or customer login.
- Standalone POS checkout independent of job orders or service invoices.
- Payroll, commissions, salaries, payslips, or payroll contributions.
- Full accounting/general ledger, chart of accounts, journal entries, formal close, or bank reconciliation.
- Direct BIR/tax filing.
- E-commerce marketplace, online store, public checkout, or delivery workflow.
- Loyalty program.
- Service packages.
- AI forecasting, predictive analytics, or custom BI beyond defined reports.
- Automatic subscription payment collection.
- Two-factor authentication.
- Microservices-first architecture.
- Undocumented routes, permissions, tables, columns, enums, screens, workflows, integrations, or background jobs.

Missing details must become an explicit gap, ADR, clarification, or downstream artifact. Do not fill gaps with invented behavior.

---

## Architecture Rules

Follow the approved GarageOS architecture:

- Mobile-first PWA.
- TypeScript monorepo.
- NestJS API.
- Modular monolith first.
- PostgreSQL 16+ transactional source of truth.
- REST/JSON API under `/api/v1`.
- Explicit workflow action endpoints instead of arbitrary status patches.
- API request and response payloads use `snake_case`.
- Tenant context is derived from the authenticated session.
- Tenant-owned records require `tenant_id`.
- Branch-specific operational records require both `tenant_id` and `branch_id`.
- Branch access is separate from permission access.
- Backend and database enforcement are authoritative.
- UI restrictions are UX assistance only.
- Critical retryable writes require idempotency where documented.
- Mutable records use optimistic locking where documented.
- High-risk transactional workflows use row locks or equivalent concurrency safeguards.
- Inventory is ledger-first.
- FIFO cost layers, FIFO allocations, and FIFO consumptions must preserve FIFO correctness.
- Financial, receipt, refund, inventory ledger, FIFO, and audit records are immutable or correction-only where documented.
- Critical state changes require audit logs.
- Observability must use safe structured logs, request IDs, and correlation IDs.
- Background work must be retry-safe, observable, and idempotent where side effects could duplicate.

---

## Security and Isolation Rules

Every implementation and review must consider:

- Authentication.
- Email verification gates.
- Tenant lifecycle gates.
- Subscription status gates.
- Permission checks.
- Branch access checks.
- Tenant isolation.
- Branch isolation.
- Plan limits.
- Input validation.
- Output sanitization.
- Idempotency.
- Optimistic locking or row locking.
- Transaction boundaries.
- Audit logging.
- Sensitive-data redaction.
- Observability.
- Regression coverage.
- Deployment impact.

Never trust these from client payloads:

- `tenant_id` for tenant-scoped operations.
- Permissions.
- Branch access.
- Actor identity.
- Subscription status.
- Plan capabilities.
- Audit actor metadata.

Never return, log, export, or include in audit payloads:

- Plaintext passwords.
- Password reset tokens.
- Email verification tokens.
- Access tokens.
- Refresh tokens.
- Provider secrets.
- Full card data.
- Sensitive free text beyond documented safe summaries.

---

## Repository Conventions

Use existing repository patterns before adding new abstractions.

General rules:

- Use TypeScript throughout.
- Keep module boundaries explicit.
- Keep controllers thin: validate, authorize, call application services, return envelopes.
- Put business rules in application/domain services, not controllers or UI components.
- Keep repositories tenant/branch scoped by design.
- Use existing transaction utilities for multi-record writes.
- Use Zod validation where established.
- Keep files focused by use case.
- Avoid duplicate logic.
- Avoid unnecessary abstraction.
- Avoid broad rewrites.
- Preserve unrelated dirty worktree changes.
- Put tests next to affected code using `*.spec.ts` or `*.test.ts`.
- Update `.env.example` when adding required configuration.
- Never commit secrets.

Backend module shape should follow existing patterns, generally:

```text
module/
  api/
  application/
  domain/
  persistence/
  policies/
  events/
  tests/
```

Shared packages must contain cross-cutting primitives, generated/shared contracts, test utilities, or configuration. Do not move domain-specific service logic into shared packages unless documentation or existing architecture supports it.

---

## API Rules

Preserve documented API behavior:

- Base path: `/api/v1`.
- REST over HTTPS.
- JSON request/response bodies unless binary file flow is documented.
- Payload fields use `snake_case`.
- Enum values match documented lowercase API-safe values.
- Successful responses use the documented `data` + `meta` envelope.
- Error responses use the documented `error` envelope.
- Responses include request and correlation metadata.
- Accept `X-Correlation-ID`; generate one when missing.
- Use stable error codes.
- Use cursor pagination for high-volume lists.
- Use explicit action endpoints for workflow transitions.
- Use `Idempotency-Key` for documented critical writes.
- Preserve documented route names, headers, error codes, and envelope shapes.
- Do not expose undocumented endpoints for excluded or unapproved capabilities.

Critical writes must not duplicate side effects under retry.

---

## Database and Migration Rules

Database changes must preserve production safety and documented schema intent.

Rules:

- Migrations are version-controlled.
- Migrations must be production-safe.
- Seed scripts must be idempotent.
- Use PostgreSQL constraints, indexes, foreign keys, checks, unique constraints, and locks to protect invariants where practical.
- Money uses fixed precision.
- Quantities use fixed precision.
- Do not use floating-point types for money or inventory quantities.
- Do not directly edit issued or posted financial records, inventory ledger records, receipts, refunds, FIFO history, or audit logs.
- Prefer soft deletion/deactivation unless tenant deletion lifecycle requires hard deletion.
- Destructive migrations require explicit approval, rollback/backup notes, and documentation.
- Schema, API DTOs, validation, fixtures, tests, and documentation must stay aligned.

High-risk database areas require extra care:

- Tenant isolation.
- Branch isolation.
- Document numbering.
- FIFO allocation and consumption.
- Inventory reservations.
- Inventory transfers.
- Invoice billing allocations.
- Payments, receipts, refunds, and voids.
- Supplier returns.
- Tenant deletion.
- Exports.
- Audit and idempotency records.

---

## Frontend Rules

GarageOS UI must remain mobile-first and source-aligned.

Rules:

- Build for narrow screens first.
- Use existing components and styling patterns before adding new ones.
- Align UI flows with:

  - `docs/ux-sreen-map.md`
  - `docs/ui-registry.md`
  - `docs/ui-tokens.md`

- Use permission-aware UI, but never rely on UI checks as the only enforcement.
- Show tenant lifecycle banners where access is affected.
- Show branch context on branch-scoped screens.
- Show loading, empty, validation, forbidden, subscription-blocked, plan-blocked, branch-denied, offline, conflict, and success states where applicable.
- Offline mode is read-only only.
- Block creates, edits, approvals, payments, refunds, inventory actions, uploads, settings changes, and role/permission changes while offline.
- Use explicit workflow actions, not arbitrary status dropdowns.
- Do not design screens or interactions for excluded product scope.

For financial, receipt, refund, inventory ledger, FIFO, audit, and posted workflow records, visually communicate immutability or correction-only behavior where applicable.

---

## Testing Expectations

Match test depth to risk.

Minimum expectations:

- Unit tests for domain rules, calculations, validators, policies, and state transitions.
- API/contract tests for envelopes, validation, auth, permissions, branch access, tenant status, errors, idempotency, and optimistic locking.
- Integration tests for repositories, transactions, constraints, rollback, tenant isolation, branch isolation, and concurrency-sensitive behavior.
- Frontend tests for auth/session flows, mobile states, loading/empty/error/forbidden/conflict/read-only/offline states.
- Regression tests for every bug fix.

High-risk workflows require blocked-path and concurrency coverage:

- Tenant lifecycle.
- Branch access.
- Role and permission changes.
- FIFO inventory.
- Inventory reservations.
- Inventory transfers.
- Inventory adjustments.
- Purchase receiving.
- Supplier returns.
- Invoice issuance.
- Billing allocations.
- Payments and receipts.
- Refunds and voids.
- File access.
- Exports.
- Background jobs.
- Sensitive logging.

A feature is not production-ready only because the happy path works.

---

## Work Process

### Before Editing

1. Check `git status -sb`.
2. Read `Instructions.txt` if present.
3. Read the relevant source documentation.
4. Inspect existing implementation patterns.
5. Identify affected areas:

   - Architecture
   - Database
   - API
   - Services
   - UI
   - Permissions
   - Tests
   - Observability
   - Documentation

6. Choose the smallest safe change set.
7. Avoid touching unrelated files or generated artifacts.

### During Implementation

- Make narrow, source-aligned changes.
- Keep files thin and use-case focused.
- Preserve existing naming, layering, and repository conventions.
- Add or update tests with the change.
- Update docs, ADRs, fixtures, generated clients, or `.env.example` only when behavior requires it.
- Keep validation commands tied to changed files.
- If a command fails, diagnose from output and fix the smallest proven cause.
- Do not move to the next step while the current failure is unresolved unless the user explicitly defers it.

### Before Handoff

Use the minimum handoff detail appropriate to the task.

For compact tasks, state only:

- What changed.
- Files changed.
- Validation run or validation not run.
- Residual risk, if any.
- Suggested commit message.

For expanded tasks, also include:

- Documentation alignment.
- Relevant affected areas.
- Risks and trade-offs.
- Next recommended step.
- Next-chat handoff prompt only when requested or clearly useful.

Never claim validation passed unless it actually ran and passed.

---

## Execution Modes

Use the mode that matches the task. Prefer compact modes unless the task is high-risk, broad, or explicitly asks for planning.

### Compact Fix Mode

Use for small bug fixes, type errors, failed tests, UI adjustments, prompt revisions, and narrow implementation corrections.

Required sections:

```md
## Root Cause

## Files Changed

## Minimal Fix

## Validation

## Commit Message
```

Rules:

- Fix only the stated issue.
- Do not redesign unrelated areas.
- Do not restate project background.
- Do not include full documentation summaries unless there is a conflict or material risk.
- Do not include a next-chat handoff prompt unless requested.
- Use targeted copy-paste blocks or a ZIP only when requested.

### Compact Status Mode

Use for quick progress checks, “what changed,” “what is next,” or “is this done?” questions.

Required sections:

```md
## Current Status

## Done

## Pending

## Next Step
```

Include risks or blockers only when they exist.

### Planning Mode

Use for milestones, feature specs, implementation plans, high-risk workflow planning, or architectural decisions.

Required sections:

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

Use for implementation, refactoring, test additions, or file updates that are not narrow enough for Compact Fix Mode.

Required sections:

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
```

Add `### Next-Chat Handoff Prompt` only when the user asks for it or when the implementation step is large enough that a future chat needs structured continuity.

For code changes, prefer copy-paste-ready instructions unless the user asks for a ZIP or patch:

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

Use exact file paths and complete code blocks. Do not provide partial code that cannot compile unless the task is explicitly explanatory.

### Debugging Mode

Use when the user provides an error, failed test, failing command, screenshot, stack trace, or broken behavior.

For narrow failures, use Compact Fix Mode. For broad failures, use:

```md
## Diagnosis

## Root Cause

## Minimal Fix

## Copy-Paste Changes

## Validation Commands

## Expected Result

## Risks / Notes
```

### Review Mode

Use when reviewing latest commit, implementation slice, or milestone work.

Required sections:

```md
## Review Scope

## Documentation Alignment

## Findings

## Production Readiness Verdict

## Required Fixes

## Validation

## Next Step
```

Classify findings as:

- Critical
- Major
- Minor
- Observations

Stop at required fixes if the implementation is not production-ready.

---

## Delivery Format Defaults

Use the lightest delivery format that matches the request.

Default delivery order:

1. Minimal copy-paste blocks for small code changes.
2. Full-file replacement only when the file is small or targeted edits would be confusing.
3. ZIP file when the user explicitly asks for drag-and-drop delivery or updated files.
4. Patch files only when the user explicitly asks for a patch.

Do not provide patch commands, patch downloads, or `git apply` instructions unless a patch is requested.

---

## Git and Remote Safety

The GitHub repository is read-only for AI-assisted work unless the user explicitly provides tool access and asks for a remote write operation.

Do not:

- Run `git push`.
- Create, update, or delete remote branches.
- Open, update, merge, or close pull requests.
- Commit directly to GitHub.
- Edit files through the GitHub UI, GitHub API, GitHub MCP, or any remote repository write tool.
- Change GitHub repository settings, secrets, workflows, issues, releases, tags, or permissions.
- Use destructive git commands unless explicitly requested.
- Revert user changes unless explicitly requested.
- Commit unless explicitly asked.

Allowed:

- Inspect repository files if access is available.
- Make local sandbox changes if tool access allows.
- Run local validation commands if tool access allows.
- Provide copy-paste-ready code, replacement snippets, commands, validation steps, and commit messages for the user to apply locally.

The user is responsible for applying, validating, committing, and pushing changes unless explicitly stated otherwise.

---

## Common Commands

Use `pnpm.cmd` on Windows PowerShell if the plain `pnpm` shim is blocked.

### Root Verification

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

### Targeted API Verification

```bash
pnpm --filter @garageos/api typecheck
pnpm --filter @garageos/api test
pnpm --filter @garageos/api test -- --reporter=verbose
```

### Targeted Web Verification

```bash
pnpm --filter @garageos/web typecheck
pnpm --filter @garageos/web test
```

### Shared Packages

```bash
pnpm --filter @garageos/shared test
pnpm --filter @garageos/config test
pnpm --filter @garageos/api-client test
pnpm --filter @garageos/test-utils test
```

### Database

```bash
pnpm dev:db
pnpm db:migrate
pnpm db:seed
pnpm db:validate
pnpm dev:db:down
```

### Development Servers

```bash
pnpm dev:web
pnpm dev:api
pnpm dev:worker
pnpm dev:scheduler
```

Run the narrowest relevant command set first, then broader checks when practical.

---

## Validation Reporting

Always report validation honestly.

Use this wording when commands were not run:

```text
Validation not run here. Please run:
[commands]
```

Use this wording when validation ran:

```text
Validation run:
- [command] — passed
- [command] — failed: [short reason]
```

When validation fails:

- Include the failing command.
- Summarize the relevant output.
- Provide the minimal next fix.
- Do not claim the step is complete.

---

## Commit Message Rule

When a step is ready for commit, provide one meaningful conventional commit message.

Format:

```bash
git commit -asm "type(scope): short summary"
```

Allowed types:

- `feat`
- `fix`
- `test`
- `refactor`
- `docs`
- `chore`

Examples:

```bash
git commit -asm "feat(auth): add tenant context resolver scaffold"
git commit -asm "test(auth): cover refresh session rotation policy"
git commit -asm "fix(api): preserve correlation id in error envelopes"
git commit -asm "refactor(shared): centralize transaction boundary helper"
git commit -asm "docs(agents): clarify repository safety rules"
```

Do not commit for the user unless explicitly asked and tool access permits local commits.

---

## Next-Chat Handoff Prompt Rule

Do not provide a next-chat handoff prompt by default for compact tasks.

Provide a copy-paste next-chat handoff prompt only when:

- The user asks for one.
- A completed implementation step is broad enough that continuity would otherwise be risky.
- The next task depends on specific validation output, repository caveats, or affected files.
- Work is moving between chats, agents, or tools.

When provided, keep the handoff concise and include only the details needed to continue safely:

1. Current milestone.
2. Last completed step.
3. Current or next step.
4. Known validation status.
5. Files changed or likely affected.
6. Summary of changes.
7. Exact validation commands.
8. Any unresolved issue or failing output.
9. Suggested commit message.
10. Instruction not to redo completed work unless repository verification shows it is missing or broken.
11. Reminder that GitHub remote writes are not allowed unless explicitly requested.

Avoid repeating full project background, full source-of-truth lists, or unrelated roadmap context.

---

## Definition of Done

A change is not done if it:

- Is not traceable to approved documentation.
- Introduces undocumented scope.
- Bypasses existing architecture decisions.
- Relies only on frontend checks for security or business rules.
- Can leak tenant or branch data.
- Bypasses tenant lifecycle gates.
- Bypasses permissions or branch access.
- Bypasses plan gates where applicable.
- Bypasses idempotency requirements.
- Bypasses audit requirements.
- Bypasses observability expectations.
- Mutates immutable or correction-only records directly.
- Weakens transaction boundaries.
- Lacks tests appropriate to risk.
- Lacks regression coverage for a bug fix.
- Leaves validation unrun without clearly stating that validation was not run.
- Touches unrelated files without justification.

When `docs/definition-of-done.md` exists, treat it as the quality contract and keep this section aligned with it.

---

## Agent Behavior Summary

Agents must:

- Follow documentation first.
- Preserve approved scope.
- Respect current repository state.
- Work in small safe steps.
- Prefer existing patterns.
- Keep implementation production-ready.
- Protect tenant and branch isolation.
- Enforce security in backend/database, not only UI.
- Add appropriate tests.
- Run or specify exact validation.
- Report uncertainty honestly.
- Never claim work or validation was done unless it was actually done.
- Never mutate the remote repository unless explicitly requested and supported by available tooling.
