## Notion Ticket

<!-- Required: paste the Notion ticket title and URL. -->

- Ticket:

## Goal

<!-- Required: what problem does this PR solve? Keep this source-aligned and narrow. -->

```text

```

## Scope

<!-- Required: list what changed in this PR. -->

- [ ] Backend/API
- [ ] Database/migrations/seeds
- [ ] Frontend/UI
- [ ] Tests/QA
- [ ] CI/CD/tooling
- [ ] Documentation/runbooks
- [ ] Other:

## Source Docs Reviewed

<!-- Required: check only the docs actually reviewed for this PR. -->

- [ ] `requirements-v2.4.md`
- [ ] `database-design.md`
- [ ] `database-schema.md`
- [ ] `architecture.md`
- [ ] `api-contracts.md`
- [ ] `permission-matrix.md`
- [ ] `ux-sreen-map.md`
- [ ] `qa-acceptance-test-plan.md`
- [ ] `requirements-traceability-matrix.md`
- [ ] `tech-stack.md`
- [ ] `garageos-architecture-records.md`
- [ ] `garageos-build-roadmap-v1.3.md`
- [ ] `Working-Instructions.txt`
- [ ] Not applicable: docs-only/tooling-only change with rationale below

Rationale if any source doc is not applicable:

```text

```

## Documentation Alignment

<!-- Required: confirm this PR implements only documented behavior. -->

- [ ] This PR follows the project documentation as the source of truth.
- [ ] This PR does not introduce undocumented product behavior.
- [ ] This PR does not add excluded capabilities.
- [ ] Any missing or unclear behavior was handled as a ticket, clarification, or ADR instead of being invented.

## Affected Areas

<!-- Required: check all affected areas. -->

- [ ] Architecture
- [ ] Database
- [ ] API contracts
- [ ] Services/application logic
- [ ] UI/routes/components
- [ ] Permissions/RBAC/branch access
- [ ] Tenant lifecycle/subscription gates
- [ ] Offline/read-only behavior
- [ ] Financial/inventory immutability
- [ ] Background jobs
- [ ] Observability/logging
- [ ] Testing/QA
- [ ] Documentation only
- [ ] Other:

## Risk Class

<!-- Required: select one. Use the highest applicable class. -->

- [ ] R0 — Documentation-only, comments, or non-runtime metadata
- [ ] R1 — Low-risk tooling, UI copy, tests, or isolated non-critical code
- [ ] R2 — Standard feature or bug fix with limited module impact
- [ ] R3 — High-risk auth, authorization, tenant isolation, financial, inventory, migration, CI/CD, background job, or data integrity change
- [ ] R4 — Production-critical, irreversible, destructive, security-sensitive, or cross-cutting architectural change

Risk rationale:

```text

```

## Validation Commands Run

<!-- Required: paste exact commands. Use N/A only with rationale. -->

```bash

```

## Validation Results

<!-- Required: paste pass/fail result summary and any relevant output. -->

```text

```

## UI Evidence

<!-- Required for UI changes. Attach screenshots/recordings or write N/A with rationale. -->

- [ ] Mobile viewport checked
- [ ] Desktop viewport checked
- [ ] Loading/empty/error/forbidden/offline/read-only states checked where applicable
- [ ] Not applicable

Evidence / notes:

```text

```

## AI Reviewer Notes

<!-- Required once AI reviewer has run. AI review is advisory and does not replace CI or human review. -->

- [ ] AI reviewer completed
- [ ] Findings reviewed
- [ ] No actionable findings
- [ ] Actionable findings addressed
- [ ] Actionable findings intentionally deferred with rationale
- [ ] Not applicable / did not run

Notes:

```text

```

## Rollback Notes

<!-- Required: how can this change be safely reverted? -->

```text

```

## Final Merge Checklist

- [ ] PR targets the correct base branch.
- [ ] PR is from a dedicated task branch.
- [ ] Scope matches the Notion ticket.
- [ ] CI status checks passed.
- [ ] Database/migration validation passed or is not applicable.
- [ ] Conversations are resolved.
- [ ] Human final merge decision is preserved.
