# OWASP ZAP Baseline Scan Plan

**Task:** ENG-LOOP-13 — Plan OWASP ZAP baseline scanning  
**Status:** Planning / advisory-first  
**Category:** Security  
**Branch:** chore/eng-loop-zap-planning

---

## 1. Purpose

This document defines how GarageOS will introduce OWASP ZAP baseline scanning as an advisory dynamic application security testing control.

The first GarageOS use of ZAP baseline scanning is documentation and readiness planning only. It must not become a blocking branch-protection check until the scan target, route boundaries, finding triage process, and false-positive handling are stable.

The goal is to add repeatable security visibility without creating a noisy or unsafe CI gate.

---

## 2. Source Alignment

This plan aligns with the approved GarageOS engineering and security direction:

- GarageOS is a mobile-first PWA with REST APIs behind authenticated tenant, permission, branch, subscription, and plan guards.
- Security validation must cover tenant isolation, branch access, authentication safety, support access, file access, rate limits, sensitive log handling, and observable failures.
- The engineering loop already includes validation profiles, CI evidence, release readiness, and advisory security review.
- ZAP baseline scanning supplements existing tests; it does not replace API contract tests, tenant-isolation tests, RBAC tests, branch-access tests, dependency scanning, or manual security review.

This plan does not introduce product scope, runtime behavior, new routes, new permissions, or user-facing functionality.

---

## 3. OWASP ZAP Baseline Behavior

OWASP ZAP baseline scanning is appropriate for an early advisory DAST check because the baseline script spiders a target and waits for passive scanning to complete. The official ZAP documentation states that the baseline script does not perform actual attacks by default and reports alerts as warnings unless a configuration file promotes or ignores rules.

References:

- https://www.zaproxy.org/docs/docker/baseline-scan/
- https://github.com/zaproxy/action-baseline

GarageOS must treat this as passive DAST coverage only. It must not be represented as full penetration testing, active scanning, authenticated workflow testing, API fuzzing, or tenant-isolation proof.

---

## 4. Advisory-First Policy

Initial ZAP baseline scans must be advisory.

Advisory means:

- ZAP findings are collected as security evidence.
- Findings are reviewed and triaged.
- Findings may create follow-up security tasks.
- PRs are not blocked by ZAP until explicit promotion criteria are met.
- Branch protection does not require ZAP status checks yet.
- Known findings must be documented instead of silently ignored.

The first implementation must prefer manual or scheduled execution over required PR execution.

Recommended initial execution modes:

| Mode                                    |                   Allowed Initially | Notes                                                |
| --------------------------------------- | ----------------------------------: | ---------------------------------------------------- |
| Manual workflow dispatch                |                                 Yes | Best first step after this planning task.            |
| Scheduled scan against staging          | Yes, after staging target is stable | Useful for trend visibility.                         |
| Pull request required check             |                                  No | Too early; likely noisy and environment-sensitive.   |
| Active scan                             |                                  No | Not part of baseline plan.                           |
| Authenticated destructive workflow scan |                                  No | Unsafe until controlled context and allowlist exist. |

---

## 5. Safe Target Route Strategy

ZAP baseline scanning must start with safe, non-mutating, unauthenticated pages.

### 5.1 Initial Allowed Public Routes

The first scan target should be the deployed PWA root or local preview root.

Allowed initial routes:

| Route                 | Reason                                 |
| --------------------- | -------------------------------------- |
| /                     | Public landing page / app entry shell. |
| /auth/login           | Public login form.                     |
| /auth/signup-owner    | Public owner signup form.              |
| /auth/password/forgot | Public forgot-password form.           |

These routes are safe because they should be reachable without tenant data access and do not require authenticated operational context.

### 5.2 Excluded Initial Routes

The first ZAP baseline plan must exclude operational, destructive, tenant-scoped, platform-admin, token-bearing, or data-mutating routes.

| Route Pattern                     | Exclusion Reason                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| /api/*                            | API contract/security tests own this path initially; avoid browser spider side effects. |
| /auth/password/reset*             | Token-bearing route; unsafe without controlled single-use fixtures.                     |
| /auth/email-verification/confirm* | Token-bearing route; unsafe without controlled single-use fixtures.                     |
| /onboarding/*                     | Tenant setup workflow; may mutate setup state.                                          |
| /dashboard*                       | Authenticated tenant context required.                                                  |
| /customers*                       | Tenant data and potential write actions.                                                |
| /motorcycles*                     | Tenant data and potential write actions.                                                |
| /job-orders*                      | Operational workflow and state transitions.                                             |
| /estimates*                       | Operational workflow and state transitions.                                             |
| /inventory*                       | Stock and ledger-adjacent workflows.                                                    |
| /products*                        | Inventory master data workflows.                                                        |
| /inventory-adjustments*           | Approval/posting workflow.                                                              |
| /inventory-transfers*             | Stock-affecting workflow.                                                               |
| /purchase-orders*                 | Purchasing/receiving workflow.                                                          |
| /supplier-returns*                | Stock/AP affecting workflow.                                                            |
| /invoices*                        | Financial workflow.                                                                     |
| /payments*                        | Financial workflow.                                                                     |
| /receipts*                        | Immutable financial records.                                                            |
| /refunds*                         | Corrective financial workflow.                                                          |
| /exports*                         | Background jobs and tenant data packaging.                                              |
| /files*                           | Private signed file access.                                                             |
| /platform*                        | Platform admin surface and support access.                                              |
| /background-jobs*                 | Operational job visibility.                                                             |

---

## 6. Readiness Criteria Before Adding a Workflow

A ZAP baseline GitHub Actions workflow should not be added until all readiness criteria are satisfied.

### 6.1 Environment Readiness

- A stable local preview or staging URL exists.
- The target URL can be reached from GitHub Actions or the selected runner.
- The target is disposable or safe for passive crawling.
- The target has deterministic seed/configuration for public routes.
- Secrets are not needed for the initial unauthenticated scan.

### 6.2 Route Safety Readiness

- Initial route targets are limited to public, non-mutating routes.
- Operational and tenant-scoped routes are excluded.
- Token-bearing routes are excluded.
- Platform-admin routes are excluded.
- Upload, export, payment, refund, inventory, and workflow action routes are excluded.

### 6.3 Evidence Readiness

- ZAP HTML, Markdown, or JSON report artifacts are retained.
- The PR body template can include advisory ZAP evidence when a scan is run.
- Findings are reviewed before closing the task or release checklist item.
- Known accepted findings have documented rationale.

### 6.4 Ownership Readiness

- A security owner or maintainer is responsible for triage.
- New Critical or High findings become follow-up security tickets.
- Medium or Low findings are either fixed, accepted with rationale, or tracked.
- False positives are not globally ignored without explanation.

---

## 7. Future Workflow Design

The workflow file should be added in a follow-up task after this planning document is accepted.

Recommended future file path:

```text
.github/workflows/security-zap-baseline.yml
```

Recommended future support file path only after real findings require policy configuration:

```text
.zap/rules.tsv
```

Initial workflow characteristics:

| Setting               | Recommendation                                          |
| --------------------- | ------------------------------------------------------- |
| Trigger               | workflow_dispatch first; optional scheduled scan later. |
| Target                | Local preview or staging PWA URL.                       |
| Scan mode             | Baseline passive scan only.                             |
| Auth                  | None initially.                                         |
| Failure behavior      | Advisory / non-blocking.                                |
| Issue writing         | Disabled initially to avoid noisy automated issues.     |
| Artifacts             | Upload reports.                                         |
| Required branch check | No.                                                     |

Illustrative future workflow shape only. Do not add this workflow in ENG-LOOP-13 unless explicitly approved:

```yaml
name: Security ZAP Baseline

on:
  workflow_dispatch:

jobs:
  zap-baseline:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Run ZAP baseline scan
        uses: zaproxy/action-baseline@v0.15.0
        with:
          target: 'https://staging.example.com'
          fail_action: false
          allow_issue_writing: false
          artifact_name: zap_baseline
```

The exact target URL, environment startup, and artifact handling should be defined in the follow-up implementation ticket.

---

## 8. Finding Triage Policy

| Finding Level  | Initial Handling                                                              |
| -------------- | ----------------------------------------------------------------------------- |
| Critical       | Create security ticket immediately; assess release impact.                    |
| High           | Create security ticket; fix before promotion to required gate.                |
| Medium         | Track or fix before release readiness signoff unless accepted with rationale. |
| Low            | Track as hardening backlog if not release-blocking.                           |
| Informational  | Keep as evidence; fix opportunistically.                                      |
| False positive | Document rule ID, affected URL, reason, and reviewer.                         |

A finding should not be ignored only because it is inconvenient. A rule should be ignored only when the team has documented why the finding is false positive, out of scope, duplicate, or intentionally accepted.

---

## 9. Promotion Criteria

ZAP baseline may be promoted from advisory to required only when all criteria are true:

- The scan has run successfully for multiple consecutive executions.
- Target startup and route availability are deterministic.
- Report artifacts are retained and easy to review.
- Known findings have been fixed, accepted, or tracked.
- False positives are documented in rules or progress files with rationale.
- The scan does not hit write paths or destructive workflows.
- Runtime is acceptable for the selected CI lane.
- The maintainer explicitly approves promotion.
- Branch protection is updated only after the status check name is documented.

Promotion should be handled as a separate ENG-LOOP task, not as part of ENG-LOOP-13.

---

## 10. Validation

ENG-LOOP-13 is documentation-only.

Recommended validation commands:

```bash
pnpm validate:quick
```

If a PR body is prepared locally:

```bash
PR_BODY="$(cat .tmp/eng-loop-13-pr-body.md)" node ./.github/scripts/validate-pr-evidence.cjs
```

Expected result:

```text
PR validation evidence guard passed.
```

No ZAP scan is required to close this planning task.

---

## 11. Acceptance Criteria

ENG-LOOP-13 is complete when:

- ZAP baseline readiness criteria are documented.
- Advisory-first behavior is explicitly documented.
- Safe initial target routes are documented.
- Unsafe/destructive/authenticated route groups are excluded.
- Future workflow criteria are documented without enabling a required gate.
- Promotion criteria are documented.
- No runtime behavior, product behavior, API behavior, database schema, or branch protection setting is changed.

---

## 12. Follow-Up Candidates

Potential follow-up tasks after this planning task:

1. Add advisory OWASP ZAP baseline GitHub Actions workflow.
2. Add ZAP report artifact retention and PR evidence guidance.
3. Add ZAP rule/progress file after first real scan findings are reviewed.
4. Add authenticated read-only scan strategy after stable test tenants and non-destructive route allowlists exist.
5. Evaluate whether selected ZAP checks can become required release-readiness evidence.
