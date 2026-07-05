# Automatic Engineering Loop States

**Task:** ENG-LOOP-15 — Define automatic engineering-loop contract  
**Status:** In Progress  
**Change Type:** Documentation-only state model

## 1. Purpose

This document defines the state model for the GarageOS automatic engineering loop.

The states in this document are intended to guide future machine-readable Notion task schema work, dry-run runner implementation, claiming, run ledger, local validation execution, PR automation, GitHub status watching, follow-up task creation, and first-5 batch mode.

ENG-LOOP-15 does not implement these states in runtime code.

## 2. State Principles

1. State transitions must be explicit.
2. A runner must not skip validation states.
3. A runner must not mark a task Done from an uncertain state.
4. Failure states must preserve evidence.
5. Retryable and non-retryable states must be distinguishable.
6. Manual review states must stop automation.
7. One task must have at most one active claim.
8. First-5 mode must process tasks sequentially.

## 3. State Catalog

| State                         | Type               | Meaning                                                               |
| ----------------------------- | ------------------ | --------------------------------------------------------------------- |
| `backlog`                     | Intake             | Task exists but has not been selected.                                |
| `ineligible`                  | Intake             | Task failed eligibility checks.                                       |
| `eligible`                    | Intake             | Task passed eligibility checks and may be selected.                   |
| `claim_pending`               | Claim              | Runner is attempting to reserve the task.                             |
| `claimed`                     | Claim              | Runner has reserved the task.                                         |
| `claim_conflict`              | Claim failure      | Another active claim exists or claim could not be safely acquired.    |
| `in_progress`                 | Work               | Task implementation is active.                                        |
| `branch_prepared`             | Work               | Task branch exists and is ready for scoped changes.                   |
| `implementation_complete`     | Work               | Repository changes for the task are complete before local validation. |
| `local_validation_running`    | Validation         | Local validation command is executing.                                |
| `local_validation_passed`     | Validation         | Required local validation passed.                                     |
| `local_validation_failed`     | Validation failure | Required local validation failed.                                     |
| `pr_evidence_ready`           | PR                 | PR body/evidence has been generated.                                  |
| `pr_opened`                   | PR                 | Pull request exists.                                                  |
| `pr_handoff_ready`            | PR                 | PR-ready artifact exists, but automated PR creation is not enabled.   |
| `github_validation_pending`   | GitHub             | Required GitHub checks are running or queued.                         |
| `github_validation_passed`    | GitHub             | Required GitHub checks passed.                                        |
| `github_validation_failed`    | GitHub failure     | One or more required checks failed.                                   |
| `github_validation_cancelled` | GitHub failure     | Required validation was cancelled.                                    |
| `github_validation_timed_out` | GitHub failure     | Required validation did not complete within the configured window.    |
| `notion_sync_pending`         | Sync               | Tracker update is pending.                                            |
| `notion_sync_failed`          | Sync failure       | Tracker update failed or is uncertain.                                |
| `follow_up_required`          | Follow-up          | A follow-up task is required before completion.                       |
| `follow_up_created`           | Follow-up terminal | Follow-up task was created and linked.                                |
| `blocked`                     | Terminal/manual    | Task cannot proceed without manual intervention.                      |
| `manual_review_required`      | Terminal/manual    | Human decision is required before continuing.                         |
| `done`                        | Terminal/success   | Task completion policy has been satisfied and tracker sync succeeded. |

## 4. Allowed Transitions

| From                          | To                            | Condition                                                                |
| ----------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `backlog`                     | `eligible`                    | Metadata, dependency, readiness, and safety checks pass.                 |
| `backlog`                     | `ineligible`                  | Eligibility check fails.                                                 |
| `eligible`                    | `claim_pending`               | Runner selected the task.                                                |
| `claim_pending`               | `claimed`                     | Claim is acquired.                                                       |
| `claim_pending`               | `claim_conflict`              | Active claim exists or claim cannot be acquired safely.                  |
| `claimed`                     | `in_progress`                 | Tracker sync to In Progress succeeds.                                    |
| `in_progress`                 | `branch_prepared`             | Branch exists or is created safely.                                      |
| `branch_prepared`             | `implementation_complete`     | Scoped implementation changes are complete.                              |
| `implementation_complete`     | `local_validation_running`    | Required validation begins.                                              |
| `local_validation_running`    | `local_validation_passed`     | Validation command exits successfully.                                   |
| `local_validation_running`    | `local_validation_failed`     | Validation command exits unsuccessfully.                                 |
| `local_validation_passed`     | `pr_evidence_ready`           | PR body/evidence is generated.                                           |
| `pr_evidence_ready`           | `pr_opened`                   | PR creation is enabled and succeeds.                                     |
| `pr_evidence_ready`           | `pr_handoff_ready`            | PR creation is manual or disabled, but PR-ready artifact exists.         |
| `pr_opened`                   | `github_validation_pending`   | Required checks are queued or running.                                   |
| `github_validation_pending`   | `github_validation_passed`    | Required checks pass.                                                    |
| `github_validation_pending`   | `github_validation_failed`    | Required checks fail.                                                    |
| `github_validation_pending`   | `github_validation_cancelled` | Required checks are cancelled.                                           |
| `github_validation_pending`   | `github_validation_timed_out` | Required checks exceed timeout.                                          |
| `github_validation_passed`    | `notion_sync_pending`         | Completion policy permits tracker update.                                |
| `notion_sync_pending`         | `done`                        | Notion tracker update succeeds.                                          |
| `notion_sync_pending`         | `notion_sync_failed`          | Tracker update fails or is uncertain.                                    |
| `local_validation_failed`     | `follow_up_required`          | Failure requires new work item.                                          |
| `github_validation_failed`    | `follow_up_required`          | CI failure requires new work item.                                       |
| `github_validation_cancelled` | `manual_review_required`      | Cancellation reason is not safely known.                                 |
| `github_validation_timed_out` | `manual_review_required`      | Timeout requires human decision or rerun.                                |
| `follow_up_required`          | `follow_up_created`           | Follow-up task creation succeeds.                                        |
| Any non-terminal state        | `blocked`                     | Safe continuation is impossible.                                         |
| Any non-terminal state        | `manual_review_required`      | Documentation conflict, unsafe mutation, or ambiguous scope is detected. |

## 5. Disallowed Transitions

The runner must never perform these transitions:

| From                       | To            | Reason                                                                                     |
| -------------------------- | ------------- | ------------------------------------------------------------------------------------------ |
| `backlog`                  | `in_progress` | Claim and eligibility checks would be skipped.                                             |
| `claimed`                  | `done`        | Implementation and validation would be skipped.                                            |
| `implementation_complete`  | `pr_opened`   | Local validation and PR evidence would be skipped.                                         |
| `local_validation_failed`  | `pr_opened`   | Failed validation must block PR creation unless a future explicit exception policy exists. |
| `github_validation_failed` | `done`        | Failed CI cannot complete a task.                                                          |
| `notion_sync_failed`       | `done`        | Tracker state is uncertain.                                                                |
| `manual_review_required`   | `done`        | Human decision is required.                                                                |
| `blocked`                  | `done`        | Blocked work cannot be completed by automation.                                            |

## 6. Terminal States

| Terminal State           | Meaning                                     | Retry Allowed                                               |
| ------------------------ | ------------------------------------------- | ----------------------------------------------------------- |
| `done`                   | Task completed successfully.                | No.                                                         |
| `blocked`                | Task is blocked and requires manual action. | No automatic retry.                                         |
| `manual_review_required` | Human decision required.                    | No automatic retry.                                         |
| `follow_up_created`      | Current task produced a follow-up item.     | No automatic retry unless a future task reclaims it.        |
| `claim_conflict`         | Another run owns the task.                  | The runner may skip; stale recovery requires policy checks. |
| `notion_sync_failed`     | Tracker state uncertain.                    | Bounded sync retry only.                                    |

## 7. Notion Status Mapping

| Internal State              | Suggested Notion Status                                                            |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `backlog`                   | Backlog                                                                            |
| `eligible`                  | Backlog                                                                            |
| `claimed`                   | In Progress                                                                        |
| `in_progress`               | In Progress                                                                        |
| `branch_prepared`           | In Progress                                                                        |
| `implementation_complete`   | In Progress                                                                        |
| `local_validation_running`  | In Progress                                                                        |
| `local_validation_passed`   | In Progress                                                                        |
| `pr_evidence_ready`         | In Progress                                                                        |
| `pr_opened`                 | Review                                                                             |
| `pr_handoff_ready`          | Review                                                                             |
| `github_validation_pending` | Review                                                                             |
| `github_validation_passed`  | Review                                                                             |
| `done`                      | Done                                                                               |
| `blocked`                   | Blocked                                                                            |
| `manual_review_required`    | Blocked                                                                            |
| `follow_up_created`         | Blocked or Done, depending on completion policy and remaining acceptance criteria. |

If the tracker does not yet have all suggested statuses, the runner must use the closest configured status and write a clear Progress Source note.

## 8. Run Outcome Values

Every run should produce one final outcome:

| Outcome                    | Meaning                                                         |
| -------------------------- | --------------------------------------------------------------- |
| `succeeded`                | Task reached Done.                                              |
| `pr_ready`                 | PR-ready artifact exists but automated PR creation is disabled. |
| `pr_opened`                | PR exists and task is waiting for review or GitHub validation.  |
| `failed_validation`        | Local validation failed.                                        |
| `failed_github_validation` | Required GitHub checks failed.                                  |
| `blocked`                  | Safe continuation is blocked.                                   |
| `manual_review_required`   | Human decision is required.                                     |
| `sync_failed`              | Notion tracker could not be updated safely.                     |
| `skipped`                  | No eligible task was selected.                                  |

## 9. First-5 Batch State Rules

For first-5 mode:

1. Each task must have its own run segment.
2. The batch must record the ordered list of selected task IDs.
3. The batch must stop on the first task segment that reaches a failure, blocked, manual-review, or sync-failed terminal state.
4. Later tasks in the selected batch must remain unclaimed if the batch stops early.
5. A task must not be considered complete merely because a previous task in the batch completed.

## 10. Invariants

The following invariants must always hold:

1. At most one active claim per task.
2. A task cannot be Done without validation evidence.
3. A failed validation cannot open a PR through automation.
4. A failed GitHub required check cannot mark a task Done.
5. A Notion sync failure cannot be treated as success.
6. First-5 mode cannot execute tasks in parallel.
7. Missing source documentation must stop implementation or create a follow-up task.
8. Runtime behavior must not change for documentation-only tasks.
