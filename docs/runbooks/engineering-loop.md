# GarageOS Engineering Loop Runbook

**Status:** Source-aligned engineering runbook  
**Scope:** GarageOS repository delivery workflow  
**Task:** ENG-LOOP-11 — Add engineering loop runbook  
**Applies To:** documentation, frontend, API, database, security, E2E, CI, release-readiness, and operational hardening work

---

## 1. Purpose

This runbook defines the canonical GarageOS engineering loop from ticket intake through branch creation, implementation, validation, pull request evidence, review, merge readiness, and tracker closure.

The goal is to make every GarageOS change:

- source-aligned;
- scoped to the approved ticket;
- validated with the narrowest safe local checks and required CI gates;
- traceable through Notion, `docs/progress-tracker.md`, branch names, commits, and PR evidence;
- reviewed with AI feedback treated as advisory only;
- safe to merge only after deterministic validation evidence exists.

This runbook does **not** introduce product scope, runtime behavior, API behavior, schema changes, permissions, CI jobs, branch protection settings, or release gates by itself. It documents the engineering process that should be followed for GarageOS work.

---

## 2. Source-of-Truth Order

When working on GarageOS, follow this order:

1. Project documentation.
2. Approved architecture decisions / ARDs / ADRs.
3. Existing repository implementation and code patterns.
4. Current Notion ticket, task, or specification.
5. Previous handoff context.
6. User-provided logs, screenshots, files, command output, or local repository evidence.

If documentation conflicts with implementation, identify the conflict and follow the approved documentation by default unless a documentation update is explicitly approved.

Do not invent undocumented requirements, routes, workflows, schema fields, permissions, validation profiles, or process claims.

---

## 3. Engineering Loop Overview

Use this flow for normal GarageOS work:

```text
Ready ticket
  -> review source documentation and ticket acceptance criteria
  -> set Notion ticket to In Progress
  -> create or switch to the documented branch
  -> inspect only relevant repository areas
  -> implement the smallest safe source-aligned change
  -> run the narrowest safe validation locally
  -> update docs/progress-tracker.md when required
  -> open or update PR with validation evidence
  -> collect advisory AI review when configured
  -> resolve findings or document accepted advisory risks
  -> confirm required CI checks are green
  -> merge only when deterministic gates pass
  -> mark Notion ticket Done after merge/readiness evidence exists
```

The loop is intentionally conservative. For GarageOS, correctness, traceability, tenant isolation, financial/inventory integrity, and operational safety are more important than speed.

---

## 4. Ticket Intake Rules

Before implementation starts:

1. Read the full Notion ticket.
2. Confirm goal, scope, acceptance criteria, branch name, priority, and dependencies.
3. Review directly relevant GarageOS docs.
4. Identify affected areas:
   - architecture;
   - database;
   - API;
   - services;
   - UI;
   - permissions;
   - testing;
   - CI or operations;
   - documentation.
5. State assumptions if any requirement is missing.
6. Do not start coding when a required source document is missing or contradictory unless the safest documented path is clear.

For documentation-only tasks, confirm that the change does not alter product behavior or enforcement behavior unless explicitly accepted.

---

## 5. Branch Naming Rules

Use the branch name from the Notion ticket when provided.

Recommended branch prefixes:

| Work Type              | Branch Prefix | Example                                |
| ---------------------- | ------------- | -------------------------------------- |
| Documentation          | `docs/`       | `docs/engineering-loop-runbook`        |
| CI/process hardening   | `chore/`      | `chore/eng-loop-ci-validation-gates`   |
| Bug fix                | `fix/`        | `fix/purchase-receiving-schema-drift`  |
| Feature implementation | `feat/`       | `feat/job-order-intake`                |
| Refactor               | `refactor/`   | `refactor/purchase-receiving-tests`    |
| Tests only             | `test/`       | `test/inventory-reservation-conflicts` |

Do not reuse a branch for unrelated tickets.

---

## 6. Implementation Rules

Every implementation must follow these rules:

1. Keep the change limited to the ticket scope.
2. Prefer the smallest safe change.
3. Reuse existing project patterns.
4. Avoid duplicate logic.
5. Avoid unnecessary abstractions.
6. Preserve documented API contracts, envelopes, error codes, tenant context, branch context, permissions, idempotency, and audit behavior.
7. Preserve documented database invariants, constraints, immutable records, tenant isolation, FIFO, ledgers, and financial correctness.
8. Do not add excluded product capabilities.
9. Do not claim behavior is enforced unless code, CI, branch protection, or documented manual process actually enforces it.
10. Do not claim validation passed unless it was actually run and passed.

For documentation-only changes, avoid implying runtime enforcement unless the enforcement already exists.

---

## 7. Validation Profile Selection

Select the narrowest safe local validation profile based on the change type. Required CI and branch protection checks remain authoritative.

| Change Type                       | Minimum Local Validation                                                       | Notes                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation only                | PR evidence guard and relevant documentation review                            | Run broader checks if docs affect CI, scripts, or process enforcement.                                                                                                           |
| PR template / PR evidence rules   | PR evidence guard script                                                       | Include positive and negative examples when changing validation logic.                                                                                                           |
| CI workflow changes               | Relevant workflow/script validation plus `pnpm validate:quick` where available | Do not claim GitHub Actions behavior unless CI actually runs.                                                                                                                    |
| Web/UI changes                    | `pnpm validate:web`                                                            | Add `pnpm validate:e2e` for user-visible workflow changes.                                                                                                                       |
| API changes                       | `pnpm validate:api`                                                            | Include targeted API tests and contract behavior.                                                                                                                                |
| Database/schema/migration changes | `pnpm validate:db`                                                             | Include migration/schema validation and affected integration tests.                                                                                                              |
| Security-sensitive changes        | `pnpm validate:security`                                                       | Required for auth, authorization, tenant isolation, branch access, dependency security, secrets, file access, support access, refunds, voids, exports, or high-risk admin paths. |
| E2E workflow changes              | `pnpm validate:e2e`                                                            | Prefer deterministic mocks unless stable test fixtures exist.                                                                                                                    |
| Broad/high-risk changes           | `pnpm validate:full`                                                           | Use when multiple layers or critical workflows are affected.                                                                                                                     |

If a validation command is unavailable, failing for unrelated known reasons, or intentionally deferred, record the exact reason in the PR evidence and progress tracker.

---

## 8. Pull Request Requirements

Every PR should clearly state:

1. Summary.
2. Source alignment.
3. Scope.
4. Out-of-scope items.
5. Files changed.
6. Validation evidence.
7. Risk classification.
8. Security/access-control impact.
9. Database/API/UI impact where relevant.
10. Follow-ups or known limitations.

For documentation-only PRs, explicitly state:

- no runtime behavior changes;
- no database changes;
- no API changes;
- no permission changes;
- no CI behavior changes unless the PR actually changes CI files;
- no product-scope expansion.

---

## 9. PR Evidence Requirements

PR validation evidence must be specific and reproducible.

Acceptable evidence examples:

```text
pnpm validate:quick
Result: Passed locally.
```

```text
node ./.github/scripts/validate-pr-evidence.cjs
Result: Passed locally against this PR body.
```

```text
pnpm validate:db
Result: Failed before this PR due to unrelated existing migration drift: <exact error>. This PR is docs-only and does not touch DB files.
```

Do not use vague evidence such as:

```text
Tests passed.
```

```text
Looks good.
```

```text
CI should pass.
```

---

## 10. AI Review Role

AI review is advisory only.

AI review may help identify:

- source-alignment issues;
- scope drift;
- security risks;
- tenant isolation gaps;
- branch access gaps;
- API contract drift;
- database invariant risks;
- validation gaps;
- missing documentation updates;
- unclear PR evidence.

AI review must **not** be treated as automatic approval to merge.

Deterministic CI gates, required checks, branch protection, and maintainer review remain authoritative.

When the AI reviewer reports findings:

1. Resolve valid findings.
2. Add a clear explanation for false positives.
3. Track follow-ups when a finding is valid but intentionally deferred.
4. Do not merge with unresolved high-risk findings unless an explicit maintainer decision documents the risk.

---

## 11. Maintainer Review and Solo-Repo Rule

GarageOS may be maintained by a single repository owner.

When the maintainer is the only contributor and cannot assign themselves as reviewer:

1. Use branch protection and required checks as the deterministic review gate.
2. Perform a manual self-review before merge.
3. Record validation evidence in the PR body.
4. Treat AI review as advisory feedback only.
5. Do not claim independent human review occurred when it did not.
6. Prefer stricter required checks over informal approval when no second reviewer exists.

A solo-maintainer PR can still be merge-ready when:

- the scope is clear;
- required checks pass;
- PR evidence is complete;
- advisory findings are resolved or explicitly accepted;
- branch protection requirements are satisfied.

---

## 12. Branch Protection Expectations

Branch protection should protect `main` and `develop` according to the documented branch-protection runbook and required-check matrix.

The engineering loop assumes:

- direct pushes to protected branches are avoided;
- pull requests are used for tracked work;
- required validation checks must pass before merge;
- the PR evidence guard must pass where configured;
- branch protection settings must be manually verified when repository settings change;
- documented check names must match emitted GitHub Actions status names.

This runbook documents expectations. Actual enforcement depends on repository branch protection settings and GitHub Actions configuration.

---

## 13. Notion Tracker Update Rules

Use Notion as the delivery tracker for GarageOS tasks.

| Moment                          | Notion Status                                            | Required Notes                                                     |
| ------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| Ticket is ready but not started | `Ready`                                                  | Goal, acceptance criteria, branch, priority, dependencies.         |
| Work starts                     | `In Progress`                                            | Branch name, source alignment, implementation plan.                |
| Work is blocked                 | `Blocked`                                                | Exact blocker, required decision/evidence, next action.            |
| PR is open                      | Keep `In Progress` unless tracker has a PR/review status | PR URL or PR number if available, validation evidence summary.     |
| Work is complete                | `Done` / completed status                                | Commit/PR evidence, validation commands/results, completion notes. |

Do not mark a ticket complete before validation evidence and merge/readiness evidence exist.

---

## 14. Progress Tracker Update Rules

Update `docs/progress-tracker.md` when a task changes delivery state or completes meaningful work.

Each progress entry should include:

- task ID and title;
- status;
- branch;
- files changed;
- summary of change;
- validation commands and result;
- risks, limitations, or follow-ups;
- completion notes when done.

Progress tracker entries must be factual. Do not claim checks passed unless they actually ran and passed.

---

## 15. Completion Checklist

A GarageOS task is ready to close when all applicable items are true:

- [ ] Ticket scope was implemented without undocumented expansion.
- [ ] Relevant source docs were followed.
- [ ] Files changed match the ticket scope.
- [ ] Required validation commands were run or explicitly justified.
- [ ] Validation evidence is present in the PR body.
- [ ] Progress tracker is updated.
- [ ] Notion tracker is updated.
- [ ] AI advisory findings are resolved, dismissed with reason, or tracked as follow-up.
- [ ] Required CI checks are green.
- [ ] Branch protection requirements are satisfied.

---

## 16. Failure and Rework Loop

When validation fails:

1. Capture the exact command and error.
2. Identify whether the failure is caused by the current change.
3. Fix the smallest relevant cause.
4. Re-run the narrowest failed validation first.
5. Escalate to broader validation only after the focused failure is resolved.
6. Record persistent unrelated failures honestly in PR evidence.

When a PR review identifies scope drift:

1. Remove the undocumented behavior.
2. Or create a separate clarification/ADR/documentation ticket.
3. Do not hide product-scope expansion inside technical cleanup.

---

## 17. ENG-LOOP-11 Acceptance Mapping

| Acceptance Criterion                                     | Runbook Coverage         |
| -------------------------------------------------------- | ------------------------ |
| Ticket-to-branch-to-PR flow is documented.               | Sections 3, 4, 5, 8, 15. |
| Validation profile selection is documented.              | Section 7.               |
| Notion and progress tracker update rules are documented. | Sections 13 and 14.      |
| AI review remains advisory-only.                         | Section 10.              |

---

## 18. Related Documentation

This runbook should be read together with:

- `.github/pull_request_template.md`
- `.github/scripts/validate-pr-evidence.cjs`
- `.github/workflows/*`
- `docs/engineering/validation-profiles.md`
- `docs/runbooks/branch-protection.md`
- `docs/progress-tracker.md`
- `garageos-build-roadmap-v1.3.md`
- `garageos-architecture-records.md`
- `qa-acceptance-test-plan.md`

## Release and Milestone Readiness

Before marking a milestone complete or approving release-candidate work, use `docs/runbooks/release-readiness.md` to confirm source alignment, validation evidence, QA/security/documentation review, unresolved-risk handling, deployment readiness, rollback planning, and final signoff.

<!-- ENG-LOOP-12 release-readiness-reference -->

## Release and Milestone Readiness

Before closing a GarageOS milestone or preparing release-candidate work, use `docs/runbooks/release-readiness.md` as the canonical readiness checklist.

This checklist must be used with the existing PR evidence guard, branch protection requirements, validation profiles, QA acceptance criteria, and progress tracker closeout steps.

<!-- ENG-LOOP-20-PR-AUTOMATION:START -->

## ENG-LOOP-20 — Branch and PR Body Automation

The engineering loop can prepare local branch and pull-request artifacts for the currently selected or claimed task.

### Commands

```bash
pnpm eng-loop:prepare-pr
```

The script writes these local artifacts:

```text
.tmp/eng-loop-pr-body.md
.tmp/eng-loop-pr-automation-metadata.json
.tmp/eng-loop-pr-command-plan.md
```

### Resolution Rules

- Branch name comes from the task `Branch` field when present.
- Commit message comes from the task `Commit Message` field when present.
- PR title comes from the task `Task` title.
- Missing optional branch and commit metadata use deterministic fallbacks.
- Unsafe branch names are rejected before output is written.

### Safety Rules

- The script does not run `git push`.
- The script does not create remote branches.
- The script does not create GitHub pull requests.
- Remote mutation flags are rejected in ENG-LOOP-20.
- Generated PR body content is checked by `.github/scripts/validate-pr-evidence.cjs`.

### Required Sequence

```bash
pnpm eng-loop:test
pnpm eng-loop:dry-run
pnpm eng-loop:validate -- --command "pnpm validate:quick"
pnpm eng-loop:prepare-pr
PR_BODY="$(cat .tmp/eng-loop-pr-body.md)" node ./.github/scripts/validate-pr-evidence.cjs
```

<!-- ENG-LOOP-20-PR-AUTOMATION:END -->

## ENG-LOOP-23 — Manual GitHub workflow entrypoint

The engineering loop now has a manual GitHub Actions entrypoint:

```text
.github/workflows/engineering-loop-manual.yml
```

Dry-run is the default. Mutation-capable behavior requires explicit inputs and preflight validation. See `docs/runbooks/engineering-loop-manual-workflow.md` for operator instructions.

## ENG-LOOP-24 first-5 batch mode

First-5 mode is a controlled batch mode for the GarageOS engineering loop. It is limited to five eligible tasks and must be run sequentially. Dry-run mode is the required trial path before mutation-capable execution.

### Dry-run

```bash
node ./.github/scripts/eng-loop-runner.cjs --mode=first-5-dry-run
```

Dry-run writes local evidence only under `.tmp/eng-loop-batch-summary.json` and `.tmp/eng-loop-batch-summary.md`. It must not mutate Notion, create branches, create PRs, or claim tasks.

### Mutation-capable first-5 run

```bash
node ./.github/scripts/eng-loop-runner.cjs --mode=first-5 --confirm-first-5
```

Manual workflow execution must use `max_tasks=5`, `dry_run=false`, and `mutation_confirmation=ENG-LOOP-24-FIRST-5`.

### Stop conditions

The batch stops immediately on claim conflict, malformed task, validation failure, CI failure, unsafe state, follow-up creation, or unexpected runner error. Downstream tasks must not be processed after the first failure.

## Codex-Powered First-5 PR Automation

The live first-5 command now delegates implementation work to Codex CLI and creates reviewable PRs:

```bash
pnpm eng-loop:first-5
```

Use the dry-run command first to inspect the planned task, branch, Codex, validation, push, and PR actions:

```bash
pnpm eng-loop:first-5:dry-run
cat .tmp/eng-loop-codex-pr-plan.md
```

The previous claim-only behavior remains available as:

```bash
pnpm eng-loop:first-5:claim
```

See `docs/runbooks/engineering-loop-codex-pr-automation.md` for preflight requirements, stop conditions, and evidence files.

## Task scope selection

Task selection scope is documented in [Engineering Loop Task Scope](./engineering-loop-task-scope.md). Use `--task-scope=all` to select any eligible GarageOS tracker task and `--task-scope=eng-loop` to preserve ENG-LOOP-only selection.
