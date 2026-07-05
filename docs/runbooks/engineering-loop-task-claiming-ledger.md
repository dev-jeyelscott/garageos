# ENG-LOOP-18 — Task Claiming and Run Ledger

## Purpose

This runbook documents the GarageOS engineering-loop task claiming and run-ledger behavior introduced by **ENG-LOOP-18 — Add task claiming and run ledger**.

The goal is to make automatic engineering-loop execution auditable and recoverable before later tasks add local validation execution, branch/PR automation, CI watching, and follow-up task creation.

## Scope

This task is limited to engineering-loop automation mechanics.

Included:

- Select at most one eligible engineering-loop task.
- Claim the selected task by updating the approved Notion tracker fields.
- Initialize a local run ledger under `.tmp/eng-loop-runs/`.
- Preserve dry-run mode as mutation-free.
- Stop safely on claim conflicts or ambiguous ownership.

Not included:

- Product feature implementation.
- Branch creation.
- Commit creation.
- Git push.
- PR creation.
- GitHub Actions watching.
- Automatic Done transition.
- Follow-up task creation.

## Commands

```bash
pnpm eng-loop:dry-run
pnpm eng-loop:claim
pnpm eng-loop:test
```

## Required Environment for Notion Claim Mode

```bash
export GARAGEOS_NOTION_TOKEN="secret_..."
export GARAGEOS_NOTION_TASK_DATABASE_ID="<notion-database-id>"
```

Supported aliases:

```bash
NOTION_TOKEN
NOTION_TASK_DATABASE_ID
NOTION_DATABASE_ID
```

Optional:

```bash
export ENG_LOOP_ACTOR="local"
export ENG_LOOP_STALE_CLAIM_HOURS="24"
```

## Dry-Run Contract

Dry-run mode must remain read-only.

It may:

- Query tasks.
- Parse task fields.
- Select the deterministic next eligible task.
- Print the execution plan.

It must not:

- Update Notion.
- Create a run ledger.
- Claim a task.
- Create a branch.
- Run product implementation.
- Create a PR.

## Claim Mode Contract

Claim mode performs the smallest approved mutation needed to reserve one engineering-loop task for a single run.

Algorithm:

1. Query task pages from the Notion tracker.
2. Parse source-aligned fields such as `Task`, `Status`, `Codex Ready`, `Branch`, `Repository`, and `Progress Source`.
3. Filter eligible tasks.
4. Sort deterministically by ENG-LOOP number, priority, creation date, and title.
5. Select no more than one task.
6. Generate a run id.
7. Write a local run ledger in `started` status.
8. Re-fetch the selected Notion page.
9. Re-check eligibility immediately before mutation.
10. Update `Status` to `In Progress` and write a claim marker to `Progress Source` when available.
11. Re-fetch the page again.
12. Verify claim ownership.
13. Update the run ledger to `claimed`.

## Run ID Format

```text
eng-loop-YYYYMMDD-HHMMSSZ-<random-hex>
```

Example:

```text
eng-loop-20260706-063000Z-a7f3c9
```

## Claim Marker

The claim marker is written into the tracker using an approved field, currently `Progress Source` when available.

Example:

```text
Claimed by engineering loop run eng-loop-20260706-063000Z-a7f3c9 at 2026-07-06T06:30:00.000Z. Actor: local. Mode: claim. Branch: chore/eng-loop-18-claim-ledger. Scope: task claim and run-ledger initialization only; no product task implementation performed by ENG-LOOP-18.
```

## Run Ledger Location

```text
.tmp/eng-loop-runs/<run_id>.json
```

The ledger is intentionally stored under `.tmp` so local runs can produce durable evidence without requiring repository commits for every runner invocation.

## Run Ledger Shape

```json
{
  "schema_version": 1,
  "run_id": "eng-loop-20260706-063000Z-a7f3c9",
  "mode": "claim",
  "actor": "local",
  "status": "claimed",
  "task": {
    "id": "notion-page-id",
    "title": "ENG-LOOP-18 — Add task claiming and run ledger",
    "branch": "chore/eng-loop-18-claim-ledger",
    "repository": "dev-jeyelscott/garageos",
    "url": "https://app.notion.com/p/..."
  },
  "started_at": "2026-07-06T06:30:00.000Z",
  "completed_at": null,
  "summary": "Claim verified for ENG-LOOP-18 — Add task claiming and run ledger.",
  "events": []
}
```

## Ledger Statuses

| Status      | Meaning                                                                      |
| ----------- | ---------------------------------------------------------------------------- |
| `started`   | Runner selected a task and initialized claim processing.                     |
| `claimed`   | Notion claim update was verified for the selected task.                      |
| `succeeded` | Reserved for later loop phases after implementation and validation complete. |
| `failed`    | Claim or run initialization failed after starting.                           |
| `aborted`   | Runner stopped safely before overwriting or continuing an unsafe claim.      |

## Stale Claim Policy

Initial stale claim handling is conservative.

- Active claims are never overwritten automatically.
- Claims older than `ENG_LOOP_STALE_CLAIM_HOURS` are treated as stale but still require manual review.
- The runner stops and prints recovery guidance instead of stealing the claim.

Default stale threshold:

```text
24 hours
```

## Stop Conditions

Stop immediately when:

- No eligible task exists.
- The selected task changes status before claim mutation.
- The selected task already has a claim marker.
- Notion update fails.
- Post-claim verification does not confirm `In Progress`.
- Post-claim verification indicates another run owns the claim.
- Ledger initialization fails before claim mutation.

## Validation

```bash
pnpm eng-loop:test
pnpm eng-loop:dry-run
pnpm eng-loop:claim
pnpm validate:quick
```

Claim mode requires valid Notion credentials. Dry-run can also use a fixture:

```bash
node ./.github/scripts/eng-loop-runner.cjs --mode=dry-run --tasks-file .tmp/eng-loop-tasks.fixture.json
```

## PR Evidence Expectations

The ENG-LOOP-18 PR body should include:

- Source alignment.
- Claim behavior summary.
- Ledger behavior summary.
- Dry-run non-mutation evidence.
- Focused test evidence.
- `pnpm validate:quick` evidence.
- Explicit statement that no product runtime behavior, database schema, API behavior, UI behavior, or remote repository mutation is introduced.
