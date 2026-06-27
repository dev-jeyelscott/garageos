# GarageOS Definition of Done

**Project:** GarageOS — Motorcycle Shop Management System SaaS  
**Status:** Milestone 0 Quality Contract  
**Applies to:** features, fixes, technical tasks, release candidates.

---

## 1. Rule

A work item is **done** only when it is source-aligned, implemented, validated, tested, documented, observable, secure, and reviewed. Mark an item **N/A** only with a reason.

## 2. Source Order

1. `requirements.md`
2. `database-design.md`
3. `database-schema.md`
4. `architecture.md`
5. `api-contracts.md`
6. `requirements-traceability-matrix.md`
7. `user-stories.md`
8. `permission-matrix.md`
9. `ux-sreen-map.md`
10. `qa-acceptance-test-plan.md`
11. `tech-stack.md`
12. `garageos-architecture-records.md`
13. `garageos-build-roadmap-v1.3.md`

Approved docs win over implementation. Do not add undocumented behavior, hidden scope, or excluded capabilities.

---

## 3. Done Checklist

### 3.1 Traceability and Scope

- [ ] PRD, RTM, user story, and relevant architecture/API/schema/UX/QA/permission/ADR references are identified.
- [ ] Behavior matches documented requirements, acceptance criteria, and edge cases.
- [ ] No undocumented modules, routes, tables, permissions, screens, workflows, integrations, or excluded capabilities are introduced.
- [ ] Ambiguities and major architecture/data/security/ops/cost/provider decisions have an ADR or approved decision.
- [ ] Business rules and blocked paths are enforced server-side, not only in UI, with deterministic errors.

### 3.2 Database and Schema

- [ ] DB impact is reviewed; required tables, columns, enums/checks, indexes, FKs, constraints, and seed changes are implemented.
- [ ] Tenant-owned records include `tenant_id`; branch-specific operational records include `tenant_id` + `branch_id`.
- [ ] Critical invariants are DB-protected where practical.
- [ ] Mutable records use `lock_version` or equivalent where required.
- [ ] Append-only/correction-only records are not directly editable.
- [ ] Migrations are versioned, CI-repeatable, staging/production safe, and tested.
- [ ] Seed changes are idempotent.

### 3.3 API Contract

- [ ] Endpoints follow `/api/v1`, documented routes, JSON shapes, enum values, envelopes, and error codes.
- [ ] Pagination/filtering/sorting/search follow the contract where applicable.
- [ ] Critical writes require `Idempotency-Key` where required.
- [ ] Mutable updates handle version conflicts.
- [ ] API contract tests are added or updated.

### 3.4 Auth, Lifecycle, and Plan Gates

- [ ] Auth is required where applicable.
- [ ] Tenant context is session-derived, never trusted from client payload.
- [ ] Required permissions, branch access, and tenant-wide visibility rules are enforced.
- [ ] Platform admin access is separate from tenant-user access.
- [ ] Support access is explicit, reasoned, time-bound, visible where applicable, and audited.
- [ ] Shop Owner protected behavior, custom roles, and additive permissions are preserved.
- [ ] Tenant status gate runs before operational writes and respects `pending_setup`, `read_only`, `suspended`, `pending_deletion`, and `deleted`.
- [ ] Shop Owner renewal/export exceptions are preserved.
- [ ] Plan limits and notification-channel restrictions are enforced.
- [ ] Blocked subscription/plan-limit attempts return clear errors and are audited where required.

### 3.5 Workflow, Transactions, and Audit

- [ ] Workflow transitions are explicit, validated, and invalid transitions are blocked.
- [ ] Required reason fields are captured for corrective/high-risk actions.
- [ ] Status/audit history is recorded where required.
- [ ] Financial, inventory, billing, export, deletion, and irreversible workflows are transactionally safe.
- [ ] Retries cannot duplicate irreversible side effects.
- [ ] Concurrency-sensitive flows use locks, optimistic locking, idempotency, or equivalent controls.
- [ ] Audit logs include actor, tenant, branch where applicable, action, timestamp, previous/new values where appropriate, and reason where required.
- [ ] Platform/support and high-risk actions are audited: role/permission changes, refunds, voids, force adjustments, exports, deletion, subscription overrides, lifecycle changes.
- [ ] Audit payloads exclude passwords, tokens, provider secrets, full card data, and sensitive payloads.

### 3.6 Security

- [ ] No plaintext passwords, tokens, provider secrets, or sensitive credentials are stored, logged, returned, exported, or exposed.
- [ ] Tenant and branch isolation are enforced.
- [ ] Files use private storage and signed URLs where applicable.
- [ ] Rate limits are implemented where required.
- [ ] Inputs are server-side validated.
- [ ] Authorization is server-side enforced.
- [ ] Sensitive error messages are sanitized.
- [ ] Security-sensitive work is reviewed by Engineering/Security where applicable.

### 3.7 Frontend, UX, and Offline

- [ ] UI follows the UX screen map, is mobile-first, and adds no undocumented screens/flows.
- [ ] Loading, empty, success, validation-error, forbidden, subscription/read-only, offline, and conflict states are handled where applicable.
- [ ] Destructive/corrective actions require confirmation where appropriate.
- [ ] UI restrictions are UX assistance only; backend remains authoritative.
- [ ] Offline mode is clearly indicated and read-only.
- [ ] Offline create/edit/approve/payment/refund/inventory/upload/settings/role-permission changes are blocked.
- [ ] Cached data is read-only, user-scoped where applicable, cleared on logout/session invalidation, and signed file URLs are not cached past expiry.

### 3.8 Observability and Operations

- [ ] Logs include request/correlation IDs where applicable.
- [ ] Important business events emit structured logs.
- [ ] Critical failures emit metrics or observable events.
- [ ] Background jobs expose status, attempts, timestamps, and safe error summaries.
- [ ] Integration failures are observable and retry-safe.
- [ ] Dashboards/runbooks are updated where applicable.
- [ ] Logs, analytics, errors, audit payloads, and monitoring exclude sensitive data.

### 3.9 Testing

- [ ] Unit tests cover domain rules, calculations, validators, permissions, and state transitions where applicable.
- [ ] Integration/repository/DB tests cover service behavior, tenant/branch scoping, constraints, indexes, transactions, and rollback where applicable.
- [ ] API tests cover envelopes, validation, errors, permissions, branch access, idempotency, and optimistic locking where applicable.
- [ ] E2E tests cover critical mobile-first workflows where applicable.
- [ ] Security tests cover tenant/branch isolation, sensitive data, file access, rate limits, and support access where applicable.
- [ ] Concurrency tests cover document numbering, FIFO allocation, reservations, billing allocation, payments, refunds, transfers, receiving, exports, and deletion where applicable.
- [ ] Regression tests are added for bug fixes.
- [ ] Relevant tests pass locally and in CI.

### 3.10 Docs, Quality, and Review

- [ ] Source docs, API/OpenAPI notes, schema/migration notes, ADRs, runbooks, and QA cases are updated where applicable.
- [ ] Known limitations and follow-ups are documented.
- [ ] Code follows existing patterns and introduces no duplicate business logic.
- [ ] Domain logic is not hidden in controllers or UI components.
- [ ] Complex workflows use services/command handlers.
- [ ] Transaction boundaries, validation, and errors are intentional.
- [ ] No dead/debug code, console noise, unused files, or stale artifacts remain.
- [ ] Lint, typecheck, and tests pass.
- [ ] Required self, Engineering, QA, Security, DevOps, and Product/Business reviews are complete.
- [ ] No unresolved Critical/High defects remain.
- [ ] Accepted exceptions include reason, owner, and follow-up.

---

## 4. Closure Blockers

A work item is **not done** if it:

- Is not traceable to approved docs.
- Introduces undocumented scope.
- Relies only on frontend restrictions for security/business rules.
- Can leak tenant or branch data.
- Bypasses permissions, tenant lifecycle, or plan gates.
- Mutates financial, inventory, receipt, refund, ledger, or audit data in an unsupported way.
- Lacks required audit logs, idempotency, concurrency protection, tests, observability, or documentation.
