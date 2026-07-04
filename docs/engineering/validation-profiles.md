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
| Full     | `pnpm validate:full`     | Broad local pre-merge or milestone validation                     | All currently implemented validation coverage using real existing commands      |

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

### Pending Profiles

| Profile | Future Command      | Status  | Reason                                                                                                     |
| ------- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| E2E     | `pnpm validate:e2e` | Pending | Dedicated E2E workflow test infrastructure or command is not yet available as a stable validation profile. |

Pending profiles must not be required in PR evidence until implemented.

Until `validate:e2e` exists, workflow-critical PRs must provide the strongest available implemented validation plus targeted test evidence, reviewer notes, UI evidence where applicable, and rollback notes.

## Current Profile Status

| Profile             | Status      | Notes                                                                                                                                                |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validate:quick`    | Implemented | Runs format check, lint, and typecheck.                                                                                                              |
| `validate:web`      | Implemented | Runs web lint, typecheck, and tests for `@garageos/web`.                                                                                             |
| `validate:api`      | Implemented | Runs API lint, typecheck, and tests for `@garageos/api`.                                                                                             |
| `validate:db`       | Implemented | Runs migration order validation and `@garageos/db` validation.                                                                                       |
| `validate:security` | Implemented | Runs security-sensitive API tests plus dependency audit. Dependency audit is only one signal and does not prove complete GarageOS security coverage. |
| `validate:full`     | Implemented | Runs quick validation, full recursive tests, DB validation, security validation, and dependency/security checks included in implemented profiles.    |
| `validate:e2e`      | Pending     | Do not add until real E2E or Playwright workflow scripts exist and are stable enough for the intended validation scope.                              |

## Risk-Class Validation Matrix

Select the highest applicable risk class for each PR.

| Risk Class | Change Type                                                                             | Required Implemented Validation                                                                                                                                                    | Additional Evidence Required                                                                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R0         | Docs-only changes                                                                       | `pnpm validate:quick` when practical                                                                                                                                               | Explain why no runtime validation is required.                                                                                                                                                                     |
| R1         | Tooling, CI metadata, templates, runbooks                                               | `pnpm validate:quick`                                                                                                                                                              | Confirm existing CI gates are not weakened.                                                                                                                                                                        |
| R2         | Web UI only                                                                             | `pnpm validate:quick` + `pnpm validate:web`                                                                                                                                        | Provide screenshots, recordings, or UI verification notes where applicable.                                                                                                                                        |
| R3         | API/service logic                                                                       | `pnpm validate:quick` + `pnpm validate:api`                                                                                                                                        | Identify affected endpoints, services, DTOs, guards, and tests.                                                                                                                                                    |
| R4         | Database/persistence                                                                    | `pnpm validate:quick` + `pnpm validate:api` + `pnpm validate:db`                                                                                                                   | Document migration, constraint, transaction, locking, rollback, and data-integrity considerations.                                                                                                                 |
| R5         | Auth, tenant isolation, RBAC, branch access, plan gates, support access, sensitive data | `pnpm validate:quick` + `pnpm validate:security` + `pnpm validate:api` + `pnpm validate:db` when persistence is affected + `pnpm validate:web` when UI access behavior is affected | Provide targeted auth/access/security test evidence, dependency audit evidence where relevant, explicit reviewer notes, and rollback notes.                                                                        |
| R6         | Financial, inventory, invoice, payment, refund, FIFO, workflow-critical behavior        | `pnpm validate:quick` + `pnpm validate:api` + `pnpm validate:db` + `pnpm validate:web` when UI is affected                                                                         | Provide targeted financial/inventory/workflow tests, concurrency/idempotency evidence where applicable, UI evidence where applicable, rollback notes, and manual workflow evidence where E2E is not yet automated. |
| R7         | Background jobs, exports, operational reliability, observability                        | `pnpm validate:quick` + relevant package tests + `pnpm validate:api` where API behavior is affected + `pnpm validate:db` where persistence is affected                             | Provide job retry, idempotency, logging, failure-state, operational visibility, and runbook evidence where applicable.                                                                                             |
| R8         | Release candidate or milestone closure                                                  | `pnpm validate:full` plus all relevant implemented profile commands                                                                                                                | `validate:e2e` remains pending until implemented. Provide security validation output, E2E/manual workflow evidence, UAT, UI evidence, rollback notes, and signoff evidence as applicable.                          |

## Pending Profile Handling

`validate:e2e` is intentionally not required as a runnable PR command yet.

Do not claim `pnpm validate:e2e` was run unless the script exists and runs meaningful checks.

`pnpm validate:security` is implemented and may be required for R5 and other security-sensitive PRs. Do not bypass this profile when it fails.

For workflow-critical PRs before `validate:e2e` exists, reviewers must require:

- implemented validation profile results,
- targeted package/test evidence,
- explicit security or workflow review notes,
- UI evidence where applicable,
- rollback notes,
- and follow-up tickets when automation coverage is missing.

This keeps the validation matrix honest and prevents GarageOS from claiming automated E2E coverage that does not exist yet.

## Change-Type Matrix

| Change Type                                              | Risk Class | Required Implemented Validation                                                                                                                                     | Additional Evidence Required                                                                                                                                                        |
| -------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown docs only                                       | R0         | `pnpm validate:quick` when practical                                                                                                                                | Ensure no product scope drift. Explain why no runtime validation is required.                                                                                                       |
| PR template / branch protection runbook                  | R1         | `pnpm validate:quick`                                                                                                                                               | Confirm CI gates and human final merge authority are not weakened. Include rollback notes.                                                                                          |
| Frontend layout or component only                        | R2         | `pnpm validate:quick` + `pnpm validate:web`                                                                                                                         | Include loading, empty, forbidden, read-only/offline, validation, and conflict states where applicable. Attach screenshots or recordings for UI-facing changes.                     |
| Frontend permission or tenant-status behavior            | R5         | `pnpm validate:quick` + `pnpm validate:security` + `pnpm validate:web` + `pnpm validate:api` where backend behavior is affected                                     | UI checks are not authoritative. Provide targeted access-control evidence and confirm backend authorization remains authoritative.                                                  |
| API DTO/controller only                                  | R3         | `pnpm validate:quick` + `pnpm validate:api`                                                                                                                         | Confirm response envelope, error envelope, validation, and required permissions.                                                                                                    |
| Service/domain rule                                      | R3 or R6   | `pnpm validate:quick` + `pnpm validate:api` + focused tests                                                                                                         | Use R6 for financial, inventory, workflow-critical, or irreversible operations. Add DB validation if persistence is affected.                                                       |
| Migration/schema/index/seed                              | R4         | `pnpm validate:quick` + `pnpm validate:api` + `pnpm validate:db`                                                                                                    | Include migration/schema validation, affected repository tests, rollback notes, and data-integrity evidence.                                                                        |
| Repository query/scoping                                 | R4 or R5   | `pnpm validate:quick` + `pnpm validate:security` + `pnpm validate:api` + `pnpm validate:db`                                                                         | Tenant and branch scoping must be proven with targeted tests or reviewer evidence.                                                                                                  |
| Auth/session/token/password/rate limit                   | R5         | `pnpm validate:quick` + `pnpm validate:security` + `pnpm validate:api` + `pnpm validate:db` where persistence is affected                                           | Confirm sensitive data is not logged or exposed. Provide targeted auth/security tests and dependency audit evidence where relevant.                                                 |
| Tenant lifecycle/subscription/read-only/suspended access | R5         | `pnpm validate:quick` + `pnpm validate:security` + `pnpm validate:api` + `pnpm validate:db` where persistence is affected + `pnpm validate:web` when UI is affected | Tenant status guard must run before operational permission checks. Provide targeted guard/access evidence.                                                                          |
| RBAC/roles/permissions/branch access                     | R5         | `pnpm validate:quick` + `pnpm validate:security` + `pnpm validate:api` + `pnpm validate:db` where persistence is affected + `pnpm validate:web` when UI is affected | Effective permissions are additive; branch access is separate from permission access. Provide targeted permission and branch-access evidence.                                       |
| Invoices/payments/receipts/refunds/voids/AR              | R6         | `pnpm validate:quick` + `pnpm validate:api` + `pnpm validate:db` + `pnpm validate:web` when UI is affected                                                          | No overbilling, overpayment, over-refund, or mutable receipt behavior. Provide idempotency, concurrency, financial immutability, UI evidence where applicable, and rollback notes.  |
| Inventory/FIFO/reservations/transfers/adjustments        | R6         | `pnpm validate:quick` + `pnpm validate:api` + `pnpm validate:db` + `pnpm validate:web` when UI is affected                                                          | No over-reservation, negative stock, duplicate ledger side effects, or FIFO corruption. Provide concurrency, idempotency, ledger, UI evidence where applicable, and rollback notes. |
| Workers/scheduler/background jobs/export jobs            | R7         | `pnpm validate:quick` + relevant package tests + `pnpm validate:api` where API behavior is affected + `pnpm validate:db` where persistence is affected              | Prove retries do not duplicate irreversible side effects. Provide observability, failure-state, and runbook evidence.                                                               |
| Release candidate or milestone closure                   | R8         | `pnpm validate:full` plus all relevant implemented profile commands                                                                                                 | Provide security validation output, E2E/manual workflow evidence, UAT evidence, rollback notes, and product/security/DevOps/engineering signoff as applicable.                      |

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

`validate:e2e` is intentionally not implemented yet.

Reason:

- No dedicated E2E command is currently present in the root scripts.

`validate:security` has been implemented through `ENG-LOOP-03` and must remain backed by real underlying checks.

Security profile notes:

- Dependency audit alone does not prove GarageOS security requirements such as tenant isolation, RBAC, branch access, subscription gates, support access, sensitive-log protection, or file access control.
- `pnpm validate:security` must continue to run security-sensitive API tests plus dependency audit.
- Do not weaken the security profile into an audit-only or placeholder command.

Follow-up tickets:

- `ENG-LOOP-04 — Add E2E validation profile`

## Validation for This Document

After editing this document, run:

```bash
pnpm validate:quick
```

Then verify that implemented and pending profile references are accurate:

```bash
grep -n "validate:security\|validate:e2e" docs/engineering/validation-profiles.md
```

Expected result:

- `validate:security` is documented as implemented and backed by real checks.
- `validate:e2e` is documented as pending, future, or not required until implemented.
