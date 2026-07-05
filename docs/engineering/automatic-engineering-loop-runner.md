# Engineering Loop Runner Dry Run

## Purpose

ENG-LOOP-17 adds the first local GarageOS engineering-loop runner entrypoint in **dry-run mode**.

The runner validates Notion-like engineering task records, evaluates eligibility, selects at most one task, and prints a deterministic execution plan. It must not mutate Notion, GitHub, git branches, pull requests, repository files, or local tracker files during the runner execution.

## Command

```bash
pnpm eng-loop:dry-run
```

Equivalent direct command:

```bash
node ./.github/scripts/run-engineering-loop-dry-run.cjs --dry-run
```

Use an explicit fixture file:

```bash
pnpm eng-loop:dry-run -- --tasks-file .github/scripts/fixtures/engineering-loop-tasks.json
```

Machine-readable output only:

```bash
pnpm eng-loop:dry-run -- --json
```

## Inputs

By default, the dry-run runner reads:

```text
.github/scripts/fixtures/engineering-loop-tasks.json
```

You may override task input with:

1. `--tasks-file path/to/tasks.json`
2. `ENGINEERING_LOOP_TASKS_JSON='[...]'`

The input must be a JSON array of Notion-like task records.

## Schema loading

The runner prefers an ENG-LOOP-16 machine-readable schema from one of these paths:

```text
docs/engineering/notion-task-schema.json
docs/engineering/engineering-loop-task-schema.json
docs/engineering/automatic-engineering-loop-task-schema.json
docs/engineering/notion-engineering-task-schema.json
.github/scripts/engineering-loop-task-schema.json
```

If none exists, the runner uses a built-in fallback schema that matches the ENG-LOOP-17 required task fields. The fallback exists only to keep local fixture dry-runs and focused tests usable before real Notion reads are wired.

## Required task fields

The dry-run runner expects these fields:

```text
Task
Status
Priority
Category
Dependencies
Codex Ready
Branch
Repository
Validation Commands
Commit Message
Source Alignment
Progress Source
```

## Eligibility rules

A task is eligible only when:

1. `Status` is `Backlog`.
2. `Codex Ready` is checked/true.
3. All listed `Dependencies` are present in the same input and have `Status` equal to `Done`.
4. Required fields are present.
5. The task title contains an `ENG-LOOP-NN` identifier.

Selection order is deterministic:

1. Priority rank: `P0`, `P1`, `P2`, `P3`.
2. Engineering-loop task number ascending.
3. Task title lexicographic order.

The runner selects at most one task.

## Dry-run output

The report includes:

- Selected task, if any.
- Task eligibility evaluation.
- Planned actions.
- Mutation summary.
- Machine-readable execution plan.

Planned actions are intentionally non-mutating in ENG-LOOP-17:

```text
claim_task_in_notion: skipped_dry_run_only
create_branch: planned
load_source_docs: planned
implement_task: planned
run_local_validation: planned
create_pr_body: planned
watch_github_ci: planned
update_progress_tracker: planned
mark_notion_done_on_success: skipped_dry_run_only
```

## Mutation guarantee

The runner must report zero mutations:

```text
Notion writes: 0
GitHub writes: 0
Git writes: 0
File writes: 0
```

ENG-LOOP-17 does not perform task claiming, branch creation, file editing, PR creation, CI watching, or tracker completion.

## Validation

Run focused validation:

```bash
pnpm eng-loop:dry-run
pnpm test:eng-loop
```

Run the required GarageOS validation gate:

```bash
pnpm validate:quick
```

## Stop conditions

Stop and rework the implementation if dry-run requires write permissions to function or if the runner attempts to mutate Notion, GitHub, git branches, pull requests, repository files, or tracker state.

## Schema source behavior

The runner uses `docs/engineering/notion-task-schema.md` as the documented ENG-LOOP-16 schema source when that file exists. The built-in schema remains only as a defensive fallback for isolated fixture execution.

## Schema source behavior

The runner reports `docs/engineering/notion-task-schema.md` as the documented ENG-LOOP-16 schema source when that file exists. The built-in schema remains only as a defensive fallback for isolated fixture execution.

## Markdown schema source fallback

When no machine-readable JSON schema file exists, the runner reports `docs/engineering/notion-task-schema.md` as the ENG-LOOP-16 documented schema source and uses the built-in executable field rules as the local validation fallback.
