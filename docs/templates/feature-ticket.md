# Feature Ticket Template

> Use this template for every GarageOS feature, workflow, technical slice, or documentation-backed implementation task.
> A ticket is not ready for development until all required traceability sections are completed or marked `N/A` with a reason.

---

## 1. Ticket Summary

| Field           | Value                                                              |
| --------------- | ------------------------------------------------------------------ |
| Ticket ID       |                                                                    |
| Title           |                                                                    |
| Type            | Feature / Bug Fix / Refactor / Documentation / Spike               |
| Priority        | P0 / P1 / P2 / P3                                                  |
| Milestone       |                                                                    |
| Module / Domain |                                                                    |
| Owner           |                                                                    |
| Reviewer(s)     | Product / Architecture / Engineering / QA / Security / DevOps / UX |
| Status          | Draft / Ready / In Progress / In Review / Done / Blocked           |
| Created Date    |                                                                    |
| Updated Date    |                                                                    |

---

## 2. Goal

Describe the business or engineering outcome this ticket must achieve.

```text

```

---

## 3. Scope

List only what is included in this ticket.

-
-
- ***

## 4. Non-Goals / Out of Scope

List what this ticket must not implement.

-
-
- ***

## 5. Source Traceability

Every row must be completed. Use `N/A — reason` only when the artifact truly does not apply.

| Source Artifact                                             | Reference |
| ----------------------------------------------------------- | --------- |
| PRD section(s)                                              |           |
| RTM ID(s)                                                   |           |
| User Story ID(s)                                            |           |
| API contract section / endpoint(s)                          |           |
| Database schema table(s), enum(s), constraint(s), index(es) |           |
| Permission matrix permission code(s)                        |           |
| UX screen map route(s) / screen(s)                          |           |
| QA acceptance test ID(s)                                    |           |
| ADR / ARD reference(s)                                      |           |
| Audit requirement(s)                                        |           |
| Observability requirement(s)                                |           |
| Security requirement(s)                                     |           |

---

## 6. Requirement Notes

Summarize the documented behavior this ticket implements.

```text

```

---

## 7. Impact Analysis

### Architecture Impact

- Affected module(s):
- Service boundary changes:
- New shared utility needed:
- Cross-module dependency risk:

### Database Impact

- New table(s):
- Changed table(s):
- New enum/check constraint(s):
- New index(es):
- Migration required: Yes / No
- Seed data required: Yes / No
- Data backfill required: Yes / No

### API Impact

- New endpoint(s):
- Changed endpoint(s):
- Request DTO changes:
- Response DTO changes:
- Error code changes:
- Idempotency required: Yes / No / N/A
- Optimistic locking required: Yes / No / N/A

### Permission / Access Impact

- Required permission(s):
- Branch access required: Yes / No / N/A
- Tenant status guard applies: Yes / No / N/A
- Plan limit guard applies: Yes / No / N/A
- Platform support access impact: Yes / No / N/A

### UX Impact

- Screen(s) affected:
- New UI state(s):
- Loading state required: Yes / No
- Empty state required: Yes / No
- Validation error state required: Yes / No
- Forbidden state required: Yes / No
- Conflict state required: Yes / No
- Read-only tenant state required: Yes / No / N/A
- Offline state required: Yes / No / N/A

### Audit Impact

- Audit log required: Yes / No
- Audit actor type(s):
- Audit action/event name(s):
- Required audit payload fields:
- Reason field required: Yes / No / N/A

### Observability Impact

- Structured logs required:
- Metrics required:
- Tracing / correlation ID required:
- Alerting required:
- Background job visibility required:

### Security Impact

- Sensitive data involved: Yes / No
- Tenant isolation risk: Yes / No
- Branch isolation risk: Yes / No
- Token / credential risk: Yes / No
- File access risk: Yes / No
- Financial or inventory integrity risk: Yes / No
- Security review required: Yes / No

---

## 8. Proposed Implementation Plan

Break the work into small steps.

1.
2.
3.
4.
5.

---

## 9. Acceptance Criteria

This ticket is acceptable when:

- [ ] Behavior matches the referenced PRD requirement.
- [ ] Implementation matches the referenced API contract.
- [ ] Database changes match the schema/design rules.
- [ ] Required permissions are enforced.
- [ ] Tenant isolation is enforced.
- [ ] Branch access is enforced where applicable.
- [ ] Tenant status behavior is enforced where applicable.
- [ ] Plan limits are enforced where applicable.
- [ ] Audit logs are written where required.
- [ ] Idempotency is implemented where required.
- [ ] Optimistic locking or row locking is implemented where required.
- [ ] UI handles success, loading, validation, forbidden, conflict, read-only, and offline states where applicable.
- [ ] Observability hooks are implemented.
- [ ] Documentation is updated.
- [ ] Tests are added and passing.

Additional ticket-specific acceptance criteria:

- [ ]
- [ ]
- [ ]

---

## 10. Test Plan

| Test Type              | Required? | Notes / Test IDs |
| ---------------------- | --------- | ---------------- |
| Unit tests             | Yes / No  |                  |
| Integration tests      | Yes / No  |                  |
| API contract tests     | Yes / No  |                  |
| E2E tests              | Yes / No  |                  |
| Security tests         | Yes / No  |                  |
| Permission tests       | Yes / No  |                  |
| Tenant isolation tests | Yes / No  |                  |
| Branch access tests    | Yes / No  |                  |
| Concurrency tests      | Yes / No  |                  |
| Migration tests        | Yes / No  |                  |
| Observability tests    | Yes / No  |                  |
| Manual QA              | Yes / No  |                  |

---

## 11. Risks and Mitigations

| Risk | Severity | Mitigation |
| ---- | -------- | ---------- |
|      |          |            |
|      |          |            |

---

## 12. Rollback / Recovery Plan

Describe how this change can be safely reverted or mitigated.

```text

```

---

## 13. Documentation Updates

- [ ] PRD update required
- [ ] RTM update required
- [ ] User story update required
- [ ] API contract update required
- [ ] Database schema/design update required
- [ ] Permission matrix update required
- [ ] UX screen map update required
- [ ] QA plan update required
- [ ] ADR / ARD update required
- [ ] README / runbook update required
- [ ] No documentation update required — reason:

---

## 14. Definition of Done Checklist

- [ ] Source documentation reviewed.
- [ ] No undocumented scope added.
- [ ] Requirement implemented according to source docs.
- [ ] API contract implemented or explicitly marked N/A.
- [ ] Schema impact implemented or explicitly marked N/A.
- [ ] Permission and branch access enforced or explicitly marked N/A.
- [ ] Tenant lifecycle behavior enforced where applicable.
- [ ] Plan limits enforced where applicable.
- [ ] Audit logging implemented where required.
- [ ] Idempotency implemented where required.
- [ ] Tests added and passing.
- [ ] Observability added where required.
- [ ] Security concerns reviewed.
- [ ] Documentation updated.
- [ ] Reviewer approval completed.

---

## 15. Review Signoff

| Reviewer           | Required? | Status                       | Notes |
| ------------------ | --------- | ---------------------------- | ----- |
| Product / BA       | Yes / No  | Pending / Approved / Blocked |       |
| Architecture       | Yes / No  | Pending / Approved / Blocked |       |
| Senior Engineering | Yes / No  | Pending / Approved / Blocked |       |
| QA                 | Yes / No  | Pending / Approved / Blocked |       |
| Security           | Yes / No  | Pending / Approved / Blocked |       |
| DevOps             | Yes / No  | Pending / Approved / Blocked |       |
| UX                 | Yes / No  | Pending / Approved / Blocked |       |
