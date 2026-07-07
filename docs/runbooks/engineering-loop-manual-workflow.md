# ENG-LOOP-23 — Manual GitHub Workflow Entrypoint

## Purpose

This runbook documents the manually triggered GitHub Actions entrypoint for the GarageOS engineering loop.

The workflow is intentionally manual-only. It does not add scheduled autonomous execution. Dry-run remains the default and safest behavior.

## Workflow

```text
.github/workflows/engineering-loop-manual.yml
```

## Default safe execution

Use these inputs for the safe default run:

```text
mode: dry-run
max_tasks: 1
dry_run: true
create_branch: false
create_pr_body: true
mutate_notion: false
run_validation: true
validation_command: pnpm validate:quick
```

## Mutation-capable execution

Mutation-capable execution is fail-closed and must be explicit:

```text
mode: run
dry_run: false
mutation_confirmation: ENG-LOOP-23-RUN
```

For Notion mutation, configure one of these repository secrets:

- `NOTION_TOKEN`
- `NOTION_API_KEY`

The workflow must not print secret values. The preflight script records only whether required secrets are present.

## Guarded manual merge

Guarded merge execution is available only in one-task manual run mode. It is disabled by default.

To attempt a guarded merge after deterministic merge-gate evaluation:

```text
mode: run
dry_run: false
max_tasks: 1
mutation_confirmation: ENG-LOOP-23-RUN
merge_pr: true
merge_confirmation: ENG-LOOP-33-MERGE
merge_method: squash
```

The guarded merge executor first runs `.github/scripts/pr-merge-gate.cjs`, then `.github/scripts/pr-guarded-merge.cjs`. The executor requires the merge gate to pass, the PR head SHA to match the evaluated gate result, and the exact merge confirmation before calling GitHub's pull request merge API.

GitHub branch protection, required checks, repository permissions, and maintainer decision-making remain authoritative. The executor does not approve PRs, bypass branch protection, change repository settings, or merge batch-mode tasks.

## Stop conditions

- Stop when `max_tasks` is greater than `1`.
- Stop when dry-run mode requests branch creation or Notion mutation.
- Stop when run mode does not include `mutation_confirmation: ENG-LOOP-23-RUN`.
- Stop when Notion mutation is requested but the Notion token secret is missing.
- Stop when the validation command contains shell metacharacters.
- Stop when guarded merge is requested outside `mode: run`.
- Stop when guarded merge is requested without `merge_confirmation: ENG-LOOP-33-MERGE`.
- Stop when the deterministic merge gate blocks the PR.
- Stop when the PR head SHA no longer matches the merge gate result.
- Stop when GitHub rejects the merge because branch protection, required checks, permissions, or PR state are not satisfied.

## Evidence artifacts

The workflow uploads engineering-loop evidence files as artifacts when available, including:

- `.tmp/eng-loop-workflow-command-plan.md`
- `.tmp/eng-loop-workflow-inputs.json`
- `.tmp/eng-loop-run-ledger.json`
- `.tmp/eng-loop-validation-result.json`
- `.tmp/eng-loop-validation-evidence.md`
- `.tmp/eng-loop-pr-body.md`
- `.tmp/eng-loop-pr-automation-metadata.json`
- `.tmp/eng-loop-ci-status.json`
- `.tmp/eng-loop-follow-up-task.json`
- `.tmp/pr-merge-gate-result.json`
- `.tmp/pr-merge-gate-summary.md`
- `.tmp/pr-guarded-merge-result.json`
- `.tmp/pr-guarded-merge-summary.md`

## Local validation

Run:

```bash
node ./.github/scripts/pr-guarded-merge.test.cjs
node ./.github/scripts/eng-loop-workflow-preflight.test.cjs
pnpm eng-loop:test
pnpm validate:quick
```

## ENG-LOOP-24 first-5 batch mode

First-5 mode is a controlled batch mode for the GarageOS engineering loop. It is limited to five eligible tasks and must be run sequentially. Dry-run mode is the required trial path before mutation-capable execution.

### Dry-run

```bash
node ./.github/scripts/eng-loop-runner.cjs --mode=first-5-dry-run
```

Dry-run writes local evidence only under `.tmp/eng-loop-batch-summary.json` and `.tmp/eng-loop-batch-summary.md`. It must not mutate Notion, create branches, create PRs, or claim tasks.

### Mutation-capable first-5 run

```bash
node ./.github/scripts/eng-loop-runner.cjs --mode=first-5 --confirm-first-5
```

Manual workflow execution must use `max_tasks=5`, `dry_run=false`, and `mutation_confirmation=ENG-LOOP-24-FIRST-5`.

### Stop conditions

The batch stops immediately on claim conflict, malformed task, validation failure, CI failure, unsafe state, follow-up creation, or unexpected runner error. Downstream tasks must not be processed after the first failure.
