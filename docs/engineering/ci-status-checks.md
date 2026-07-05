<!-- AUTO-GENERATED-BY: ENG-LOOP-10 node apply. Safe to edit after review. -->

# GarageOS CI Status Check Naming and Required-Check Matrix

**Task:** ENG-LOOP-10 — Add CI status check naming and required-check matrix  
**Status:** In Progress  
**Branch:** `docs/eng-loop-validation-checks`  
**Scope:** Documentation and validation-gate alignment only.

## Purpose

This document defines the canonical GarageOS pull request status check names and the required branch-protection matrix for `main` and `develop`.

The goal is to make GitHub branch protection easy to verify and hard to misconfigure. Required checks in GitHub must match the exact status check names emitted by the workflow jobs.

## Source Alignment

GarageOS uses documentation-first engineering controls. Validation gates exist to protect source alignment, deterministic validation evidence, tenant isolation, security, data integrity, and maintainability before changes merge into protected branches.

This document does not introduce runtime behavior, product functionality, permissions, routes, database fields, or workflows.

## Naming Rules

1. Check names must be stable and human-readable.
2. Check names must match GitHub Actions job display names exactly.
3. Required checks must not be renamed without updating this document and the branch-protection runbook in the same PR.
4. Workflow names may change for grouping, but job display names used as branch-protection checks must remain stable.
5. Advisory checks must be clearly marked and must not be required unless the project intentionally changes the merge policy.
6. Matrix entries must map to local validation commands so PR authors can reproduce failures before pushing.

## Canonical Status Check Names

| Canonical Status Check               | Local Command / Source                            | Blocking | Purpose                                                                            |
| ------------------------------------ | ------------------------------------------------- | -------: | ---------------------------------------------------------------------------------- |
| `PR Evidence / validate-pr-evidence` | `node ./.github/scripts/validate-pr-evidence.cjs` |      Yes | Requires PR validation evidence before merge.                                      |
| `GarageOS CI / validate:quick`       | `pnpm validate:quick`                             |      Yes | Fast baseline validation for formatting/lint/type/unit readiness.                  |
| `GarageOS CI / validate:web`         | `pnpm validate:web`                               |      Yes | Web/PWA validation profile.                                                        |
| `GarageOS CI / validate:api`         | `pnpm validate:api`                               |      Yes | API validation profile.                                                            |
| `GarageOS CI / validate:db`          | `pnpm validate:db`                                |      Yes | Database migration/schema validation profile.                                      |
| `GarageOS CI / validate:security`    | `pnpm validate:security`                          |      Yes | Security-sensitive tests and dependency/security checks.                           |
| `GarageOS CI / validate:e2e`         | `pnpm validate:e2e`                               |      Yes | Deterministic Playwright E2E validation profile.                                   |
| `GarageOS AI Review / advisory`      | AI PR review workflow                             |       No | Advisory risk review only; deterministic CI and human review remain authoritative. |

## Required-Check Matrix

| Status Check                         | Required on `main` | Required on `develop` | Required Before Merge | Notes                                                                                                   |
| ------------------------------------ | -----------------: | --------------------: | --------------------: | ------------------------------------------------------------------------------------------------------- |
| `PR Evidence / validate-pr-evidence` |                Yes |                   Yes |                   Yes | Ensures source alignment and validation evidence are documented in the PR body.                         |
| `GarageOS CI / validate:quick`       |                Yes |                   Yes |                   Yes | Baseline quality gate for every protected-branch PR.                                                    |
| `GarageOS CI / validate:web`         |                Yes |                   Yes |                   Yes | Required because GarageOS is a mobile-first PWA.                                                        |
| `GarageOS CI / validate:api`         |                Yes |                   Yes |                   Yes | Required because API contracts and auth/tenant guards are authoritative.                                |
| `GarageOS CI / validate:db`          |                Yes |                   Yes |                   Yes | Required because PostgreSQL schema, migrations, and drift checks protect invariants.                    |
| `GarageOS CI / validate:security`    |                Yes |                   Yes |                   Yes | Required because tenant isolation, auth, dependency, and sensitive-flow controls are high risk.         |
| `GarageOS CI / validate:e2e`         |                Yes |                   Yes |                   Yes | Required once deterministic E2E is stable; failures must be fixed or explicitly explained before merge. |
| `GarageOS AI Review / advisory`      |                 No |                    No |                    No | Advisory only. Do not configure as a required branch-protection check by default.                       |

## Branch Protection Configuration

Configure both `main` and `develop` with these rules:

1. Require a pull request before merging.
2. Require status checks to pass before merging.
3. Require branches to be up to date before merging when available.
4. Select all blocking checks listed in the required-check matrix.
5. Do not require advisory-only checks by default.
6. Restrict direct pushes if appropriate for the repository ownership model.

## Verification Procedure

After a PR runs, compare the GitHub PR checks panel against this document:

1. Confirm every required check appears with the exact canonical name.
2. Confirm every required check passed.
3. Confirm advisory checks are not required by branch protection.
4. Confirm the PR body includes validation evidence accepted by `PR Evidence / validate-pr-evidence`.
5. Confirm the branch-protection settings for `main` and `develop` require the same blocking checks listed here.

## Change Control

Any PR that renames, removes, splits, or adds CI checks must update:

- `docs/engineering/ci-status-checks.md`
- `docs/runbooks/branch-protection.md`
- `docs/engineering/validation-profiles.md` when the check maps to a validation profile
- `docs/progress-tracker.md` when part of an ENG-LOOP task

## Acceptance Criteria

- Check names are documented.
- `main` requirements are documented.
- `develop` requirements are documented.
- The matrix is easy to verify against GitHub branch protection.
