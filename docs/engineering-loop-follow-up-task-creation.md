# ENG-LOOP-22 — Follow-up Task Creation Rules

## Purpose

ENG-LOOP-22 adds safe follow-up task creation for the GarageOS engineering loop.

The automation creates a Notion Backlog task only when a failed or incomplete engineering-loop run produces a unique, actionable failure fingerprint.

## Creation Triggers

A follow-up task may be created for:

- Local validation failure.
- Validation executor failure.
- Disallowed validation command.
- GitHub CI failure.
- Missing required GitHub check.
- GitHub metadata/API resolution failure.
- Missing requirement discovered during implementation or review.
- Discovered bug.
- Flaky engineering-loop automation.

## Skip Conditions

A follow-up task must not be created when:

- Local validation passes.
- GitHub CI passes.
- GitHub CI is still pending and has not reached a terminal timeout/missing-check state.
- No failure kind or evidence is available.

## Dedupe Rule

Every follow-up uses a deterministic fingerprint:

```text
eng-loop-follow-up:<sha256-prefix>
```

The fingerprint is derived from:

- Source task ID and title.
- Failure source.
- Failure kind.
- Validation command or CI check name.
- Normalized failure summary.
- Affected files when known.

Before creating a task, the script searches existing Notion tasks for the fingerprint. If a matching task already exists, creation is suppressed and the run ledger records `deduped`.

If the script cannot perform a safe dedupe query against the current Notion task schema, it fails closed and creates no task.

## Generated Task Defaults

Generated follow-ups use the existing task tracker schema where supported:

| Field           | Value                                                              |
| --------------- | ------------------------------------------------------------------ |
| Status          | Backlog                                                            |
| Codex Ready     | checked                                                            |
| Category        | Based on failure type                                              |
| Priority        | P1 for blocking failures, P2 for flaky automation unless blocking  |
| Item Type       | Bug Fix or Implementation Task                                     |
| Milestone       | M0                                                                 |
| Dependencies    | Source ENG-LOOP task code when known                               |
| Progress Source | Source task, ledger reference, detected timestamp, and fingerprint |

## Required Evidence

Each follow-up includes:

- Source task reference.
- Source task URL when known.
- Run ledger path/reference.
- Source branch and repository when known.
- Failure type.
- Fingerprint.
- Detection timestamp.
- Validation command or CI check.
- Sanitized failure summary.
- Reproduction command.
- Proposed next action.
- Affected files when known.

## Original Task Rule

Creating a follow-up does not mark the original task Done.

The original task remains unresolved until validation and CI evidence prove it is safe to close.

## Validation

Run:

```bash
node ./.github/scripts/eng-loop-follow-up-task.test.cjs
pnpm eng-loop:test
pnpm validate:quick
```
