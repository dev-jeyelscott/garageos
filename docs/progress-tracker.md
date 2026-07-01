# GarageOS Progress Tracker

**File:** `docs/progress-tracker.md`  
**Project:** GarageOS — Motorcycle Shop Management System SaaS  
**Updated:** 2026-07-01  
**Status:** Working tracker for engineering handoffs

---

## Tracker Rules

- Project documentation remains the source of truth.
- Backend/API/database enforcement remains authoritative; UI checks are usability aids only.
- Do not mark a slice complete unless repository state and validation are confirmed.
- Explicit exclusions remain out of scope: native apps, offline writes, customer portal, standalone POS, payroll, full accounting/general ledger, direct BIR filing, e-commerce marketplace, loyalty, service packages, automatic subscription payment collection, 2FA, microservices-first architecture, and undocumented AI/advanced analytics.

---

## Current Workstream Summary

| Field                              | Value                                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Roadmap milestone currently active | Milestone 8 — Purchasing, Suppliers, and Accounts Payable                                                            |
| Current frontend slice             | Supplier list/search UI                                                                                              |
| Implemented route in this handoff  | `/suppliers`                                                                                                         |
| Implemented API binding            | `GET /api/v1/suppliers` with `q`, `status`, `limit`, and `cursor` query parameters                                   |
| Write workflows                    | Not implemented in this slice; create/edit/deactivate/reactivate/payments/credits/returns remain disabled or planned |
| Validation status                  | Validation not run in this environment; run local commands below                                                     |

---

## Milestone Overview

| Milestone | Name                                               | Status       | Notes                                                                                          |
| --------: | -------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------- |
|         0 | Project Foundation and Engineering Decisions       | Needs Review | Verify repo, CI, ADR directory, and local dev setup.                                           |
|         1 | Database Foundation and Core Migrations            | Needs Review | Verify migrations, seed data, constraints, and indexes.                                        |
|         2 | API Foundation, Auth, Tenant Context, RBAC         | Needs Review | Verify auth/session, guards, idempotency, audit, and transaction helpers.                      |
|         3 | Tenant Lifecycle, Onboarding, Platform Admin       | In Progress  | Platform tenant management UI exists in the current repository baseline.                       |
|         4 | Core Master Data                                   | Needs Review | Branches/customers/employees/roles need current repo verification.                             |
|         5 | Service Operations                                 | Needs Review | Job order and estimate UI/API coverage need verification.                                      |
|         6 | Inventory Foundation and FIFO                      | Needs Review | Prior inventory work implies implementation exists; verify tests.                              |
|         7 | Inventory Workflows                                | Needs Review | User previously reported validation passed for Step 7.15; re-run before marking done.          |
|         8 | Purchasing, Suppliers, and AP                      | In Progress  | Supplier list/search UI route added; backend supplier API must exist locally for runtime data. |
|         9 | Invoicing, Payments, Receipts, Refunds, AR         | Not Started  | Depends on service, inventory, and purchasing/AP readiness.                                    |
|        10 | Expenses, Reminders, Notifications, Integrations   | Not Started  | Provider choices may remain ADR-backed until needed.                                           |
|        11 | Files, Exports, Offline PWA Cache                  | Not Started  | Offline cache must remain read-only.                                                           |
|        12 | Dashboard, Reports, Search, Export Formats         | Not Started  | Report formulas and search read models need dedicated validation.                              |
|        13 | Security, Observability, Performance, DR Hardening | Not Started  | Continuous review; milestone closure is later.                                                 |
|        14 | End-to-End UAT and Launch Readiness                | Not Started  | Requires full validation evidence.                                                             |

---

## Milestone 8 — Purchasing, Suppliers, and Accounts Payable

**Goal:** Build suppliers, purchase orders, receiving, supplier payments/credits, supplier returns, and AP basis.

**Status:** `In Progress`

### Done Checklist

- [x] Supplier list/search route scaffold added at `/suppliers`.
- [x] Supplier list/search screen wired to documented `GET /api/v1/suppliers` endpoint.
- [x] Supplier search supports `q`, `status`, cursor pagination, loading, empty, forbidden, and error states.
- [x] Tenant navigation includes Suppliers behind `suppliers.read`.
- [x] Supplier write/payment/credit/return actions remain disabled or planned in this slice.

### Pending Checklist

- [ ] Validate the supplier list/search UI against the local repository.
- [ ] Confirm backend `GET /api/v1/suppliers` response shape matches the frontend normalizer.
- [ ] Implement supplier detail route `/suppliers/{supplier_id}`.
- [ ] Implement supplier create route `/suppliers/new` with idempotency.
- [ ] Implement supplier edit/deactivate/reactivate workflows.
- [ ] Implement purchase orders, purchase receiving, supplier payments, supplier credits, supplier returns, and AP balance views.
- [ ] Add unit/component tests for supplier list/search states where the current test setup supports it.

### Validation Commands

```bash
pnpm --filter @garageos/web typecheck
pnpm --filter @garageos/web lint
pnpm --filter @garageos/web test
pnpm --filter @garageos/web build
```

### Notes

- This slice intentionally does not implement supplier writes or financial workflows.
- Backend authorization remains authoritative for tenant isolation, permissions, tenant lifecycle gates, and API error handling.
- Runtime data requires the documented backend supplier list endpoint to be available in the local API.
