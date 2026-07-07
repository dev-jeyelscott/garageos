# AI Reviewer and Merge-Readiness Reuse Audit

**Task:** ENG-LOOP-28 - Audit existing AI reviewer and merge-readiness reuse
**Status:** Audit complete
**Scope:** Documentation-only engineering-loop audit
**Validation:** `pnpm validate:quick`

## Purpose

This audit records what GarageOS already has for advisory AI pull request review and merge-readiness checks before adding the later ENG-LOOP merge automation tasks.

This document does not add a new merge gate, change workflow behavior, create GitHub settings, alter branch protection, or make AI review authoritative.

## Source Alignment

Reviewed sources:

- `docs/runbooks/engineering-loop.md`
- `docs/runbooks/branch-protection.md`
- `docs/engineering/validation-profiles.md`
- `docs/engineering/ci-status-checks.md`
- `docs/engineering/automatic-engineering-loop.md`
- `docs/engineering/automatic-engineering-loop-states.md`
- `docs/engineering/automatic-engineering-loop-failure-policy.md`
- `docs/runbooks/engineering-loop-codex-pr-automation.md`
- `.github/workflows/ai-pr-review.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/pr-validation-evidence.yml`
- `.github/workflows/dependency-security.yml`
- `.github/workflows/static-security-analysis.yml`
- `.github/scripts/eng-loop-ci-status-watcher.cjs`
- `.github/scripts/eng-loop-required-checks.json`
- `scripts/ai-pr-review.mjs`

## Existing AI Reviewer

GarageOS already has an advisory AI PR reviewer:

- Workflow: `.github/workflows/ai-pr-review.yml`
- Script: `scripts/ai-pr-review.mjs`
- Trigger: pull requests into `develop` or `main`
- Scope: same-repository, non-draft PRs
- Output: one upserted issue comment marked with `<!-- garageos-ai-review -->`
- Failure mode: fail-open by default through `AI_REVIEW_FAIL_MODE=open`
- Security controls: diff filtering, secret redaction, bounded diff size, pinned action versions, and explicit prompt-injection resistance
- Review policy: advisory only; deterministic CI, branch protection, and maintainer review remain authoritative

Reuse decision:

- ENG-LOOP-31 should reuse `scripts/ai-pr-review.mjs` instead of introducing a second reviewer prompt or comment format.
- Future automation may invoke the existing script or workflow, but must preserve the advisory-only status unless a later approved task explicitly changes policy.
- Future AI review gates must parse the existing marker/comment shape if they need to inspect reviewer output.

## Existing Merge-Readiness Basis

GarageOS already has deterministic merge-readiness building blocks:

- Validation profile commands in `package.json`, including `validate:quick`, `validate:web`, `validate:api`, `validate:db`, `validate:security`, `validate:e2e`, and `validate:full`.
- GitHub validation workflow `.github/workflows/ci.yml`, emitting `validation-${{ matrix.profile }}` for implemented validation profiles.
- PR evidence workflow `.github/workflows/pr-validation-evidence.yml`, emitting `Validate PR evidence`.
- Dependency security workflow `.github/workflows/dependency-security.yml`, emitting `Dependency audit and security profile`.
- Static security workflow `.github/workflows/static-security-analysis.yml`, emitting `Semgrep static security scan`.
- CI status watcher `.github/scripts/eng-loop-ci-status-watcher.cjs`, which classifies configured required checks as passed, failed, cancelled, timed out, pending, missing, or unknown.
- Required-check config `.github/scripts/eng-loop-required-checks.json`, currently scoped to the checks consumed by the watcher.

Reuse decision:

- ENG-LOOP-29 should reuse `eng-loop-ci-status-watcher.cjs` for deterministic check classification instead of creating a parallel GitHub check parser.
- ENG-LOOP-29 may extend `.github/scripts/eng-loop-required-checks.json`, but should do that as a gate-specific change with tests.
- ENG-LOOP-33 should use `safe_to_mark_done` from the watcher result as an input signal only; it must still preserve branch protection, PR state, and maintainer ownership.

## Documented Policy Conflict Found

The docs mostly agree that AI review is advisory only:

- `docs/runbooks/engineering-loop.md` says AI review is advisory and must not be automatic merge approval.
- `docs/runbooks/branch-protection.md` says AI review should not replace deterministic CI or human final decision.
- `docs/engineering/validation-profiles.md` lists AI review as not required on protected branches.

The conflict was in `docs/engineering/ci-status-checks.md`, which listed `Advisory AI PR Review` as required on both `main` and `develop`.

Resolution in this task:

- Update the check-name matrix to classify `Advisory AI PR Review` as advisory on `main` and `develop`.
- Keep deterministic validation and evidence checks as the merge-readiness basis.
- Do not change workflow YAML or branch protection settings in this audit task.

## Follow-On Task Boundaries

Later ENG-LOOP tasks should stay within these boundaries:

- ENG-LOOP-29: add the deterministic merge gate by reusing the CI status watcher and required-check config.
- ENG-LOOP-30: add risk classification without changing AI reviewer authority.
- ENG-LOOP-31: add an AI PR review runner by reusing `scripts/ai-pr-review.mjs`.
- ENG-LOOP-32: add any AI review gate workflow as advisory or explicitly documented gate behavior only.
- ENG-LOOP-33: add guarded merge execution in manual mode without bypassing branch protection or maintainer decision-making.
- ENG-LOOP-34 and ENG-LOOP-35: reuse watcher/follow-up/task-sync outputs rather than duplicating status interpretation.

## Non-Changes

This audit intentionally does not:

- Add a merge executor.
- Add auto-merge.
- Make AI review required.
- Change branch protection.
- Change workflow triggers.
- Change validation commands.
- Change Notion task schema.
- Update tracker status.
