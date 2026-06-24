# GarageOS UX Wireframe Backlog

**Document:** `docs/ux/wireframe-backlog.md`
**Project:** GarageOS — Motorcycle Shop Management System SaaS
**Status:** Draft
**Milestone:** UX Wireframe Backlog
**Purpose:** Define the first low-fidelity wireframe backlog for high-frequency mobile workflows before detailed UI implementation begins.

---

## 1. Goal

Create a source-aligned backlog of low-fidelity wireframes for GarageOS.

This backlog does not define final visual design, colors, spacing, component styling, or pixel-level layout. It identifies which mobile workflows and reusable UX patterns must be wireframed first so future frontend implementation remains consistent, traceable, and aligned with the approved documentation.

---

## 2. Scope

### In Scope

- Low-fidelity wireframe backlog items.
- High-frequency mobile workflows.
- Reusable UX patterns required across workflows.
- Permission-aware action states.
- Tenant lifecycle and subscription status banners.
- Branch indicators and branch selectors.
- Offline read-only states.
- Workflow confirmation modals.
- Reason-field patterns for audited/corrective actions.
- Validation, blocked, empty, loading, conflict, and error states.
- Background job status components for exports and long-running operations.

### Out of Scope

- High-fidelity visual design.
- Final component styling.
- Native iOS or Android app screens.
- Offline write queues or sync conflict screens.
- Customer portal screens.
- Standalone retail POS screens.
- Payroll, general ledger, direct BIR filing, loyalty, marketplace, or 2FA flows.
- Any screen or workflow not already represented in the approved source documentation.

---

## 3. Wireframe Backlog Rules

Every wireframe backlog item must include:

- Wireframe ID.
- Priority.
- Workflow or pattern name.
- Primary role.
- Route or screen group.
- Source alignment references.
- Required states.
- Acceptance criteria.
- Notes for future feature-ticket traceability.

Every wireframe must account for these states where applicable:

- Default state.
- Empty state.
- Loading state.
- Validation error state.
- Permission-blocked state.
- Branch-access-blocked state.
- Tenant-status-blocked state.
- Plan-limit-blocked state.
- Offline read-only state.
- Conflict or stale-update state.
- Background job queued/running/succeeded/failed state.

---

## 4. Priority Model

| Priority | Meaning                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------- |
| P0       | Required baseline pattern or core mobile workflow needed before frontend implementation starts. |
| P1       | High-frequency operational workflow needed early in frontend planning.                          |
| P2       | Important workflow, but can be wireframed after P0/P1 patterns are stable.                      |

---

## 5. P0 — Baseline UX Patterns

| ID      | Wireframe / Pattern                | Primary Users                                  | Required Coverage                                                          | Acceptance Criteria                                                                                  |
| ------- | ---------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| WF-0001 | Mobile Application Shell           | Tenant users, platform admins                  | Auth gate, bottom navigation, More menu, user menu, notification indicator | Shell shows only accessible navigation groups and supports mobile-first layout.                      |
| WF-0002 | Tenant Status Banner               | Tenant users                                   | Grace period, read-only, suspended, pending deletion, renewal warning      | User can clearly understand current access status and recovery action.                               |
| WF-0003 | Branch Selector / Branch Indicator | Multi-branch users, branch-scoped users        | Current branch context, branch filter, assigned branch limitations         | Branch context is visible before branch-scoped actions are performed.                                |
| WF-0004 | Permission-Aware Actions           | All tenant roles                               | Hidden/disabled actions, missing permission state, safe messaging          | UI never implies an unauthorized action is available.                                                |
| WF-0005 | Offline Read-Only Indicator        | Tenant users                                   | Offline banner, cached record view, blocked write attempt                  | Offline mode clearly blocks create, edit, upload, approve, payment, inventory, and settings actions. |
| WF-0006 | Workflow Confirmation Modal        | Managers, advisors, cashiers, inventory clerks | Confirm action, risk copy, reason field where required                     | Status-changing or corrective actions require explicit confirmation.                                 |
| WF-0007 | Validation and Conflict States     | All users                                      | Field validation, duplicate warnings, version conflict, workflow blocked   | Errors are clear, field-specific where possible, and provide recovery guidance.                      |
| WF-0008 | Background Job Status Component    | Owners, managers, platform admins              | Queued, running, succeeded, failed, dead-lettered, safe error summary      | Long-running exports/reports expose status without leaking sensitive details.                        |

---

## 6. P1 — High-Frequency Mobile Workflow Wireframes

| ID      | Wireframe / Workflow                         | Primary Role                              | Route / Screen Group                                   | Required States                                                                      | Acceptance Criteria                                                                            |
| ------- | -------------------------------------------- | ----------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| WF-0101 | Onboarding Gate and Setup Progress           | Shop Owner                                | `/onboarding/*`                                        | Pending setup, missing profile, missing branch, missing subscription info            | Owner can see setup blockers and continue onboarding without accessing operational modules.    |
| WF-0102 | Dashboard Summary                            | Owner, Manager                            | `/dashboard`                                           | Empty tenant, branch-filtered, renewal warning, read-only banner, low-stock alert    | Dashboard gives fast operational status without exposing unauthorized branch data.             |
| WF-0103 | Customer Search and Create                   | Service Advisor, Owner, Manager           | `/customers/*`                                         | Search, empty state, duplicate warning, validation errors, permission blocked        | Advisor can quickly find or create a customer during intake.                                   |
| WF-0104 | Motorcycle Search and Create                 | Service Advisor, Owner, Manager           | `/motorcycles/*`                                       | Linked customer, duplicate warning, validation errors, permission blocked            | Advisor can link a motorcycle to an active customer during intake.                             |
| WF-0105 | Job Order Intake                             | Service Advisor, Manager, Owner           | `/job-orders/new`                                      | Branch selector, customer/motorcycle lookup, service lines, notes, validation errors | Advisor can create a job order for one motorcycle at one branch.                               |
| WF-0106 | Job Order Detail and Status Actions          | Service Advisor, Manager, Mechanic        | `/job-orders/{id}`                                     | Status history, notes, parts/labor, workflow blocked, read-only, offline             | User can understand job progress and available actions based on permission and workflow state. |
| WF-0107 | Mechanic Assigned Jobs                       | Mechanic                                  | `/mechanic-sessions/my-jobs` or filtered `/job-orders` | Assigned jobs, no assigned jobs, start blocked, offline read-only                    | Mechanic sees assigned work without financial information.                                     |
| WF-0108 | Mechanic Work Session Actions                | Mechanic                                  | `/mechanic-sessions/*`                                 | Start, pause, resume, finish, active session, blocked invalid transition             | Mechanic can manage one valid work session lifecycle.                                          |
| WF-0109 | Inventory Product Search and Stock by Branch | Inventory Clerk, Manager, Owner           | `/inventory/*`, `/products/*`                          | Branch stock, low stock, empty search, branch access blocked                         | User can quickly check available stock for accessible branches.                                |
| WF-0110 | Job Part Reservation                         | Service Advisor, Inventory Clerk, Manager | Job order part panel/modal                             | Insufficient stock, FIFO/reservation pending, validation errors, offline blocked     | User can reserve parts only when stock is available and action is permitted.                   |
| WF-0111 | Invoice from Job Order                       | Cashier, Manager, Owner                   | `/invoices/*`                                          | Draft invoice, billing allocation warning, issue confirmation, validation errors     | Cashier can generate and issue invoice from billable job order lines without overbilling.      |
| WF-0112 | Record Payment and Receipt View              | Cashier, Manager, Owner                   | `/payments/*`, `/receipts/*`                           | Partial payment, split payment, overpayment blocked, immutable receipt               | Cashier can record payment and view immutable receipt after success.                           |
| WF-0113 | Inventory Transfer Quick Flow                | Inventory Clerk, Manager                  | `/inventory-transfers/*`                               | Draft, submit, send, receive, variance, cancel confirmation                          | User can understand transfer state and required confirmations.                                 |
| WF-0114 | Purchase Receiving                           | Inventory Clerk, Manager, Owner           | `/purchase-orders/*`                                   | Partial receive, over-receive blocked, validation errors, confirmation               | User can receive stock safely into inventory.                                                  |
| WF-0115 | Tenant Export Request and Job Status         | Shop Owner                                | `/exports/*`                                           | Request export, queued, running, failed, download ready, expired link                | Owner can request export and track background job status safely.                               |

---

## 7. P2 — Secondary Wireframe Backlog

| ID      | Wireframe / Workflow           | Primary Role                            | Route / Screen Group                  | Notes                                                          |
| ------- | ------------------------------ | --------------------------------------- | ------------------------------------- | -------------------------------------------------------------- |
| WF-0201 | Employee List and Invite       | Shop Owner, Authorized Manager          | `/employees/*`                        | Needs role and branch assignment visibility.                   |
| WF-0202 | Role and Permission Management | Shop Owner, Authorized Manager          | `/roles/*`                            | Must clearly show high-risk permission changes.                |
| WF-0203 | Service Catalog Management     | Owner, Manager, Service Advisor         | `/services/*`                         | Includes deactivate/reactivate states.                         |
| WF-0204 | Estimate Creation and Approval | Service Advisor, Manager, Owner         | `/estimates/*`                        | Must not imply inventory or revenue impact before conversion.  |
| WF-0205 | Inventory Adjustment Approval  | Inventory Clerk, Manager                | `/inventory-adjustments/*`            | Requires approval, post, reject, cancel states.                |
| WF-0206 | Supplier Detail and AP Summary | Inventory Clerk, Manager, Owner         | `/suppliers/*`, `/accounts-payable/*` | Must avoid exposing AP to unauthorized roles.                  |
| WF-0207 | Refund and Void Actions        | Cashier, Manager, Owner                 | `/refunds/*`, `/invoices/*`           | Requires confirmation and reason fields.                       |
| WF-0208 | Reports and Report Export      | Owner, Manager, Authorized Users        | `/reports/*`                          | Must include plan-limited and branch-filtered states.          |
| WF-0209 | Audit Log Viewer               | Owner, Authorized Users, Platform Admin | `/audit-logs/*`                       | Must show actor, action, timestamp, and sanitized changes.     |
| WF-0210 | Platform Tenant Management     | Platform Admin                          | `/platform/*`                         | Must visibly separate platform admin from tenant user context. |

---

## 8. Wireframe Ticket Template

Each wireframe ticket should use this structure:

```text
Title:
Wireframe ID:
Priority:
Primary role:
Route / screen group:
Source alignment:
Related PRD references:
Related RTM references:
Related user stories:
Related API endpoints:
Related schema entities:
Related permissions:
Related UX screen map sections:
Related QA acceptance tests:
Related ADRs:
Audit relevance:
Required states:
Acceptance criteria:
Out of scope:
Notes:
```

---

## 9. Acceptance Criteria

1. `docs/ux/wireframe-backlog.md` exists.
2. The backlog prioritizes baseline reusable UX patterns before detailed screen design.
3. The backlog includes high-frequency mobile workflows for onboarding, dashboard, customer/motorcycle intake, job orders, mechanic sessions, inventory lookup, part reservation, invoicing, payment, receipt, transfer, receiving, and export status.
4. Every backlog item includes required UX states or explicitly states when a state is not applicable.
5. The backlog does not introduce excluded screens or undocumented workflows.
6. Future wireframe tickets can trace to PRD, RTM, user story, API, schema, permission, UX, QA, ADR, and audit references where applicable.
7. The backlog is ready for review by Product, UX, QA, Security, Engineering, and DevOps.
