# GarageOS Machine-Readable Notion Task Schema

**Document:** `docs/engineering/notion-task-schema.md`  
**Task:** ENG-LOOP-16 — Add machine-readable Notion task schema  
**Status:** Implementation contract  
**Scope:** Engineering-loop automation only

## 1. Purpose

This document defines the canonical machine-readable Notion task schema for the GarageOS automatic engineering loop.

The schema converts the human-readable Notion tracker into a stable automation contract that future runner tasks can safely query, validate, select, and update without guessing field names, task eligibility rules, status transitions, dependency rules, validation requirements, or failure behavior.

## 2. Scope

This document covers only the Notion task contract used by the GarageOS engineering-loop automation.

Included:

- Required and optional Notion task fields.
- Runner read-only fields.
- Future runner-writable fields.
- Future append/evidence fields.
- Status values and transition rules.
- Dependency representation before a first-class Notion relation exists.
- Task eligibility and one-task-at-a-time selection.
- Task description/content requirements.
- Safe malformed-task behavior.
- Validation command handling.
- Commit, branch, PR, and failure metadata rules.

## 3. Non-Scope

This task must not introduce runtime automation.

Excluded from ENG-LOOP-16:

- No Notion API write implementation.
- No task claiming implementation.
- No run ledger implementation.
- No Git branch creation implementation.
- No GitHub PR creation implementation.
- No GitHub Actions watcher implementation.
- No follow-up task creation implementation.
- No GarageOS product behavior, API, database, permission, or UI changes.

Runtime implementation belongs to later ENG-LOOP tasks.

## 4. Source-of-Truth Rules

The automatic engineering loop must follow this priority order:

1. Project documentation.
2. Approved architecture decisions.
3. Existing repository implementation.
4. Current Notion task contract.
5. Current task page content.
6. User-provided command output and PR evidence.

The runner must not invent undocumented behavior, routes, fields, statuses, validation commands, or completion rules.

If a Notion task is missing required machine-readable fields, the runner must skip the task and produce evidence instead of attempting a best-effort mutation.

## 5. Contract Version

```yaml
contract_id: garageos.notion_task_schema
contract_version: 1
owner: engineering-loop
runtime_writes_implemented: false
minimum_runner_behavior: safe-read-and-skip
```

`runtime_writes_implemented: false` means this document defines future write permissions, but ENG-LOOP-16 itself does not implement those writes.

## 6. Current Tracker Minimum Shape

The current tracker must support the following minimum properties for a task to be automation-eligible:

| Field                 | Type            |    Required | Runner Access | Purpose                                             |
| --------------------- | --------------- | ----------: | ------------- | --------------------------------------------------- |
| `Task`                | Title           |         Yes | Read-only     | Stable human-readable task title and task ID.       |
| `Status`              | Status / Select |         Yes | Future write  | Task lifecycle state.                               |
| `Codex Ready`         | Checkbox        |         Yes | Read-only     | Eligibility gate for automated selection.           |
| `Priority`            | Select / Text   |         Yes | Read-only     | Selection ordering.                                 |
| `Category`            | Select / Text   |         Yes | Read-only     | Work classification.                                |
| `Dependencies`        | Text            | Conditional | Read-only     | Dependency IDs before first-class relation support. |
| `Repository`          | Text            |         Yes | Read-only     | Repository safety guard.                            |
| `Branch`              | Text            |         Yes | Read-only     | Expected working branch.                            |
| `Validation Commands` | Text            |         Yes | Read-only     | Required local validation.                          |
| `Progress Source`     | Text            |         Yes | Future write  | Human-readable automation evidence summary.         |
| `Source Alignment`    | Text            |         Yes | Read-only     | Scope and documentation alignment.                  |
| `Commit Message`      | Text            |    Optional | Read-only     | Suggested commit message.                           |
| `Commit SHA`          | Text            |    Optional | Future write  | Merge/commit evidence after implementation.         |
| `Commit URL`          | URL / Text      |    Optional | Future write  | Remote commit evidence after implementation.        |
| `Review ID`           | Text            |    Optional | Future write  | PR/review evidence after PR creation.               |
| `Author`              | Text / People   |    Optional | Read-only     | Human owner or creator.                             |
| `File`                | Text            |    Optional | Read-only     | File-level follow-up reference.                     |
| `Line`                | Text / Number   |    Optional | Read-only     | Line-level follow-up reference.                     |
| `Item Type`           | Select / Text   |    Optional | Read-only     | Documentation, bug, feature, test, etc.             |
| `Milestone`           | Select / Text   |    Optional | Read-only     | Roadmap grouping.                                   |
| `Created At`          | Date            |    Optional | Read-only     | Deterministic tie-breaker.                          |
| `url`                 | URL             |    Optional | Read-only     | Direct Notion task URL.                             |

## 7. Field Ownership Classes

### 7.1 Human-Owned Fields

Human-owned fields must not be changed by the runner unless a later task explicitly implements and validates safe writes.

- `Task`
- `Priority`
- `Category`
- `Dependencies`
- `Repository`
- `Branch`
- `Validation Commands`
- `Source Alignment`
- `Commit Message`
- `Author`
- `File`
- `Line`
- `Item Type`
- `Milestone`
- `Created At`

### 7.2 Future Runner-Writable Fields

These fields may be written by later automation tasks only after Notion writes are implemented safely.

- `Status`
- `Progress Source`
- `Commit SHA`
- `Commit URL`
- `Review ID`

### 7.3 Forbidden Runner Fields

The runner must not create, rename, delete, or retype Notion properties during normal task execution.

Schema migration or tracker restructuring must be handled manually or by a dedicated documentation/task-tracker migration task.

## 8. Task ID Rules

A task ID must match this pattern:

```regex
^ENG-LOOP-[0-9]+$
```

The `Task` title should begin with the task ID followed by a separator and title, for example:

```text
ENG-LOOP-16 — Add machine-readable Notion task schema
```

The runner must parse the first `ENG-LOOP-[0-9]+` token from the task title as the canonical task ID.

If no task ID can be parsed, the task is malformed and must be skipped.

## 9. Status Values

The minimum supported statuses are:

| Status        | Meaning                                                          | Runner Selection Behavior                                              |
| ------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `Backlog`     | Task exists but is not currently claimed.                        | Eligible only when `Codex Ready` is checked and dependencies are done. |
| `Ready`       | Task is ready for execution if this value exists in the tracker. | Eligible when `Codex Ready` is checked and dependencies are done.      |
| `In Progress` | Task has been claimed or manually started.                       | Not eligible for new selection.                                        |
| `Done`        | Task has completed and evidence is accepted.                     | Not eligible for new selection; can satisfy dependencies.              |

Optional future statuses:

| Status    | Meaning                                                          | Rule                                         |
| --------- | ---------------------------------------------------------------- | -------------------------------------------- |
| `Blocked` | Task cannot proceed due to missing info or failed preconditions. | Use only if the tracker already supports it. |
| `Failed`  | Automated run failed after allowed validation/retry behavior.    | Use only if the tracker already supports it. |

If `Blocked` or `Failed` are not configured in the current tracker, the runner must keep the task status unchanged and write or emit failure evidence through the supported evidence channel once writes exist.

## 10. Status Transition Rules

Allowed future transitions:

| From          | To            | Actor                  | Condition                                                                                        |
| ------------- | ------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| `Backlog`     | `In Progress` | Human or future runner | Task is eligible and selected.                                                                   |
| `Ready`       | `In Progress` | Human or future runner | Task is eligible and selected.                                                                   |
| `In Progress` | `Done`        | Human or future runner | Validation, PR, and completion evidence are satisfied by later tasks.                            |
| `In Progress` | `Blocked`     | Human or future runner | Supported status exists and required input is missing.                                           |
| `In Progress` | `Failed`      | Future runner          | Supported status exists and validation or PR automation fails according to later failure policy. |
| `Blocked`     | `Ready`       | Human                  | Missing information has been corrected.                                                          |
| `Failed`      | `Ready`       | Human                  | Failure has been triaged and task is ready to retry.                                             |

Forbidden transitions:

- `Done` back to `In Progress` by automation.
- Any transition from unknown status values.
- Any transition that skips validation evidence.
- Any transition for a malformed task.

ENG-LOOP-16 does not implement these writes; it only defines the contract.

## 11. Dependency Rules

Until a first-class Notion relation exists, dependencies are represented in the `Dependencies` text field.

Supported formats:

```text
ENG-LOOP-15
ENG-LOOP-15, ENG-LOOP-16
ENG-LOOP-15
ENG-LOOP-16
```

Parsing rules:

1. Extract every `ENG-LOOP-[0-9]+` token.
2. Ignore whitespace and commas.
3. Preserve the extracted task IDs as the dependency set.
4. Treat unparseable non-empty dependency text as malformed.
5. A dependency is satisfied only when the matching task's `Status` is `Done`.
6. A task must not depend on itself.

If a dependency ID is referenced but not found in the tracker, the task is not eligible.

## 12. Eligibility Rules

A task is eligible for future automatic selection only when all of these conditions are true:

```yaml
eligible_when:
  codex_ready: true
  status_in:
    - Backlog
    - Ready
  repository: dev-jeyelscott/garageos
  task_id_present: true
  branch_present: true
  validation_commands_present: true
  source_alignment_present: true
  dependencies_done: true
  task_content_has_required_sections: true
  malformed: false
```

Required content sections:

- Goal or automation task details.
- Scope or detailed scope.
- Requirements.
- Deliverables.
- Acceptance criteria.
- Validation.
- Stop conditions or failure handling.

If the task content is unavailable to the runner, it must rely only on properties and skip tasks that cannot be validated safely.

## 13. Task Selection Rules

The runner must select at most one task per run.

Recommended deterministic ordering:

1. Priority order: `P0`, `P1`, `P2`, `P3`.
2. Earliest `Created At` date.
3. Lowest numeric task ID.
4. Lexicographic `Task` title as final tie-breaker.

The runner must not select:

- More than one task.
- A task already `In Progress`.
- A task with incomplete dependencies.
- A task from another repository.
- A task missing validation commands.
- A malformed task.

## 14. Validation Command Rules

The `Validation Commands` field must contain deterministic commands that can be run from repository root.

Valid examples:

```bash
pnpm validate:quick
pnpm validate:docs
pnpm validate:security
```

Rules:

1. Commands must not require interactive prompts.
2. Commands must not mutate remote systems.
3. Commands must not require secrets unless the task explicitly documents the secret requirement and safe fallback.
4. The runner must execute only documented validation commands for the selected task.
5. If multiple commands are listed, they must run in listed order.
6. A task without validation commands is not eligible.

## 15. Branch and Commit Metadata Rules

The `Branch` field is the expected branch name for implementation work.

Rules:

- Branch names must be repository-safe text.
- The runner must not invent a branch if `Branch` is missing in the current minimum contract.
- Future branch automation may create the branch only after task claiming exists.
- `Commit Message` is advisory unless future automation explicitly uses it.
- `Commit SHA` and `Commit URL` are evidence fields populated only after a commit exists.

## 16. PR / Review Metadata Rules

`Review ID` is reserved for future PR or review evidence.

Until PR automation exists, the runner must not require `Review ID` for task eligibility.

Later automation may use this field for:

- GitHub PR number.
- GitHub PR URL.
- AI review ID.
- Manual review evidence ID.

The exact format must be defined by the PR automation task before writes are enabled.

## 17. Progress and Failure Evidence Rules

`Progress Source` is the human-readable evidence field.

Recommended future update format:

```text
<ISO timestamp> — <actor> — <short event summary>. Evidence: <command/result/URL>. Next: <next action or none>.
```

Examples:

```text
2026-07-05T15:45:00+08:00 — engineering-loop — Selected task for dry-run only. No mutations performed.
2026-07-05T15:50:00+08:00 — engineering-loop — Skipped task: missing Validation Commands.
```

Failure evidence must include:

- Failure category.
- Failed command or precondition.
- Short reason.
- Whether retry is safe.
- Follow-up task recommendation when applicable.

## 18. Malformed Task Handling

Malformed tasks must be skipped safely.

| Malformed Condition                | Required Behavior                         |
| ---------------------------------- | ----------------------------------------- |
| Missing `Task`                     | Skip. Cannot identify the task.           |
| Missing task ID in `Task`          | Skip. Cannot create stable run identity.  |
| Missing `Status`                   | Skip. Cannot evaluate lifecycle.          |
| Unknown `Status`                   | Skip. Do not mutate unknown states.       |
| `Codex Ready` unchecked or missing | Skip. Not eligible.                       |
| Missing `Repository`               | Skip. Prevent wrong-repository execution. |
| Repository mismatch                | Skip. Prevent cross-repository execution. |
| Missing `Branch`                   | Skip for current contract.                |
| Missing `Validation Commands`      | Skip. Cannot prove safety.                |
| Dependency not found               | Skip. Dependency cannot be verified.      |
| Dependency not `Done`              | Skip. Dependency not satisfied.           |
| Self-dependency                    | Skip. Dependency graph invalid.           |
| Unsupported dependency text        | Skip. Require human correction.           |

The runner must never correct malformed tasks through undocumented mutation.

## 19. Safe Minimum Runner Output

Before Notion writes exist, dry-run output should be enough to prove the contract works.

Minimum output shape:

```json
{
  "contract_id": "garageos.notion_task_schema",
  "contract_version": 1,
  "selected_task": {
    "task_id": "ENG-LOOP-16",
    "title": "ENG-LOOP-16 — Add machine-readable Notion task schema",
    "repository": "dev-jeyelscott/garageos",
    "branch": "docs/eng-loop-16-notion-task-schema",
    "validation_commands": ["pnpm validate:quick"]
  },
  "skipped_tasks": [
    {
      "task_id": "ENG-LOOP-17",
      "reason": "dependency_not_done",
      "dependency": "ENG-LOOP-16"
    }
  ]
}
```

## 20. Stop Conditions

The runner must stop without mutation when:

- More than one task appears claimable but ordering cannot be resolved deterministically.
- The selected task changes during a future claim operation.
- Required Notion fields are unavailable.
- The Notion tracker schema cannot be read.
- Dependency status cannot be verified.
- Validation commands are missing.
- Repository identity does not match.
- A status transition would be unsupported.
- A write target field is missing or has an incompatible type.

## 21. Follow-Up Schema Enhancements

These are allowed follow-up improvements but are not required for ENG-LOOP-16 completion:

- First-class dependency relation property.
- Dedicated `Failure Category` select field.
- Dedicated `Failure Details` rich-text field.
- Dedicated `Run ID` field.
- Dedicated `Claimed At` date field.
- Dedicated `Claimed By` field.
- Dedicated `PR URL` field.
- Dedicated `Last Validation Result` field.
- Dedicated `Last Automation Event At` field.

If these fields are needed, create a follow-up task instead of silently assuming they exist.

## 22. Acceptance Criteria

ENG-LOOP-16 is complete when:

- This schema document exists.
- Required, optional, read-only, future runner-writable, and evidence fields are separated.
- Eligibility rules can be implemented without guessing.
- Dependency rules are explicit.
- Status transition rules are explicit.
- Missing or malformed task behavior is safe skip with evidence.
- No runtime automation or Notion writes are introduced.
- Related engineering-loop documentation references this contract when applicable.
- The progress tracker reflects ENG-LOOP-16 implementation progress.
- `pnpm validate:quick` passes.
