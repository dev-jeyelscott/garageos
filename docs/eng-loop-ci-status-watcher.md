# ENG-LOOP-21 — GitHub CI Status Watcher

## Purpose

The GitHub CI status watcher observes pull-request validation for GarageOS engineering-loop tasks. It reads GitHub check runs and commit statuses, classifies required checks, writes a structured result, and records a safe CI summary in the run ledger.

This watcher is read-only. It does not merge pull requests, push branches, edit repository settings, or mark Notion tasks Done by itself.

## Inputs

The watcher resolves metadata from explicit CLI arguments first, then falls back to `.tmp/eng-loop-pr-automation-metadata.json`, `.tmp/eng-loop-task.json`, and GitHub environment variables where available.

Supported CLI options:

```bash
node ./.github/scripts/eng-loop-ci-status-watcher.cjs \
  --repo dev-jeyelscott/garageos \
  --branch chore/eng-loop-21-ci-status-watcher \
  --once
```

Optional arguments:

- `--pr <number>`
- `--sha <commit-sha>`
- `--watch`
- `--max-attempts <count>`
- `--poll-interval-ms <milliseconds>`
- `--required-checks-file <path>`
- `--out <path>`
- `--summary <path>`
- `--ledger <path>`

## Required checks

Required checks are configured in `.github/scripts/eng-loop-required-checks.json`.

Only `ci_passed` sets `safe_to_mark_done` to `true`. All other states are fail-safe and must not move a Notion task to Done.

## Output files

The watcher writes:

- `.tmp/eng-loop-ci-status-result.json`
- `.tmp/eng-loop-ci-status-summary.md`
- `.tmp/eng-loop-run-ledger.json`

## Statuses

| Status                       | Meaning                                                   |
| ---------------------------- | --------------------------------------------------------- |
| `ci_passed`                  | All required checks completed successfully.               |
| `ci_failed`                  | At least one required check failed.                       |
| `ci_pending`                 | At least one required check is still queued or running.   |
| `ci_cancelled`               | At least one required check was cancelled.                |
| `ci_timed_out`               | Polling ended before checks completed.                    |
| `ci_missing_required_check`  | At least one configured required check was not found.     |
| `ci_unknown`                 | A check could not be classified safely.                   |
| `github_api_error`           | GitHub API access failed safely.                          |
| `metadata_unresolved`        | Repository, PR, branch, or SHA metadata was insufficient. |
| `required_checks_unresolved` | Required-check configuration was missing or empty.        |

## Validation

```bash
node ./.github/scripts/eng-loop-ci-status-watcher.test.cjs
pnpm validate:quick
```
