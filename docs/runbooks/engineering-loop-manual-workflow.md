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

## Stop conditions

- Stop when `max_tasks` is greater than `1`.
- Stop when dry-run mode requests branch creation or Notion mutation.
- Stop when run mode does not include `mutation_confirmation: ENG-LOOP-23-RUN`.
- Stop when Notion mutation is requested but the Notion token secret is missing.
- Stop when the validation command contains shell metacharacters.

## Evidence artifacts

The workflow uploads `.tmp/eng-loop-*` files as artifacts when available, including:

- `.tmp/eng-loop-workflow-command-plan.md`
- `.tmp/eng-loop-workflow-inputs.json`
- `.tmp/eng-loop-run-ledger.json`
- `.tmp/eng-loop-validation-result.json`
- `.tmp/eng-loop-validation-evidence.md`
- `.tmp/eng-loop-pr-body.md`
- `.tmp/eng-loop-pr-automation-metadata.json`
- `.tmp/eng-loop-ci-status.json`
- `.tmp/eng-loop-follow-up-task.json`

## Local validation

Run:

```bash
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
