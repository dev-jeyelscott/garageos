# GarageOS Release and Milestone Readiness Checklist

**Document:** `docs/runbooks/release-readiness.md`  
**Status:** Active engineering-loop runbook  
**Task:** ENG-LOOP-12 — Add release and milestone readiness checklist  
**Scope:** Documentation-only engineering-loop hardening  
**Created:** 2026-07-05

## Purpose

This runbook defines the required checklist for closing GarageOS milestones and preparing release candidates.

It exists to make milestone and release decisions evidence-based, source-aligned, and repeatable. It does not introduce product scope, runtime behavior, database behavior, API behavior, UI behavior, permissions, or deployment automation.

## Source Alignment

This checklist must remain aligned with the GarageOS source-of-truth documents:

1. `requirements-v2.4.md`
2. `database-design.md`
3. `database-schema.md`
4. `architecture.md`
5. `api-contracts.md`
6. `qa-acceptance-test-plan.md`
7. `garageos-build-roadmap-v1.3.md`
8. `requirements-traceability-matrix.md`
9. `permission-matrix.md`
10. `garageos-architecture-records.md`
11. Existing repository implementation and validation output

If this checklist conflicts with approved source documentation, the approved source documentation wins and this checklist must be corrected.

## Non-Scope

This runbook must not be used to add or imply:

- Native mobile applications.
- Offline operational writes or sync conflict handling.
- Customer portal behavior.
- Standalone retail POS checkout.
- Payroll or full accounting behavior.
- Direct tax authority filing.
- Automatic subscription payment collection.
- Two-factor authentication.
- Microservices-first architecture.
- Any undocumented validation gate that is not emitted by the repository or explicitly approved.

## Readiness Principles

1. Documentation is the source of truth.
2. CI and local validation evidence must be real, not assumed.
3. No Critical or High defect may remain open without an approved waiver.
4. Required checks must match emitted GitHub status check names.
5. Milestone closure must include validation evidence, documentation status, known risks, and closeout notes.
6. Release candidate readiness requires QA, security, engineering, product/business, and operations review evidence.
7. Backend, database, and API behavior remain authoritative over UI-only checks.
8. Waivers must be explicit, temporary, owned, and risk-classified.

## Milestone Readiness Checklist

Use this checklist before marking a milestone complete.

### 1. Source Alignment

- [ ] The milestone scope maps to approved source documentation.
- [ ] No excluded capability was introduced.
- [ ] Any source ambiguity is documented as a gap, ADR follow-up, or clarification ticket.
- [ ] Requirements traceability is updated where applicable.

### 2. Scope Control

- [ ] The implementation matches the ticket acceptance criteria.
- [ ] The change avoids unrelated refactors.
- [ ] No undocumented routes, permissions, schema fields, workflows, or UI screens were added.
- [ ] Follow-up work is tracked separately instead of hidden inside the current milestone.

### 3. Implementation Completion

- [ ] All planned files for the milestone are updated.
- [ ] Any intentionally deferred work is documented with a ticket or risk entry.
- [ ] Generated artifacts, if any, are reproducible.
- [ ] Documentation links and references are valid.

### 4. Validation Evidence

At minimum, milestone closeout must record the relevant validation profile results.

| Validation Area      | Evidence Requirement                                                           | Status               |
| -------------------- | ------------------------------------------------------------------------------ | -------------------- |
| Quick validation     | `pnpm validate:quick` result or approved waiver                                | Pending              |
| Full validation      | `pnpm validate:full` result before milestone closure or release-candidate work | Pending              |
| PR evidence guard    | `node ./.github/scripts/validate-pr-evidence.cjs` using the final PR body      | Pending              |
| Targeted tests       | Module-specific commands when implementation touches runtime code              | N/A until applicable |
| Documentation review | Changed docs reviewed for source alignment and no scope expansion              | Pending              |

### 5. QA Review

- [ ] Relevant acceptance criteria are documented.
- [ ] Required test evidence is linked or pasted into the PR body.
- [ ] Regression risk is classified.
- [ ] Known test gaps are recorded.
- [ ] P0/P1 blockers are resolved or waived.

### 6. Security Review

- [ ] Tenant isolation, branch access, permissions, secrets, auditability, and sensitive logging were reviewed when applicable.
- [ ] No security-sensitive behavior is changed without targeted validation.
- [ ] Dependency or workflow changes do not weaken the existing security posture.
- [ ] Any security waiver includes owner, expiration, severity, and mitigation.

### 7. Documentation Review

- [ ] Runbooks, trackers, PR body, and handoff notes are updated.
- [ ] Documentation-only tasks clearly state that there are no runtime/database/API/UI/permission changes.
- [ ] New docs are linked from the appropriate parent runbook or tracker where applicable.
- [ ] Terminology matches existing GarageOS documentation.

### 8. Risk and Waiver Review

- [ ] No unresolved Critical or High issue remains without explicit waiver.
- [ ] Medium and Low risks have mitigation notes or follow-up tickets.
- [ ] Waivers include owner, reason, expiration/review date, and rollback/mitigation plan.
- [ ] Residual risks are included in the PR body.

### 9. Milestone Closeout

- [ ] Notion tracker is updated.
- [ ] `docs/progress-tracker.md` is updated.
- [ ] PR validation evidence is complete.
- [ ] Final commit SHA and PR URL are recorded after merge where applicable.
- [ ] Next handoff is prepared.

## Release Candidate Readiness Checklist

Use this checklist before promoting work to release-candidate status.

### 1. Release Scope Freeze

- [ ] Release scope is explicitly listed.
- [ ] Included tickets are complete or intentionally waived.
- [ ] Excluded tickets are not partially merged as hidden scope.
- [ ] Source documents are reviewed for release-impacting changes.

### 2. Required Validation Profiles

- [ ] `pnpm validate:quick` passes.
- [ ] `pnpm validate:full` passes.
- [ ] Security validation passes where available.
- [ ] E2E validation passes where available.
- [ ] PR evidence guard passes on the final PR body.
- [ ] Required GitHub Actions checks are green and match documented check names.

### 3. QA Acceptance Evidence

- [ ] P0 acceptance tests pass.
- [ ] P1 acceptance tests pass or have approved release-blocker waivers.
- [ ] Regression tests pass for completed modules.
- [ ] Defect list is reviewed and classified.
- [ ] No open Critical or High defects remain unresolved without approval.

### 4. Security Evidence

- [ ] Authentication and session behavior are validated where applicable.
- [ ] Tenant isolation checks are validated where applicable.
- [ ] Branch access and permission checks are validated where applicable.
- [ ] Sensitive logs and secrets handling are reviewed.
- [ ] Dependency/security automation findings are resolved or waived.

### 5. Database and Migration Evidence

- [ ] Migrations apply cleanly from a clean database.
- [ ] Schema drift validation passes.
- [ ] Required seed data exists.
- [ ] Rollback or forward-fix strategy is documented.
- [ ] High-risk data integrity paths have targeted validation where applicable.

### 6. API and Contract Evidence

- [ ] API response envelopes remain aligned with contracts.
- [ ] Error codes remain stable and documented.
- [ ] Idempotency behavior is validated for critical writes where applicable.
- [ ] Optimistic locking or row-locking behavior is validated where applicable.

### 7. UI and UX Evidence

- [ ] Mobile-first screens are validated where applicable.
- [ ] Permission, forbidden, loading, empty, conflict, read-only, and offline states are covered where applicable.
- [ ] UI does not imply excluded capabilities.
- [ ] Backend authorization remains authoritative.

### 8. Observability and Operations Evidence

- [ ] Request IDs and correlation IDs are present where applicable.
- [ ] Structured logs are available for critical workflows.
- [ ] Background job status and failure evidence are visible where applicable.
- [ ] Alerts or manual monitoring steps are documented.

### 9. Backup, Restore, and Disaster Recovery Evidence

- [ ] Backup expectations are documented.
- [ ] Restore evidence is available for release readiness when applicable.
- [ ] RPO/RTO expectations are reviewed for production launch readiness.
- [ ] Tenant export and deletion risks are reviewed where applicable.

### 10. Deployment, Rollback, and Incident Plan

- [ ] Deployment steps are documented.
- [ ] Rollback or forward-fix plan is documented.
- [ ] Incident owner and escalation path are identified.
- [ ] Post-release smoke checks are listed.

### 11. Final Signoff

| Role                | Required For Release Candidate | Status  | Notes                                                        |
| ------------------- | -----------------------------: | ------- | ------------------------------------------------------------ |
| Engineering         |                            Yes | Pending | Source alignment, implementation, validation evidence        |
| QA                  |                            Yes | Pending | Acceptance, regression, defect state                         |
| Security            |                            Yes | Pending | Access control, secrets, sensitive logs, dependency findings |
| DevOps / Operations |                            Yes | Pending | Deployment, observability, backup/restore, rollback          |
| Product / Business  |                            Yes | Pending | Scope, release value, known risk acceptance                  |

## Validation Evidence Template

Use this table in milestone closeout notes and PR descriptions.

| Area                 | Command / Evidence                                                                        | Result  | Link / Notes |
| -------------------- | ----------------------------------------------------------------------------------------- | ------- | ------------ |
| Quick validation     | `pnpm validate:quick`                                                                     | Pending |              |
| Full validation      | `pnpm validate:full`                                                                      | Pending |              |
| PR evidence guard    | `PR_BODY="$(cat .tmp/<task>-pr-body.md)" node ./.github/scripts/validate-pr-evidence.cjs` | Pending |              |
| Targeted validation  |                                                                                           | N/A     |              |
| Documentation review | Manual review                                                                             | Pending |              |

## Waiver Template

Waivers must be explicit and reviewed before milestone closure or release candidate promotion.

| Field                     | Required |
| ------------------------- | -------- |
| Waiver ID                 | Yes      |
| Risk severity             | Yes      |
| Affected area             | Yes      |
| Reason                    | Yes      |
| Owner                     | Yes      |
| Expiration or review date | Yes      |
| Mitigation                | Yes      |
| Approval                  | Yes      |

## Post-Release Smoke Checklist

Run only safe production smoke checks after deployment.

- [ ] Application health endpoint responds.
- [ ] Login page loads.
- [ ] Authenticated session loads for a safe test account, if available.
- [ ] Core navigation loads without client errors.
- [ ] No elevated error rate is visible after deployment.
- [ ] Background workers or scheduled jobs are healthy where applicable.
- [ ] Rollback criteria remain clear during the observation window.

## Closeout Checklist

- [ ] Release or milestone evidence is attached to the tracker.
- [ ] Final PR body includes validation results.
- [ ] Known risks and waivers are recorded.
- [ ] Notion tracker is updated.
- [ ] `docs/progress-tracker.md` is updated.
- [ ] Next handoff prompt is prepared.
