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
- `requirements-traceability-matrix.md`
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
6. If a PR touches multiple areas, run the union of required implemented validation profiles.
7. Critical financial, inventory, tenant isolation, RBAC, branch access, migration, and background-job work requires focused validation beyond generic lint/typecheck.
8. Manual evidence is allowed only where automated coverage does not yet exist, and must be documented in the PR.
9. Pending profiles must not be listed as required runnable commands until real underlying scripts exist.
10. `validate:full` must include only implemented profiles and real checks.

## Validation Profile Availability

GarageOS validation profiles are split into implemented profiles and pending profiles.

Implemented profiles are runnable today and may be required in PR evidence.

Pending profiles are documented future targets only. Do not reference pending profiles as required runnable commands until the underlying scripts exist and have meaningful coverage.

### Implemented Profiles

| Profile  | Command                  | Purpose                                                           | Typical Coverage                                                                |
| -------- | ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Quick    | `pnpm validate:quick`    | Fast baseline for low-risk docs, tooling, and source-safe changes | Format check, lint, typecheck                                                   |
| Web      | `pnpm validate:web`      | Frontend validation                                               | Web lint, web typecheck, web unit/component tests                               |
| API      | `pnpm validate:api`      | Backend/API validation                                            | API lint, API typecheck, backend unit/API tests                                 |
| DB       | `pnpm validate:db`       | Persistence and migration validation                              | Migration-order validation and database package validation                      |
| Security | `pnpm validate:security` | Security-focused validation                                       | Security-sensitive API tests plus dependency audit using real existing commands |
| E2E      | `pnpm validate:e2e`      | Browser-based PWA workflow validation                             | Playwright mobile smoke coverage for implemented E2E paths                      |
| Full     | `pnpm validate:full`     | Broad local pre-merge or milestone validation                     | All currently implemented validation coverage using real existing commands      |

## GitHub Actions Check Names

GarageOS validation profiles are wired into GitHub Actions using stable check names so branch protection can require deterministic gates.

| GitHub Actions Check  | Command                  | Purpose                                               |
| --------------------- | ------------------------ | ----------------------------------------------------- |
| `validation-quick`    | `pnpm validate:quick`    | Fast local and PR sanity validation.                  |
| `validation-web`      | `pnpm validate:web`      | Web/PWA validation profile.                           |
| `validation-api`      | `pnpm validate:api`      | API validation profile.                               |
| `validation-db`       | `pnpm validate:db`       | Database and migration validation profile.            |
| `validation-security` | `pnpm validate:security` | Security-sensitive test and audit validation profile. |
| `validation-e2e`      | `pnpm validate:e2e`      | Playwright E2E validation profile.                    |
| `validation-full`     | `pnpm validate:full`     | Full deterministic validation profile.                |

Pull requests targeting `main` or `develop` must run these checks through `.github/workflows/ci.yml`.

Branch protection should require the stable check names above once this workflow has run successfully at least once on GitHub.

## Branch Protection Guidance

After `.github/workflows/ci.yml` has run successfully at least once, configure branch protection for `main` and `develop` to require the stable GitHub Actions checks below before merge:

- `validation-quick`
- `validation-web`
- `validation-api`
- `validation-db`
- `validation-security`
- `validation-e2e`
- `validation-full`

Pull requests must not be merged into `main` or `develop` when required validation checks are failing, missing, skipped unexpectedly, or bypassed without explicit documented approval.

Branch protection should also preserve human review authority. The AI reviewer is advisory only; deterministic CI gates and human review remain authoritative.

## CI Validation Context

GitHub Actions is responsible for orchestrating validation profiles and providing disposable infrastructure such as PostgreSQL for database-backed checks.

GitHub Actions must not invent tenant IDs, branch IDs, RBAC grants, subscription statuses, or support-access context through environment variables unless the underlying tests explicitly define and consume those fixtures.

GarageOS tenant isolation, branch access, RBAC, subscription lifecycle gates, and support-access safeguards must be proven by the underlying validation commands, especially:

- `pnpm validate:security`
- `pnpm validate:api`
- `pnpm validate:db`
- `pnpm validate:full`

Any test requiring tenant, branch, role, permission, subscription, or support-access state must create deterministic test fixtures inside the relevant package test setup.

## Database-backed CI Profiles

The following GitHub Actions checks require a disposable PostgreSQL service container and a CI-provided `DATABASE_URL`:

| GitHub Actions Check | Command              | CI Requirement                                                                                                                        |
| -------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `validation-db`      | `pnpm validate:db`   | PostgreSQL 16 service container plus `DATABASE_URL`.                                                                                  |
| `validation-full`    | `pnpm validate:full` | PostgreSQL 16 service container plus `DATABASE_URL`; also installs Playwright browser dependencies when full validation includes E2E. |

CI must not use production, staging, or developer database credentials for validation profiles.

Recommended CI database configuration:

```text
postgresql://garageos:garageos@localhost:5432/garageos_validation
```

The GitHub Actions workflow must wait for PostgreSQL readiness before running database-backed validation. A missing `DATABASE_URL` is a CI configuration failure, not a validation-profile failure to bypass.

## Security Validation Profile

### Command

```bash
pnpm validate:security
```

### Purpose

Runs the dedicated GarageOS security validation profile for currently automated security-sensitive checks.

This profile provides focused validation evidence for implemented security-sensitive areas, including:

- Authentication behavior.
- Authorization and permission enforcement.
- Tenant access controls.
- Branch access controls.
- Subscription and tenant lifecycle access gates.
- Platform/support-access safeguards where tests exist.
- Dependency vulnerability scanning.

### Current Coverage

The profile currently runs real underlying commands only:

```bash
pnpm --dir apps/api test:security
pnpm audit --audit-level high
```

The API security test command targets security-sensitive API test files and modules, including auth, authorization, RBAC, permissions, tenant lifecycle/access, branch access, subscriptions, and platform-admin/support-access areas where tests exist.

Dependency audit is included as one security signal only. It must not be interpreted as complete GarageOS application security coverage.

### Required Behavior

This profile must fail if its underlying security checks fail.

Do not add:

- echo-only checks,
- placeholder scripts,
- fake passing commands,
- `--passWithNoTests`,
- or dependency-audit-only security validation.

### Known Limits

This profile does not replace full Milestone 13 security hardening, threat modeling, penetration-style testing, OWASP ZAP, file access testing, sensitive log review, RLS verification, or production security signoff.

## E2E Validation Profile

### Command

```bash
pnpm validate:e2e
```

### Purpose

Runs the dedicated GarageOS browser-based E2E validation profile for currently automated PWA paths.

This profile provides focused validation evidence for implemented E2E coverage, starting with deterministic mobile-first PWA smoke coverage. It is intended to grow incrementally toward documented GarageOS workflow coverage, including onboarding, tenant gates, customer and motorcycle intake, job orders, inventory, invoicing, payments, receipts, read-only behavior, and offline write blocking as stable fixtures become available.

### Current Coverage

The profile currently runs real underlying commands only:

```bash
pnpm test:e2e
```

The initial Playwright coverage validates that the public GarageOS PWA shell loads in a mobile Chromium viewport and exposes stable public navigation/CTA affordances.

### Required Behavior

This profile must fail if its underlying Playwright checks fail.

Do not add:

- echo-only checks,
- placeholder scripts,
- fake passing commands,
- tests that assert only implementation details without browser behavior,
- broad workflow claims without matching automated tests,
- or undocumented product flows.

### Known Limits

This profile does not yet prove full Milestone 14 UAT coverage, full authenticated workflow coverage, tenant lifecycle behavior, branch access, read-only tenant enforcement, offline blocked writes, or financial/inventory workflow correctness.

Those scenarios must be added incrementally with deterministic fixtures and stable environment setup.

## Current Profile Status

| Profile             | Status      | Notes                                                                                                                                                 |
| ------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validate:quick`    | Implemented | Runs format check, lint, and typecheck.                                                                                                               |
| `validate:web`      | Implemented | Runs web lint, typecheck, and tests for `@garageos/web`.                                                                                              |
| `validate:api`      | Implemented | Runs API lint, API typecheck, and tests for `@garageos/api`.                                                                                          |
| `validate:db`       | Implemented | Runs migration order validation and `@garageos/db` validation. Requires `DATABASE_URL` when schema validation connects to PostgreSQL.                 |
| `validate:security` | Implemented | Runs security-sensitive API tests plus dependency audit. Dependency audit is only one signal and does not prove complete GarageOS security coverage.  |
| `validate:e2e`      | Implemented | Runs Playwright browser-based E2E tests for currently automated mobile-first PWA paths.                                                               |
| `validate:full`     | Implemented | Runs quick, web, API, DB, security, and E2E validation using real existing commands. Requires the same environment dependencies as included profiles. |

## Risk-Class Validation Matrix

Select the highest applicable risk class for each PR.

| Risk Class | Change Type                                                                             | Required Implemented Validation                                                                                                                                                    | Additional Evidence Required                                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R0         | Docs-only changes                                                                       | `pnpm validate:quick` when practical                                                                                                                                               | Explain why no runtime validation is required.                                                                                                                                                           |
| R1         | Tooling, CI metadata, templates, runbooks                                               | `pnpm validate:quick`                                                                                                                                                              | Confirm existing CI gates are not weakened.                                                                                                                                                              |
| R2         | Web UI only                                                                             | `pnpm validate:quick` + `pnpm validate:web` + `pnpm validate:e2e` when the changed path is covered by E2E                                                                          | Provide screenshots, recordings, or UI verification notes where applicable.                                                                                                                              |
| R3         | API/service logic                                                                       | `pnpm validate:quick` + `pnpm validate:api`                                                                                                                                        | Identify affected endpoints, services, DTOs, guards, and tests.                                                                                                                                          |
| R4         | Database/persistence                                                                    | `pnpm validate:quick` + `pnpm validate:api` + `pnpm validate:db`                                                                                                                   | Document migration, constraint, transaction, locking, rollback, and data-integrity considerations.                                                                                                       |
| R5         | Auth, tenant isolation, RBAC, branch access, plan gates, support access, sensitive data | `pnpm validate:quick` + `pnpm validate:security` + `pnpm validate:api` + `pnpm validate:db` when persistence is affected + `pnpm validate:web` when UI access behavior is affected | Provide targeted auth/access/security test evidence, dependency audit evidence where relevant, explicit reviewer notes, and rollback notes.                                                              |
| R6         | Financial, inventory, invoice, payment, refund, FIFO, workflow-critical behavior        | `pnpm validate:quick` + `pnpm validate:api` + `pnpm validate:db` + `pnpm validate:web` when UI is affected + `pnpm validate:e2e` when the workflow path is covered by E2E          | Provide targeted financial/inventory/workflow tests, concurrency/idempotency evidence where applicable, UI evidence where applicable, rollback notes, and E2E/manual workflow evidence where applicable. |
| R7         | Background jobs, exports, operational reliability, observability                        | `pnpm validate:quick` + relevant package tests + `pnpm validate:api` where API behavior is affected + `pnpm validate:db` where persistence is affected                             | Provide job retry, idempotency, logging, failure-state, operational visibility, and runbook evidence where applicable.                                                                                   |
| R8         | Release candidate or milestone closure                                                  | `pnpm validate:full` plus all relevant implemented profile commands                                                                                                                | Provide security validation output, E2E/manual workflow evidence, UAT evidence, UI evidence, rollback notes, and product/security/DevOps/engineering signoff as applicable.                              |

## E2E Profile Handling

`validate:e2e` is now implemented as a runnable Playwright-backed validation profile.

The profile starts with focused mobile-first PWA smoke coverage. It must not be treated as complete workflow acceptance coverage until authenticated workflows, deterministic fixtures, tenant lifecycle states, read-only/offline blocked writes, and critical business workflows are explicitly automated.

For workflow-critical PRs, reviewers must require:

- implemented validation profile results,
- targeted package/test evidence,
- explicit security or workflow review notes,
- UI evidence where applicable,
- rollback notes,
- `pnpm validate:e2e` when the PR affects an E2E-covered UI path,
- and follow-up tickets when E2E automation coverage is missing.

This keeps the validation matrix honest and prevents GarageOS from claiming broader automated E2E coverage than actually exists.

## Change-Type Matrix

| Change Type                                              | Risk Class | Required Implemented Validation                                                                                                                                           | Additional Evidence Required                                                                                                                                                        |
| -------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown docs only                                       | R0         | `pnpm validate:quick` when practical                                                                                                                                      | Ensure no product scope drift. Explain why no runtime validation is required.                                                                                                       |
| PR template / branch protection runbook                  | R1         | `pnpm validate:quick`                                                                                                                                                     | Confirm CI gates and human final merge authority are not weakened. Include rollback notes.                                                                                          |
| Frontend layout or component only                        | R2         | `pnpm validate:quick` + `pnpm validate:web` + `pnpm validate:e2e` when the changed path is covered by E2E                                                                 | Include loading, empty, forbidden, read-only/offline, validation, and conflict states where applicable. Attach screenshots or recordings for UI-facing changes.                     |
| Frontend permission or tenant-status behavior            | R5         | `pnpm validate:quick` + `pnpm validate:security` + `pnpm validate:web` + `pnpm validate:api` where backend behavior is affected + `pnpm validate:e2e` when covered by E2E | UI checks are not authoritative. Provide targeted access-control evidence and confirm backend authorization remains authoritative.                                                  |
| API DTO/controller only                                  | R3         | `pnpm validate:quick` + `pnpm validate:api`                                                                                                                               | Confirm response envelope, error envelope, validation, and required permissions.                                                                                                    |
| Service/domain rule                                      | R3 or R6   | `pnpm validate:quick` + `pnpm validate:api` + focused tests                                                                                                               | Use R6 for financial, inventory, workflow-critical, or irreversible operations. Add DB validation if persistence is affected.                                                       |
| Migration/schema/index/seed                              | R4         | `pnpm validate:quick` + `pnpm validate:api` + `pnpm validate:db`                                                                                                          | Include migration/schema validation, affected repository tests, rollback notes, and data-integrity evidence.                                                                        |
| Repository query/scoping                                 | R4 or R5   | `pnpm validate:quick` + `pnpm validate:security` + `pnpm validate:api` + `pnpm validate:db`                                                                               | Tenant and branch scoping must be proven with targeted tests or reviewer evidence.                                                                                                  |
| Auth/session/token/password/rate limit                   | R5         | `pnpm validate:quick` + `pnpm validate:security` + `pnpm validate:api` + `pnpm validate:db` where persistence is affected                                                 | Confirm sensitive data is not logged or exposed. Provide targeted auth/security tests and dependency audit evidence where relevant.                                                 |
| Tenant lifecycle/subscription/read-only/suspended access | R5         | `pnpm validate:quick` + `pnpm validate:security` + `pnpm validate:api` + `pnpm validate:db` where persistence is affected + `pnpm validate:web` when UI is affected       | Tenant status guard must run before operational permission checks. Provide targeted guard/access evidence.                                                                          |
| RBAC/roles/permissions/branch access                     | R5         | `pnpm validate:quick` + `pnpm validate:security` + `pnpm validate:api` + `pnpm validate:db` where persistence is affected + `pnpm validate:web` when UI is affected       | Effective permissions are additive; branch access is separate from permission access. Provide targeted permission and branch-access evidence.                                       |
| Invoices/payments/receipts/refunds/voids/AR              | R6         | `pnpm validate:quick` + `pnpm validate:api` + `pnpm validate:db` + `pnpm validate:web` when UI is affected + `pnpm validate:e2e` when the workflow path is covered by E2E | No overbilling, overpayment, over-refund, or mutable receipt behavior. Provide idempotency, concurrency, financial immutability, UI evidence where applicable, and rollback notes.  |
| Inventory/FIFO/reservations/transfers/adjustments        | R6         | `pnpm validate:quick` + `pnpm validate:api` + `pnpm validate:db` + `pnpm validate:web` when UI is affected + `pnpm validate:e2e` when the workflow path is covered by E2E | No over-reservation, negative stock, duplicate ledger side effects, or FIFO corruption. Provide concurrency, idempotency, ledger, UI evidence where applicable, and rollback notes. |
| Workers/scheduler/background jobs/export jobs            | R7         | `pnpm validate:quick` + relevant package tests + `pnpm validate:api` where API behavior is affected + `pnpm validate:db` where persistence is affected                    | Prove retries do not duplicate irreversible side effects. Provide observability, failure-state, and runbook evidence.                                                               |
| Release candidate or milestone closure                   | R8         | `pnpm validate:full` plus all relevant implemented profile commands                                                                                                       | Provide security validation output, E2E/manual workflow evidence, UAT evidence, rollback notes, and product/security/DevOps/engineering signoff as applicable.                      |

## Profile Implementation Rules

Validation scripts must map to real existing commands.

If a package or command does not exist yet:

- Do not add a fake passing script.
- Document the profile as pending.
- Create a follow-up ticket if the missing validation is required for upcoming work.
- Keep `validate:full` limited to implemented profiles only.
- Update this document before changing a profile from pending to implemented.
- Update the PR template and risk matrix when a new implemented profile changes required evidence.

## PR Evidence Checklist

Every PR should state:

- Selected risk class
- Why that risk class applies
- Validation profiles run
- Command output summary
- Any pending validation gaps
- Manual acceptance evidence when automated coverage is not available
- UI screenshots, recordings, or written UI verification notes for UI-facing changes
- Rollback plan or rationale for why rollback is not needed
- Whether CI passed
- Whether human review remains required

## Failure Handling

If a validation profile fails:

1. Fix the failing area instead of bypassing the profile.
2. Do not lower the risk class to avoid required validation.
3. Do not remove checks from aggregate scripts to make a PR pass.
4. If the failure is unrelated and pre-existing, document evidence and create or link a follow-up ticket.
5. For critical areas, do not merge with unresolved Critical or High validation failures.

## Pending Profiles

No validation profile listed in this document is currently pending.

`validate:security` has been implemented through `ENG-LOOP-03` and must remain backed by real underlying checks.

`validate:e2e` has been implemented through `ENG-LOOP-04` and must remain backed by real Playwright tests.

Security profile notes:

- Dependency audit alone does not prove GarageOS security requirements such as tenant isolation, RBAC, branch access, subscription gates, support access, sensitive-log protection, or file access control.
- `pnpm validate:security` must continue to run security-sensitive API tests plus dependency audit.
- Do not weaken the security profile into an audit-only or placeholder command.

E2E profile notes:

- Initial E2E coverage is intentionally narrow.
- `pnpm validate:e2e` must continue to run real Playwright tests.
- Do not claim full workflow E2E acceptance coverage until those workflows are actually automated.
- Add authenticated workflow, tenant lifecycle, read-only/offline, financial, inventory, and workflow-critical E2E coverage incrementally with deterministic fixtures.

Follow-up tickets:

- Expand E2E coverage for authenticated tenant workflows once stable fixtures are available.
- Expand E2E coverage for read-only tenant and offline blocked-write behavior.
- Expand E2E coverage for critical invoice/payment and inventory workflows.

## Validation for This Document

After editing this document, run:

```bash
pnpm validate:quick
```

Then verify that implemented and pending profile references are accurate:

```bash
grep -n "validate:security\|validate:e2e\|Pending Profiles" docs/engineering/validation-profiles.md
```

Expected result:

- `validate:security` is documented as implemented and backed by real checks.
- `validate:e2e` is documented as implemented and backed by real Playwright tests.
- No pending-profile language claims `validate:e2e` is unavailable.

<!-- ENG-LOOP-10:VALIDATION-CHECK-NAMES:START -->

## CI Status Check Name Mapping

The following check names are the canonical GitHub status checks for validation profiles. Branch protection must use these names exactly when the corresponding workflow jobs emit them.

| Validation Profile  | Canonical Status Check               | Required on Protected Branches | Local Command                                     |
| ------------------- | ------------------------------------ | -----------------------------: | ------------------------------------------------- |
| PR evidence         | `PR Evidence / validate-pr-evidence` |                            Yes | `node ./.github/scripts/validate-pr-evidence.cjs` |
| Quick validation    | `GarageOS CI / validate:quick`       |                            Yes | `pnpm validate:quick`                             |
| Web validation      | `GarageOS CI / validate:web`         |                            Yes | `pnpm validate:web`                               |
| API validation      | `GarageOS CI / validate:api`         |                            Yes | `pnpm validate:api`                               |
| Database validation | `GarageOS CI / validate:db`          |                            Yes | `pnpm validate:db`                                |
| Security validation | `GarageOS CI / validate:security`    |                            Yes | `pnpm validate:security`                          |
| E2E validation      | `GarageOS CI / validate:e2e`         |                            Yes | `pnpm validate:e2e`                               |
| AI review           | `GarageOS AI Review / advisory`      |                             No | Advisory workflow                                 |

### Policy

- Required validation checks must map to real local commands or deterministic scripts.
- Advisory checks must not be treated as production merge approval.
- When a validation profile is added, removed, renamed, or split, update `docs/engineering/ci-status-checks.md` and `docs/runbooks/branch-protection.md` in the same change.

<!-- ENG-LOOP-10:VALIDATION-CHECK-NAMES:END -->

<!-- ENG-LOOP-10:START -->

## ENG-LOOP-10 — CI Check Names for Validation Profiles

Validation profile status checks must be documented by their emitted GitHub Actions names so branch protection can be configured without guesswork.

- `validation-${{ matrix.profile }}` maps to a CI validation profile emitted from `.github/workflows/ci.yml`.

The authoritative required-check matrix is `docs/engineering/ci-status-checks.md`.
<!-- ENG-LOOP-10:END -->

<!-- ENG-LOOP-10:VALIDATION-CHECK-MAPPING:START -->

## ENG-LOOP-10 — Validation profile status check mapping

Validation profile scripts are package-level commands. GitHub branch protection must require the emitted GitHub Actions check names, not the script names, unless they are identical.

Current emitted validation-related checks:

- `GarageOS AI Review / advisory`
- `Dependency audit and security profile`
- `Semgrep static security scan`
- `Validate PR evidence`
- `validation-${{ matrix.profile }}`

Canonical required-check rules live in:

- `docs/engineering/ci-status-checks.md`

When validation profiles or workflow matrix values change, regenerate this documentation and rerun:

```bash
node .tmp/verify-ci-checks.cjs
```

<!-- ENG-LOOP-10:VALIDATION-CHECK-MAPPING:END -->

<!-- eng-loop-14-observability-profile:start -->

## Observability validation profile

| Field            | Value                                                                             |
| ---------------- | --------------------------------------------------------------------------------- |
| Command          | `pnpm validate:observability`                                                     |
| Script           | `node ./.github/scripts/validate-observability-profile.cjs`                       |
| Scope            | Static observability contract validation and documented coverage/gap enforcement. |
| Runtime behavior | No runtime, database, API, UI, or permission behavior changes.                    |
| CI policy        | Advisory until runtime observability checks exist.                                |

### Purpose

Use this profile for changes that affect GarageOS observability expectations, including request/correlation metadata, structured logging, safe error summaries, background job failure visibility, and observability documentation.

### Current checks

- Confirms `validate:observability` is registered in `package.json`.
- Confirms the observability validation script exists.
- Confirms the observability validation profile document exists.
- Confirms this validation profile index documents the command.
- Confirms API contract documentation includes `request_id` and `correlation_id` expectations when the contract document exists.
- Scans implementation files for observability evidence and reports warnings when runtime implementation evidence is not present yet.

### Required PR evidence

```bash
pnpm validate:observability
pnpm validate:quick
PR_BODY="$(cat .tmp/eng-loop-14-pr-body.md)" node ./.github/scripts/validate-pr-evidence.cjs
```

### Known limitation

This is not yet a runtime telemetry gate. It must not be represented as proof that metrics, traces, error monitoring, structured runtime logs, or background job dashboards are fully implemented.
<!-- eng-loop-14-observability-profile:end -->
