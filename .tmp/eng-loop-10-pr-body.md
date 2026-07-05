## Summary

Implements ENG-LOOP-10 — Add CI status check naming and required-check matrix.

This PR documents the GarageOS CI status check names used by pull requests and adds a required-check matrix for main and develop branch protection verification.

## Source Alignment

This is a documentation-only engineering-loop hardening change.

- No runtime behavior changes.
- No database changes.
- No API changes.
- No permission changes.
- No product-scope expansion.
- Branch protection requirements are documented against emitted GitHub Actions check names.
- Required checks are easier to verify against GitHub repository settings.

## Scope

Updated documentation for:

- CI status check naming.
- Required-check matrix for main and develop.
- Branch protection verification.
- Validation profile alignment.
- ENG-LOOP-10 progress tracker entry.

## Validation Evidence

Docs-only rationale: This PR changes only GarageOS engineering documentation and progress tracking for CI status check naming and required-check matrix alignment. It does not change application runtime code, API behavior, database schema, permissions, or GitHub Actions workflow behavior.

Command: node .tmp/verify-ci-checks.cjs
Result: Passed.
Evidence:

- Found workflow job names after matrix expansion.
- Advisory AI PR Review was matched.
- validation matrix profile job was matched.
- Dependency audit and security profile was matched.
- Validate PR evidence was matched.
- Semgrep static security scan was matched.
- Final output: All documented required checks match workflow job names.

Command: pnpm lint
Result: Passed.
Evidence:

- apps/api lint completed.
- packages/config lint completed.
- apps/web lint completed.
- packages/shared lint completed.
- packages/api-client lint completed.
- packages/test-utils lint completed.

Command: pnpm typecheck
Result: Passed.
Evidence:

- apps/api typecheck completed.
- apps/worker typecheck completed.
- apps/scheduler typecheck completed.
- apps/web typecheck completed and route types generated successfully.
- packages/config typecheck completed.
- packages/shared typecheck completed.
- packages/api-client typecheck completed.
- packages/test-utils typecheck completed.

Command: pnpm validate:quick
Result: Passed.
Evidence:

- pnpm format:check passed with: All matched files use Prettier code style.
- pnpm lint passed.
- pnpm typecheck passed.

Risk note: The source-level verifier confirms that the documented required-check matrix matches local workflow job declarations. Final GitHub branch protection should still be compared against the rendered PR Checks UI after CI runs, especially for matrix-rendered check names.

## Risk Classification

Docs-only / validation-process documentation change.

## Final Merge Checklist

- [x] Source alignment documented.
- [x] Documentation-only scope confirmed.
- [x] Required-check matrix documented.
- [x] Local workflow check-name verifier passed.
- [x] Lint passed.
- [x] Typecheck passed.
- [x] Quick validation passed.
