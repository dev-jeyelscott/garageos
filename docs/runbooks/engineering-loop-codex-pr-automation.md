# Engineering Loop Codex PR Automation

## Purpose

`pnpm eng-loop:first-5` is the live automation command for the GarageOS engineering loop. It selects up to five eligible Notion tasks, runs each task through Codex CLI, validates the generated change, commits it, pushes a task branch, and creates a PR for maintainer review.

## Commands

Dry-run plan:

```bash
pnpm eng-loop:first-5:dry-run
cat .tmp/eng-loop-codex-pr-plan.md
```

Live automation:

```bash
pnpm eng-loop:first-5
```

Claim-only fallback:

```bash
pnpm eng-loop:first-5:claim
```

## Required local tools

- `node`
- `pnpm`
- `git`
- `gh`
- `codex`

The Codex CLI non-interactive path uses `codex exec`, which is designed for scripted or CI-style runs that finish without human interaction. The runner uses `--sandbox workspace-write`, `--ask-for-approval never`, `--json`, and `--output-last-message` so each task has captured execution evidence.

As of ENG-LOOP-27, Codex execution uses a streaming child process instead of buffered `spawnSync`. Stdout is streamed to `codex-stdout.jsonl`, stderr is streamed to `codex-stderr.txt`, and the last-message file remains written through Codex CLI `--output-last-message`.

## Required environment

```bash
export GARAGEOS_NOTION_TOKEN="secret_xxx"
export GARAGEOS_NOTION_TASK_DATABASE_ID="1a487915-6b76-4189-984a-9f8376e5cc0a"
export ENG_LOOP_BASE_BRANCH="develop"
export ENG_LOOP_REPOSITORY="dev-jeyelscott/garageos"
export ENG_LOOP_VALIDATION_COMMAND="pnpm validate:quick"
```

GitHub CLI must be authenticated:

```bash
gh auth status
```

Codex CLI must be installed and authenticated:

```bash
codex --version
codex doctor
```

## Live task lifecycle

For each selected task, the automation performs this sequence:

1. Claim the task in Notion.
2. Create a task branch and isolated git worktree under `.tmp/eng-loop-worktrees/`.
3. Generate `.tmp/eng-loop-runs/<run-id>/codex-prompt.md`.
4. Run Codex CLI in non-interactive mode.
5. Stream Codex stdout/stderr and capture the final message.
6. Run the task validation command.
7. Generate a PR body.
8. Commit changes.
9. Push the task branch.
10. Create a PR with `gh pr create`.
11. Update the task progress source with the PR URL.
12. Continue to the next task only if all steps pass.

## Stop conditions

The batch stops immediately when any of these occur:

- No eligible tasks are found.
- Task claim conflict occurs.
- Branch name is unsafe or missing.
- Base branch is unavailable.
- Working tree is dirty before execution.
- `codex`, `gh`, or `git` is unavailable.
- GitHub CLI authentication fails.
- Codex execution fails.
- Validation fails.
- Codex produces no file changes.
- Commit fails.
- Push fails.
- PR creation fails.
- Notion update fails.

## Review policy

The automation creates PRs only. It does not auto-merge and does not mark a task Done before CI/review completion.

## Evidence files

- `.tmp/eng-loop-codex-pr-plan.json`
- `.tmp/eng-loop-codex-pr-plan.md`
- `.tmp/eng-loop-codex-pr-summary.json`
- `.tmp/eng-loop-runs/<run-id>/codex-prompt.md`
- `.tmp/eng-loop-runs/<run-id>/codex-stdout.jsonl`
- `.tmp/eng-loop-runs/<run-id>/codex-stderr.txt`
- `.tmp/eng-loop-runs/<run-id>/codex-final-message.md`
- `.tmp/eng-loop-runs/<run-id>/validation-output.txt`
- `.tmp/eng-loop-runs/<run-id>/pr-body.md`
- `.tmp/eng-loop-runs/<run-id>/pr-url.txt`

## Codex Terminal Output

Codex automation writes raw JSONL artifacts for audit/debug evidence while rendering readable terminal progress by default.

Human-readable terminal output includes:

- Codex agent messages.
- File changes.
- Command/check starts and results.
- Failed command summaries.
- Final Codex turn summaries when emitted by the CLI.

Raw machine output remains available in the run directory:

```text
.tmp/eng-loop-runs/<run_id>/codex-stdout.jsonl
.tmp/eng-loop-runs/<run_id>/codex-stderr.txt
.tmp/eng-loop-runs/<run_id>/validation-output.txt
```

To force raw Codex events to the terminal for debugging:

```bash
CODEX_OUTPUT=raw pnpm eng-loop:first-5
```
