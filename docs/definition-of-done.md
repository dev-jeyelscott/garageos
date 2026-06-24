# GarageOS Definition of Done

**Document:** `definition-of-done.md`
**Project:** GarageOS — Motorcycle Shop Management System SaaS
**Status:** Milestone 0 Quality Contract
**Scope:** Applies to all GarageOS feature tickets, bug fixes, technical tasks, and release candidates where relevant.

---

## 1. Purpose

This document defines what “done” means for GarageOS work.

A feature, fix, or technical task is not complete until it is implemented, validated, documented, and proven to align with the approved GarageOS source documents.

This Definition of Done exists to prevent incomplete implementation, undocumented scope changes, weak authorization, data integrity gaps, missing tests, missing audit coverage, missing observability, and security regressions.

---

## 2. Source-of-Truth Rule

GarageOS work must follow the approved source documents in this order:

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
12. `architecture-records.md`
13. `build-roadmap.md`

If implementation details conflict with the PRD or approved source documents, the source documents win.

Undocumented behavior must not be implemented as hidden scope.

---

## 3. Definition of Done Checklist

A GarageOS work item is done only when every applicable item below is complete.

Use **N/A with reason** only when a checklist item genuinely does not apply.

---

## 4. Source Documentation Alignment

- [ ] Relevant PRD section is identified.
- [ ] Relevant RTM ID is identified where available.
- [ ] Relevant user story ID is identified where available.
- [ ] Relevant architecture, API, schema, UX, QA, permission, and ADR references are identified where applicable.
- [ ] No excluded capability has been introduced.
- [ ] Any ambiguity is documented before implementation.
- [ ] Any implementation decision affecting architecture, data, security, operations, cost, or provider choice has an ADR or approved decision record.

---

## 5. Scope and Requirement Completion

- [ ] The implemented behavior matches the documented requirement.
- [ ] The feature does not add undocumented modules, routes, tables, permissions, screens, workflows, or integrations.
- [ ] Business rules are implemented in backend/service logic, not only in the UI.
- [ ] Blocked paths are implemented with clear, deterministic errors.
- [ ] Edge cases from the source documents are handled.
- [ ] Acceptance criteria are satisfied.

---

## 6. Database and Schema Impact

- [ ] Database impact has been reviewed.
- [ ] Required tables, columns, enums/check constraints, indexes, and foreign keys are implemented where applicable.
- [ ] Tenant-owned tables include `tenant_id`.
- [ ] Branch-specific operational tables include both `tenant_id` and `branch_id`.
- [ ] Critical invariants are protected through database constraints where practical.
- [ ] Mutable records use `lock_version` or equivalent optimistic locking where required.
- [ ] Append-only or correction-only records are not directly editable.
- [ ] Migration is versioned, repeatable in CI, and safe for staging/production.
- [ ] Seed data changes are idempotent.
- [ ] Schema changes include tests or validation evidence.

---

## 7. API Contract Impact

- [ ] API endpoint behavior matches `api-contracts.md`.
- [ ] Routes use `/api/v1` conventions.
- [ ] Request and response bodies use documented JSON shape and enum values.
- [ ] Success responses follow the standard response envelope.
- [ ] Error responses follow the standard error envelope.
- [ ] Error codes are stable and machine-readable.
- [ ] Pagination, filtering, sorting, and search follow the documented contract where applicable.
- [ ] Critical write endpoints require `Idempotency-Key` where required.
- [ ] Mutable update endpoints handle version conflicts where required.
- [ ] API contract tests are added or updated.

---

## 8. Authorization, Permissions, and Access Control

- [ ] Authentication is required where applicable.
- [ ] Tenant context is resolved from the authenticated session, not trusted from client payload.
- [ ] Required permission code is enforced.
- [ ] Branch access is enforced for branch-specific records.
- [ ] Tenant-wide entity visibility rules are respected.
- [ ] Platform admin access is separated from tenant user access.
- [ ] Platform support access is explicit, reasoned, time-bound, visibly marked where applicable, and audited.
- [ ] Shop Owner protected behavior is preserved where applicable.
- [ ] Custom role and additive permission behavior are respected.
- [ ] Authorization tests cover allowed and blocked paths.

---

## 9. Tenant Lifecycle and Plan Enforcement

- [ ] Tenant status gate is enforced before operational writes.
- [ ] `pending_setup`, `read_only`, `suspended`, `pending_deletion`, and `deleted` behavior is respected where applicable.
- [ ] Shop Owner renewal/export exceptions are respected where documented.
- [ ] Plan limits are enforced where applicable.
- [ ] Notification channel restrictions are enforced where applicable.
- [ ] Blocked subscription or plan-limit actions return clear errors.
- [ ] Blocked plan-limit attempts are audit logged where required.

---

## 10. Business Workflow Correctness

- [ ] Workflow transitions are explicit and validated.
- [ ] Invalid status transitions are blocked.
- [ ] Required reason fields are captured for corrective or high-risk actions.
- [ ] Status history or audit history is recorded where required.
- [ ] Financial, inventory, billing, export, deletion, and irreversible workflows are transactionally safe.
- [ ] Retry behavior cannot duplicate irreversible side effects.
- [ ] Concurrency-sensitive flows use row locks, optimistic locking, idempotency, or equivalent protection.

---

## 11. Audit Requirements

- [ ] Required audit logs are written.
- [ ] Audit logs include actor, tenant, branch where applicable, action, timestamp, previous/new values where appropriate, and reason where required.
- [ ] Platform admin and support access actions are audited.
- [ ] High-risk actions are audited, including role changes, permission changes, support access, refunds, voids, force adjustments, exports, deletion, subscription overrides, and tenant lifecycle changes.
- [ ] Audit logs do not contain passwords, tokens, provider secrets, full payment card data, or sensitive payloads.
- [ ] Audit tests are added where required.

---

## 12. Security Review

- [ ] No plaintext passwords, tokens, provider secrets, or sensitive credentials are stored, logged, returned, exported, or exposed.
- [ ] Tenant isolation is enforced.
- [ ] Branch isolation is enforced.
- [ ] File access uses private storage and signed URLs where applicable.
- [ ] Rate limits are implemented where required.
- [ ] Inputs are validated server-side.
- [ ] Authorization is enforced server-side.
- [ ] Sensitive error messages are sanitized.
- [ ] Security-sensitive work has been reviewed by Engineering and Security where applicable.

---

## 13. Frontend and UX Completion

- [ ] UI follows the documented UX screen map.
- [ ] UI does not introduce undocumented screens or flows.
- [ ] UI works on mobile-first layouts.
- [ ] Loading state is handled.
- [ ] Empty state is handled.
- [ ] Success state is handled.
- [ ] Validation error state is handled.
- [ ] Forbidden/permission denied state is handled.
- [ ] Subscription blocked/read-only state is handled where applicable.
- [ ] Offline state is handled where applicable.
- [ ] Conflict/version error state is handled where applicable.
- [ ] Destructive or corrective actions require confirmation where appropriate.
- [ ] UI restrictions are treated as UX assistance only; backend remains authoritative.

---

## 14. Offline Behavior

- [ ] Offline mode does not allow operational writes.
- [ ] Offline create, edit, approve, payment, refund, inventory, upload, settings, and role/permission changes are blocked.
- [ ] Offline state is clearly indicated.
- [ ] Cached data is read-only.
- [ ] Cached data is scoped to the logged-in user where applicable.
- [ ] Cache is cleared on logout or session invalidation where applicable.
- [ ] Signed file URLs are not cached beyond their expiration.

---

## 15. Observability and Operations

- [ ] Logs include request ID or correlation ID where applicable.
- [ ] Important business events emit structured logs.
- [ ] Critical failures emit metrics or observable events.
- [ ] Background jobs expose status, attempts, timestamps, and safe error summaries.
- [ ] Integration failures are observable and retry-safe where applicable.
- [ ] Operational dashboards or runbook notes are updated where applicable.
- [ ] No sensitive data is written to logs, analytics, errors, audit payloads, or monitoring tools.

---

## 16. Testing Requirements

Testing must match the risk level of the work item.

- [ ] Unit tests are added for domain rules, calculations, validators, permission resolution, and state transitions where applicable.
- [ ] Integration tests are added for service/database behavior where applicable.
- [ ] Repository or database tests verify tenant scoping, branch scoping, constraints, indexes, transactions, and rollback behavior where applicable.
- [ ] API contract tests verify request/response envelopes, validation, errors, permissions, branch access, idempotency, and optimistic locking where applicable.
- [ ] E2E tests cover critical mobile-first workflows where applicable.
- [ ] Security tests cover tenant isolation, branch isolation, sensitive data, file access, rate limits, and support access where applicable.
- [ ] Concurrency tests cover document numbering, FIFO allocation, inventory reservation, invoice billing allocation, payments, refunds, transfers, receiving, exports, and deletion where applicable.
- [ ] Regression tests are added for bug fixes.
- [ ] All relevant tests pass locally and in CI.

---

## 17. Documentation Requirements

- [ ] Relevant source-aligned documentation is updated.
- [ ] API docs or OpenAPI notes are updated where applicable.
- [ ] Schema/migration notes are updated where applicable.
- [ ] ADRs are added or updated for significant technical decisions.
- [ ] Runbooks are updated for operational behavior where applicable.
- [ ] QA test cases are updated where applicable.
- [ ] Known limitations or follow-up tasks are documented.

---

## 18. Code Quality and Maintainability

- [ ] Code follows existing project patterns.
- [ ] No duplicate business logic is introduced.
- [ ] Domain logic is not hidden inside controllers or UI components.
- [ ] Complex workflows are implemented through explicit services/command handlers.
- [ ] Transaction boundaries are clear.
- [ ] Errors are handled intentionally.
- [ ] Validation is centralized where practical.
- [ ] No dead code, debug code, console noise, or unused files remain.
- [ ] Lint, typecheck, and tests pass.

---

## 19. Review and Approval

A work item may be closed only when:

- [ ] Developer self-review is complete.
- [ ] Engineering review is complete.
- [ ] QA review is complete where applicable.
- [ ] Security review is complete for high-risk work.
- [ ] DevOps review is complete for operational/infrastructure work.
- [ ] Product/Business review is complete for user-facing behavior or scope-sensitive work.
- [ ] No unresolved Critical or High defects remain.
- [ ] Any accepted exception has a documented reason, owner, and follow-up.

---

## 20. Minimum Closure Rule

A GarageOS feature is not done if any of the following are true:

- It is not traceable to approved source documentation.
- It introduces undocumented scope.
- It relies only on frontend restrictions for security or business rules.
- It can leak tenant or branch data.
- It bypasses required permissions.
- It ignores tenant lifecycle or plan gates.
- It changes financial, inventory, receipt, refund, ledger, or audit data in an unsupported way.
- It lacks required audit logs.
- It lacks required idempotency or concurrency protection.
- It lacks required tests.
- It lacks required observability.
- It leaves documentation stale.
