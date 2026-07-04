# GarageOS Pull Request

## Summary

Describe what changed and why.

```text
<!-- Example:
Adds validation profile scripts and documents the GarageOS risk-class matrix for PR validation evidence.
-->
```

## Linked Ticket / Task

- Notion ticket:
- Branch:
- Commit message:

## Source Alignment

Check every source document that applies to this PR.

- [ ] `requirements-v2.4.md`
- [ ] `database-design.md`
- [ ] `database-schema.md`
- [ ] `architecture.md`
- [ ] `api-contracts.md`
- [ ] `qa-acceptance-test-plan.md`
- [ ] `garageos-build-roadmap-v1.3.md`
- [ ] `permission-matrix.md`
- [ ] `requirements-traceability-matrix.md`
- [ ] `garageos-architecture-records.md`
- [ ] `docs/engineering/validation-profiles.md`
- [ ] Not applicable / docs-only change

Source-alignment notes:

```text
<!-- Explain how this PR stays within documented GarageOS scope. -->
```

## Scope Control

- [ ] This PR implements only documented behavior.
- [ ] This PR does not introduce undocumented routes, fields, permissions, modules, workflows, or product behavior.
- [ ] This PR does not introduce excluded GarageOS scope such as native apps, offline writes, customer portal, standalone POS, payroll, full accounting, automated subscription collection, or 2FA.
- [ ] This PR does not remove or weaken existing CI gates.
- [ ] This PR does not include unrelated cleanup or broad refactoring.

Scope notes:

```text
<!-- Call out any intentional limits or deferred work. -->
```

## Risk Class and Validation Profile

Select the highest applicable risk class.

- [ ] R0 — Docs-only
- [ ] R1 — Tooling / CI metadata
- [ ] R2 — Web UI only
- [ ] R3 — API / service logic
- [ ] R4 — Database / persistence
- [ ] R5 — Auth / tenant / RBAC / branch / plan gates
- [ ] R6 — Financial / inventory / workflow-critical
- [ ] R7 — Background jobs / exports / operational reliability
- [ ] R8 — Release candidate / milestone closure

Reason for selected risk class:

```text
<!-- Explain why this risk class applies. If multiple areas are touched, choose the highest applicable class. -->
```

Required validation reference:

- `docs/engineering/validation-profiles.md`

## Validation Evidence

Paste exact commands run and results.

```bash
# Example:
# pnpm validate:quick
# pnpm validate:web
# pnpm validate:api
# pnpm validate:db
# pnpm validate:full
```

Validation result summary:

```text
<!-- Example:
pnpm validate:quick ✅ passed
pnpm validate:web ✅ passed
pnpm validate:api ✅ passed
pnpm validate:db ✅ passed
pnpm validate:full ✅ passed
-->
```

Pending or unavailable validation:

```text
<!-- If a profile is not implemented yet, explain why and what evidence was used instead.
Do not claim security or E2E coverage unless real underlying scripts/tests exist.
-->
```

## UI Evidence

Attach screenshots, recordings, or written UI verification notes for UI-facing changes.

```text
<!-- Required for UI changes.
Examples:
- Mobile screenshot of the updated screen
- Desktop screenshot if applicable
- Short recording for workflow/state changes
- Notes for loading, empty, forbidden, read-only, offline, or conflict states

If this PR has no UI changes, write: Not applicable — no UI changes.
-->
```

## Rollback Notes

Describe the rollback plan or explain why rollback is not needed.

```text
<!-- Required for all PRs.
Examples:
- Revert this PR if validation fails after merge.
- Disable the feature flag if applicable.
- Roll back the migration using the documented down migration.
- Not applicable — docs-only change with no runtime impact.

Do not leave this blank.
-->
```

## Architecture / Implementation Checklist

- [ ] Follows existing repository patterns.
- [ ] Preserves modular monolith boundaries.
- [ ] Avoids duplicate logic.
- [ ] Avoids unnecessary abstractions.
- [ ] Keeps command/write logic separate from query/read logic where applicable.
- [ ] Uses documented API envelope and error semantics where applicable.
- [ ] Uses documented enum values and DTO field naming where applicable.
- [ ] Handles errors, conflicts, validation failures, and blocked states where applicable.

Implementation notes:

```text
<!-- Mention affected modules, packages, or decisions. -->
```

## Security and Access Control

Check all that apply.

- [ ] Tenant isolation is preserved.
- [ ] Branch access is preserved.
- [ ] Permission checks are preserved.
- [ ] Tenant lifecycle/subscription gates are preserved.
- [ ] Platform support access remains audited and explicit.
- [ ] No secrets, tokens, passwords, credentials, or sensitive payloads are logged.
- [ ] No sensitive data is exposed in API responses, audit payloads, exports, errors, or UI.
- [ ] Not applicable.

Security notes:

```text
<!-- Include security-sensitive behavior or reasons this is not applicable. -->
```

## Database / Data Integrity

Check all that apply.

- [ ] No schema changes.
- [ ] Migration order is safe.
- [ ] Tenant-owned tables include tenant scoping where applicable.
- [ ] Branch-specific records include branch scoping where applicable.
- [ ] Constraints/indexes preserve documented invariants.
- [ ] Critical writes are transactional.
- [ ] Idempotency is preserved where required.
- [ ] Optimistic locking or row locking is preserved where required.
- [ ] Financial, receipt, refund, inventory ledger, FIFO, and audit immutability are preserved.
- [ ] Not applicable.

Database notes:

```text
<!-- Include migration, repository, seed, constraint, or rollback notes. -->
```

## API Contract

Check all that apply.

- [ ] API response envelope is preserved.
- [ ] API error envelope is preserved.
- [ ] Standard error codes are used.
- [ ] Required permissions are enforced.
- [ ] Branch access is enforced for branch-scoped resources.
- [ ] Tenant context is resolved from session, not arbitrary client input.
- [ ] Idempotency key behavior is preserved for critical writes.
- [ ] Pagination/filtering/search behavior remains documented and indexed where applicable.
- [ ] Not applicable.

API notes:

```text
<!-- Mention affected endpoints, DTOs, guards, or tests. -->
```

## UI / UX

Check all that apply.

- [ ] Mobile-first layout remains usable.
- [ ] Loading state is handled.
- [ ] Empty state is handled.
- [ ] Forbidden state is handled.
- [ ] Read-only tenant state is handled.
- [ ] Offline read-only state is handled.
- [ ] Validation errors are clear and actionable.
- [ ] Conflict/version errors are recoverable.
- [ ] Permission-aware UI does not replace backend authorization.
- [ ] Not applicable.

UI notes:

```text
<!-- Mention affected screens, components, routes, or states. -->
```

## Observability / Operations

Check all that apply.

- [ ] Correlation/request IDs are preserved where applicable.
- [ ] Structured logs do not leak sensitive data.
- [ ] Background job status/failure visibility is preserved where applicable.
- [ ] Retry/idempotency behavior is preserved for workers/jobs where applicable.
- [ ] No deployment, secret, environment, or runbook changes.
- [ ] Runbook/docs updated where needed.
- [ ] Not applicable.

Operations notes:

```text
<!-- Mention monitoring, logs, job behavior, environment config, or runbook changes. -->
```

## Tests Added or Updated

- [ ] Unit tests
- [ ] Integration tests
- [ ] API contract tests
- [ ] Database/repository tests
- [ ] Security/access-control tests
- [ ] Concurrency/idempotency tests
- [ ] E2E tests
- [ ] Documentation-only / no tests required

Test notes:

```text
<!-- Explain why the selected tests are sufficient for this risk class. -->
```

## Reviewer Notes

Specific areas reviewers should inspect:

```text
<!-- Example:
- Confirm validation profiles do not overclaim coverage.
- Confirm package scripts compose only real existing commands.
- Confirm docs preserve CI and human review authority.
-->
```

## Final Merge Checklist

- [ ] CI passed.
- [ ] Required validation evidence is included above.
- [ ] Risk class is selected and justified.
- [ ] Source alignment is documented.
- [ ] No Critical or High findings remain unresolved.
- [ ] Human reviewer approval is still required.
- [ ] I understand AI review is advisory only and does not replace deterministic CI or human review.
