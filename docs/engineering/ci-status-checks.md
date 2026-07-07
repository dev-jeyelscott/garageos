# GarageOS CI Status Check Naming and Required-Check Matrix

**Status:** Source-aligned engineering loop documentation
**Task:** ENG-LOOP-10 — Add CI status check naming and required-check matrix
**Scope:** Documentation only; no runtime or workflow behavior change.

## Purpose

This document defines the canonical GitHub status checks that GarageOS branch protection must require for pull requests into protected branches.

GitHub branch protection matches status checks by their emitted check names. These names must match the workflow job names exactly after matrix expansion.

## Canonical Emitted Status Checks

- `GarageOS AI Review / advisory` from `.github/workflows/ai-pr-review.yml` (`advisory`)
- `validation-${{ matrix.profile }}` from `.github/workflows/ci.yml` (`validation`)
- `Dependency audit and security profile` from `.github/workflows/dependency-security.yml` (`dependency-security`)
- `Validate PR evidence` from `.github/workflows/pr-validation-evidence.yml` (`validate`)
- `Semgrep static security scan` from `.github/workflows/static-security-analysis.yml` (`semgrep`)

## Required-Check Matrix

| Status check name                     | Workflow location                                                   | `main` requirement | `develop` requirement |
| ------------------------------------- | ------------------------------------------------------------------- | ------------------ | --------------------- |
| GarageOS AI Review / advisory         | `.github/workflows/ai-pr-review.yml` / `advisory`                   | Advisory           | Advisory              |
| validation-${{ matrix.profile }}      | `.github/workflows/ci.yml` / `validation`                           | Required           | Required              |
| Dependency audit and security profile | `.github/workflows/dependency-security.yml` / `dependency-security` | Required           | Required              |
| Validate PR evidence                  | `.github/workflows/pr-validation-evidence.yml` / `validate`         | Required           | Required              |
| Semgrep static security scan          | `.github/workflows/static-security-analysis.yml` / `semgrep`        | Required           | Required              |

## Enforcement Rules

- Required branch protection checks must use the exact names listed above.
- If a workflow job `name:` changes, this matrix must be updated in the same PR.
- Matrix workflow names must be verified using the expanded emitted names, not only the raw YAML expression.
- Advisory AI review remains advisory unless a later approved task updates the branch-protection policy, validation profile documentation, and merge-readiness automation together.
- This document does not add product scope or runtime behavior.

## Local Verification

Run:

```bash
node .tmp/verify-ci-checks.cjs
```

Expected result:

```text
All documented required checks match workflow job names.
```
