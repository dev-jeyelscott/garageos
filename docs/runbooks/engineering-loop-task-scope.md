# Engineering Loop Task Scope

## Purpose

ENG-LOOP-26 generalizes GarageOS engineering-loop task selection from ENG-LOOP-only automation tasks to all eligible tracker tasks.

The loop must select tasks by tracker eligibility, not by title prefix alone.

## Supported scopes

| Scope      | Meaning                                                 |
| ---------- | ------------------------------------------------------- |
| `all`      | Select any eligible GarageOS tracker task.              |
| `eng-loop` | Preserve the previous ENG-LOOP-only selection behavior. |

Recommended dry-run commands:

```bash
pnpm eng-loop:batch -- --limit=5 --mode=dry-run --task-scope=all
pnpm eng-loop:batch -- --limit=5 --mode=dry-run --task-scope=eng-loop
```

Recommended live command:

```bash
pnpm eng-loop:batch -- --limit=5 --mode=live --task-scope=all
```

## Eligibility rules

A task is eligible only when it satisfies all required gates:

- Status is selectable, such as Backlog, Ready, Todo, To Do, Not Started, or Open.
- Status is not Done, Complete, Closed, Blocked, On Hold, Deferred, or Cancelled.
- The task is not actively claimed by another engineering-loop run.
- The task is not review-only.
- The task is not manual-only.
- Codex Ready is checked.
- Mutation-capable live selection has repository and branch metadata.
- Strict/live selection has validation commands.
- Dependencies are expected to be satisfied by the runner before selection.

## Safety behavior

The generalized loop must fail closed. If a task is missing required metadata, the runner should skip it and emit a clear reason instead of selecting it unsafely.

Examples:

- `missing_metadata:Codex Ready`
- `missing_metadata:Branch`
- `active_claim`
- `outside_eng_loop_scope`
- `review_only`
- `manual_only`

## Validation

```bash
pnpm format
node ./.github/scripts/eng-loop-task-scope.test.cjs
node ./.github/scripts/eng-loop-runner.test.cjs
node ./.github/scripts/eng-loop-codex-pr-automation.test.cjs
pnpm eng-loop:test
pnpm validate:quick
pnpm eng-loop:batch -- --limit=5 --mode=dry-run --task-scope=all
pnpm eng-loop:batch -- --limit=5 --mode=dry-run --task-scope=eng-loop
```
