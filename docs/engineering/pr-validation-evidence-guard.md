# PR Validation Evidence Guard

**Task:** ENG-LOOP-07 — Add PR validation evidence guard  
**Status:** In Progress  
**Scope:** GitHub pull request process and CI validation only

## Purpose

This guard blocks pull requests whose body does not contain usable validation evidence.

It is intentionally narrow: it verifies that the PR body contains evidence text, not that the listed commands actually ran. Deterministic CI checks and manual review remain authoritative.

## Source Alignment

GarageOS release readiness requires retained QA evidence, including test execution reports, traceability, API contract test results, migration/schema validation, concurrency logs, security evidence, performance evidence, background job evidence, export evidence, backup/restore evidence, defects/waivers, and final signoff records.

GarageOS architecture records also require validation evidence across scope control, architecture, database, tenant isolation, branch access, auth/security, API, inventory/FIFO, financial workflows, background jobs, PWA/offline behavior, files, reports/search, and operations.

## What the Guard Requires

A PR body must include a markdown heading named one of:

- `Validation Evidence`
- `Validation`
- `Validation Commands`
- `Testing Evidence`
- `Test Evidence`

The section must include one of:

1. Validation command evidence with a passing result.
2. A documentation-only/manual-review rationale.
3. An approved validation waiver with reason and approver/owner context.

## Passing Examples

```text
## Validation Evidence

pnpm validate:quick — PASS
pnpm validate:security — PASS
```

```text
## Validation Evidence

Documentation-only change. Manual review completed; no runtime validation required.
```

```text
## Validation Evidence

Waiver: approved by repository owner. Reason: GitHub branch-protection setting cannot be validated locally.
```

## Failing Examples

```text
## Validation Evidence

TBD
```

```text
## Validation Evidence

pnpm validate:quick
```

```text
## Validation Evidence

pnpm validate:quick — failed
```

## Branch Protection Setup

After this workflow lands on `main` and `develop`, add this required check to branch protection rules:

```text
PR Validation Evidence / Validate PR evidence
```

This keeps the evidence guard separate from the deterministic validation profiles so that missing PR evidence produces a clear failure reason.

## Local Validation

```bash
pnpm test:pr-evidence
pnpm validate:pr-evidence -- --body-file path/to/pr-body.md
```

Expected result:

```text
validate-pr-evidence tests passed
PR validation evidence guard passed.
```

## Limitations

- The guard does not prove that commands ran; CI validation jobs still do that.
- The guard does not parse screenshots or external links as proof.
- The guard accepts explicit waivers, so reviewer discipline is still required.
