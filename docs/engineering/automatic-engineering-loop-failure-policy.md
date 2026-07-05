# Automatic Engineering Loop Failure Policy

**Task:** ENG-LOOP-15 — Define automatic engineering-loop contract  
**Status:** In Progress  
**Change Type:** Documentation-only failure policy

## 1. Purpose

This document defines how the GarageOS automatic engineering loop must behave when a task cannot proceed safely.

The failure policy is intentionally conservative. The runner must prefer stopping with clear evidence over guessing, skipping required validation, or incorrectly moving tracker status forward.

ENG-LOOP-15 documents this policy only. It does not implement runtime failure handling.

## 2. Failure Policy Principles

1. Do not hide failures.
2. Do not mark a task Done from an uncertain state.
3. Do not retry implementation blindly.
4. Do not retry failed tests without code or documentation changes.
5. Do not create duplicate side effects when retrying Notion or GitHub operations.
6. Do not continue a batch after a task fails unless a future approved policy explicitly allows it.
7. Always preserve enough evidence for manual recovery.
8. Create follow-up tasks for valid discovered work outside the current task scope.

## 3. Failure Classes

| Failure Class                   | Examples                                                                                             | Required Behavior                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `tracker_read_failed`           | Notion unavailable, query failed, schema unreadable.                                                 | Stop before claiming a task.                                     |
| `missing_task_metadata`         | Missing validation command, branch, acceptance criteria, repository, or source alignment.            | Do not claim; mark blocked or create follow-up if policy allows. |
| `dependency_not_done`           | Dependency task is not Done.                                                                         | Skip task; do not claim.                                         |
| `not_codex_ready`               | Codex Ready is false or missing.                                                                     | Skip task; do not claim.                                         |
| `claim_conflict`                | Active claim exists for same task.                                                                   | Skip task; do not override claim.                                |
| `stale_claim_uncertain`         | Expired claim but branch or PR state is unclear.                                                     | Stop and require manual review.                                  |
| `branch_prepare_failed`         | Branch exists with unexpected diff, checkout failed, protected branch mutation risk.                 | Stop and require manual review.                                  |
| `implementation_scope_unclear`  | Docs conflict, source missing, acceptance criteria ambiguous.                                        | Stop and require manual review or follow-up.                     |
| `unexpected_file_change`        | Runner would alter unrelated files or delete unexpected files.                                       | Stop.                                                            |
| `local_validation_failed`       | Required local command exits non-zero.                                                               | Do not open PR; record evidence; create follow-up if needed.     |
| `pr_evidence_failed`            | PR body cannot be generated or lacks required validation evidence.                                   | Stop; do not open PR.                                            |
| `pr_creation_failed`            | GitHub mutation failed.                                                                              | Retry only if transient and idempotent; otherwise stop.          |
| `github_validation_failed`      | Required check fails.                                                                                | Do not mark Done; create follow-up task.                         |
| `github_validation_cancelled`   | Required check cancelled.                                                                            | Stop and require manual review unless safe rerun policy exists.  |
| `github_validation_timed_out`   | Checks did not complete within the configured window.                                                | Stop and require manual review or bounded watcher retry.         |
| `notion_sync_failed`            | Status or progress update failed.                                                                    | Retry bounded times; do not assume success.                      |
| `follow_up_creation_failed`     | Follow-up task could not be created for known required work.                                         | Stop and report manual recovery details.                         |
| `unsafe_mutation_attempt`       | Protected branch mutation, force push, merge, delete, or remote setting change outside policy.       | Hard stop.                                                       |
| `secret_or_sensitive_data_risk` | Token, secret, credential, private key, or sensitive environment value would be logged or committed. | Hard stop and require manual remediation.                        |

## 4. Stop Conditions

The runner must stop immediately when any of these conditions occur:

1. Required task metadata is missing.
2. Source documentation is missing or conflicting.
3. Repository state is dirty before task execution and not owned by the runner.
4. The task branch cannot be prepared safely.
5. Required local validation fails.
6. PR evidence cannot be generated accurately.
7. GitHub required checks fail.
8. Notion sync state is uncertain after bounded retries.
9. A protected branch would be mutated directly.
10. A secret or credential may be exposed.
11. First-5 mode encounters the first task failure.
12. The runner cannot determine whether a side effect already occurred.

## 5. Retry Rules

| Operation                 | Retry Policy                                                                    |
| ------------------------- | ------------------------------------------------------------------------------- |
| Notion read               | Retry bounded times for transient failures before task claim.                   |
| Notion status update      | Retry bounded times. If final state is uncertain, stop and report.              |
| GitHub status read        | Retry or poll until configured timeout.                                         |
| GitHub PR creation        | Retry only if idempotency can prove duplicate PRs will not be created.          |
| Local validation command  | Do not automatically retry failed validation without code changes.              |
| Implementation generation | Do not blindly retry. Stop on ambiguous or unsafe output.                       |
| Follow-up task creation   | Retry only if duplicate task prevention exists or idempotency key is available. |
| Branch creation           | Retry only if the resulting branch state is safely known.                       |

Recommended initial retry defaults for future implementation:

| Failure Type                |             Attempts | Notes                           |
| --------------------------- | -------------------: | ------------------------------- |
| Transient Notion read/write |                    3 | Exponential backoff.            |
| Transient GitHub read       |                    5 | Polling or backoff allowed.     |
| PR status watcher           | Configurable timeout | Must not wait forever.          |
| Local validation failure    |  0 automatic retries | Requires implementation change. |
| Unsafe mutation             |                    0 | Hard stop.                      |

## 6. Follow-Up Creation Rules

A follow-up task must be created when a valid required action remains but does not belong safely inside the current task.

Required follow-up fields:

| Field               | Requirement                                                              |
| ------------------- | ------------------------------------------------------------------------ |
| Task Title          | Must describe the needed fix or investigation.                           |
| Parent Task         | Must reference the originating task ID.                                  |
| Category            | Must match the type of work.                                             |
| Priority            | Must reflect blocking severity.                                          |
| Repository          | Must identify the repository.                                            |
| Dependencies        | Should reference the parent or blocking task when appropriate.           |
| Source Alignment    | Must explain the source document or validation evidence behind the work. |
| Validation Commands | Must include expected validation for closure.                            |
| Progress Source     | Must summarize why the follow-up exists.                                 |

Follow-up tasks must not be vague. They must be actionable by a future runner or maintainer.

## 7. Failure-to-Status Mapping

| Failure Class                  | Notion Status          | Progress Source Pattern                                          |
| ------------------------------ | ---------------------- | ---------------------------------------------------------------- |
| `missing_task_metadata`        | Blocked                | Missing required automation metadata: `<field>`.                 |
| `dependency_not_done`          | Backlog                | Skipped because dependency is not Done: `<dependency>`.          |
| `claim_conflict`               | Backlog                | Skipped because task is already claimed by `<run_id>`.           |
| `implementation_scope_unclear` | Blocked                | Manual review required: `<reason>`.                              |
| `local_validation_failed`      | In Progress or Blocked | Local validation failed: `<command>`. Follow-up: `<task_id>`.    |
| `github_validation_failed`     | Review or Blocked      | GitHub validation failed: `<check>`. Follow-up: `<task_id>`.     |
| `notion_sync_failed`           | Unknown/no assumption  | Sync failed after retries. Manual tracker verification required. |
| `unsafe_mutation_attempt`      | Blocked                | Automation stopped due to unsafe mutation risk.                  |
| `follow_up_creation_failed`    | Blocked                | Follow-up creation failed; manual recovery required.             |

If tracker status cannot be updated, the runner must report the intended status and evidence in the run output.

## 8. Local Validation Failure Behavior

When local validation fails:

1. Stop implementation for the task.
2. Do not open a PR.
3. Capture command, exit code, and bounded output summary.
4. Determine whether the failure is inside current task scope.
5. If safely fixable inside scope, allow a future explicit implementation loop to make a scoped correction.
6. If outside scope, create a follow-up task.
7. Keep or set Notion status according to the configured tracker policy.

The runner must not claim validation passed unless it observed a successful command exit.

## 9. GitHub Validation Failure Behavior

When GitHub validation fails:

1. Do not mark the task Done.
2. Record failing workflow/check names.
3. Record PR URL and failure summary.
4. Create a follow-up task if a real code, test, docs, or configuration fix is required.
5. Leave the original task in Review or Blocked according to the configured policy.
6. Stop first-5 batch mode immediately.

## 10. Manual Review Conditions

Manual review is required when:

1. Source documentation conflicts with repository behavior.
2. Acceptance criteria are not testable.
3. A branch or PR already exists but cannot be safely associated with the current run.
4. Validation status is unknown.
5. A required check is cancelled or timed out and no safe retry policy exists.
6. The runner detects possible secret exposure.
7. The task requires repository settings, secrets, branch protection, permissions, or external account changes.
8. The task would require broad refactoring beyond its acceptance criteria.

## 11. Idempotency Expectations

Future implementation must treat these operations as idempotent or duplicate-safe:

1. Task claim creation.
2. Notion status update.
3. Branch creation.
4. PR creation.
5. PR body generation.
6. Follow-up task creation.
7. Run ledger writes.

Each operation should use a stable run ID, task ID, branch name, or request fingerprint to prevent duplicate side effects.

## 12. First-5 Failure Behavior

First-5 mode must stop after the first failed, blocked, manual-review, or sync-uncertain task.

The batch output must include:

1. Batch run ID.
2. Selected task IDs.
3. Completed task IDs.
4. Stopped task ID.
5. Stop state.
6. Stop reason.
7. Follow-up task ID if created.
8. Remaining unclaimed task IDs.

No remaining task in the batch may be claimed after the stop condition.

## 13. Acceptance Criteria for This Policy

This policy is complete when it defines:

1. Failure classes.
2. Stop conditions.
3. Retry behavior.
4. Notion status behavior.
5. Follow-up task rules.
6. Local validation failure behavior.
7. GitHub validation failure behavior.
8. Manual review conditions.
9. First-5 failure behavior.
10. Idempotency expectations.
