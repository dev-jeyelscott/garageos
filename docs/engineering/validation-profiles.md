# GarageOS Validation Profiles and Risk-Class Matrix

## Purpose

This document defines named GarageOS validation profiles and a risk-class matrix for pull requests.

The goal is to help each PR select the narrowest safe validation path while preserving deterministic CI gates, source alignment, and GarageOS quality requirements.

This document does not weaken CI, replace human review, or introduce product behavior outside the approved GarageOS documentation.

## Source Alignment

Validation must remain aligned with:

- `requirements-v2.4.md`
- `database-design.md`
- `database-schema.md`
- `architecture.md`
- `api-contracts.md`
- `qa-acceptance-test-plan.md`
- `garageos-build-roadmap-v1.3.md`
- `permission-matrix.md`
- `garageos-architecture-records.md`

GarageOS validation must prove the relevant evidence for:

- Tenant isolation
- Branch access
- Permission behavior
- Subscription and tenant lifecycle gates
- Workflow transition correctness
- Atomic critical writes
- Idempotency and retry safety
- Concurrency safety
- Ledger-first inventory and FIFO correctness
- Financial immutability
- API envelope and error contract behavior
- Offline read-only behavior
- Observability and operational visibility
- Security and sensitive-data handling

## Validation Rules

1. Existing CI gates remain authoritative.
2. Validation profiles are additive convenience scripts, not replacements for CI.
3. Do not add fake validation scripts that pass without meaningful checks.
4. Do not remove or weaken existing test, lint, typecheck, build, migration, or security checks.
5. Select the highest applicable risk class for the PR.
6. If a PR touches multiple areas, run the union of required validation profiles.
7. Critical financial, inventory, tenant isolation, RBAC, branch access, migration, and background-job work requires focused validation beyond generic lint/typecheck.
8. Manual evidence is allowed only where automated coverage does not yet exist, and must be documented in the PR.

## Validation Profiles

| Profile  | Command                  | Purpose                                              | Typical Coverage                                                             |
| -------- | ------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| Quick    | `pnpm validate:quick`    | Fast baseline for low-risk docs/tooling-safe changes | Lint, typecheck, formatting-safe checks where available                      |
| Web      | `pnpm validate:web`      | Frontend validation                                  | Web lint, web typecheck, web unit/component tests                            |
| API      | `pnpm validate:api`      | Backend/API validation                               | API lint, API typecheck, backend unit/API tests                              |
| DB       | `pnpm validate:db`       | Persistence and migration validation                 | Migration checks, schema checks, repository/integration tests                |
| Security | `pnpm validate:security` | Security-sensitive validation                        | Auth, tenant isolation, RBAC, branch access, sensitive-log/dependency checks |
| E2E      | `pnpm validate:e2e`      | User workflow validation                             | Playwright/mobile-first/critical workflow tests where available              |
| Full     | `pnpm validate:full`     | Broad local pre-merge or milestone validation        | All implemented validation profiles                                          |

## Risk Classes

| Risk Class | Name                                                | Description                                                                                                              | Minimum Validation                                                                                      |
| ---------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| R0         | Docs-only                                           | Documentation, comments, markdown, non-runtime notes                                                                     | `pnpm validate:quick`                                                                                   |
| R1         | Tooling / CI metadata                               | PR template, runbooks, non-production scripts, repo metadata                                                             | `pnpm validate:quick` plus script syntax checks if applicable                                           |
| R2         | Web UI only                                         | UI rendering, frontend-only state, styling, components, route display                                                    | `pnpm validate:web`                                                                                     |
| R3         | API / service logic                                 | DTOs, controllers, services, validators, API envelopes, error codes                                                      | `pnpm validate:api`                                                                                     |
| R4         | Database / persistence                              | Migrations, schema, repositories, constraints, indexes, seed data                                                        | `pnpm validate:db` plus API/integration checks where affected                                           |
| R5         | Auth / tenant / RBAC / branch / plan gates          | Authentication, tenant status, subscription gates, permissions, branch access, plan enforcement                          | `pnpm validate:security` plus relevant API/integration tests                                            |
| R6         | Financial / inventory / workflow-critical           | Invoices, payments, receipts, refunds, voids, inventory, FIFO, reservations, purchases, supplier returns, job completion | `pnpm validate:api`, `pnpm validate:db`, focused domain tests, idempotency tests, and concurrency tests |
| R7         | Background jobs / exports / operational reliability | Workers, scheduler, exports, reminders, lifecycle jobs, retry/dead-letter behavior, observability                        | Relevant API/DB tests plus retry/idempotency/operational visibility evidence                            |
| R8         | Release candidate / milestone closure               | Milestone completion, release candidate, launch-readiness work                                                           | `pnpm validate:full` plus documented manual acceptance evidence                                         |

## Change-Type Matrix

| Change Type                                              | Risk Class | Required Validation                                               | Notes                                                                                                   |
| -------------------------------------------------------- | ---------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Markdown docs only                                       | R0         | `pnpm validate:quick`                                             | Ensure no product scope drift.                                                                          |
| PR template / branch protection runbook                  | R1         | `pnpm validate:quick`                                             | Do not weaken CI or human final merge authority.                                                        |
| Frontend layout or component only                        | R2         | `pnpm validate:web`                                               | Include loading, empty, forbidden, read-only/offline, validation, and conflict states where applicable. |
| Frontend permission/tenant-status behavior               | R5         | `pnpm validate:web` plus relevant security/API tests              | UI checks are not authoritative; backend remains authoritative.                                         |
| API DTO/controller only                                  | R3         | `pnpm validate:api`                                               | Confirm response envelope, error envelope, validation, and required permissions.                        |
| Service/domain rule                                      | R3 or R6   | `pnpm validate:api` plus focused tests                            | Use R6 for financial, inventory, workflow-critical, or irreversible operations.                         |
| Migration/schema/index/seed                              | R4         | `pnpm validate:db`                                                | Include migration/schema validation and affected repository tests.                                      |
| Repository query/scoping                                 | R4 or R5   | `pnpm validate:db` plus security tests if tenant/branch scoped    | Tenant and branch scoping must be proven.                                                               |
| Auth/session/token/password/rate limit                   | R5         | `pnpm validate:security` plus API tests                           | Confirm sensitive data is not logged or exposed.                                                        |
| Tenant lifecycle/subscription/read-only/suspended access | R5         | `pnpm validate:security` plus API/integration tests               | Tenant status guard must run before operational permission checks.                                      |
| RBAC/roles/permissions/branch access                     | R5         | `pnpm validate:security` plus API/integration tests               | Effective permissions are additive; branch access is separate from permission access.                   |
| Invoices/payments/receipts/refunds/voids/AR              | R6         | API, DB, idempotency, concurrency, and focused financial tests    | No overbilling, overpayment, over-refund, or mutable receipt behavior.                                  |
| Inventory/FIFO/reservations/transfers/adjustments        | R6         | API, DB, idempotency, concurrency, and focused inventory tests    | No over-reservation, negative stock, duplicate ledger side effects, or FIFO corruption.                 |
| Workers/scheduler/background jobs/export jobs            | R7         | Relevant API/DB tests plus retry/idempotency/observability checks | Prove retries do not duplicate irreversible side effects.                                               |
| Release candidate or milestone closure                   | R8         | `pnpm validate:full` plus manual QA/security/devops evidence      | Required before milestone closure or release candidate approval.                                        |

## Profile Implementation Rules

Validation scripts must map to real existing commands.

If a package or command does not exist yet:

- Do not add a fake passing script.
- Document the profile as pending.
- Create a follow-up ticket if the missing validation is required for upcoming work.
- Keep `validate:full` limited to implemented profiles only.

## PR Evidence Checklist

Every PR should state:

- Selected risk class
- Why that risk class applies
- Validation profiles run
- Command output summary
- Any pending validation gaps
- Manual acceptance evidence when automated coverage is not available
- Whether CI passed
- Whether human review remains required

## Failure Handling

If a validation profile fails:

1. Fix the failing area instead of bypassing the profile.
2. Do not lower the risk class to avoid required validation.
3. Do not remove checks from aggregate scripts to make a PR pass.
4. If the failure is unrelated and pre-existing, document evidence and create or link a follow-up ticket.
5. For critical areas, do not merge with unresolved Critical or High validation failures.

## Current Profile Status

| Profile             | Status      | Notes                                                                                                                                                                                                    |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validate:quick`    | Implemented | Runs format check, lint, and typecheck.                                                                                                                                                                  |
| `validate:web`      | Implemented | Runs web lint, typecheck, and tests for `@garageos/web`.                                                                                                                                                 |
| `validate:api`      | Implemented | Runs API lint, typecheck, and tests for `@garageos/api`.                                                                                                                                                 |
| `validate:db`       | Implemented | Runs migration order validation and `@garageos/db` validation.                                                                                                                                           |
| `validate:security` | Pending     | Do not add until dedicated auth, tenant isolation, RBAC, branch access, sensitive-log, or security test scripts exist. `audit:deps` is included in `validate:full` as dependency security coverage only. |
| `validate:e2e`      | Pending     | Do not add until E2E/Playwright workflow scripts exist.                                                                                                                                                  |
| `validate:full`     | Implemented | Runs quick validation, full recursive tests, DB validation, and dependency audit.                                                                                                                        |

## Pending Profiles

`validate:security` and `validate:e2e` are intentionally not implemented yet.

Reason:

- `audit:deps` exists and is included in `validate:full`, but dependency audit alone does not prove GarageOS security requirements such as tenant isolation, RBAC, branch access, subscription gates, support access, sensitive-log protection, or file access control.
- No dedicated E2E command is currently present in the root scripts.

These profiles should be added only when real underlying commands exist.
