# Observability Validation Profile

**Task:** ENG-LOOP-14 — Add observability validation profile  
**Status:** In Progress  
**Profile command:** `pnpm validate:observability`  
**Validation script:** `.github/scripts/validate-observability-profile.cjs`

## Purpose

The observability validation profile provides a deterministic GarageOS engineering-loop check for the current observability contract.

This profile is intentionally scoped as a **static contract validation** until runtime API, worker, metrics, tracing, and provider instrumentation are implemented broadly enough to support deeper automated checks.

## Source Alignment

GarageOS requires operational visibility across API requests, background jobs, provider failures, authorization failures, exports, reminders, inventory failures, and critical workflows.

The current static profile validates that the repository continues to document and expose the required observability expectations:

- API response and error metadata include `request_id` and `correlation_id`.
- Structured logs are expected for request tracing and operational investigation.
- Sensitive data must not be logged, exported unnecessarily, or included in error payloads.
- Background job failures must expose safe status, attempt, timestamp, last-error, and correlation metadata.
- Coverage gaps must be explicit until runtime checks exist.

## Included Checks

`pnpm validate:observability` currently runs:

```bash
node ./.github/scripts/validate-observability-profile.cjs
```

The guard checks:

1. `package.json` exposes `validate:observability`.
2. The observability profile script exists.
3. This profile document exists and includes the required observability expectations.
4. `docs/engineering/validation-profiles.md` documents the profile.
5. API contract documentation includes `request_id` and `correlation_id` expectations where the contract document exists.
6. Implementation-level evidence is scanned and reported when present.

## Current Coverage

| Area                                     | Current Coverage   | Notes                                                                    |
| ---------------------------------------- | ------------------ | ------------------------------------------------------------------------ |
| Profile command                          | Covered            | `pnpm validate:observability` is deterministic.                          |
| Request metadata expectations            | Covered statically | Validates documentation references to `request_id` and `correlation_id`. |
| Error metadata expectations              | Covered statically | Tied to API contract/error-envelope documentation.                       |
| Structured logs                          | Covered statically | Runtime log emission is not asserted until API instrumentation exists.   |
| Sensitive data exclusion                 | Covered statically | Runtime log-redaction tests remain a future enhancement.                 |
| Background jobs                          | Covered statically | Runtime worker/job observability tests remain a future enhancement.      |
| Metrics/traces/error-monitoring provider | Not covered        | Provider choice and runtime integration must be validated later.         |

## Coverage Gaps

The current profile does **not** prove:

- Every API route emits a structured request log.
- Every API response contains runtime-generated `request_id` and `correlation_id`.
- Error monitoring receives API/PWA/worker exceptions.
- Metrics and traces are emitted to a production telemetry backend.
- Background job dashboards are available in staging or production.
- Logs are fully redacted through runtime tests.

These gaps are intentional and must not be hidden. They should be closed incrementally as API/worker observability foundations are implemented.

## Promotion Criteria

This profile can become a required CI gate only when at least one of the following real runtime checks exists:

1. API contract tests assert response and error envelopes include `request_id` and `correlation_id`.
2. Error-handling tests assert safe error summaries and no sensitive payload leakage.
3. Logger/redaction tests assert tenant/user context is safe and secrets are omitted.
4. Background-job tests assert failed jobs persist status, attempt count, safe error summary, and correlation metadata.
5. Provider/integration tests assert failure visibility without duplicate side effects.

## Validation Evidence Template

Use this evidence in PRs that touch observability validation:

```text
pnpm validate:observability
Result: pass

pnpm validate:quick
Result: pass

PR_BODY="$(cat .tmp/eng-loop-14-pr-body.md)" node ./.github/scripts/validate-pr-evidence.cjs
Result: pass
```

## Non-Scope

This profile does not add:

- A new monitoring vendor.
- Production dashboard configuration.
- Runtime tracing infrastructure.
- Product behavior changes.
- API behavior changes.
- Database/schema changes.
- UI behavior changes.
