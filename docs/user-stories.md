# GarageOS User Stories

**Document:** `user-stories.md`  
**Project:** GarageOS — Motorcycle Shop Management System SaaS  
**Generated:** 2026-06-24  
**Status:** Draft generated from approved source documents  
**Source of Truth:** `requirements-v2.4.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`

---

## 1. Purpose

This document converts the approved GarageOS source documentation into implementation-ready user stories. It is intended for product backlog creation, sprint planning, QA test planning, and traceability from requirements to implementation.

No functionality, module, role, workflow, or scope has been added beyond the provided source documents.

---

## 2. Source Alignment Rules

The following rules apply to every story in this document:

1. The PRD is the primary product source of truth.
2. The database design and database schema are the persistence and data-integrity source of truth.
3. The architecture document is the implementation-structure and non-functional constraint source of truth.
4. The API contracts define endpoint behavior, request/response conventions, authorization boundaries, idempotency, and error semantics.
5. If a detail is not documented, it is not converted into functional scope.
6. Explicit exclusions remain out of scope.

---

## 3. Global Acceptance Criteria

These acceptance criteria apply to all applicable stories unless explicitly stated otherwise.

- Tenant-owned records are always scoped by `tenant_id`.
- Branch-specific records are always scoped by both `tenant_id` and `branch_id`.
- Tenant users cannot access records from another tenant.
- Branch-scoped users cannot access branch-specific records from unassigned branches unless they have tenant-wide branch access.
- Required permissions are enforced before performing protected actions.
- Tenant lifecycle status is enforced before operational writes.
- Read-only, suspended, pending-deletion, and deleted tenants are blocked according to documented access rules.
- Critical writes use idempotency where required by the API contract.
- Mutable updates use optimistic locking where documented.
- Workflow status changes use explicit transition validation and status history records.
- Critical actions write audit logs.
- Financial, receipt, refund, inventory ledger, FIFO, and audit records are immutable or correction-only according to the source documents.
- API responses follow the documented response/error envelope and include request/correlation metadata.
- Offline mode never allows operational create, edit, delete, approve, payment, upload, or sync behavior.

---

## 4. Agent Panel Discussion Summary

| Role                 | Focus                                   | Discussion Result                                                                                                                                                                                                                  |
| -------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Business Owner       | SaaS monetization and operational value | Stories must preserve subscription revenue controls, plan limits, renewal lifecycle, branch limits, reports, and customer retention workflows.                                                                                     |
| Product Manager / BA | Scope and PRD traceability              | Stories must cover the complete single-build scope and exclude native apps, customer portals, POS checkout, payroll, full accounting, direct BIR filing, marketplace, loyalty, 2FA, and automatic subscription payment collection. |
| SMEs                 | Motorcycle shop domain fit              | Stories must support real shop workflows: intake, job orders, mechanic work, parts reservation, invoicing, payments, supplier purchasing, branch inventory, reminders, and operational reports.                                    |
| End Users            | Daily workflow usability                | Stories must be role-oriented for shop owners, managers, service advisors, mechanics, cashiers, inventory clerks, and platform admins.                                                                                             |
| Architect            | Technical feasibility                   | Stories must align with the modular monolith, PostgreSQL source of truth, tenant isolation, command-driven workflows, background jobs, and mobile-first PWA constraints.                                                           |
| Senior Engineers     | Implementation quality                  | Stories must expose explicit workflow transitions, idempotent critical writes, optimistic locking, immutable ledgers, FIFO correctness, and clear service boundaries.                                                              |
| UX Designer          | Mobile-first usability                  | Stories must support small-screen workflows, disabled/hidden unauthorized actions, clear offline/read-only states, and clear validation messages.                                                                                  |
| QA                   | Testability                             | Stories must contain acceptance criteria for permissions, workflow transitions, blocked actions, duplicate prevention, concurrency, tenant isolation, and financial/inventory integrity.                                           |
| Security             | Access control and sensitive data       | Stories must enforce hashed passwords/tokens, rate limits, tenant/branch authorization, audited support access, signed file URLs, and sensitive-data logging prohibitions.                                                         |
| DevOps               | Operations and reliability              | Stories must include background job visibility, observability, backup/restore targets, exports, deletion jobs, and provider delivery failure tracking.                                                                             |
| Project Manager      | Delivery planning                       | Stories are grouped by epics that align with the documented recommended implementation order, while respecting the PRD rule that the product is a single build scope with no product phases.                                       |

---

## 5. Clarification Log

| Question Raised                                                | Role Asking          | Role Answering       | Resolution                                                                                                                                                                                        |
| -------------------------------------------------------------- | -------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can offline users create or edit records and sync later?       | UX Designer          | Product Manager / BA | No. Offline support is limited to app shell and read-only recently viewed records.                                                                                                                |
| Can subscription payments be collected automatically?          | Business Owner       | Product Manager / BA | No. Subscription payment collection happens outside the system and is manually reflected by platform admins.                                                                                      |
| Can customers log in to a portal?                              | End Users            | Product Manager / BA | No. Customer portal and customer login accounts are explicitly excluded.                                                                                                                          |
| Can mechanics access invoices or financial reports by default? | SMEs                 | Security             | No. Mechanics must not access invoices, payments, supplier balances, financial reports, or subscription settings unless explicitly granted through custom permissions.                            |
| Can stock quantity be updated directly?                        | Senior Engineers     | Architect            | No. Stock-changing events must use inventory ledger entries and FIFO rules.                                                                                                                       |
| Can issued receipts be edited?                                 | Cashier / End User   | Security             | No. Receipts are immutable proof of payment.                                                                                                                                                      |
| Can one job order be billed through multiple invoices?         | Product Manager / BA | Senior Engineers     | Yes, but billing allocations must prevent overbilling.                                                                                                                                            |
| Can tenant deletion data be restored after deletion?           | Business Owner       | DevOps               | No. Resubscription after deletion creates a new tenant record. Backups are only for platform-wide disaster recovery.                                                                              |
| Is notification template wording finalized?                    | UX Designer          | Product Manager / BA | Not fully specified in the schema seed notes. Stories cover delivery, tracking, preferences, and plan enforcement; exact template copy should be handled in a separate content/template artifact. |

---

## 6. Explicit Out-of-Scope Guardrails

The following are not user stories and must not be added to the backlog for this build:

- Native iOS or Android applications.
- Offline transaction creation, editing, submission, or conflict resolution.
- Full accounting system, general ledger, journal entries, bank reconciliation, or formal accounting close.
- Payroll, commissions, salary calculations, payslips, or government payroll contributions.
- Direct BIR filing.
- E-commerce marketplace, online store, checkout, or delivery workflow.
- Customer portal or customer login accounts.
- Loyalty program, points, rewards, membership tiers, or redemption.
- Service packages with package-level pricing or redemption tracking.
- Predictive analytics, AI recommendations, forecasting models, or custom BI dashboards beyond defined reports.
- Automated subscription payment collection through a payment gateway.
- Standalone walk-in retail POS/cart checkout independent of job orders or service invoices.
- Two-factor authentication.

---

## 7. Story Format

Each story follows this structure:

```text
As a <role>, I want <capability>, so that <business/user outcome>.
```

Each story includes acceptance criteria and source alignment references.

---

# Epic 1 — Platform Administration, Tenant Lifecycle, and Subscriptions

## US-001 — Create platform-managed tenants

**As a Platform Admin, I want to create tenants with assigned subscription plans and shop owner setup, so that new shops can be onboarded under SaaS control.**

**Acceptance Criteria**

- Platform admin can create a tenant.
- Platform admin can assign plan, start date, and expiration date before activation.
- Platform admin can create or invite the shop owner.
- Duplicate active tenant using the same normalized shop email and business name is blocked unless explicitly approved by platform admin.
- Tenant is created in `pending_setup` until onboarding is complete and subscription requirements are satisfied.
- Tenant creation is audit logged.

**Source Alignment:** PRD 4.1, 4.2, 4.11, 4.12; API 9.2; Schema 5.

## US-002 — Support owner signup tenant creation

**As a Shop Owner, I want to sign up and create a tenant, so that I can start onboarding my motorcycle shop.**

**Acceptance Criteria**

- Owner signup requires email verification before operational access.
- Owner signup creates a tenant in `pending_setup`.
- System assigns the configured default plan and default subscription duration.
- Signup is blocked if default plan or default subscription duration is not configured.
- Operational modules remain blocked until onboarding is complete.

**Source Alignment:** PRD 4.2, 4.11, 4.12; API 9.1, 9.3.

## US-003 — Enforce tenant subscription lifecycle

**As a Platform Operator, I want tenant access to follow the subscription expiration lifecycle, so that subscription status is enforced consistently.**

**Acceptance Criteria**

- Before expiration, tenant status is `active` with full permission-based access.
- Day 1–14 after expiration sets `grace_period` with full access and renewal warnings.
- Day 15–30 sets `read_only` and blocks operational writes.
- Day 31–60 sets `suspended`, allowing only Shop Owner renewal/export access.
- Day 61–67 sets `pending_deletion` and queues tenant deletion.
- Day 68 or later allows permanent deletion job completion.
- Lifecycle dates are calculated using tenant timezone.
- Status changes caused by scheduled evaluation are system-logged.

**Source Alignment:** PRD 4.3–4.8, 4.12; Architecture 10.4; API 5.4.

## US-004 — Renew subscription through external payment confirmation

**As a Shop Owner, I want to submit a renewal request, so that my subscription can be restored after external payment confirmation.**

**Acceptance Criteria**

- Renewal action does not process payment in GarageOS.
- Renewal action shows renewal instructions or submits a renewal request.
- Tenant returns to `active` only after platform admin confirms external payment and updates subscription expiration date or override.
- If renewal occurs before permanent deletion completes, tenant is restored to `active` immediately after platform admin confirmation.
- Renewal-related changes are audit logged.

**Source Alignment:** PRD 4.4, 4.12, 5.5; API 9.3.

## US-005 — Manage subscription plans and plan limits

**As a Platform Admin, I want to configure standard subscription plans and limits, so that SaaS monetization is enforced by plan.**

**Acceptance Criteria**

- System supports exactly Basic, Mid, and High standard plans.
- Platform admin can configure plan limits.
- Platform admin can configure one default active plan for owner signup.
- Plan limits include active branches, notification channels, customer reminders, branch reports, and advanced reports.
- Tenant-specific plan overrides are supported and audit logged.

**Source Alignment:** PRD 5.1–5.5; Schema 5, 23.1; API 9.2.

## US-006 — Enforce branch limits by plan

**As a Shop Owner, I want branch creation to respect my subscription plan, so that my shop operates within my subscribed limits.**

**Acceptance Criteria**

- Active branch count is checked before creating or reactivating a branch.
- Branch creation is blocked when active branch count reaches the effective plan limit.
- Inactive branches do not count against active branch limit.
- Blocked attempts show a clear upgrade prompt.
- Blocked branch creation attempts are audit logged.

**Source Alignment:** PRD 5.3, 9.5; API 9.4.

## US-007 — Manage audited platform support access

**As a Platform Admin, I want audited support access to tenant data, so that I can investigate support issues without bypassing controls.**

**Acceptance Criteria**

- Support access requires platform admin, tenant, access reason, start timestamp, expiration/end timestamp, access mode, and audit log.
- Default support access mode is `read_only`.
- `write_allowed` must be explicitly selected and permission-controlled.
- Platform admins cannot silently impersonate tenant users.
- Support sessions are visually marked when active.
- Every support action is audited as platform admin activity.

**Source Alignment:** PRD 4.10; Architecture 22.4; API 9.2.

---

# Epic 2 — Authentication and Account Management

## US-008 — Log in, maintain sessions, and log out

**As a User, I want secure login, remember-me sessions, and logout controls, so that I can safely access GarageOS.**

**Acceptance Criteria**

- User can log in with email and password.
- Access tokens expire within 15 minutes.
- Refresh tokens rotate.
- Remember-me sessions can last up to 30 days.
- User can log out from current device.
- User can log out from all devices.
- Deactivated users cannot log in.

**Source Alignment:** PRD 6.1, 6.6, 6.9; API 9.1.

## US-009 — Verify email before operational access

**As a User, I want to verify my email before using operational screens, so that account ownership is confirmed.**

**Acceptance Criteria**

- Before verification, user can only access verification screen, resend verification action, and logout.
- Operational access is blocked until email is verified.
- Email verification token is single-use and stored securely as a hash.
- Verification is reflected in session state.

**Source Alignment:** PRD 6.3; API 9.1; Schema 6.

## US-010 — Reset forgotten password securely

**As a User, I want to reset my password securely, so that I can regain access without exposing credentials.**

**Acceptance Criteria**

- Password reset requests are rate-limited to 3 per account per hour.
- Password reset links expire after 30 minutes.
- Password reset tokens are single-use and stored as hashes.
- Passwords must satisfy documented password policy.
- Existing sessions are revoked after successful admin-triggered reset.
- Plaintext passwords are never stored, logged, emailed, exported, or exposed through APIs.

**Source Alignment:** PRD 6.4, 6.5, 6.8, 10.4; API 9.1, 9.5.

## US-011 — Protect login from brute-force attempts

**As a Platform Operator, I want failed login attempts rate-limited, so that account abuse is reduced.**

**Acceptance Criteria**

- System rate-limits 5 failed login attempts within 15 minutes per account and per IP address.
- Excess attempts are blocked for 15 minutes.
- Forgot-password requests remain available subject to password reset rate limits.
- Lockout events are audit logged.

**Source Alignment:** PRD 6.7, 33.6; API 12.3.

## US-012 — Change user email safely

**As a User or Authorized Admin, I want user email changes to preserve identity and history, so that records remain accurate.**

**Acceptance Criteria**

- Email change requires own confirmation or authorized admin action.
- New normalized email must be globally unique among active users.
- New email must be verified before operational access continues.
- Active sessions are revoked after email change confirmation.
- Historical user ID references remain unchanged.
- Email change is audit logged.

**Source Alignment:** PRD 6.10; API 9.1, 9.5.

## US-013 — Bootstrap first platform admin securely

**As an Infrastructure Operator, I want the first platform admin created through deployment-time bootstrap, so that platform administration is not publicly exposed.**

**Acceptance Criteria**

- Bootstrap is disabled after first platform admin is created.
- Bootstrap requires infrastructure-level operator access.
- Bootstrap requires strong temporary credential or invite token.
- First platform admin must change password and verify email before operational access.
- Public signup cannot create platform admin accounts.
- Bootstrap action writes platform audit log.

**Source Alignment:** PRD 6.2.1.

---

# Epic 3 — Roles, Permissions, Employees, and Branch Access

## US-014 — Seed tenant role templates

**As a Shop Owner, I want default shop roles created during tenant setup, so that common responsibilities are available immediately.**

**Acceptance Criteria**

- Tenant setup seeds Shop Owner, Manager, Service Advisor, Mechanic, Cashier, and Inventory Clerk roles.
- Default role templates belong to the tenant after creation.
- Shop Owner role cannot be deleted, deactivated, or modified in a way that removes required owner capabilities.
- Other seeded roles may be edited by authorized users.
- Role permission changes are audit logged.

**Source Alignment:** PRD 7.1–7.13; Schema 23.2; API 9.5.

## US-015 — Resolve additive permissions across multiple roles

**As a User with multiple roles, I want my effective permissions to combine across active roles, so that assigned responsibilities work correctly.**

**Acceptance Criteria**

- Users may have multiple roles.
- Effective permissions are the union of all active assigned role permissions.
- Explicit deny permissions are not supported.
- Permission changes take effect immediately for users assigned to the edited role.

**Source Alignment:** PRD 7.8, 7.9, 7.13; API 5.5.

## US-016 — Create and invite employees

**As a Shop Owner or Authorized Manager, I want to create or invite employees, so that staff can access GarageOS with proper roles and branch assignments.**

**Acceptance Criteria**

- Public self-registration into an existing tenant as employee is blocked.
- Employee invitations are single-use and expire after 7 days.
- Invitation is scoped to exactly one tenant.
- Invitation includes role and branch configuration or requires completion before operational access.
- Invited user must verify email before operational access.
- Expired, revoked, or used invitation links are blocked.
- Invitation lifecycle events are audit logged.

**Source Alignment:** PRD 6.2.2, 10.1–10.2; API 9.5.

## US-017 — Deactivate employees safely

**As a Shop Owner or Authorized Manager, I want to deactivate employees, so that former staff lose access without losing historical records.**

**Acceptance Criteria**

- Deactivated employee cannot log in.
- Active sessions are revoked.
- Employee remains visible in historical records.
- Existing job order assignments remain historically visible.
- Open job orders assigned to deactivated employee are flagged for reassignment.
- Last active Shop Owner cannot be deactivated or demoted.
- Deactivation is audit logged.

**Source Alignment:** PRD 6.9, 7.2, 10.3; API 9.5.

## US-018 — Reactivate employees with current validations

**As a Shop Owner or Authorized Manager, I want to reactivate inactive employees only when valid, so that access is restored safely.**

**Acceptance Criteria**

- Reactivation requires `users.update` permission.
- Employee must belong to the same tenant.
- Employee must have at least one active role.
- Employee must have at least one active branch assignment unless tenant-wide branch access is enabled.
- Global active email uniqueness is re-checked.
- Stale sessions are revoked.
- Reactivated employee access follows current roles, branches, tenant status, and email verification state.
- Reactivation is audit logged.

**Source Alignment:** PRD 10.5; API 9.5.

## US-019 — Assign branch access to employees

**As a Shop Owner or Authorized Manager, I want to assign employees to one or more branches or tenant-wide access, so that branch-specific records are protected.**

**Acceptance Criteria**

- Employee must have at least one active branch assignment unless tenant-wide branch access is enabled.
- Branch-specific records require assignment to the branch or tenant-wide branch access.
- Employees assigned only to a deactivated branch are flagged for reassignment.
- Branch access is enforced for all branch-specific operational records.

**Source Alignment:** PRD 7.10, 9.4, 10.2; Architecture 10.3; API 5.3.

## US-020 — Manage custom roles

**As a Shop Owner or Authorized Manager, I want to create and manage custom roles, so that permissions can match my shop operations.**

**Acceptance Criteria**

- Custom role belongs to exactly one tenant.
- Role name is unique within tenant among active roles.
- Role contains one or more action-level permissions.
- Role can be assigned to users.
- Role can be edited by users with `roles.update` permission.
- Role can be deactivated only when no active user depends solely on it.
- Deactivated roles cannot be assigned to users.

**Source Alignment:** PRD 7.8, 7.12, 7.13; API 9.5.

---

# Epic 4 — Shop Onboarding, Settings, and Branch Management

## US-021 — Complete shop onboarding

**As a Shop Owner, I want to complete required shop setup, so that operational modules become available.**

**Acceptance Criteria**

- Onboarding requires shop profile, at least one active branch, invoice prefix, tax profile, country, business timezone, default currency, and at least one active Shop Owner.
- Pending setup users can access only onboarding, profile setup, subscription information, password management, and logout.
- Operational modules remain blocked until onboarding completion.
- Tenant moves from `pending_setup` to `active` only when onboarding is complete and subscription plan and expiration date are effective.
- Onboarding completion is audit logged.

**Source Alignment:** PRD 4.11, 8.1–8.2; API 9.3.

## US-022 — Configure shop profile and settings

**As a Shop Owner, I want to manage shop profile and settings, so that business information, tax behavior, and invoice defaults are correct.**

**Acceptance Criteria**

- Required setup fields validate according to documented rules.
- Invoice prefix must match `^[A-Z0-9]{2,10}-$` and end with dash.
- Invoice prefix is immutable after onboarding completion.
- Tax profile, tax mode, and VAT rate changes affect only future invoices.
- Issued invoices retain copied tax profile, tax mode, and VAT rate from issuance.
- Country and currency follow immutability rules.

**Source Alignment:** PRD 8.2–8.4, 24, 36.2; API 9.3.

## US-023 — Create and update branches

**As a Shop Owner or Authorized Manager, I want to create and update branches, so that my shop locations are represented accurately.**

**Acceptance Criteria**

- Branch requires unique active name within tenant, address, contact number, business hours, and status.
- Branch creation respects active branch plan limit.
- Branch records are tenant-scoped.
- Branch records use active/inactive status.
- Branch updates require proper permission.

**Source Alignment:** PRD 9.1–9.2; API 9.4; Schema 7.

## US-024 — Deactivate branches safely

**As a Shop Owner or Authorized Manager, I want to deactivate branches instead of deleting them, so that historical records remain intact.**

**Acceptance Criteria**

- Last active branch cannot be deactivated.
- Branch deactivation is blocked when open job orders, open purchase orders, pending/in-transit transfers, active reservations, non-zero on-hand inventory, or unposted stock-affecting records exist.
- Deactivated branch remains visible in historical reports.
- Deactivated branch is not selectable for new job orders, invoices, purchases, or transfers.
- Deactivated branch does not count against plan branch limits.
- Deactivation is audit logged.

**Source Alignment:** PRD 9.3; API 9.4.

## US-025 — Reactivate branches with plan validation

**As a Shop Owner or Authorized Manager, I want to reactivate inactive branches, so that a previously inactive location can resume operations.**

**Acceptance Criteria**

- Reactivation requires `branches.reactivate` permission.
- Branch must belong to same tenant.
- Effective active branch limit is re-checked.
- Reactivation is blocked if active branch limit would be exceeded.
- Required branch fields must be valid before reactivation.
- Original branch ID and historical relationships are preserved.
- Reactivation is audit logged.

**Source Alignment:** PRD 9.5; API 9.4.

---

# Epic 5 — Customer and Motorcycle Management

## US-026 — Create and search customers

**As a Service Advisor, I want to create and search customers, so that customer intake and service history are centralized.**

**Acceptance Criteria**

- Customer requires name and at least one contact method: mobile number or email.
- Customers are tenant-wide and visible to authorized users across branches.
- Customer search supports name, mobile number, email, tags, motorcycle plate number, and motorcycle model.
- Soft-deleted customers are excluded from default search.
- Duplicate detection warns on normalized mobile, lowercased email, and similar name.
- Duplicate warnings do not automatically merge records.

**Source Alignment:** PRD 11.1–11.5; API 9.6; Schema 8.

## US-027 — Merge duplicate customers

**As a Service Advisor or Manager, I want to merge duplicate customers, so that duplicate profiles do not fragment service history.**

**Acceptance Criteria**

- Merge requires `customers.merge` permission.
- User selects one surviving customer.
- Service history, motorcycles, invoices, payments, reminders, and files are preserved.
- Linked records are reassigned to surviving customer.
- Duplicate customer is marked `merged` and stores surviving customer ID.
- Customers from different tenants cannot be merged.
- Merge is audit logged.

**Source Alignment:** PRD 11.6; API 9.6.

## US-028 — Soft delete and restore customers

**As an Authorized User, I want to soft delete and restore customers, so that records can be removed from active workflows without losing history.**

**Acceptance Criteria**

- Customer soft deletion is blocked when customer has open job orders, unpaid invoices, active reminders, or active motorcycles not reassigned or soft deleted.
- Soft-deleted customer is not selectable for new motorcycles, job orders, estimates, invoices, or reminders.
- Restoration requires `customers.restore` permission.
- Restoration re-checks duplicate warning rules.
- Restoration is blocked if exact active duplicate email or mobile number conflict exists.
- Restoring customer does not automatically restore linked records.
- Soft delete and restore are audit logged.

**Source Alignment:** PRD 11.7–11.8; API 9.6.

## US-029 — Create and manage motorcycles

**As a Service Advisor, I want to create motorcycle records linked to customers, so that service history can be tracked by motorcycle.**

**Acceptance Criteria**

- Motorcycle must reference an active customer in same tenant.
- Motorcycle requires brand, model, and mileage.
- Year is optional but must be valid when provided.
- Plate, engine, and chassis numbers are optional.
- Provided identifiers are normalized and checked for duplicates within tenant.
- Exact duplicate active identifier values are blocked.
- Motorcycle is tenant-wide; branch-specific service history follows branch access rules.

**Source Alignment:** PRD 12.1–12.6; API 9.7; Schema 8.

## US-030 — Track and correct odometer readings

**As a Service Advisor or Authorized User, I want to track motorcycle mileage, so that service history and reminders use accurate readings.**

**Acceptance Criteria**

- Completed job order stores motorcycle mileage at service time.
- Motorcycle latest mileage is updated only when completed job order mileage is greater than or equal to current latest mileage.
- Lower mileage correction is blocked unless user has `motorcycles.update` permission and provides correction reason.
- Mileage corrections are audit logged.

**Source Alignment:** PRD 12.7; API 9.7.

## US-031 — Soft delete and restore motorcycles

**As an Authorized User, I want to soft delete and restore motorcycles, so that inactive records do not appear in active workflows while history remains intact.**

**Acceptance Criteria**

- Motorcycle soft deletion is blocked when motorcycle has open job orders, active reminders, or unpaid invoices linked through active job orders.
- Soft-deleted motorcycle is not selectable for new job orders.
- Soft-deleted motorcycle is excluded from default search.
- Restoration requires `motorcycles.restore` permission.
- Restoration requires linked customer to be active.
- Restoration re-checks exact duplicate constraints for identifiers.
- Restore is blocked if linked customer is merged or soft deleted.
- Actions are audit logged.

**Source Alignment:** PRD 12.8–12.9; API 9.7.

---

# Epic 6 — Service Catalog and Estimates

## US-032 — Manage predefined services

**As a Shop Owner or Service Advisor, I want to manage predefined services, so that common service work can be added consistently.**

**Acceptance Criteria**

- Predefined service requires unique active service name within tenant, starting price, variable price flag, and status.
- Price disclaimer is required when variable price is true.
- Catalog service price is copied into job order or estimate line when selected.
- Historical records remain stable even if catalog service changes later.
- Service deactivation is blocked when referenced by open job orders or active draft/presented estimates.
- Deactivated service is not selectable for new job order or estimate lines.

**Source Alignment:** PRD 13.1–13.5; API 9.8; Schema 9.

## US-033 — Add custom service lines to job orders

**As a Service Advisor, I want to add custom service lines to job orders, so that non-catalog service work can be billed.**

**Acceptance Criteria**

- Custom service line belongs only to the job order where it is created.
- Custom service line does not automatically create a reusable catalog service.
- Custom service line is invoiceable as labor or service revenue.
- Job order line editing rules are enforced.

**Source Alignment:** PRD 13.4, 14.11.1; API 9.10.

## US-034 — Create and present estimates

**As a Service Advisor, I want to create and present estimates, so that customers can review service quotations before work proceeds.**

**Acceptance Criteria**

- Estimate is created as `draft` with tenant, branch, customer, estimate number, creator, and timestamp.
- Estimate number follows `EST-YYYYMMDD-000001`, tenant-wide and daily reset.
- Estimate number is immutable and never reused.
- Line items are required before presentation.
- Valid until date is required before presentation and defaults to creation date + 7 days.
- Presented estimates can expire after valid until date when not approved, converted, or cancelled.
- Draft estimates do not automatically expire.

**Source Alignment:** PRD 15.1–15.3; API 9.9.

## US-035 — Approve, cancel, and convert estimates

**As a Service Advisor, I want to manage estimate approval and conversion, so that approved quotations become job order work.**

**Acceptance Criteria**

- Presented estimate can be approved only when customer approval method is recorded.
- Approval records approved customer name, method, timestamp, recording user, and optional attachment.
- Approved estimate can be converted to job order lines.
- Approved estimate may be cancelled only before conversion and with reason.
- Converted, cancelled, and expired estimates are final.
- Estimate transitions follow documented transition matrix.

**Source Alignment:** PRD 15.3, 15.6; API 9.9.

## US-036 — Keep estimates non-financial and non-inventory-impacting

**As a Shop Owner, I want estimates to avoid affecting inventory and financial reports, so that quotations do not distort operations.**

**Acceptance Criteria**

- Estimates do not reserve inventory.
- Estimates do not affect sales revenue.
- Estimates do not affect accounts receivable.
- Estimates do not affect inventory on-hand or reserved stock.
- Estimates do not affect FIFO layers, tax reports, or financial reports.

**Source Alignment:** PRD 15.4–15.5; API 9.9.

---

# Epic 7 — Job Orders and Mechanic Time Tracking

## US-037 — Create job orders

**As a Service Advisor, I want to create job orders, so that service work is tracked from intake through release.**

**Acceptance Criteria**

- Job order requires active branch, active customer, motorcycle belonging to selected customer, service advisor, mileage at intake, customer concern, creator, and timestamp.
- Job order number follows `JO-YYYYMMDD-000001`, tenant-wide and daily reset.
- Job order number is immutable and unique within tenant.
- Initial status is `pending`.
- Branch must be active.
- Job order represents one service engagement for one motorcycle at one branch.

**Source Alignment:** PRD 14.1–14.4; API 9.10; Schema 9.

## US-038 — Enforce job order status transitions

**As a Manager, I want job order status changes to follow documented rules, so that service workflow remains controlled.**

**Acceptance Criteria**

- System supports exactly `pending`, `in_progress`, `waiting_for_parts`, `completed`, `released`, and `cancelled` API statuses.
- Transition from pending to in progress requires primary mechanic assigned.
- Waiting for parts requires authorized status change and reason.
- In progress to completed requires all required service lines complete.
- Completed to in progress correction requires correction permission and reason.
- Released and cancelled job orders are final.
- Blocked transitions return clear validation errors.
- All transitions write status history and audit logs where required.

**Source Alignment:** PRD 14.4–14.7; API 9.10, 10.3.

## US-039 — Add and reserve job order parts

**As a Service Advisor or Inventory Clerk, I want to add parts to job orders and reserve available stock, so that parts are allocated before completion.**

**Acceptance Criteria**

- Product must belong to same tenant.
- Stock branch must match job order branch.
- Requested quantity must be greater than zero.
- Available stock must be sufficient.
- Part line creation creates inventory reservation.
- Reservation reduces available stock but not on-hand stock.
- FIFO reservation allocations are created oldest-first.
- Insufficient stock blocks reservation and displays available quantity.

**Source Alignment:** PRD 14.9, 17.8; API 9.10.

## US-040 — Complete job orders with inventory consumption

**As a Manager or Authorized Service Advisor, I want job order completion to consume reserved parts, so that inventory and COGS are accurate.**

**Acceptance Criteria**

- Completion consumes reserved parts only when moving from in progress or waiting for parts to completed.
- System reduces branch on-hand stock and reserved stock.
- System creates inventory ledger entries using `job_order_consumption`.
- System consumes FIFO layers from oldest allocated stock first.
- System records cost of goods sold from consumed FIFO layers.
- Completion runs atomically with reservation, stock balance, FIFO, ledger, and status updates.

**Source Alignment:** PRD 14.10, 18.4–18.5; Architecture 12, 14; API 9.10.

## US-041 — Release completed job orders

**As a Cashier or Manager, I want to release completed job orders only when release rules are satisfied, so that motorcycles are released under controlled billing conditions.**

**Acceptance Criteria**

- Release is allowed when fully paid, no-charge with reason, or release-with-balance permission and reason.
- Fully paid release requires issued invoice exists, billable lines fully billed, and linked issued invoices have zero remaining collectible balance.
- No-charge release requires total zero and no-charge reason.
- Release with balance requires `job_orders.release_with_balance` permission and release reason.
- Released job orders are immutable except viewing, file viewing, and audit log viewing.

**Source Alignment:** PRD 14.8; API 9.10.

## US-042 — Cancel job orders safely

**As a Manager, I want to cancel job orders under documented rules, so that inventory and billing remain consistent.**

**Acceptance Criteria**

- Cancellation requires `job_orders.cancel` permission and reason.
- Cancellation releases all active inventory reservations linked to job order.
- Cancellation is blocked when released.
- Cancellation is blocked when paid invoice balances remain unresolved.
- Cancellation is blocked while linked invoice is draft, pending, partially paid, paid, or overdue.
- If inventory has been consumed, cancellation requires inventory reversal through authorized adjustment before cancellation.
- Cancellation is audit logged.

**Source Alignment:** PRD 14.7; API 9.10.

## US-043 — Track mechanic work sessions

**As a Mechanic, I want to start, pause, resume, and finish work sessions, so that my active repair time is recorded accurately.**

**Acceptance Criteria**

- Mechanic work session requires tenant, branch, job order, mechanic, start time, and calculated active duration.
- Branch must match job order branch.
- Mechanic must be assigned to job order.
- A mechanic cannot have more than one unfinished session across all job orders in the tenant.
- Pause is allowed only when active.
- Resume is allowed only by same mechanic or authorized manager.
- Pause time does not count toward active duration.
- Finish calculates total active duration.

**Source Alignment:** PRD 16.1–16.5; API 9.11; Schema 9.

## US-044 — Calculate mechanic productivity

**As a Manager, I want mechanic productivity reports based on work sessions, so that performance is measured by actual work activity.**

**Acceptance Criteria**

- Productivity uses number of assigned jobs.
- Productivity uses completed job orders with mechanic sessions.
- Productivity includes total active work duration.
- Productivity includes average active work duration per completed job.
- Productivity includes job order completion count.
- Productivity includes rework/correction count based on status rollbacks.
- Reports attribute work based on actual mechanic sessions, not only assignment.

**Source Alignment:** PRD 14.13, 16.6; Reports PRD 29.4.

---

# Epic 8 — Products, Inventory, FIFO, Adjustments, and Transfers

## US-045 — Manage product catalog and categories

**As an Inventory Clerk, I want to manage products and categories, so that parts and supplies are organized tenant-wide.**

**Acceptance Criteria**

- Products are tenant-wide.
- Stock balances are branch-specific.
- Product requires name, SKU, category, unit of measure, default cost, selling price, reorder level, and status.
- SKU is unique within tenant across active and inactive products.
- Barcode is optional and unique among active products when provided.
- Default categories are created during onboarding.
- Active category names are unique within tenant.

**Source Alignment:** PRD 17.1–17.4; API 9.12; Schema 10, 23.2.

## US-046 — Deactivate and reactivate products/categories safely

**As an Inventory Clerk, I want to deactivate products and categories instead of deleting them, so that historical records remain intact.**

**Acceptance Criteria**

- Product deactivation is blocked when product has non-zero on-hand stock, active reservations, open job orders, open purchase orders, or draft/pending/in-transit transfer references.
- Deactivated product is not selectable for new job order parts, purchases, transfers, or positive adjustments.
- Product reactivation requires SKU and barcode uniqueness.
- Category deactivation is blocked when active products are assigned.
- Deactivated category is not selectable for new or active products.
- Category reactivation requires active-name uniqueness.

**Source Alignment:** PRD 17.3.1, 17.4.1; API 9.12.

## US-047 — View stock balances and low-stock alerts

**As an Inventory Clerk, I want to view stock by branch and receive low-stock alerts, so that inventory can be replenished.**

**Acceptance Criteria**

- System tracks on-hand, reserved, and available stock per product per branch.
- Available stock is calculated as on hand minus reserved.
- Normal transactions cannot make available stock negative.
- Low-stock alert triggers when available is less than or equal to reorder level.
- Low-stock alerts are branch-specific.
- Only one active low-stock alert exists per product per branch at a time.
- Alert resolves automatically when available exceeds reorder level.

**Source Alignment:** PRD 17.5, 17.9; API 9.12; Schema 10.

## US-048 — Preserve immutable inventory ledger

**As a Shop Owner, I want every stock-changing event recorded in an immutable ledger, so that stock movement is auditable.**

**Acceptance Criteria**

- Every stock-changing event creates an inventory ledger entry.
- Direct stock quantity updates without ledger entry are not allowed.
- System supports only documented inventory transaction types.
- Inventory ledger records tenant, branch, product, source transaction, quantity deltas, costs, and timestamp.
- Inventory reports read ledger and source records according to branch access.

**Source Alignment:** PRD 17.6–17.7; Schema 10; Architecture 14.

## US-049 — Maintain FIFO cost layers and consumption

**As a Shop Owner, I want FIFO costing for inventory consumption, so that COGS and valuation are accurate.**

**Acceptance Criteria**

- FIFO layers are created by purchase receiving, positive adjustments, transfer receiving, void inventory reversal, and refund inventory reversal.
- FIFO consumption occurs through job order consumption, transfer out, transfer variance loss, negative adjustments, and supplier returns.
- FIFO consumes oldest available stock first.
- Stock valuation reports calculate value using remaining FIFO quantities and unit costs.
- Reports support filtering by tenant, branch, category, product, and date as of.

**Source Alignment:** PRD 18.1–18.6; Schema 10; Architecture 14.

## US-050 — Create inventory adjustments with approval workflow

**As an Inventory Clerk, I want to request inventory adjustments, so that stock corrections are controlled and auditable.**

**Acceptance Criteria**

- Adjustment requires permission, reason, branch, product, and quantity difference or final counted quantity.
- Adjustments creating positive stock create FIFO layers.
- Adjustments decreasing stock consume FIFO layers.
- Adjustments cannot make on-hand lower than reserved.
- Adjustments at or above configured value threshold require approval before posting.
- Default threshold is absolute stock value impact greater than or equal to ₱5,000.
- Stock, FIFO, and ledger entries do not change until adjustment reaches `posted`.
- Approval, rejection, cancellation, and posting are audit logged.

**Source Alignment:** PRD 17.10–17.11; API 9.13; Schema 10.1.

## US-051 — Perform force adjustments only as exceptional corrections

**As an Authorized Manager, I want force adjustment capability only for exceptional corrections, so that normal workflows are not bypassed.**

**Acceptance Criteria**

- Force adjustment requires `inventory.force_adjust` permission and reason.
- Force adjustment is audit logged.
- Force adjustment creates inventory ledger entries.
- Force adjustment preserves tenant and branch isolation.
- Force adjustment preserves FIFO costing rules where affected.
- Force adjustment cannot make on-hand negative.
- Force adjustment cannot make on-hand lower than reserved unless related reservations are resolved first.

**Source Alignment:** PRD 17.12; API 9.13.

## US-052 — Create and submit inventory transfers

**As an Inventory Clerk, I want to transfer inventory between active branches, so that stock can move across shop locations.**

**Acceptance Criteria**

- Transfers occur only between active branches within same tenant.
- Source and destination branches must be different.
- Transfer number follows `TR-YYYYMMDD-000001`, tenant-wide and daily reset.
- Draft transfer has no stock effect.
- Submitting draft to pending checks source available stock.
- Insufficient stock blocks submission.
- Pending transfer reserves requested stock from source branch.
- Transfer reservation creates ledger entry using `inventory_transfer_reservation`.

**Source Alignment:** PRD 19.1–19.5; API 9.14; Schema 10.2.

## US-053 — Send and receive inventory transfers with FIFO preservation

**As an Inventory Clerk, I want to send and receive transfers, so that stock and FIFO costs move correctly between branches.**

**Acceptance Criteria**

- Sending transfer requires sent quantity greater than zero and not exceeding reserved quantity.
- If sent quantity is lower than reserved quantity, unused reservation is released.
- Receiving transfer requires received quantity between zero and sent quantity.
- Source on-hand and reserved stock decrease by sent quantity.
- Destination on-hand increases by received quantity.
- FIFO reservation allocations are consumed oldest-first.
- Destination FIFO layers preserve unit cost and reference original source FIFO layer.
- Transfer out and transfer in ledger entries are created.

**Source Alignment:** PRD 19.6–19.7; API 9.14.

## US-054 — Record transfer variance and in-transit cancellation

**As a Manager, I want transfer variance and in-transit cancellation controlled, so that losses are tracked without creating financial records.**

**Acceptance Criteria**

- If received quantity is lower than sent quantity, variance reason is required.
- Variance creates `inventory_transfer_variance_loss` ledger entry.
- Missing quantity is not automatically added to destination stock.
- Variance does not create supplier payable, customer receivable, revenue, or expense records.
- In-transit cancellation requires `inventory.transfer.cancel` permission.
- Cancellation disposition must be `returned_to_source` or `lost_or_damaged` according to documented inventory effects.
- Cancellation and disposition are audit logged.

**Source Alignment:** PRD 19.8–19.9; API 9.14.

---

# Epic 9 — Suppliers, Purchases, Supplier Returns, and Accounts Payable

## US-055 — Manage suppliers

**As an Inventory Clerk, I want to manage suppliers, so that purchase history and supplier balances can be tracked.**

**Acceptance Criteria**

- Supplier requires unique active supplier name within tenant.
- Supplier can store contact person, mobile number, email, address, and notes.
- Supplier is tenant-wide.
- Supplier can be deactivated and reactivated.
- Deactivated suppliers remain visible in historical records.
- Supplier reactivation re-checks active-name uniqueness.
- Supplier lifecycle actions are audit logged where required.

**Source Alignment:** PRD 20.1–20.5; API 9.15; Schema 11.

## US-056 — Create and manage purchase orders

**As an Inventory Clerk, I want to create purchase orders, so that supplier purchases are tracked before receiving stock.**

**Acceptance Criteria**

- Purchase order requires active branch, supplier, payment terms, order date, and product lines.
- Purchase order number follows `PO-YYYYMMDD-000001`, tenant-wide and daily reset.
- Purchase status follows documented lifecycle: draft, ordered, partially received, received, closed, cancelled.
- Open purchase orders block branch deactivation as documented.
- Purchase cancellation follows documented rules.
- Purchase records are branch-specific and tenant-scoped.

**Source Alignment:** PRD 21.1–21.4, 21.8; API 9.16; Schema 11.

## US-057 — Receive purchased stock and create FIFO layers

**As an Inventory Clerk, I want to receive stock from purchase orders, so that inventory and supplier balances update correctly.**

**Acceptance Criteria**

- Receiving requires active purchase order and valid received quantities.
- Receiving increases branch on-hand stock.
- Receiving creates FIFO layers with received unit cost.
- Receiving creates inventory ledger entries using `purchase_receive`.
- Credit purchases create supplier payable records.
- Cash purchases do not create accounts payable.
- Purchase receiving is idempotent and transaction-safe.

**Source Alignment:** PRD 21.5–21.6, 21.11; API 9.16; Schema 11.

## US-058 — Track supplier payments and accounts payable

**As a Shop Owner or Inventory Clerk, I want to track supplier payments and balances, so that payables are visible.**

**Acceptance Criteria**

- Supplier payments require supplier, amount greater than zero, payment date, payment method, and creator.
- Supplier payment method uses documented payment method enum values where applicable.
- Supplier balance reflects credit purchases, supplier payments, supplier returns, and supplier credits according to documented AP rules.
- Supplier payment creation is idempotent.
- Supplier payment is audit logged where required.

**Source Alignment:** PRD 21.6–21.7, 23.1.1; API 9.20; Schema 11.

## US-059 — Process supplier returns

**As an Inventory Clerk, I want to process supplier returns, so that returned stock and supplier credits/payables are handled correctly.**

**Acceptance Criteria**

- Supplier return requires branch, supplier, reason, returned products, and quantities.
- Posted supplier return consumes FIFO layers.
- Posted supplier return reduces branch stock.
- Supplier return valuation follows documented rules.
- Supplier return updates supplier payable or creates supplier credit according to payment state.
- Supplier return creates inventory ledger entry using `supplier_return`.
- Supplier return posting is idempotent and audit logged.

**Source Alignment:** PRD 21.9–21.10; API 9.17; Schema 11.

---

# Epic 10 — Invoices, Payments, Receipts, Refunds, AR, and Tax

## US-060 — Create draft invoices from job orders

**As a Cashier, I want to create invoices from job orders, so that completed service work can be billed.**

**Acceptance Criteria**

- Invoice is connected to one or more job orders.
- Invoice can include service, labor, parts, and custom lines according to documented invoice scope.
- Invoice number uses tenant invoice prefix and sequence rules.
- Invoice number is unique within tenant and immutable after creation.
- Draft invoice lines allocate source job order lines to prevent overbilling.
- Draft invoice can be edited only under documented rules.

**Source Alignment:** PRD 22.1–22.8; API 9.18; Schema 12.

## US-061 — Issue invoices with immutable billing data

**As a Cashier, I want to issue invoices, so that customer balances and reports are created from finalized billing records.**

**Acceptance Criteria**

- Issuing invoice finalizes billing allocations.
- Issued invoice records copied tax profile, tax mode, VAT rate, discounts, and calculated totals.
- Issued invoices affect accounts receivable and financial reports.
- Issued invoices cannot be edited directly except through documented cancellation, void, refund, or corrected invoice workflows.
- Invoice issuance is idempotent and audit logged.

**Source Alignment:** PRD 22.7–22.13; API 9.18; Architecture 15.

## US-062 — Prevent invoice overbilling

**As a Shop Owner, I want billing allocations to prevent overbilling job order lines, so that customers are not billed twice for the same work.**

**Acceptance Criteria**

- Invoice lines originating from job order lines create billing allocations.
- Billing allocation statuses follow documented lifecycle.
- Remaining billable amount or quantity subtracts reserved, final, and closed allocations.
- Concurrent invoice drafts cannot over-allocate source job order lines.
- Cancelled or voided invoices release allocations according to documented rules.
- Overbilling attempts return stable API error code.

**Source Alignment:** PRD 22.3.1; Architecture 15.1; API 4.6, 9.18.

## US-063 — Calculate discounts and tax correctly

**As a Cashier, I want invoice discounts and taxes calculated according to settings, so that issued invoices are accurate.**

**Acceptance Criteria**

- Invoice-level discount is allocated across invoice lines before tax calculation.
- Tax profile must be one of `vat_registered`, `non_vat`, or `no_tax`.
- Tax mode must be one of `tax_inclusive`, `tax_exclusive`, or `no_tax`.
- VAT rate is applied according to documented tax profile behavior.
- Issued invoice retains copied tax settings used at issuance.
- Tax changes affect only future invoices.

**Source Alignment:** PRD 22.11–22.13, 24; API 9.18.

## US-064 — Record payments and generate immutable receipts

**As a Cashier, I want to record customer payments and issue receipts, so that collections are documented.**

**Acceptance Criteria**

- Payment is recorded against one invoice.
- Payment amount must be greater than zero.
- Payment cannot exceed remaining collectible balance.
- Partial and split payments are supported.
- Each payment generates exactly one receipt.
- Receipt number uses fixed tenant-level prefix `RCPT-` and is unique within tenant.
- Receipt is immutable and cannot be edited after creation.
- Payment creation and receipt generation are idempotent and audit logged.

**Source Alignment:** PRD 23.1–23.6; API 9.19; Architecture 15.2.

## US-065 — Correct payments through void/refund workflows

**As a Cashier or Manager, I want payment corrections to use controlled workflows, so that financial history is preserved.**

**Acceptance Criteria**

- Original payments and receipts are not deleted or edited for correction.
- Payment correction uses documented refund or void workflows.
- Refund amount cannot exceed refundable amount.
- Refund recalculates invoice balance and status.
- Paid-invoice refund status recalculation follows documented behavior.
- Refund is idempotent and audit logged.

**Source Alignment:** PRD 23.2.1, 23.7; API 9.19; Architecture 15.3.

## US-066 — Reverse inventory during refund or void only when selected

**As a Manager, I want optional inventory reversal for refunds or voids, so that returned parts are reflected only when actually returned to inventory.**

**Acceptance Criteria**

- Refund does not automatically restore inventory.
- Authorized user may select inventory reversal when stock is returned.
- Refund inventory reversal creates FIFO layer when stock returns to inventory.
- Void inventory reversal creates FIFO layer when stock returns to inventory.
- Reversal creates documented inventory ledger transaction type.
- Reversal is audit logged.

**Source Alignment:** PRD 18.2, 23.8; API 9.19.

## US-067 — Track accounts receivable

**As a Shop Owner or Cashier, I want to track accounts receivable, so that unpaid invoice balances are visible.**

**Acceptance Criteria**

- Issued invoices with remaining collectible balance appear in AR.
- Partial payments reduce invoice remaining balance.
- Refunds recalculate invoice balance/status.
- Release-with-balance job orders keep remaining invoice balance in AR.
- AR reports respect branch access.
- AR excludes cancelled or voided invoices according to documented status rules.

**Source Alignment:** PRD 23.9, 29.7, 29.10; API 9.20.

---

# Epic 11 — Expenses, Reminders, Notifications, Files, Reports, and Export

## US-068 — Manage expenses and categories

**As a Shop Owner or Cashier, I want to record operating expenses, so that financial reports reflect shop costs.**

**Acceptance Criteria**

- Expense requires documented fields including branch where applicable, category, amount, payment method, date, and status.
- Expense editing follows documented editing rules.
- Expense void requires permission and reason.
- Voided expenses are excluded from profit reports.
- Expense category deactivation follows documented blocking rules.
- Expense actions are audit logged where required.

**Source Alignment:** PRD 25.1–25.4; API 9.21; Schema 13.

## US-069 — Create customer reminders

**As a Service Advisor, I want to create customer reminders, so that follow-ups, service intervals, mileage intervals, and birthdays are tracked.**

**Acceptance Criteria**

- Reminder supports documented reminder categories.
- Reminder statuses include scheduled, due, sent, failed, and cancelled.
- Time-based reminder due logic follows tenant timezone.
- Mileage-based reminder logic uses motorcycle mileage records.
- Birthday reminder logic follows documented birthday rules.
- Reminder creation and updates respect tenant status and permissions.

**Source Alignment:** PRD 26.1–26.8; API 9.22; Schema 14.

## US-070 — Enforce reminder delivery channels by plan

**As a Shop Owner, I want reminder channels enforced by subscription plan, so that plan benefits are monetized correctly.**

**Acceptance Criteria**

- In-app, push, email, and SMS channels follow effective plan availability.
- Disabled channel actions are blocked with required plan level shown.
- System does not silently downgrade disabled channels to another channel.
- Customer email reminders are disabled on Basic and enabled on Mid/High by default.
- Customer SMS reminders are enabled only on High by default.
- Channel enforcement applies when configuring and sending reminders.

**Source Alignment:** PRD 5.2, 5.4, 26.4–26.5; API 9.22.

## US-071 — Track reminder delivery and retries

**As a Service Advisor, I want reminder delivery attempts tracked, so that failed customer communication is visible.**

**Acceptance Criteria**

- Each delivery attempt records attempt number, provider/channel, timestamp, result status, and failure reason when available.
- Retry behavior follows documented retry rules.
- Permanent failures such as missing contact details, blocked plan channel, invalid address, or invalid phone number are not retried automatically.
- After all retry attempts fail, channel delivery status is marked failed.
- Failed reminder delivery can trigger internal notification according to notification rules.

**Source Alignment:** PRD 26.9–26.10, 27.1; API 9.22.

## US-072 — Send internal notifications

**As a User, I want internal notifications for operational events relevant to my role and branch, so that I can act on important updates.**

**Acceptance Criteria**

- System supports documented notification types including low stock, new job orders, assignments, service completion, payments, subscription alerts, transfer updates, purchase receiving updates, reminder due alerts, failed reminder delivery, employee deactivation, and role/permission changes.
- Recipients are determined by tenant, branch access, permissions, notification type, preferences, and plan channel availability.
- Users can configure notification preferences by type and channel.
- Users cannot enable channels blocked by the tenant plan.
- Delivery status is tracked per recipient and channel.

**Source Alignment:** PRD 27.1–27.4; API 9.23; Schema 14.

## US-073 — Upload and access files securely

**As a User, I want to attach files to supported records, so that service photos, receipts, documents, and approvals are stored securely.**

**Acceptance Criteria**

- Supported attachment scopes include motorcycle photos, service photos, job order attachments, receipt attachments, warranty documents, expense receipts, estimate approval attachments, supplier documents, and purchase documents.
- Supported image types are JPG, JPEG, PNG, and WEBP.
- Supported document types are PDF, DOCX, and XLSX.
- Unsupported file types are blocked.
- Images are limited to 5 MB; documents are limited to 20 MB.
- Files are stored under tenant-scoped private paths.
- File access follows linked entity access rules.
- Downloads use time-limited signed URLs.
- Permanent public tenant file URLs are prohibited.

**Source Alignment:** PRD 28.1–28.4; Architecture 20; API 9.24.

## US-074 — Soft delete, restore, and retain files

**As a Shop Owner or Authorized User, I want file deletion to preserve audit-relevant documents, so that compliance and history are protected.**

**Acceptance Criteria**

- Files are soft deleted for 30 days before permanent deletion.
- Soft-deleted files are excluded from default attachment lists.
- Soft-deleted files remain restorable for 30 days.
- Soft-deleted files remain accessible to platform admins for audit support.
- Files linked to financial records, receipts, invoices, or audit-relevant documents are not permanently deleted before tenant retention policy allows deletion.
- Malware scanning behavior applies when scanning service is configured.

**Source Alignment:** PRD 28.4–28.5; Architecture 20; API 9.24.

## US-075 — View dashboard and reports

**As a Shop Owner or Manager, I want dashboards and reports, so that I can monitor sales, service, inventory, customers, and financial performance.**

**Acceptance Criteria**

- Dashboard supports documented operational summary features.
- Reports include sales, service, inventory, customer, and financial reports.
- Branch filtering respects user branch access.
- Basic, branch comparison, and advanced reports follow plan access rules.
- Financial reports use documented operational calculation rules for revenue, collections, COGS, gross profit, AR, AP, expenses, refunds, voids, and variance.
- Large report exports run asynchronously when required.

**Source Alignment:** PRD 29.1–29.10; Architecture 21; API 9.25.

## US-076 — Export reports

**As a Shop Owner or Authorized User, I want to export reports, so that I can review or share operational data outside the system.**

**Acceptance Criteria**

- Report export supports documented export formats.
- Report export respects permission, plan access, tenant isolation, and branch access.
- Large report exports run through background jobs.
- Export status is visible through safe job status metadata.
- Export failures are recorded and observable.

**Source Alignment:** PRD 28, 29.8; Architecture 19, 21; API 9.25, 9.28.

## US-077 — Generate full tenant export

**As a Shop Owner or Platform Admin, I want to generate a full tenant export, so that tenant data can be downloaded during supported access windows.**

**Acceptance Criteria**

- Tenant export includes CSV data, JSON relationship data, audit log export, attachment manifest, optional attachment binaries, and README.
- Large exports run asynchronously.
- Export download links expire after 7 days.
- Export respects tenant lifecycle rules.
- Export access is disabled in pending deletion unless platform admin grants emergency extension.
- Export generation and download are audit logged.

**Source Alignment:** PRD 31.1–31.2; Architecture 20.4; API 9.26.

## US-078 — Enforce data retention and tenant deletion

**As a Platform Operator, I want tenant deletion to follow retention rules, so that expired tenant data is removed safely and audit retention is preserved.**

**Acceptance Criteria**

- Tenant enters pending deletion Day 61 after expiration.
- Deletion scheduled date is Day 68 unless emergency extension is granted.
- Deletion warnings are sent Day 61, Day 65, and Day 67 when email contact is available.
- Deletion job permanently deletes eligible tenant production database records.
- Deletion job permanently deletes eligible tenant-owned files from active object storage.
- Platform-retained audit records are preserved as documented.
- Tenant is marked `deleted` after deletion completes.
- Resubscription after deletion creates a new tenant record.

**Source Alignment:** PRD 4.8, 30.4, 31.3–31.4; API 9.26, 9.28; Schema 5.

---

# Epic 12 — Audit, Offline PWA, Security, Observability, and Operations

## US-079 — Write immutable audit logs for critical actions

**As a Shop Owner or Platform Admin, I want critical actions audit logged, so that accountability is preserved.**

**Acceptance Criteria**

- Audit logs capture documented required fields.
- Required audit coverage includes documented business, security, platform, support, and corrective actions.
- Audit logs are immutable.
- Platform support access and support actions are audited.
- Audit logs do not contain sensitive secrets.
- Audit retention is at least 3 years where required.

**Source Alignment:** PRD 30.1–30.4; Schema 16; API 9.27.

## US-080 — Support offline shell and read-only cache

**As a Mobile PWA User, I want the app shell and recent records available offline, so that I can view limited information during connectivity loss.**

**Acceptance Criteria**

- PWA is installable and loads application shell without network connection.
- Offline state is clearly indicated.
- Recently viewed customers, motorcycles, job orders, and invoices may be cached.
- Cache is read-only, scoped to logged-in user, cleared on logout, and expires after 7 days.
- Signed file URLs are not cached beyond URL expiration.
- Offline mode blocks creates, edits, approvals, payments, refunds, inventory actions, file uploads, settings changes, and role/permission changes.
- Offline unavailable actions show clear messages.

**Source Alignment:** PRD 32.1–32.4; Architecture 18; API 9.29.

## US-081 — Enforce tenant and branch isolation

**As a Platform Operator, I want tenant and branch isolation enforced everywhere, so that one tenant or branch cannot access another tenant or unauthorized branch records.**

**Acceptance Criteria**

- Every tenant-owned query is scoped by `tenant_id`.
- Every branch-specific query is scoped by `tenant_id` and `branch_id`.
- Requests where authenticated tenant context does not match requested record tenant are blocked.
- Branch-specific data is returned only when user has branch assignment or tenant-wide branch access.
- Authorization is enforced through API middleware, service policies, repository scoping, and database constraints/RLS where implemented.

**Source Alignment:** PRD 33.1–33.2; Architecture 10; API 5.2–5.3.

## US-082 — Protect sensitive data

**As a Security Reviewer, I want sensitive data protected, so that credentials, tokens, and payment details are not exposed.**

**Acceptance Criteria**

- Passwords are hashed with Argon2id or bcrypt cost factor at least 12.
- Plaintext passwords are never stored, logged, emailed, exported, or exposed.
- Reset, invite, verification, and refresh tokens are stored as hashes.
- Access tokens, refresh tokens, reset tokens, and verification tokens are not logged.
- Credit card payment method records store only manual reference information.
- Full card numbers, CVV, and magnetic stripe data are never stored.
- Secrets are stored outside source code.

**Source Alignment:** PRD 6.5, 33.4–33.5; Architecture 22; API 12.2.

## US-083 — Process retry-safe background jobs

**As a DevOps Operator, I want background jobs to be observable and retry-safe, so that long-running and scheduled workflows are reliable.**

**Acceptance Criteria**

- Background jobs support queued, running, succeeded, failed, cancelled, and dead-lettered where implemented.
- Workers acquire jobs with locks.
- Workers update attempt count and last error.
- Workers use correlation IDs.
- Irreversible operations are idempotent.
- Permanent failures are not retried indefinitely.
- Required job types include exports, reminders, lifecycle transitions, deletion warnings, tenant deletion, file retention, low-stock evaluation, provider deliveries, report snapshots, and search refreshes.

**Source Alignment:** PRD 34.7; Architecture 19; API 9.28.

## US-084 — Observe API, jobs, integrations, and inventory failures

**As a DevOps Operator, I want logs, metrics, and alerts, so that production issues are detected and diagnosed.**

**Acceptance Criteria**

- API logs include timestamp, level, environment, service name, correlation ID, tenant ID when applicable, user ID when applicable, request path or job type, error code, and sanitized details.
- Metrics cover API latency/error rate, background job failures/retries, auth failures, authorization denials, inventory transaction failures, notification delivery failures, export duration, and database pool saturation.
- Alerts exist for critical background failures, tenant deletion failure, payment/receipt transaction failure spike, inventory failure spike, provider failure spike, storage threshold, backup failure, high API error rate, and sustained P95/P99 latency breach.
- Sensitive request/response bodies are not logged.

**Source Alignment:** PRD 34.6; Architecture 23; API 13.

## US-085 — Backup and restore production data

**As a Platform Operator, I want backups and restore testing, so that GarageOS meets disaster recovery targets.**

**Acceptance Criteria**

- Database backups are encrypted and run daily.
- Backup retention is at least 30 days.
- Object storage is encrypted.
- Restore testing is performed quarterly by platform operators.
- Disaster recovery targets are RPO 24 hours and RTO 4 hours.
- Backup-retained deleted tenant data is not restored for tenant use except platform-wide disaster recovery.

**Source Alignment:** PRD 33.7–33.8; Architecture 25.

## US-086 — Enforce idempotency and concurrency safety

**As a Senior Engineer, I want critical write operations to be idempotent and concurrency-safe, so that retries do not duplicate financial, inventory, or deletion side effects.**

**Acceptance Criteria**

- Required idempotent operations include invoice issuance, payment creation, refund creation, receipt generation, inventory reservation, inventory consumption, adjustment posting, purchase receiving, supplier return posting, supplier payment creation, transfer stock transitions, and tenant deletion execution.
- Same idempotency key and same request intent returns original result after success.
- Same key with different request intent returns `idempotency_conflict`.
- Concurrent document numbering cannot produce duplicates.
- Concurrent inventory reservation cannot over-allocate FIFO layers.
- Concurrent payments/refunds cannot overpay or over-refund.
- Stale `lock_version` updates return version conflict.

**Source Alignment:** PRD 33.9; Architecture 13; API 7, 15.6; Schema 16.

---

## 8. Backlog Coverage Map

| Source Area                                                | Covered By Stories |
| ---------------------------------------------------------- | ------------------ |
| Multi-tenant SaaS lifecycle and subscriptions              | US-001 to US-007   |
| Authentication and account management                      | US-008 to US-013   |
| RBAC, employee, and branch access                          | US-014 to US-020   |
| Onboarding, settings, branches                             | US-021 to US-025   |
| Customers and motorcycles                                  | US-026 to US-031   |
| Services and estimates                                     | US-032 to US-036   |
| Job orders and mechanic sessions                           | US-037 to US-044   |
| Inventory, FIFO, adjustments, transfers                    | US-045 to US-054   |
| Suppliers, purchases, supplier returns, AP                 | US-055 to US-059   |
| Invoices, payments, receipts, refunds, AR, tax             | US-060 to US-067   |
| Expenses, reminders, notifications, files, reports, export | US-068 to US-078   |
| Audit, offline, security, observability, operations        | US-079 to US-086   |

---

## 9. Remaining Documentation Follow-Ups

These are not blockers for user-story generation, but they should be completed before detailed implementation tasks or UI copy are finalized.

1. Final notification template copy/content for customer reminders and internal notifications.
2. Final OpenAPI YAML generated or manually maintained from `api-contracts.md`.
3. Permission matrix mapped role-template defaults to each permission code.
4. UI workflow diagrams or wireframes for mobile-first screens.
5. QA test case catalog derived from these stories and PRD acceptance criteria.
6. ADRs for remaining implementation choices: frontend framework, backend framework, ORM/query builder, RLS timing, append-only triggers, object storage provider, malware scanning provider, and reporting read model strategy.

---

## 10. Final Panel Recommendation

The generated backlog is aligned with the approved GarageOS source documents and should be used as a requirements-to-implementation bridge. The stories are intentionally conservative: they convert documented behavior into backlog items without adding undocumented modules or future product ideas.

The recommended next artifact is a `permission-matrix.md` or `qa-test-plan.md`, because both can be derived directly from these stories and the existing source documents.
