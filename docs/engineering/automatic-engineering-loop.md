# Automatic Engineering Loop Contract

**Task:** ENG-LOOP-15 — Define automatic engineering-loop contract  
**Status:** In Progress  
**Change Type:** Documentation-only engineering-loop contract  
**Validation:** `pnpm validate:quick`

## 1. Purpose

This document defines the source-of-truth contract for the GarageOS automatic engineering loop.

The automatic engineering loop is a controlled automation workflow that will eventually:

1. Read eligible engineering tasks from the Notion task tracker.
2. Claim exactly one task at a time, unless an explicitly bounded batch mode is selected.
3. Implement the task in the GarageOS repository.
4. Run the required local validation before PR creation.
5. Generate PR evidence.
6. Open or prepare a pull request.
7. Observe GitHub validation status.
8. Synchronize task progress back to Notion.
9. Create follow-up tasks when validation fails, CI fails, requirements are missing, or additional work is discovered.

ENG-LOOP-15 defines the contract only. It does not introduce runtime automation, repository mutation automation, GitHub mutation automation, Notion mutation automation, or scheduler behavior.

## 2. Source Alignment

This contract follows the GarageOS documentation-first engineering model:

1. Project documentation remains the source of truth.
2. Approved architecture decisions remain binding implementation guidance.
3. Existing repository patterns must be respected.
4. Missing information must stop automation or create a follow-up task instead of inventing behavior.
5. Runtime implementation must remain incremental and safe.

The automatic engineering loop must remain scoped to engineering delivery automation. It must not add GarageOS product capabilities, APIs, database schema, permissions, UI behavior, SaaS subscription behavior, tenant behavior, or operational workflows unless a claimed task explicitly requires those changes and source documentation supports them.

## 3. Non-Goals

The automatic engineering loop must not:

- Merge pull requests automatically.
- Bypass branch protection.
- Mark a task Done without required validation evidence.
- Skip local validation before PR creation.
- Continue after an unsafe or ambiguous requirement is detected.
- Run unbounded batches.
- Run multiple implementation tasks in parallel.
- Silently overwrite manual Notion tracker decisions.
- Silently overwrite maintainer-authored repository work.
- Create undocumented GarageOS product scope.
- Treat AI review as authoritative over deterministic validation and maintainer review.

## 4. Actors and Responsibilities

| Actor                     | Responsibility                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Notion Task Tracker       | Stores task metadata, status, priority, dependency, branch, validation command, source alignment, and progress source.                     |
| Engineering Loop Runner   | Orchestrates task discovery, eligibility checks, claiming, execution mode, validation handoff, PR handoff, status sync, and stop behavior. |
| Implementation Agent      | Performs scoped repository changes for the claimed task.                                                                                   |
| Local Validation Executor | Runs task-defined validation commands and records validation evidence.                                                                     |
| PR Evidence Generator     | Produces a PR body with source alignment, scope, validation evidence, and risk notes.                                                      |
| GitHub Actions            | Runs deterministic CI validation for the PR.                                                                                               |
| GitHub Status Watcher     | Reads required check status and reports pending, pass, fail, cancelled, timed out, or unknown.                                             |
| Notion Sync Adapter       | Updates task status and progress source only through documented transitions.                                                               |
| Follow-Up Task Creator    | Creates new Notion tasks for failed, blocked, or discovered work.                                                                          |

## 5. Required Task Metadata

A task is not eligible unless the runner can read the following fields:

| Field               | Requirement                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Task                | Must include stable task ID and title, such as `ENG-LOOP-15 — Define automatic engineering-loop contract`.                     |
| Status              | Must be a recognized tracker status.                                                                                           |
| Priority            | Must be present and sortable, such as P0, P1, or P2.                                                                           |
| Category            | Must identify the work category, such as Documentation, Testing, Observability, Reliability, Maintainability, or Architecture. |
| Repository          | Must match the configured repository.                                                                                          |
| Branch              | Must be present or derivable from the task ID and title.                                                                       |
| Dependencies        | Must be empty or reference completed tasks.                                                                                    |
| Codex Ready         | Must explicitly indicate the task is safe for automation.                                                                      |
| Validation Commands | Must include at least one command for local validation.                                                                        |
| Acceptance Criteria | Must define completion requirements.                                                                                           |
| Source Alignment    | Must describe the allowed source scope.                                                                                        |
| Progress Source     | Must be writable by the tracker sync step.                                                                                     |

## 6. Task Eligibility Rules

A task is eligible only when all rules below pass:

1. The task status is `Backlog` or another explicitly configured eligible intake status.
2. `Codex Ready` is true.
3. The repository matches the configured GarageOS repository.
4. All dependencies are Done.
5. The task has acceptance criteria.
6. The task has validation commands.
7. The task has source-alignment notes.
8. The task has no active claim from another runner.
9. The task is not manually blocked.
10. The task is not already represented by an open PR unless the runner is explicitly resuming that same task.
11. The task category is supported by the current runner mode.
12. The task can be completed without violating documentation, architecture, validation, security, or repository safety rules.

If any eligibility rule fails, the runner must skip the task or stop with a clear reason. It must not guess missing values.

## 7. Deterministic Selection Order

When multiple tasks are eligible, the runner must select deterministically:

1. Highest priority first: P0, then P1, then P2.
2. Dependency order before independent later tasks.
3. Oldest Created At date first.
4. Lowest task ID first.
5. Stable title sort as a final tie-breaker.

The runner must record why a task was selected.

## 8. Claim and Lock Rules

Before implementation begins, the runner must claim the task.

A claim must record:

| Claim Field                  | Requirement                               |
| ---------------------------- | ----------------------------------------- |
| Run ID                       | Unique ID for the automation run.         |
| Claimed By                   | Runner identity.                          |
| Claimed At                   | Timestamp.                                |
| Claim Expires At             | Timestamp for stale-claim recovery.       |
| Branch                       | Branch assigned to the claimed task.      |
| Original Status              | Status before claim.                      |
| Task Snapshot Hash           | Hash of task metadata used for execution. |
| Validation Commands Snapshot | Commands the runner intends to execute.   |

The runner must not claim a task already claimed by a non-expired active run.

A stale claim may be recovered only when:

1. Claim expiration has passed.
2. No open PR exists for the claimed branch, or the open PR is explicitly tied to the stale run and marked recoverable.
3. The previous run did not reach an uncertain mutation state.
4. Recovery is recorded in progress notes.

## 9. One-Task Mode

One-task mode is the default safe execution mode.

Required behavior:

1. Discover eligible tasks.
2. Select one task.
3. Claim the task.
4. Set tracker status to `In Progress`.
5. Create or use the task branch.
6. Apply implementation changes.
7. Run local validation.
8. Generate PR evidence.
9. Prepare or open the PR, depending on the enabled runner capability.
10. Stop after the configured terminal point.

One-task mode must never pick a second task during the same run.

## 10. First-5 Mode

First-5 mode is a controlled batch mode for early automation testing.

Required behavior:

1. Select up to five eligible tasks using deterministic ordering.
2. Execute tasks sequentially, never in parallel.
3. Complete or safely stop the current task before starting the next task.
4. Stop immediately on the first failed validation, failed PR creation, failed GitHub validation, unsafe condition, or uncertain sync state unless a future explicit policy allows continue-on-failure.
5. Record batch index, batch size, task ID, outcome, and stop reason.

First-5 mode must remain bounded and must not become an unbounded queue consumer.

## 11. Execution Phases

| Phase             | Required Input              | Required Output                       | Stop on Failure                                |
| ----------------- | --------------------------- | ------------------------------------- | ---------------------------------------------- |
| Discover          | Notion tracker query        | Candidate task list                   | Yes, if tracker cannot be read.                |
| Check Eligibility | Candidate task metadata     | Eligible task list with skip reasons  | No, skip ineligible tasks.                     |
| Claim             | Eligible task               | Claim metadata and In Progress status | Yes.                                           |
| Prepare Branch    | Claim metadata              | Existing or created task branch       | Yes.                                           |
| Implement         | Task details and repository | Scoped repository changes             | Yes.                                           |
| Local Validation  | Validation commands         | Validation evidence                   | Yes.                                           |
| PR Evidence       | Diff and validation output  | PR body                               | Yes.                                           |
| PR Handoff        | Branch and PR body          | PR opened or PR-ready artifact        | Yes.                                           |
| GitHub Watch      | PR checks                   | Required-check result                 | Yes for failure or timeout.                    |
| Notion Sync       | Outcome                     | Tracker status update                 | Yes if sync uncertainty affects final state.   |
| Follow-Up         | Failure/discovery evidence  | New follow-up task                    | Yes if creation fails after a blocking defect. |

## 12. Validation Contract

The local validation executor must:

1. Run exactly the commands required by the task, plus any globally required validation for the risk class.
2. Capture command text, exit code, start time, end time, and a bounded output summary.
3. Treat non-zero exit codes as failures.
4. Block PR creation when required validation fails.
5. Preserve enough evidence for the PR body and Notion progress source.
6. Avoid claiming validation passed unless commands actually ran and passed.

Documentation-only tasks may use `pnpm validate:quick` when that is the task-defined validation command.

## 13. PR Evidence Contract

A generated PR body must include:

1. Summary.
2. Source Alignment.
3. Scope.
4. Files Changed.
5. Runtime Impact.
6. Validation Evidence.
7. Risk Class.
8. Failure/Follow-Up Notes.
9. Manual Review Notes.
10. Merge Readiness Checklist.

PR evidence must never claim a validation command passed unless the runner observed it passing.

## 14. GitHub Status Contract

The GitHub status watcher must classify PR validation as one of:

| Status      | Meaning                                                            |
| ----------- | ------------------------------------------------------------------ |
| `pending`   | Required checks have not completed.                                |
| `success`   | All required checks passed.                                        |
| `failure`   | At least one required check failed.                                |
| `cancelled` | Required validation was cancelled.                                 |
| `timed_out` | Required validation did not complete within the configured window. |
| `unknown`   | Status could not be safely determined.                             |

Only `success` may advance a task toward Done.

## 15. Notion Sync Contract

The runner must use documented transitions only.

| Source State     | Target State                      | Allowed When                                                                |
| ---------------- | --------------------------------- | --------------------------------------------------------------------------- |
| `Backlog`        | `In Progress`                     | Task is eligible and successfully claimed.                                  |
| `In Progress`    | `Review`                          | PR is opened or PR-ready handoff is complete, depending on configured mode. |
| `Review`         | `Done`                            | Required GitHub validation passed and completion policy is satisfied.       |
| `In Progress`    | `Blocked`                         | Work cannot proceed safely.                                                 |
| `Review`         | `Blocked`                         | PR validation failed or manual review blocks completion.                    |
| Any active state | `Follow-up Created` or equivalent | A child/follow-up task was created for remaining work.                      |

If the tracker sync fails, the runner must not assume the tracker state changed.

## 16. Done Policy

A task may be marked Done only when all required conditions are true:

1. The scoped implementation is complete.
2. Required local validation passed.
3. PR evidence exists.
4. Required GitHub checks passed, when PR validation is in scope.
5. No blocking follow-up remains for the same acceptance criteria.
6. The Notion update succeeds.
7. The repository progress tracker is aligned.

For documentation-only tasks that do not require runtime changes, Done still requires the documented validation command and review/merge policy required by the repository.

## 17. Follow-Up Task Contract

A follow-up task must be created when:

1. Local validation fails and the fix is outside the safe scope of the current task.
2. GitHub validation fails after PR creation.
3. AI review, maintainer review, or deterministic validation identifies a real defect.
4. Required metadata is missing.
5. Source documentation conflicts with repository implementation and manual decision is required.
6. A discovered issue is valid but not part of the current task acceptance criteria.
7. Automation reaches an uncertain state that requires manual recovery.

A follow-up task must include:

| Field                | Requirement                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| Parent Task          | Original task ID.                                                                                    |
| Failure Source       | Local validation, GitHub CI, review, metadata, dependency, implementation, sync, or manual decision. |
| Evidence             | Bounded evidence summary.                                                                            |
| Required Fix         | Concrete next action.                                                                                |
| Suggested Validation | Commands or checks required to close the follow-up.                                                  |
| Priority             | Based on severity and blocking impact.                                                               |
| Category             | Testing, Reliability, Documentation, Observability, Architecture, or Maintainability.                |
| Dependency           | Parent or blocking task reference where applicable.                                                  |

## 18. Safety and Security Rules

The runner must:

1. Use least privilege for Notion and GitHub access.
2. Avoid logging secrets, tokens, credentials, provider payloads, or private environment values.
3. Treat repository mutation as explicit and auditable.
4. Never force-push unless a future approved policy explicitly allows it for runner-created branches.
5. Never mutate protected branches directly.
6. Never bypass required validation.
7. Stop on unexpected file deletion, unexpected branch state, unknown PR status, or ambiguous tracker status.

## 19. Observability Contract

Each run should eventually record:

1. Run ID.
2. Task ID.
3. Mode: one-task or first-5.
4. Start and end timestamps.
5. Selected task reason.
6. Skip reasons for ineligible tasks.
7. Claim metadata.
8. Validation evidence summary.
9. PR URL or PR-ready artifact path.
10. GitHub validation status.
11. Notion sync status.
12. Follow-up task IDs.
13. Final outcome.
14. Stop reason.

ENG-LOOP-18 is expected to implement the task claiming and run ledger. This document defines the contract that future implementation should follow.

## 20. Acceptance Criteria for ENG-LOOP-15

ENG-LOOP-15 is complete when:

1. This contract document exists.
2. The state-machine document exists.
3. The failure-policy document exists.
4. The progress tracker marks ENG-LOOP-15 as In Progress or Done according to the current repository stage.
5. No runtime behavior changes are introduced.
6. `pnpm validate:quick` passes.

## Machine-Readable Notion Task Contract

The automatic engineering loop reads task metadata using the canonical schema documented in [`docs/engineering/notion-task-schema.md`](./notion-task-schema.md).

Runner implementations must not infer undocumented Notion fields, task statuses, dependency rules, validation commands, or writable fields. Missing or malformed task metadata must be handled as a safe skip with evidence rather than best-effort mutation.
