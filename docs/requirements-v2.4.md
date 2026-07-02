# Product Requirements Document

# Motorcycle Shop Management System SaaS

**Version:** 2.4  
**Status:** Final Build-Ready Product Specification  
**Source Baseline:** PRD v2.3 specialist panel review and ambiguity-resolution revision  
**Target Platform:** Mobile-first Progressive Web App  
**Business Model:** Multi-tenant SaaS subscription  
**Implementation Mode:** Single build scope; no product phases  
**Primary Market:** Motorcycle repair shops, accessories shops, tuning shops, tire shops, and motorcycle service centers  
**Primary Users:** Shop owners, managers, service advisors, mechanics, cashiers, and inventory clerks

---

# 1. Document Control

## 1.1 Purpose of This PRD

This Product Requirements Document defines the complete implementation scope for the Motorcycle Shop Management System SaaS. This version removes ambiguous language from the previous PRD and converts product intent into specific, testable, production-ready requirements.

This PRD is intended to be used by product managers, designers, software engineers, QA engineers, DevOps engineers, security reviewers, support teams, and stakeholders as the primary source of truth for system design and implementation.

## 1.1.1 Revision History

| Version | Date       | Status                                    | Summary                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------- | ---------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.0     | 2026-06-23 | Build-Ready Product Specification         | Baseline ambiguity-resolution PRD.                                                                                                                                                                                                                                                                                                                                                                                         |
| 2.1     | 2026-06-24 | Revised Build-Ready Product Specification | Panel review resolution covering subscription deletion timing, tax enums, invoice/refund rules, supplier returns, transfer variances, FIFO reservation allocation, audit-retention carveout, and offline cache safeguards.                                                                                                                                                                                                 |
| 2.2     | 2026-06-24 | Final Build-Ready Product Specification   | Specialist panel resolution covering branch deactivation stock blocking, supplier return permissions, estimate expiration, paid-invoice refund status recalculation, support-access safeguards, internal email reminder channels, error monitoring, cash purchase payment handling, and currency/country immutability rules.                                                                                               |
| 2.3     | 2026-06-24 | Final Build-Ready Product Specification   | Specialist panel resolution covering branch reactivation, employee invitations, numbering formats for estimates/transfers/purchases, service/category deactivation rules, invoice billing allocation, job-order line edit controls, supplier return valuation, inventory adjustment approval workflow, full export attachment packaging, background job reliability, transaction idempotency, and expanded audit coverage. |
| 2.4     | 2026-06-24 | Final Build-Ready Product Specification   | Specialist panel resolution covering pending-setup access, subscription activation and renewal semantics, role-template behavior, employee and supplier reactivation, customer/motorcycle restoration, payment-method enums, invoice-level discount allocation, financial report calculation basis, expense editing, timezone-change safeguards, and additional acceptance criteria.                                       |

## 1.2 Requirement Language

The following terms are used consistently in this document:

| Term           | Meaning                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------- |
| MUST           | Required behavior. The system is not acceptable without this capability.                     |
| MUST NOT       | Prohibited behavior. The system is not acceptable if this behavior exists.                   |
| ALLOWED        | A permitted behavior that the system supports under defined conditions.                      |
| BLOCKED        | A behavior the system prevents through validation, authorization, or business rules.         |
| SYSTEM         | The Motorcycle Shop Management System SaaS.                                                  |
| TENANT         | A motorcycle shop business account using the system.                                         |
| PLATFORM ADMIN | Internal SaaS operator who manages tenants, plans, support access, and system configuration. |

This PRD intentionally avoids vague requirement terms such as “maybe,” “as needed,” “where applicable,” “later,” “future,” and “depending on workflow.” When a conditional behavior exists, the condition is explicitly defined.

## 1.3 Implementation Scope Rule

Everything marked as a requirement in this PRD MUST be implemented. There are no product phases in this document.

The system MUST implement the following complete product scope:

- Multi-tenant SaaS architecture
- Subscription plan enforcement
- Subscription activation and renewal rules
- Manual subscription status management
- Authentication and account management
- Shop onboarding and settings
- Branch management
- Employee management
- Role and permission management
- Role template behavior
- Customer management
- Motorcycle management
- Service management
- Job order management
- Service estimates
- Service catalog
- Mechanic time tracking
- Inventory management
- FIFO inventory costing
- Inventory reservation
- Inventory transfer
- Inventory adjustment approval workflow
- Supplier management
- Purchase management
- Supplier returns
- Accounts payable
- Sales and invoicing
- Payments and receipts
- Refunds and voids
- Accounts receivable
- Tax handling
- Expenses
- Customer reminders
- Internal notifications
- Dashboard
- Reports
- Financial report calculation rules
- File attachments
- Full tenant export attachment packaging
- Audit logs
- Data export
- Data retention
- Offline shell with read-only cache
- Security controls
- Observability controls
- Background job reliability controls
- Backup and disaster recovery targets

## 1.4 Explicit Exclusions

The following capabilities are intentionally excluded and MUST NOT be implemented as part of this build scope:

| Excluded Capability                       | Requirement                                                                                                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native mobile application                 | The system MUST NOT include iOS or Android native applications. The only client application is the mobile-first PWA.                                                                                      |
| Full offline transaction support          | The system MUST NOT allow offline creation, editing, or submission of operational records. Offline mode is read-only only.                                                                                |
| Full accounting system                    | The system MUST NOT implement a general ledger, chart of accounts, journal entries, bank reconciliation, or formal accounting close process.                                                              |
| Payroll                                   | The system MUST NOT calculate salaries, commissions, payroll deductions, payslips, or government payroll contributions.                                                                                   |
| Direct BIR filing                         | The system MUST NOT directly file tax reports or submit data to BIR systems.                                                                                                                              |
| E-commerce marketplace                    | The system MUST NOT include a public product marketplace, online store, checkout, or delivery workflow.                                                                                                   |
| Customer portal                           | Customers MUST NOT have login accounts or a self-service portal.                                                                                                                                          |
| Loyalty program                           | The system MUST NOT include loyalty points, rewards, membership tiers, or customer reward redemption.                                                                                                     |
| Service packages                          | The system MUST NOT include bundled service packages with package-level pricing or package redemption tracking.                                                                                           |
| Advanced analytics beyond defined reports | The system MUST NOT include predictive analytics, AI recommendations, forecasting models, or custom BI dashboards.                                                                                        |
| Automated subscription payment collection | The system MUST NOT automatically charge tenant subscription payments through a payment gateway. Subscription payment collection is handled outside the system and reflected manually by platform admins. |
| Walk-in retail POS checkout               | The system MUST NOT support a standalone retail POS/cart checkout flow that is independent of job orders or service invoices.                                                                             |
| Two-factor authentication                 | The system MUST NOT implement 2FA in this build scope.                                                                                                                                                    |

These exclusions exist to prevent accidental scope expansion.

---

# 2. Product Overview

## 2.1 Product Summary

The Motorcycle Shop Management System is a cloud-based SaaS platform that digitizes and centralizes the daily operations of motorcycle service businesses.

The system replaces manual and fragmented workflows such as paper customer records, spreadsheet inventory tracking, handwritten job orders, handwritten invoices and receipts, informal repair coordination, manual reminders, and manual financial summaries.

The system provides a single operational platform for managing customers, motorcycles, service work, employees, inventory, purchasing, invoicing, payments, reminders, reports, and tenant subscription access.

## 2.2 Target Businesses

The system MUST support the following business types:

- Motorcycle repair shops
- Motorcycle accessories shops that also provide installation services
- Motorcycle tuning shops
- Motorcycle tire shops
- Motorcycle service centers
- Multi-branch motorcycle service businesses

## 2.3 Primary Business Problems

The system MUST solve the following operational problems:

| Problem                                | System Response                                              |
| -------------------------------------- | ------------------------------------------------------------ |
| Scattered customer records             | Centralized tenant-wide customer database                    |
| No reliable motorcycle service history | Customer-linked motorcycle service timeline                  |
| Manual job order tracking              | Structured job order lifecycle and status history            |
| Poor mechanic visibility               | Mechanic assignment and time tracking                        |
| Inventory inaccuracies                 | Ledger-based stock movement and reservation model            |
| Unclear stock cost                     | FIFO cost layer tracking                                     |
| Manual branch transfers                | Auditable branch-to-branch transfer workflow                 |
| Untracked receivables                  | Invoice balances and accounts receivable reporting           |
| Untracked supplier balances            | Purchase records and accounts payable reporting              |
| Manual reminders                       | Time-based, mileage-based, birthday, and follow-up reminders |
| Weak management visibility             | Dashboard and operational reports                            |
| Poor accountability                    | Immutable audit logs for critical actions                    |

## 2.4 Business Goals

The product MUST support the following business goals:

- Generate recurring SaaS subscription revenue.
- Help motorcycle shops reduce operational inefficiency.
- Improve customer retention through structured reminders and follow-ups.
- Improve management decisions through accurate reports.
- Support multi-branch motorcycle service operations.
- Support plan-based monetization through branch limits, report access, and notification channels.
- Provide a secure and scalable foundation for future ecosystem expansion without implementing excluded future modules in this build.

## 2.5 User Goals

The system MUST help shop users:

- Track customer information.
- Track motorcycle service history.
- Create and manage job orders.
- Assign work to mechanics.
- Track repair progress.
- Reserve parts for job orders.
- Manage inventory per branch.
- Transfer inventory between branches.
- Manage suppliers.
- Manage purchases.
- Track supplier balances.
- Generate service invoices.
- Accept partial and split payments.
- Issue immutable receipts.
- Track accounts receivable.
- Track accounts payable.
- Record operating expenses.
- View sales, inventory, service, customer, and financial reports.
- Send customer reminders based on configured plan channels.

---

# 3. Core Product Definitions

## 3.1 Tenant

A tenant is one motorcycle shop business account inside the SaaS platform.

A tenant MUST contain:

- One subscription record
- One shop profile
- One or more branches, subject to plan limits
- Tenant users
- Tenant roles and permissions
- Tenant-wide customers
- Tenant-wide motorcycles
- Tenant-wide products
- Tenant-wide suppliers
- Tenant-wide files
- Tenant-wide audit logs
- Branch-specific operational records

All tenant-owned business records MUST include `tenant_id`.

## 3.2 Branch

A branch is a physical shop location under a tenant.

A tenant MUST have at least one active branch after onboarding.

Branch-specific operational records MUST include both:

- `tenant_id`
- `branch_id`

## 3.3 User

A user is a login identity that belongs to one tenant or to the SaaS platform operator.

Tenant users MUST NOT belong to multiple tenants.

Platform admin users MUST NOT be treated as tenant employees.

## 3.4 Employee

An employee is a tenant user who performs shop operations.

Each employee MUST have:

- A tenant
- One user account
- At least one role
- At least one assigned branch, unless the employee has tenant-wide access
- An active or inactive status

## 3.5 Customer

A customer is a person or organization that owns or brings motorcycles for service.

Customers are tenant-wide and MUST be visible across branches to authorized tenant users.

## 3.6 Motorcycle

A motorcycle is a service record linked to exactly one active customer record at a time.

The system tracks a motorcycle for service history. The system does not track legal ownership history.

## 3.7 Job Order

A job order is the primary operational record for motorcycle service work.

A job order MUST represent one service engagement for one motorcycle at one branch.

## 3.8 Estimate

An estimate is a non-revenue quotation prepared before invoicing.

An estimate MUST NOT affect sales revenue, accounts receivable, inventory on-hand quantity, or FIFO cost layers.

## 3.9 Invoice

An invoice is a billing document issued to a customer for service work, labor, and parts connected to one or more job orders.

An invoice MUST have a unique tenant-level invoice number.

## 3.10 Payment

A payment is a recorded customer payment against one invoice.

Each payment MUST generate exactly one receipt.

## 3.11 Receipt

A receipt is immutable proof of payment.

A receipt MUST NOT be edited after creation.

## 3.12 Inventory Ledger

The inventory ledger is the immutable source of truth for stock-changing events.

The system MUST NOT rely only on direct stock quantity updates.

## 3.13 FIFO Cost Layer

A FIFO cost layer is a tracked quantity of inventory received at a specific unit cost.

FIFO layers MUST be consumed from oldest available stock first.

---

# 4. SaaS Platform and Tenant Lifecycle

## 4.1 Platform Administration

The system MUST include platform administration capabilities for internal SaaS operators.

Platform admins MUST be able to:

- Create tenants.
- View tenant list.
- View tenant subscription status.
- Assign subscription plans.
- Update tenant subscription status.
- Set subscription expiration date.
- Configure plan limits.
- Trigger tenant read-only mode.
- Trigger tenant suspension.
- Trigger tenant export generation.
- Queue tenant deletion after retention rules are met.
- View platform-level audit logs.
- Access tenant data only through audited support access.
- Create and manage platform admin accounts, except for the first platform admin bootstrap process defined in Section 6.2.1.

Platform admins MUST NOT bypass audit logging when accessing or changing tenant data.

## 4.2 Tenant Creation

A tenant MUST be created through one of the following flows:

| Flow                    | Requirement                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform-created tenant | A platform admin creates the tenant, assigns a plan, and creates or invites the shop owner.                                                                     |
| Owner signup tenant     | A shop owner signs up, verifies email, creates the tenant, completes onboarding, and receives the default subscription plan assigned by platform configuration. |

The system MUST prevent duplicate active tenants with the same normalized shop email and business name combination unless a platform admin explicitly approves the duplicate.

## 4.3 Tenant Statuses

The system MUST support the following tenant statuses:

| Status             | Meaning                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `pending_setup`    | Tenant exists but onboarding is incomplete.                                                |
| `active`           | Tenant has an active subscription and full access.                                         |
| `grace_period`     | Subscription has expired, but full operational access is temporarily allowed.              |
| `read_only`        | Users can view and export data but cannot create or modify operational records.            |
| `suspended`        | Users cannot access operational screens; owner can access renewal and export screens only. |
| `pending_deletion` | Tenant is scheduled for permanent deletion.                                                |
| `deleted`          | Tenant has been permanently deleted from active production data stores.                    |

## 4.4 Subscription Expiration Lifecycle

The system MUST enforce this exact lifecycle based on the tenant subscription expiration date.

| Timeline                          | Tenant Status      | Access Rule                                                                                         |
| --------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------- |
| Before expiration date            | `active`           | Full access based on permissions                                                                    |
| Day 1 to Day 14 after expiration  | `grace_period`     | Full access based on permissions, with renewal warnings                                             |
| Day 15 to Day 30 after expiration | `read_only`        | View, export, and renew only; operational writes blocked                                            |
| Day 31 to Day 60 after expiration | `suspended`        | Shop Owner can renew or export only; non-owner users blocked                                        |
| Day 61 to Day 67 after expiration | `pending_deletion` | Tenant queued for deletion; export access disabled unless platform admin grants emergency extension |
| Day 68 after expiration or later  | `deleted`          | Active production data removed after deletion job completes according to deletion policy            |

The system MUST calculate lifecycle dates using the tenant timezone configured in shop settings.

The expiration day itself is the final active subscription day. Day 1 starts at 00:00:00 on the calendar day after expiration in the tenant timezone.

If a tenant renews before permanent deletion completes, the system MUST update the subscription expiration date and restore the tenant to `active` status immediately after platform admin confirmation.

## 4.5 Grace Period Rules

During `grace_period`:

- Users MUST continue using the system normally based on their permissions.
- Owners MUST see a renewal warning after login and on the dashboard.
- The system MUST NOT delete or hide tenant data.
- The system MUST NOT block job orders, invoices, payments, inventory updates, purchases, expenses, reminders, or reports.

## 4.6 Read-Only Mode Rules

During `read_only` status, the system MUST allow:

- Login by active users.
- Viewing existing records based on permissions.
- Searching existing records based on permissions.
- Report viewing.
- Data export generation by Shop Owner.
- Subscription renewal action by Shop Owner.
- Password change by active users.
- Logout.

During `read_only` status, the system MUST block:

- Creating job orders.
- Updating job orders.
- Creating estimates.
- Creating invoices.
- Recording payments.
- Recording refunds.
- Voiding invoices.
- Creating customers.
- Updating customers.
- Creating motorcycles.
- Updating motorcycles.
- Updating inventory.
- Creating inventory transfers.
- Receiving purchases.
- Recording expenses.
- Creating suppliers.
- Sending reminders.
- Uploading files.
- Updating shop settings, except billing-related settings.
- Creating or updating employees, roles, and permissions.

When a blocked action is attempted, the system MUST return a clear subscription access error and display an upgrade or renewal prompt.

## 4.7 Suspension Rules

During `suspended` status:

- Shop Owner MUST be allowed to login.
- Shop Owner MUST be allowed to renew subscription.
- Shop Owner MUST be allowed to export tenant data until the export window closes.
- Non-owner tenant users MUST be blocked from application access.
- Operational writes MUST be blocked for all tenant users.
- Platform admins MUST retain audited support access.

## 4.8 Permanent Deletion Rules

When a tenant enters `pending_deletion`, the system MUST set a deletion scheduled date of Day 68 after subscription expiration unless a platform admin grants an emergency extension.

The system MUST send deletion warnings at these exact points, if the tenant has available email contact information:

| Warning                 | Timing                                                    |
| ----------------------- | --------------------------------------------------------- |
| First deletion warning  | Day 61 after expiration, when `pending_deletion` begins   |
| Second deletion warning | Day 65 after expiration, 3 days before scheduled deletion |
| Final deletion warning  | Day 67 after expiration, 1 day before scheduled deletion  |

When the deletion job runs:

- The system MUST permanently delete active production database records owned by the tenant, except platform-retained audit records defined in Section 30.4.
- The system MUST permanently delete tenant-owned files from active object storage, except files legally or operationally retained under Section 28.5 and Section 30.4.
- The system MUST mark the tenant as `deleted` after deletion completes.
- Resubscription after deletion MUST create a new tenant record.
- Deleted tenant data MUST NOT be restored to the tenant after deletion.

Encrypted infrastructure backups MAY retain deleted data until backup retention expires. Backup-retained deleted tenant data MUST NOT be restored for tenant use except during platform-wide disaster recovery.

## 4.9 Subscription Status Ownership and Overrides

Subscription access status is system-computed from the tenant subscription expiration date unless a platform admin applies an explicit administrative override.

Platform admins MAY manually update:

- Subscription plan
- Subscription expiration date
- Subscription status override
- Emergency deletion extension
- Tenant read-only mode
- Tenant suspension

Every subscription override MUST include:

- Platform admin actor
- Override type
- Previous value
- New value
- Effective timestamp
- Reason
- Optional expiration timestamp for temporary overrides

When no active override exists, the system MUST recalculate tenant status from the subscription expiration lifecycle. Manual subscription payment collection remains outside the product.

## 4.10 Platform Support Access Safeguards

Platform support access MUST be used only for support, investigation, compliance, or operational recovery purposes.

Every platform support access session MUST require:

- Platform admin user
- Tenant being accessed
- Access reason
- Access start timestamp
- Access end timestamp or expiration timestamp
- Access mode: `read_only` or `write_allowed`
- Audit log entry

Default platform support access MUST be `read_only`.

`write_allowed` support access MUST be explicitly selected, must require a reason, and MUST be limited to users with `platform.support_access` and the required platform operation permission.

Platform support access MUST NOT allow platform admins to impersonate tenant users silently. If impersonation-style troubleshooting is implemented, the UI MUST clearly mark the session as platform support access and MUST audit every action as `platform_admin` actor type.

## 4.11 Pending Setup Access Rules

During `pending_setup` status:

- The Shop Owner MUST be allowed to login after email verification.
- The Shop Owner MUST access only onboarding, profile setup, subscription information, password management, and logout.
- Operational modules MUST remain blocked until onboarding completion.
- Non-owner tenant users MUST NOT access operational screens before onboarding completion.
- Platform admins MAY view setup status through platform administration.
- Onboarding completion MUST be audit logged.

A tenant MUST move from `pending_setup` to `active` only when onboarding is complete and the tenant has an effective subscription plan and subscription expiration date.

## 4.12 Subscription Activation and Renewal Rules

Every active tenant subscription MUST have:

- Subscription plan.
- Subscription start date.
- Subscription expiration date.
- Subscription status source: `system_computed` or `platform_override`.
- Last renewal timestamp when renewed.
- Platform admin actor when manually updated by a platform admin.

For platform-created tenants, the platform admin MUST set subscription plan and expiration date before the tenant can become `active`.

For owner signup tenants, the system MUST assign:

- The platform-configured default plan.
- A subscription start date equal to the tenant creation date in tenant timezone.
- A subscription expiration date calculated from the platform-configured default subscription duration.

Owner signup MUST be blocked if either the default plan or default subscription duration is not configured.

Renewal action by a Shop Owner MUST NOT process payment inside the system. The renewal action MUST show renewal instructions or submit a renewal request. The tenant returns to `active` only after a platform admin confirms the external payment and updates the subscription expiration date or status override.

Subscription lifecycle status changes MUST be audit logged when caused by platform admin action and MUST be system-logged when caused by scheduled lifecycle evaluation.

---

# 5. Subscription Plans

## 5.1 Plan Types

The system MUST support exactly three standard subscription tiers:

- Basic
- Mid
- High

The system MUST store subscription plans in a configurable plan table controlled by platform admins.

Owner signup tenants MUST receive the platform-configured default plan. The default plan MUST be one of `Basic`, `Mid`, or `High`. If no default plan has been configured, owner signup MUST be blocked until platform configuration is completed.

Trial plans are not included in this build scope unless represented as one of the three standard plans with a manually configured expiration date.

## 5.2 Default Plan Limits

The system MUST use the following default plan configuration:

| Capability                   |    Basic |      Mid |    High |
| ---------------------------- | -------: | -------: | ------: |
| Maximum active branches      |        1 |        3 |      10 |
| In-app notifications         |  Enabled |  Enabled | Enabled |
| Push notifications           |  Enabled |  Enabled | Enabled |
| Email notifications          | Disabled |  Enabled | Enabled |
| SMS notifications            | Disabled | Disabled | Enabled |
| Customer email reminders     | Disabled |  Enabled | Enabled |
| Customer SMS reminders       | Disabled | Disabled | Enabled |
| Branch comparison reports    | Disabled |  Enabled | Enabled |
| Advanced operational reports | Disabled | Disabled | Enabled |

Platform admins MAY configure different plan limits for individual tenants through an explicit tenant plan override. Every override MUST be audit logged.

## 5.3 Branch Limit Enforcement

When creating a branch, the system MUST:

1. Count active branches for the tenant.
2. Read the tenant's effective maximum active branch limit.
3. Allow branch creation only if active branch count is less than the effective maximum.
4. Block branch creation if the limit has been reached.
5. Display a clear upgrade prompt when blocked.
6. Write an audit log entry for blocked branch creation attempts.

Inactive branches MUST NOT count against the active branch limit.

A tenant MUST NOT deactivate its last active branch.

## 5.4 Notification Channel Enforcement

The system MUST enforce notification channels based on the tenant's effective plan.

When a user attempts to enable or send a notification through a disabled channel, the system MUST block the action and show the required plan level.

The system MUST NOT silently downgrade a disabled channel. For example, if SMS is not available, the system MUST show that SMS is unavailable rather than sending email instead.

## 5.5 Subscription Billing Model

The system MUST track subscription status, plan, expiration date, grace/read-only/suspension lifecycle, and renewal state.

The system MUST NOT automatically collect tenant subscription payments. Subscription payments are handled outside the product. Platform admins manually update subscription status after payment confirmation.

---

# 6. Authentication and Account Management

## 6.1 Authentication Features

The system MUST support:

- Login
- Logout
- Email verification
- Forgot password
- Password reset
- Change password
- Session management
- Remember-me sessions
- Forced logout when a user is deactivated
- User profile management

## 6.2 User Account Creation

The system MUST support these account creation rules:

| Account Type   | Creation Rule                                                |
| -------------- | ------------------------------------------------------------ |
| Platform admin | Created by an existing platform admin.                       |
| Shop owner     | Created during tenant creation or owner signup.              |
| Employee       | Created or invited by a Shop Owner or an authorized manager. |

The system MUST NOT allow public self-registration directly into an existing tenant as an employee.

## 6.2.1 First Platform Admin Bootstrap

The first platform admin MUST be created through a secure deployment-time bootstrap process.

The bootstrap process MUST:

- Be disabled after the first platform admin is created.
- Require infrastructure-level operator access.
- Require a strong temporary credential or invite token.
- Force password change and email verification before operational access.
- Write a platform audit log entry.

Public signup MUST NOT create platform admin accounts.

## 6.2.2 Employee Invitation Rules

Employee invitations MUST be single-use.

Employee invitation links MUST expire after 7 days.

When an employee is invited:

- The invited email address MUST be normalized and checked for active global uniqueness.
- The invitation MUST be scoped to exactly one tenant.
- The invitation MUST include assigned role and branch configuration or require the creator to complete role and branch assignment before the employee can access operational screens.
- The invited user MUST verify email before operational access.
- The invitation acceptance action MUST create or activate the user only for the invited tenant.
- Expired, revoked, or already-used invitation links MUST be blocked.
- Invitation creation, acceptance, revocation, and expiration MUST be audit logged.

Direct employee creation without invitation is ALLOWED only when the authorized creator creates the account and triggers a password setup or password reset link. Temporary plaintext passwords MUST NOT be displayed, emailed, exported, or logged.

## 6.3 Email Verification

A user MUST verify their email before accessing operational screens.

Before email verification, the user MUST only access:

- Email verification screen
- Resend verification email action
- Logout

## 6.4 Password Policy

Passwords MUST meet the following minimum requirements:

- At least 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number

The system MUST reject passwords that fail this policy.

## 6.5 Password Storage

The system MUST store passwords using a strong one-way password hashing algorithm.

Acceptable hashing algorithms:

- Argon2id
- bcrypt with cost factor of at least 12

Plaintext passwords MUST NOT be stored, logged, emailed, exported, or exposed through APIs.

## 6.6 Session Policy

The system MUST support:

- Access token expiration within 15 minutes.
- Refresh token rotation.
- Remember-me sessions up to 30 days.
- Immediate session invalidation when a user is deactivated.
- Immediate session invalidation when a user's password is reset by an administrator.
- Logout from current device.
- Logout from all devices.

## 6.7 Login Protection

The system MUST rate-limit failed login attempts using this rule:

```text
5 failed login attempts within 15 minutes per account and per IP address
```

After the limit is exceeded:

- The system MUST temporarily block login attempts for 15 minutes.
- The system MUST continue allowing forgot-password requests subject to password reset rate limits.
- The system MUST write an audit log entry.

## 6.8 Password Reset Rate Limit

The system MUST rate-limit password reset requests using this rule:

```text
3 password reset requests per account per hour
```

Password reset links MUST expire after 30 minutes.

Password reset tokens MUST be single-use.

## 6.9 Deactivated Users

When a user is deactivated:

- The user MUST be unable to login.
- Existing sessions MUST be revoked.
- The user MUST remain visible in historical records.
- The system MUST NOT delete historical references to the user.

## 6.10 User Email Change Rules

Changing a user email address MUST:

- Require the authenticated user's own confirmation or an authorized admin action.
- Require the new normalized email to be globally unique among active user accounts.
- Require email verification for the new email before operational access continues.
- Revoke active sessions after the email change is confirmed.
- Preserve historical references to the original user ID.
- Write an audit log entry.

A user email change MUST NOT create a new employee identity or break historical ownership, assignment, payment, invoice, audit, or service records.

---

# 7. Roles, Permissions, and Access Control

## 7.1 Role Types

The system MUST support these tenant role templates:

- Shop Owner
- Manager
- Service Advisor
- Mechanic
- Cashier
- Inventory Clerk

The system MUST also support custom tenant roles.

## 7.2 Shop Owner

The Shop Owner is the highest-level tenant user.

The Shop Owner MUST have all tenant permissions and tenant-wide branch access.

The Shop Owner MUST be able to:

- Manage shop settings.
- Manage subscription information.
- Manage branches within plan limits.
- Manage employees.
- Assign roles and permissions.
- View all reports.
- View all branches.
- View audit logs.
- Configure invoice prefix during onboarding.
- Export tenant data.
- Renew subscription.

A tenant MUST have at least one active Shop Owner.

The system MUST NOT allow deactivation or demotion of the last active Shop Owner.

## 7.3 Manager

The Manager role MUST support daily operational oversight.

A Manager MUST be able to perform these actions when assigned the corresponding permissions:

- Manage job orders.
- Assign employees to job orders.
- View branch-level reports.
- Review mechanic productivity.
- Monitor branch inventory.
- Approve inventory adjustments.
- Approve job order status corrections.
- Approve refunds.
- Approve branch transfer cancellation.

## 7.4 Service Advisor

The Service Advisor role MUST support service intake and customer coordination.

A Service Advisor MUST be able to perform these actions when assigned the corresponding permissions:

- Create customers.
- Create motorcycle records.
- Create job orders.
- Create service estimates.
- Add service notes.
- Add parts to job orders.
- Add labor charges to job orders.
- Attach service photos and documents.
- Update job order status within allowed transitions.

## 7.5 Mechanic

The Mechanic role MUST support assigned repair work.

A Mechanic MUST be able to perform these actions when assigned the corresponding permissions:

- View assigned jobs.
- Start work sessions.
- Pause work sessions.
- Resume work sessions.
- Finish work sessions.
- Add repair notes.
- View parts assigned to job orders.
- Mark assigned labor tasks as completed.
- Upload service photos.

Mechanics MUST NOT access invoices, payments, supplier balances, financial reports, or subscription settings unless explicitly granted through custom permissions.

## 7.6 Cashier

The Cashier role MUST support billing and payment collection.

A Cashier MUST be able to perform these actions when assigned the corresponding permissions:

- Generate invoices from job orders.
- Record payments.
- Issue receipts.
- Process partial payments.
- Process split payments.
- Process refunds when permission is granted.
- View invoice history.
- View payment history.
- View accounts receivable.

## 7.7 Inventory Clerk

The Inventory Clerk role MUST support inventory and purchasing operations.

An Inventory Clerk MUST be able to perform these actions when assigned the corresponding permissions:

- Create products.
- Edit products.
- Receive stock from purchases.
- Request inventory adjustments.
- Perform inventory adjustments when approved or directly permitted.
- View stock movements.
- Create inventory transfer requests.
- Send inventory transfers.
- Receive inventory transfers.
- View low stock alerts.
- Manage supplier inventory records when permitted.

## 7.8 Custom Roles

The system MUST support custom roles.

Custom roles MUST:

- Belong to exactly one tenant.
- Have a unique role name within the tenant.
- Contain one or more action-level permissions.
- Be assignable to one or more users.
- Be editable by users with `roles.update` permission.
- Be deactivatable only when no active user depends solely on that role.

## 7.9 Multi-Role Users

A user MAY have multiple roles.

Permission resolution MUST be additive.

If a user has multiple roles, the user's effective permissions MUST be the union of all permissions from active assigned roles.

The system MUST NOT support explicit deny permissions in this build scope.

## 7.10 Multi-Branch Users

A user MAY be assigned to multiple branches.

A user with tenant-wide branch access MUST be able to access branch-specific records across all active branches, subject to action permissions.

A user without tenant-wide branch access MUST only access branch-specific records for assigned branches.

## 7.11 Tenant-Wide Entity Visibility

Customers, motorcycles, products, suppliers, roles, permissions, shop settings, subscription, and audit logs are tenant-wide entities.

For tenant-wide operational entities:

| Entity      | Visibility Rule                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------- |
| Customers   | Active tenant users with `customers.read` can view all non-deleted customers in the tenant.     |
| Motorcycles | Active tenant users with `motorcycles.read` can view all non-deleted motorcycles in the tenant. |
| Products    | Active tenant users with `products.read` can view all active products in the tenant.            |
| Suppliers   | Active tenant users with `suppliers.read` can view all active suppliers in the tenant.          |

Branch-specific financial and operational histories linked to these tenant-wide entities MUST still follow branch access rules.

Example: A branch-scoped user can view the customer profile but MUST NOT view invoices from branches they are not assigned to unless they have tenant-wide invoice access.

## 7.12 Required Permission Set

The system MUST support at least the following action-level permissions:

```text
platform.tenants.read
platform.tenants.create
platform.tenants.update
platform.subscriptions.update
platform.plans.update
platform.support_access
platform.audit_logs.read

shop.read
shop.update
shop.billing.update
shop.export_data

branches.create
branches.read
branches.update
branches.deactivate
branches.reactivate

users.create
users.read
users.update
users.deactivate
users.reset_password
users.assign_roles
users.assign_branches

roles.create
roles.read
roles.update
roles.deactivate
permissions.read

customers.create
customers.read
customers.update
customers.merge
customers.soft_delete
customers.restore

motorcycles.create
motorcycles.read
motorcycles.update
motorcycles.soft_delete
motorcycles.restore

job_orders.create
job_orders.read
job_orders.update
job_orders.cancel
job_orders.change_status
job_orders.correct_status
job_orders.release
job_orders.release_with_balance
job_orders.attach_files

estimates.create
estimates.read
estimates.update
estimates.present
estimates.approve
estimates.convert
estimates.cancel

services.create
services.read
services.update
services.deactivate

mechanic_sessions.create
mechanic_sessions.read
mechanic_sessions.pause
mechanic_sessions.resume
mechanic_sessions.finish

products.create
products.read
products.update
products.deactivate
product_categories.manage

inventory.read
inventory.adjust
inventory.adjust.approve
inventory.reserve
inventory.release_reservation
inventory.transfer.create
inventory.transfer.send
inventory.transfer.receive
inventory.transfer.cancel
inventory.force_adjust

suppliers.create
suppliers.read
suppliers.update
suppliers.deactivate

purchases.create
purchases.read
purchases.update
purchases.cancel
purchases.receive
supplier_returns.create
supplier_returns.read
supplier_credits.create
supplier_credits.read
supplier_payments.create
supplier_payments.read

invoices.create
invoices.read
invoices.update_draft
invoices.issue
invoices.cancel
invoices.void
invoices.refund

payments.create
payments.read
payments.refund
receipts.read

expenses.create
expenses.read
expenses.update
expenses.void
expense_categories.manage

reminders.create
reminders.read
reminders.update
reminders.cancel
reminders.send

notifications.read
notifications.update_preferences
notifications.send

reports.view_basic
reports.view_branch
reports.view_advanced
reports.export

files.upload
files.read
files.soft_delete
files.restore

audit_logs.read
settings.update
```

## 7.13 Role Template Rules

The system MUST seed the following default tenant role templates during tenant setup:

- Shop Owner
- Manager
- Service Advisor
- Mechanic
- Cashier
- Inventory Clerk

Default role templates MUST belong to the tenant after creation.

The Shop Owner role MUST NOT be deleted, deactivated, or modified in a way that removes required owner capabilities.

Other seeded role templates MAY be edited by authorized users, but the system MUST preserve historical role assignment records and audit role permission changes.

When a role is edited:

- Existing users assigned to that role MUST receive the updated effective permission set immediately after the change.
- The system MUST show impact warnings before saving permission changes.
- The system MUST audit old and new permission values when safe to store.

When a role is deactivated:

- Users who depend solely on that role MUST be assigned another active role before deactivation can complete.
- Historical records MUST continue to display the role name snapshot or historical role reference.
- The deactivated role MUST NOT be assignable to users.

---

# 8. Shop Onboarding and Settings

## 8.1 Onboarding Requirement

A tenant MUST complete shop onboarding before accessing operational modules.

Onboarding is complete only when the following records exist:

- Shop profile
- At least one active branch
- Invoice prefix
- Tax profile
- Country
- Business timezone
- Default currency
- At least one active Shop Owner

## 8.2 Required Shop Setup Fields

During onboarding, the Shop Owner MUST provide:

| Field            | Requirement                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| Shop name        | Required. 2 to 150 characters.                                                                                   |
| Business address | Required. 5 to 500 characters.                                                                                   |
| Contact number   | Required. Must be valid for configured country format.                                                           |
| Email address    | Required. Must be valid email format.                                                                            |
| Business hours   | Required for each day of the week.                                                                               |
| Tax profile      | Required. One of `vat_registered`, `non_vat`, or `no_tax`.                                                       |
| Tax mode         | Required. One of `tax_inclusive`, `tax_exclusive`, or `no_tax`.                                                  |
| Country          | Required. Default is `PH` for Philippines tenants. Used for contact-number validation and localization defaults. |
| Invoice prefix   | Required. Must pass invoice prefix rules.                                                                        |
| Timezone         | Required. Default for Philippines tenants is `Asia/Manila`.                                                      |
| Currency         | Required. Default is `PHP`.                                                                                      |

## 8.3 Shop Settings

After onboarding, authorized users MUST be able to manage:

- Shop name
- Logo
- Address
- Contact details
- Business hours
- Tax profile
- Tax mode
- VAT rate
- Receipt footer text
- Reminder sender name
- Notification preferences
- File upload settings within system limits

Country and currency MUST follow the immutability rules in Section 36.2.

Tax profile, tax mode, and VAT rate changes MUST affect only invoices created after the change. Issued invoices MUST retain the copied tax profile, tax mode, and VAT rate used at issuance.

## 8.4 Invoice Prefix Rules

During onboarding, the Shop Owner MUST set one invoice prefix.

The invoice prefix MUST:

- Be 2 to 10 characters before the trailing dash.
- Use uppercase letters and numbers only before the trailing dash.
- End with a dash.
- Match this pattern: `^[A-Z0-9]{2,10}-$`
- Be configured before the first invoice is created.
- Be immutable after onboarding completion.
- Be used in every invoice number generated for the tenant.

Valid examples:

```text
MG-
RIDE-
MOTO-
ADV160-
```

Invalid examples:

```text
mg-
MOTO
MOTO_-
MOTORCYCLESHOP-
```

The invoice prefix is unique within the tenant by definition because a tenant can have only one active invoice prefix.

## 8.5 Receipt Prefix Rules

The system MUST use the fixed tenant-level receipt prefix:

```text
RCPT-
```

Receipt numbers MUST be unique within the tenant.

---

# 9. Branch Management

## 9.1 Branch Features

The system MUST support:

- Create branch
- Edit branch
- Deactivate branch
- Reactivate branch
- Assign employees to branch
- View branch reports
- View branch inventory
- View branch job orders
- View branch invoices
- View branch expenses

## 9.2 Branch Required Fields

Each branch MUST have:

| Field          | Requirement                                                      |
| -------------- | ---------------------------------------------------------------- |
| Branch name    | Required. Unique within tenant among active branches.            |
| Address        | Required.                                                        |
| Contact number | Required.                                                        |
| Business hours | Required. Defaults to shop business hours but can be customized. |
| Status         | Required. One of `active` or `inactive`.                         |

## 9.3 Branch Deactivation

Branches MUST be deactivated instead of hard deleted.

The system MUST block branch deactivation when:

- The branch is the tenant's last active branch.
- The branch has open job orders.
- The branch has open purchase orders.
- The branch has draft, pending, or in-transit inventory transfers where the branch is the source or destination.
- The branch has active inventory reservations.
- The branch has non-zero on-hand inventory.
- The branch has unposted or unreconciled stock-affecting records.

For branch deactivation validation:

- Open job orders are job orders with status `Pending`, `In Progress`, `Waiting For Parts`, or `Completed`.
- Open purchase orders are purchase orders with status `Draft`, `Ordered`, or `Partially Received`.
- Unposted or unreconciled stock-affecting records are inventory operations that have been created but have not completed their required ledger posting transaction.

A deactivated branch:

- MUST remain visible in historical reports.
- MUST NOT be selectable for new job orders.
- MUST NOT be selectable for new invoices.
- MUST NOT be selectable for new purchases.
- MUST NOT be selectable for new inventory transfers.
- MUST NOT count against plan branch limits.

When a branch is deactivated:

- Existing employee branch assignments to that branch MUST remain historically visible.
- Employees assigned only to the deactivated branch MUST be flagged for reassignment.
- Employees without tenant-wide access MUST NOT perform branch-specific operational actions until they have at least one active branch assignment.

## 9.4 Branch Access

Branch access MUST be enforced on every branch-specific record.

A user can access a branch-specific record only if:

1. The user belongs to the same tenant.
2. The user has the required action-level permission.
3. The user is assigned to the record's branch or has tenant-wide branch access.

## 9.5 Branch Reactivation Rules

Branch reactivation MUST:

- Require `branches.reactivate` permission.
- Require the branch to belong to the same tenant.
- Re-check the tenant's effective active branch limit.
- Block reactivation if the active branch limit would be exceeded.
- Require branch required fields to be valid before reactivation.
- Preserve the original branch ID and historical relationships.
- Write an audit log entry.

A reactivated branch MUST become selectable for new operational records only after reactivation succeeds.

---

# 10. Employee Management

## 10.1 Employee Features

The system MUST support:

- Create employee account
- Edit employee profile
- Deactivate employee
- Reactivate employee
- Reset employee password
- View employee activity logs
- Assign employee to one or more branches
- Assign employee to one or more roles
- Remove roles from employee
- Remove branch assignments from employee

## 10.2 Employee Required Fields

Each employee MUST have:

| Field              | Requirement                                                           |
| ------------------ | --------------------------------------------------------------------- |
| Full name          | Required.                                                             |
| Email              | Required. Unique globally among active user accounts.                 |
| Mobile number      | Optional.                                                             |
| Roles              | At least one active role required.                                    |
| Branch assignments | At least one active branch unless user has tenant-wide branch access. |
| Status             | One of `active` or `inactive`.                                        |

An inactive user's email MAY be reused for a new active account only when the original inactive account is not eligible for reactivation. If an inactive account is reactivated, the system MUST block reactivation when another active account already uses the same normalized email.

## 10.3 Employee Deactivation

When an employee is deactivated:

- Login MUST be blocked.
- Active sessions MUST be revoked.
- The employee MUST remain visible in historical records.
- Existing job order assignments MUST remain historically visible.
- Open job orders assigned to the employee MUST be flagged for reassignment.
- The system MUST write an audit log entry.

## 10.4 Password Reset by Admin

When an authorized user resets an employee password:

- The system MUST generate a secure password reset link.
- The system MUST send the link to the employee email.
- The link MUST expire after 30 minutes.
- The link MUST be single-use.
- Existing sessions MUST be revoked after successful password reset.
- The action MUST be audit logged.

## 10.5 Employee Reactivation Rules

Employee reactivation MUST:

- Require `users.update` permission.
- Require the employee to belong to the same tenant.
- Require at least one active role.
- Require at least one active branch assignment unless the employee has tenant-wide branch access.
- Re-check global active email uniqueness before reactivation.
- Block reactivation if another active user already uses the same normalized email.
- Block reactivation if reactivation would violate the last active Shop Owner rule or role requirements.
- Revoke any stale sessions and require normal login.
- Write an audit log entry.

A reactivated employee MUST regain access only according to current role permissions, current branch assignments, current tenant subscription status, and email verification state.

---

# 11. Customer Management

## 11.1 Customer Features

The system MUST support:

- Create customer
- Edit customer
- Search customer
- Add customer notes
- Add customer tags
- View customer history
- Merge duplicate customers
- Soft delete customer
- Restore soft-deleted customer

## 11.2 Customer Required Fields

A customer MUST have:

| Field          | Requirement                                         |
| -------------- | --------------------------------------------------- |
| Name           | Required. 2 to 150 characters.                      |
| Contact method | At least one of mobile number or email is required. |
| Mobile number  | Optional if email exists.                           |
| Email          | Optional if mobile number exists.                   |
| Address        | Optional.                                           |
| Birthday       | Optional. Date only.                                |
| Notes          | Optional.                                           |
| Tags           | Optional.                                           |
| Status         | One of `active`, `merged`, `soft_deleted`.          |

## 11.3 Customer Scope

Customers are tenant-wide.

A customer created in one branch MUST be visible to authorized users in other branches within the same tenant.

Customer-related branch-specific histories, such as invoices and job orders, MUST still follow branch access rules.

## 11.4 Customer Search

Customer search MUST support:

- Name
- Mobile number
- Email
- Tags
- Motorcycle plate number
- Motorcycle model

Search results MUST be scoped by tenant.

Soft-deleted customers MUST be excluded from default search results.

## 11.5 Duplicate Detection

During customer creation and update, the system MUST check for possible duplicates using:

- Normalized mobile number
- Lowercased email
- Similar name within the tenant

Duplicate detection MUST warn the user but MUST NOT automatically merge records.

## 11.6 Customer Merge

The system MUST support customer merging.

Customer merge MUST:

- Require `customers.merge` permission.
- Require selecting one surviving customer.
- Preserve service history.
- Preserve motorcycle records.
- Preserve invoices.
- Preserve payments.
- Preserve reminders.
- Preserve files linked to the duplicate customer.
- Reassign linked records to the surviving customer.
- Mark the duplicate customer as `merged`.
- Store the surviving customer ID on the merged record.
- Write an audit log entry.

The system MUST NOT allow merging customers from different tenants.

## 11.7 Customer Soft Deletion

Customers MUST be soft deleted only.

The system MUST block soft deletion when the customer has:

- Open job orders
- Unpaid invoices
- Active reminders
- Active motorcycles that have not been reassigned or soft deleted

A soft-deleted customer:

- MUST NOT appear in default customer searches.
- MUST NOT be selectable for new motorcycles, job orders, estimates, invoices, or reminders.
- MUST remain visible in historical records.
- MUST be restorable by users with `customers.restore` permission.

## 11.8 Customer Restore Rules

Customer restoration MUST:

- Require `customers.restore` permission.
- Require the customer to belong to the same tenant.
- Restore the customer to `active` status.
- Re-check duplicate warning rules using normalized mobile number, lowercased email, and similar name.
- Block restoration if restoring the customer would create an exact active duplicate email or mobile number conflict under tenant validation rules.
- Write an audit log entry.

Restoring a customer MUST NOT automatically restore soft-deleted motorcycles, reminders, files, or other linked records. Those records MUST be restored through their own restore workflows when supported.

---

# 12. Motorcycle Management

## 12.1 Motorcycle Features

The system MUST support:

- Add motorcycle
- Edit motorcycle
- View service history
- Track odometer readings
- Attach documents
- Attach photos
- Soft delete motorcycle
- Restore soft-deleted motorcycle

## 12.2 Motorcycle Required Fields

A motorcycle MUST have:

| Field          | Requirement                                                                   |
| -------------- | ----------------------------------------------------------------------------- |
| Customer       | Required. Must reference an active customer in the same tenant.               |
| Brand          | Required.                                                                     |
| Model          | Required.                                                                     |
| Year           | Optional. If provided, must be valid year from 1900 through current year + 1. |
| Color          | Optional.                                                                     |
| Plate number   | Optional.                                                                     |
| Engine number  | Optional.                                                                     |
| Chassis number | Optional.                                                                     |
| Mileage        | Required. Non-negative integer.                                               |
| Status         | One of `active` or `soft_deleted`.                                            |

## 12.3 Optional Identification Fields

The following motorcycle fields MUST NOT be required:

- Plate number
- Engine number
- Chassis number

If plate number, engine number, or chassis number is provided, the value MUST be normalized and checked for duplicates within the tenant.

The system MUST warn on possible duplicates but MUST NOT block saving unless the duplicate value is exactly the same as an active motorcycle record in the same tenant.

## 12.4 Motorcycle Scope

Motorcycles are tenant-wide.

A motorcycle record MUST be visible to authorized users across branches within the same tenant.

Branch-specific service history linked to a motorcycle MUST follow branch access rules.

## 12.5 Ownership History

The system MUST NOT track motorcycle ownership history.

A motorcycle record exists for service recording purposes only.

Changing the linked customer is ALLOWED only through authorized edit action and MUST be audit logged.

## 12.6 Customer-to-Motorcycle Relationship

One customer MAY have multiple motorcycles.

A motorcycle MUST be linked to exactly one active customer at a time.

The system MUST block job order creation for motorcycles linked to merged or soft-deleted customers.

## 12.7 Odometer Tracking

Every completed job order MUST store the motorcycle mileage at service time.

When a job order is completed, the system MUST update the motorcycle's latest mileage if the job order mileage is greater than or equal to the current motorcycle mileage.

The system MUST block mileage updates lower than the latest recorded mileage unless the user has `motorcycles.update` permission and provides a correction reason.

All mileage corrections MUST be audit logged.

## 12.8 Motorcycle Soft Deletion Rules

Motorcycles MUST be soft deleted only.

The system MUST block motorcycle soft deletion when the motorcycle has:

- Open job orders
- Active reminders
- Unpaid invoices linked through active job orders

A soft-deleted motorcycle:

- MUST NOT be selectable for new job orders.
- MUST NOT appear in default motorcycle searches.
- MUST remain visible in historical records.
- MUST be restorable by users with `motorcycles.restore` permission.

## 12.9 Motorcycle Restore Rules

Motorcycle restoration MUST:

- Require `motorcycles.restore` permission.
- Require the motorcycle to belong to the same tenant.
- Require the linked customer to be active.
- Re-check exact duplicate constraints for plate number, engine number, and chassis number when those values exist.
- Restore the motorcycle to `active` status.
- Write an audit log entry.

The system MUST block motorcycle restoration when the linked customer is merged or soft deleted. The user MUST first restore or change the linked customer through an authorized workflow.

---

# 13. Service Catalog

## 13.1 Service Catalog Features

The system MUST support:

- Create predefined service
- Edit predefined service
- Deactivate predefined service
- Set starting price
- Add price disclaimer
- Create custom service line during job order creation

## 13.2 Service Required Fields

A predefined service MUST have:

| Field            | Requirement                                                |
| ---------------- | ---------------------------------------------------------- |
| Service name     | Required. Unique within tenant among active services.      |
| Starting price   | Required. Must be zero or greater.                         |
| Variable price   | Required boolean. Indicates whether actual price may vary. |
| Description      | Optional.                                                  |
| Price disclaimer | Required when variable price is true.                      |
| Status           | One of `active` or `inactive`.                             |

## 13.3 Service Pricing Rule

The service catalog price MUST be treated as a starting price only when `variable_price` is true. When `variable_price` is false, the catalog price is still copied into the job order line and may be manually overridden only by users with job order line editing permission before invoice issuance.

Actual job order labor charges MAY differ from the starting price.

When a predefined service is added to a job order, the system MUST copy the current service name, starting price, and disclaimer into the job order line so historical records remain stable even if the catalog service changes later.

## 13.4 Custom Services

Users with job order creation permission MUST be able to add custom service lines to a job order.

Custom service lines MUST:

- Belong only to the job order where they are created.
- Not create a reusable service catalog item automatically.
- Be invoiceable as labor or service revenue.

## 13.5 Service Deactivation Rules

Predefined services MUST be deactivated instead of hard deleted.

The system MUST block predefined service deactivation when the service is referenced by:

- Open job orders with status `Pending`, `In Progress`, `Waiting For Parts`, or `Completed`.
- Draft or presented estimates that have not been converted, cancelled, or expired.

A deactivated predefined service:

- MUST remain visible in historical job order, invoice, estimate, and report records.
- MUST NOT be selectable for new job order service lines or new estimate lines.
- MAY be reactivated only when its service name remains unique within the tenant among active services.

---

# 14. Job Order Management

## 14.1 Job Order Features

The system MUST support:

- Create job order
- Edit job order before release
- Cancel job order under defined rules
- Assign primary mechanic
- Assign additional mechanics
- Add service notes
- Add labor charges
- Add parts used
- Attach service photos
- Attach service documents
- Reserve inventory parts automatically
- Generate estimate
- Link estimate to job order
- Convert approved estimate into job order lines
- Generate invoice from job order
- Track job order status history
- Track job order mileage
- Track job order release

## 14.2 Job Order Required Fields

A job order MUST have:

| Field             | Requirement                                                    |
| ----------------- | -------------------------------------------------------------- |
| Tenant            | Required.                                                      |
| Branch            | Required. Must be active.                                      |
| Customer          | Required. Must be active.                                      |
| Motorcycle        | Required. Must belong to selected customer.                    |
| Job order number  | Required. Generated automatically and unique within tenant.    |
| Status            | Required. One of defined job order statuses.                   |
| Service advisor   | Required. Defaults to creator if creator has permission.       |
| Primary mechanic  | Optional at creation, required before moving to `In Progress`. |
| Mileage at intake | Required. Non-negative integer.                                |
| Customer concern  | Required.                                                      |
| Internal notes    | Optional.                                                      |
| Created by        | Required.                                                      |
| Created timestamp | Required.                                                      |

## 14.3 Job Order Numbering

The system MUST generate job order numbers automatically using this format:

```text
JO-YYYYMMDD-000001
```

The sequence number MUST be tenant-wide and reset daily.

Job order numbers MUST be unique within the tenant.

Job order numbers MUST be immutable after creation.

## 14.4 Job Order Statuses

The system MUST support exactly these job order statuses:

```text
Pending
In Progress
Waiting For Parts
Completed
Released
Cancelled
```

## 14.5 Job Order Status Transition Matrix

The system MUST enforce the following status transitions:

| From Status       | To Status         | Allowed | Required Permission         | Required Conditions                                                                                                            |
| ----------------- | ----------------- | ------: | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| None              | Pending           |     Yes | `job_orders.create`         | Job order creation succeeds.                                                                                                   |
| Pending           | In Progress       |     Yes | `job_orders.change_status`  | Primary mechanic assigned.                                                                                                     |
| Pending           | Waiting For Parts |     Yes | `job_orders.change_status`  | Reason required.                                                                                                               |
| Pending           | Cancelled         |     Yes | `job_orders.cancel`         | No issued invoice with payment exists.                                                                                         |
| In Progress       | Waiting For Parts |     Yes | `job_orders.change_status`  | Reason required.                                                                                                               |
| In Progress       | Completed         |     Yes | `job_orders.change_status`  | All required service lines marked complete.                                                                                    |
| In Progress       | Cancelled         |     Yes | `job_orders.cancel`         | No issued invoice with payment exists; reserved parts must be released or consumed parts reversed through approved adjustment. |
| Waiting For Parts | In Progress       |     Yes | `job_orders.change_status`  | Required parts are available or manual reason is provided.                                                                     |
| Waiting For Parts | Cancelled         |     Yes | `job_orders.cancel`         | No issued invoice with payment exists.                                                                                         |
| Completed         | Released          |     Yes | `job_orders.release`        | Release rule is satisfied.                                                                                                     |
| Completed         | In Progress       |     Yes | `job_orders.correct_status` | Correction reason required; audit log required.                                                                                |
| Completed         | Cancelled         |     Yes | `job_orders.cancel`         | No payment exists; all consumed inventory must be reversed by authorized adjustment; reason required.                          |
| Released          | Any other status  |      No | Not applicable              | Released job orders are final.                                                                                                 |
| Cancelled         | Any other status  |      No | Not applicable              | Cancelled job orders are final.                                                                                                |

Any blocked transition MUST return a clear validation error.

## 14.6 Waiting for Parts Rule

The system MUST NOT automatically change a job order to `Waiting For Parts` solely because an inventory item is low stock.

The system MUST set `Waiting For Parts` only when an authorized user changes the status and provides a reason.

When a user attempts to add parts that exceed available stock, the system MUST block the part reservation and display available quantity. The user may then change the job order status to `Waiting For Parts`.

## 14.7 Job Order Cancellation Rules

Cancelling a job order MUST:

- Require `job_orders.cancel` permission.
- Require a cancellation reason.
- Release all active inventory reservations linked to the job order.
- Block cancellation when a released status already exists.
- Block cancellation when paid invoice balances remain unresolved.
- Block cancellation while any linked invoice is in `Draft`, `Pending`, `Partially Paid`, `Paid`, or `Overdue` status.
- Require linked invoices to be cancelled, voided, or otherwise finalized according to invoice rules before cancellation can proceed.
- Write an audit log entry.

If inventory has already been consumed, cancellation MUST require inventory reversal through an authorized inventory adjustment before the job order can be cancelled.

## 14.8 Release Rule

A completed job order can be released only when one of the following conditions is true:

| Release Condition    | Requirement                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fully paid           | At least one issued invoice exists for the job order, all billable job order lines are fully billed, and all linked issued invoices have zero remaining collectible balance. |
| No-charge service    | The job order total is zero and the job order is marked as no-charge with reason.                                                                                            |
| Release with balance | User has `job_orders.release_with_balance` permission and provides release reason. Remaining invoice balance stays in accounts receivable.                                   |

Released job orders MUST be immutable except for viewing, file viewing, and audit log viewing.

## 14.9 Job Order Parts

When parts are added to a job order:

- The product MUST belong to the same tenant.
- The stock branch MUST be the job order branch.
- The requested quantity MUST be greater than zero.
- Available stock MUST be sufficient.
- The system MUST create an inventory reservation.
- Reserved stock MUST reduce available stock.
- Reserved stock MUST NOT reduce on-hand stock.

## 14.10 Inventory Consumption Timing for Job Orders

Reserved job order parts MUST reduce on-hand stock only when the job order moves from `In Progress` or `Waiting For Parts` to `Completed`.

At completion:

1. The system MUST consume reserved parts.
2. The system MUST reduce branch on-hand stock.
3. The system MUST reduce branch reserved stock.
4. The system MUST create inventory ledger entries with transaction type `Job Order Consumption`.
5. The system MUST consume FIFO layers from oldest available layer first.
6. The system MUST calculate cost of goods sold from consumed FIFO layers.

If a job order is invoiced before completion, parts remain reserved until completion.

If a job order is cancelled before completion, reserved parts MUST be released and on-hand stock MUST remain unchanged.

## 14.11 Labor Charges

The system MUST support labor charges separately from parts.

Labor charges MUST:

- Be invoiceable.
- Not affect inventory.
- Be included in service revenue reports.
- Support custom descriptions.
- Support zero amount only when explicitly marked as free labor with reason.

## 14.11.1 Job Order Line Editing Rules

Job order line editing MUST follow the job order lifecycle.

Before job order completion:

- Service lines MAY be added, edited, or removed by authorized users while the job order is not `Released` or `Cancelled`.
- Part lines MAY be added, edited, or removed by authorized users only if corresponding inventory reservations can be created, updated, or released safely.
- Removing or reducing a part line MUST release the related active inventory reservation.

After job order completion:

- Consumed part lines MUST NOT be directly edited.
- Labor and service lines MUST NOT be directly edited if they are already allocated to an invoice.
- Corrections that affect consumed inventory MUST use an authorized inventory reversal, refund inventory reversal, void inventory reversal, or approved adjustment workflow.
- Corrections that affect billing MUST use invoice cancellation, voiding, refund, or a new corrected invoice.

Released and cancelled job orders MUST remain final according to the transition matrix.

## 14.12 Job Order Without Invoice

A job order MAY exist without an invoice until billing is required.

A job order MUST NOT be released unless the release rule is satisfied.

## 14.13 Multiple Mechanics Per Job Order

The system MUST support one primary mechanic and zero or more additional mechanics per job order.

Mechanic productivity reports MUST attribute work based on actual mechanic work sessions, not only assignment.

---

# 15. Service Estimates

## 15.1 Estimate Features

The system MUST support:

- Create estimate
- Edit draft estimate
- Present estimate
- Approve estimate
- Cancel estimate
- Convert approved estimate to job order lines
- Convert approved estimate to invoice lines through a linked job order
- Track estimate status history

## 15.1.1 Estimate Required Fields

An estimate MUST include:

| Field             | Requirement                                                                |
| ----------------- | -------------------------------------------------------------------------- |
| Tenant            | Required.                                                                  |
| Branch            | Required.                                                                  |
| Customer          | Required. Must be active.                                                  |
| Motorcycle        | Required when estimate is for a specific motorcycle service.               |
| Estimate number   | Required. Generated automatically and unique within tenant.                |
| Status            | Required. One of defined estimate statuses.                                |
| Line items        | Required before presentation.                                              |
| Valid until date  | Required before presentation. Defaults to estimate creation date + 7 days. |
| Created by        | Required.                                                                  |
| Created timestamp | Required.                                                                  |

Estimate numbers MUST be immutable after creation.

## 15.1.2 Estimate Numbering

The system MUST generate estimate numbers automatically using this format:

```text
EST-YYYYMMDD-000001
```

The sequence number MUST be tenant-wide and reset daily.

Estimate numbers MUST be unique within the tenant.

Estimate numbers MUST be immutable after creation.

Cancelled, expired, or converted estimate numbers MUST NOT be reused.

## 15.2 Estimate Statuses

The system MUST support exactly these estimate statuses:

```text
Draft
Presented
Approved
Converted
Cancelled
Expired
```

## 15.3 Estimate Transition Matrix

| From Status | To Status        | Allowed | Required Conditions                                                                      |
| ----------- | ---------------- | ------: | ---------------------------------------------------------------------------------------- |
| None        | Draft            |     Yes | Estimate creation succeeds.                                                              |
| Draft       | Presented        |     Yes | Estimate has at least one line item.                                                     |
| Draft       | Cancelled        |     Yes | Cancellation reason required.                                                            |
| Presented   | Approved         |     Yes | Customer approval method recorded.                                                       |
| Presented   | Cancelled        |     Yes | Cancellation reason required.                                                            |
| Presented   | Expired          |     Yes | Valid until date has passed and estimate has not been approved, converted, or cancelled. |
| Approved    | Converted        |     Yes | Conversion to job order succeeds.                                                        |
| Approved    | Cancelled        |     Yes | No conversion has occurred; reason required.                                             |
| Converted   | Any other status |      No | Converted estimate is final.                                                             |
| Cancelled   | Any other status |      No | Cancelled estimate is final.                                                             |
| Expired     | Any other status |      No | Expired estimate is final.                                                               |

Presented estimates MUST be evaluated for expiration at least once per day using tenant timezone.

Draft estimates MUST NOT automatically expire.

Approved estimates MUST NOT automatically expire. If an approved estimate should no longer be honored, an authorized user MUST cancel it before conversion and provide a reason.

## 15.4 Estimate Inventory Rule

Estimates MUST NOT reserve inventory.

Inventory reservation MUST occur only after an estimate is converted into a job order and parts are added to the job order.

## 15.5 Estimate Revenue Rule

Estimates MUST NOT affect:

- Sales revenue
- Accounts receivable
- Inventory on-hand stock
- Inventory reserved stock
- FIFO layers
- Tax reports
- Financial reports

## 15.6 Estimate Approval

Approving an estimate MUST record:

- Approved by customer name
- Approval method: `verbal`, `sms`, `email`, `signed_document`, or `other`
- Approval timestamp
- User who recorded the approval
- Optional attachment

---

# 16. Mechanic Time Tracking

## 16.1 Mechanic Work Session Features

The system MUST support:

- Start work
- Pause work
- Resume work
- Finish work
- Add mechanic notes
- View session history
- Calculate active duration

## 16.2 Work Session Required Fields

A mechanic work session MUST include:

| Field                 | Requirement                                  |
| --------------------- | -------------------------------------------- |
| Tenant                | Required.                                    |
| Branch                | Required. Must match job order branch.       |
| Job order             | Required.                                    |
| Mechanic              | Required. Must be assigned to the job order. |
| Start time            | Required when session starts.                |
| Pause intervals       | Required when pauses occur.                  |
| Finish time           | Required when session finishes.              |
| Total active duration | System-calculated.                           |
| Notes                 | Optional.                                    |

## 16.3 Active Session Rule

A mechanic MUST NOT have more than one unfinished work session at the same time across all job orders in the tenant.

An unfinished work session is any work session that has started and has no finish time, whether currently active or paused.

If a mechanic has an unfinished session and tries to start another, the system MUST block the action and show the existing job order and session state.

## 16.4 Pause and Resume Rules

A work session can be paused only when it is active.

A paused work session can be resumed only by the same mechanic or by an authorized manager.

Pause time MUST NOT count toward active duration.

## 16.5 Finish Work Rule

A mechanic can finish a work session only when the session is active or paused.

Finishing a work session MUST calculate total active duration.

Finishing all required mechanic tasks does not automatically complete the job order. Job order completion requires an authorized job order status change.

## 16.6 Productivity Reporting

Mechanic productivity MUST be calculated using:

- Number of assigned jobs
- Number of completed job orders with mechanic sessions
- Total active work duration
- Average active work duration per completed job
- Job order completion count
- Rework/correction count based on status rollbacks

---

# 17. Product and Inventory Management

## 17.1 Inventory Scope

Products are tenant-wide.

Stock balances are branch-specific.

The same product catalog MUST be shared across tenant branches, while each branch MUST maintain independent stock quantities, reservations, FIFO layers, and inventory ledger entries.

## 17.2 Product Features

The system MUST support:

- Create product
- Edit product
- Deactivate product
- Create product categories
- Edit product categories
- Search products
- View stock per branch
- View inventory movement history
- View FIFO layer details
- View low stock alerts

## 17.3 Product Required Fields

A product MUST have:

| Field           | Requirement                                                         |
| --------------- | ------------------------------------------------------------------- |
| Product name    | Required.                                                           |
| SKU             | Required. Unique within tenant across active and inactive products. |
| Barcode         | Optional. If provided, unique within tenant among active products.  |
| Supplier code   | Optional.                                                           |
| Brand           | Optional.                                                           |
| Category        | Required.                                                           |
| Unit of measure | Required.                                                           |
| Default cost    | Required. Zero or greater.                                          |
| Selling price   | Required. Zero or greater.                                          |
| Reorder level   | Required. Zero or greater.                                          |
| Description     | Optional.                                                           |
| Status          | One of `active` or `inactive`.                                      |

## 17.3.1 Product Deactivation Rules

Products MUST be deactivated instead of hard deleted.

The system MUST block product deactivation when:

- The product has non-zero on-hand stock in any branch.
- The product has active reservations in any branch.
- The product is used in open job orders, open purchase orders, or draft/pending/in-transit inventory transfers.

A deactivated product:

- MUST remain visible in historical records and inventory ledger entries.
- MUST NOT be selectable for new job order parts, purchases, inventory transfers, or positive stock adjustments.
- MUST remain available for historical reports.

The system MUST support reactivation only when the SKU and barcode remain unique within the tenant.

## 17.4 Default Product Categories

The system MUST create the following default product categories for each tenant during onboarding:

- Engine Oil
- Tires
- Accessories
- Brake Parts
- CVT Parts
- Lubricants

Tenants MUST be able to create custom product categories.

Category names MUST be unique within the tenant among active categories.

## 17.4.1 Product Category Deactivation Rules

Product categories MUST be deactivated instead of hard deleted.

The system MUST block product category deactivation when active products are assigned to the category.

A deactivated category:

- MUST remain visible in historical product and inventory reports.
- MUST NOT be selectable for new or active products.
- MAY be reactivated only when its category name remains unique within the tenant among active categories.

## 17.5 Inventory Quantity Definitions

The system MUST track these quantities per product per branch:

| Quantity  | Definition                                                                  |
| --------- | --------------------------------------------------------------------------- |
| On Hand   | Physical stock currently owned by the branch according to inventory ledger. |
| Reserved  | Stock allocated to open job orders or pending inventory transfers.          |
| Available | Stock available for new reservations or transfers.                          |

The system MUST calculate available stock using this formula:

```text
Available = On Hand - Reserved
```

The system MUST NOT allow normal transactions that make available stock negative.

## 17.6 Inventory Ledger Requirement

Every stock-changing event MUST create an immutable inventory ledger entry.

The system MUST NOT allow direct updates to stock balances without a corresponding ledger entry.

## 17.7 Inventory Transaction Types

The system MUST support exactly these inventory transaction types:

```text
Purchase Receive
Job Order Reservation
Reservation Release
Job Order Consumption
Inventory Adjustment Increase
Inventory Adjustment Decrease
Inventory Transfer Reservation
Inventory Transfer Reservation Release
Inventory Transfer Out
Inventory Transfer In
Inventory Transfer Variance Loss
Supplier Return
Refund Inventory Reversal
Void Inventory Reversal
```

## 17.8 Inventory Reservation Rules

Inventory reservation MUST occur for:

- Job order parts
- Submitted inventory transfers

Inventory reservation MUST:

- Increase reserved stock.
- Decrease available stock.
- Leave on-hand stock unchanged.
- Create an inventory ledger entry.
- Reference the source record that caused the reservation.
- Allocate reserved quantities against FIFO layers oldest-first without reducing FIFO remaining quantity until consumption occurs.

FIFO reservation allocation MUST record:

- Reservation record ID
- FIFO layer ID
- Reserved quantity
- Unit cost snapshot
- Allocation timestamp

FIFO reservation allocation MUST use this calculation per FIFO layer:

```text
Allocatable Layer Quantity = FIFO Remaining Quantity - Active Reserved Allocation Quantity
```

The system MUST NOT allocate more than the allocatable layer quantity.

When a reservation is released, the system MUST release the linked FIFO reservation allocations.

When a reservation is consumed, the system MUST convert the linked FIFO reservation allocations into FIFO consumption records in the same database transaction that updates on-hand and reserved stock.

## 17.9 Low Stock Alerts

The system MUST trigger low stock alerts when:

```text
Available <= Reorder Level
```

Low stock alerts MUST be branch-specific.

The system MUST generate only one active low stock alert per product per branch at a time.

The alert MUST resolve automatically when available stock becomes greater than reorder level.

## 17.10 Inventory Adjustment Rules

Inventory adjustments MUST:

- Require `inventory.adjust` permission.
- Require adjustment reason.
- Require branch.
- Require product.
- Require quantity difference or final counted quantity.
- Create inventory ledger entries.
- Create FIFO layers for positive adjustments.
- Consume FIFO layers for negative adjustments.
- Be audit logged.

The system MUST block adjustments that make on-hand stock lower than reserved stock.

Adjustments that exceed a tenant-configured approval threshold MUST require `inventory.adjust.approve` permission before affecting stock.

Default approval threshold:

```text
Any adjustment with absolute stock value impact greater than or equal to ₱5,000 requires approval.
```

Adjustment value impact MUST be calculated as:

| Adjustment Type        | Value Impact Rule                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Positive adjustment    | Adjustment quantity × user-entered unit cost. If no unit cost is provided, use product default cost.             |
| Negative adjustment    | FIFO-consumed cost estimated from oldest available FIFO layers at the time approval is requested.                |
| Final counted quantity | Difference between current on-hand and final counted quantity, valued using the positive or negative rule above. |

Approval threshold evaluation MUST occur before the stock-changing ledger entry is posted.

## 17.11 Inventory Adjustment Approval Workflow

Inventory adjustments MUST have one of these statuses:

```text
Draft
Pending Approval
Approved
Posted
Rejected
Cancelled
```

Inventory adjustment workflow MUST follow these rules:

| From Status      | To Status        | Requirement                                                                               |
| ---------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| None             | Draft            | Adjustment request is created.                                                            |
| Draft            | Posted           | Allowed only when approval threshold is not reached and user has `inventory.adjust`.      |
| Draft            | Pending Approval | Required when approval threshold is reached and creator does not have approval authority. |
| Pending Approval | Approved         | Requires `inventory.adjust.approve`.                                                      |
| Pending Approval | Rejected         | Requires rejection reason.                                                                |
| Pending Approval | Cancelled        | Allowed by creator or authorized manager before posting.                                  |
| Approved         | Posted           | Posts ledger entries and stock balance changes in one database transaction.               |
| Posted           | Any other status | Not allowed. Posted adjustments are final and can only be corrected by a new adjustment.  |
| Rejected         | Any other status | Not allowed.                                                                              |
| Cancelled        | Any other status | Not allowed.                                                                              |

Stock quantities, FIFO layers, and inventory ledger entries MUST NOT change until the adjustment reaches `Posted`.

Approval, rejection, cancellation, and posting MUST be audit logged.

## 17.12 Inventory Force Adjustment Rule

`inventory.force_adjust` is an exceptional corrective permission.

Force adjustments MUST:

- Require `inventory.force_adjust` permission.
- Require reason.
- Require audit log entry.
- Create inventory ledger entries.
- Preserve tenant and branch isolation rules.
- Preserve FIFO costing rules where FIFO layers are affected.
- Be visible in inventory adjustment reports.

Force adjustments MUST NOT be used to bypass normal sales, refund, purchase, supplier return, or transfer workflows when those workflows are available.

Force adjustments MUST NOT make on-hand stock negative.

Force adjustments MUST NOT make on-hand stock lower than reserved stock unless the operation first releases or resolves the related reservation through an auditable workflow.

---

# 18. FIFO Inventory Costing

## 18.1 Costing Method

The system MUST use FIFO inventory costing for all stock consumption.

FIFO means the oldest available stock layer is consumed first.

## 18.2 FIFO Layer Creation

FIFO layers MUST be created by:

- Purchase receiving
- Positive inventory adjustments
- Inventory transfer receiving
- Void inventory reversal when stock is returned to inventory
- Refund inventory reversal when stock is returned to inventory

Standalone customer return inventory workflows are not included in this build scope. Returned service parts MUST use the refund or void inventory reversal workflows.

## 18.3 FIFO Layer Fields

Each FIFO layer MUST include:

| Field                    | Requirement                     |
| ------------------------ | ------------------------------- |
| Tenant                   | Required.                       |
| Branch                   | Required.                       |
| Product                  | Required.                       |
| Quantity received        | Required. Greater than zero.    |
| Remaining quantity       | Required. Zero or greater.      |
| Unit cost                | Required. Zero or greater.      |
| Source transaction type  | Required.                       |
| Source transaction ID    | Required.                       |
| Received date            | Required.                       |
| Original source layer ID | Required for transferred stock. |

## 18.4 FIFO Consumption Events

FIFO layers MUST be consumed by:

- Job order part consumption
- Inventory transfer out
- Inventory transfer variance loss
- Negative inventory adjustment
- Supplier return

## 18.5 Cost of Goods Sold

When inventory is consumed for a job order, the system MUST calculate cost of goods sold using FIFO layer consumption.

Cost of goods sold MUST be recorded on the inventory ledger and made available to financial reports.

## 18.6 Stock Valuation

Inventory valuation reports MUST calculate stock value using remaining FIFO layer quantities and unit costs.

The report MUST support filtering by:

- Tenant
- Branch
- Product category
- Product
- Date as of

---

# 19. Inventory Transfer

## 19.1 Transfer Purpose

The Inventory Transfer module allows branches under the same tenant to move stock between branches using a controlled and auditable workflow.

Transfers MUST only occur between active branches within the same tenant.

## 19.2 Transfer Statuses

The system MUST support exactly these transfer statuses:

```text
Draft
Pending
In Transit
Received
Cancelled
```

## 19.3 Transfer Required Fields

A transfer MUST have:

| Field              | Requirement                                                 |
| ------------------ | ----------------------------------------------------------- |
| Tenant             | Required.                                                   |
| Transfer number    | Required. Generated automatically and unique within tenant. |
| Source branch      | Required. Must be active.                                   |
| Destination branch | Required. Must be active and different from source branch.  |
| Product lines      | Required before submitting.                                 |
| Requested quantity | Required per line. Greater than zero.                       |
| Sent quantity      | Required when marked in transit.                            |
| Received quantity  | Required when received.                                     |
| Created by         | Required.                                                   |
| Sent by            | Required when marked in transit.                            |
| Received by        | Required when received.                                     |
| Remarks            | Optional for draft; required for cancellation or variance.  |
| Timestamps         | Required for each status transition.                        |

## 19.3.1 Transfer Numbering

The system MUST generate inventory transfer numbers automatically using this format:

```text
TR-YYYYMMDD-000001
```

The sequence number MUST be tenant-wide and reset daily.

Transfer numbers MUST be unique within the tenant.

Transfer numbers MUST be immutable after creation.

Cancelled or received transfer numbers MUST NOT be reused.

## 19.4 Transfer Transition Matrix

| From Status | To Status        |           Allowed | Inventory Effect                                                                                             |
| ----------- | ---------------- | ----------------: | ------------------------------------------------------------------------------------------------------------ |
| None        | Draft            |               Yes | No stock effect.                                                                                             |
| Draft       | Pending          |               Yes | Reserve requested stock from source branch.                                                                  |
| Draft       | Cancelled        |               Yes | No stock effect.                                                                                             |
| Pending     | In Transit       |               Yes | Confirm sent quantity; release unused reservation if sent quantity is lower than requested.                  |
| Pending     | Cancelled        |               Yes | Release reserved source stock.                                                                               |
| In Transit  | Received         |               Yes | Deduct source on-hand; reduce source reserved; increase destination on-hand; create destination FIFO layers. |
| In Transit  | Cancelled        | Yes, manager only | Requires stock disposition rule.                                                                             |
| Received    | Any other status |                No | Received transfer is final.                                                                                  |
| Cancelled   | Any other status |                No | Cancelled transfer is final.                                                                                 |

## 19.5 Transfer Reservation Rule

When a transfer moves from `Draft` to `Pending`:

- The system MUST check source branch available stock.
- The system MUST block submission if available stock is insufficient.
- The system MUST reserve source branch stock.
- Source branch available stock MUST decrease.
- Source branch on-hand stock MUST remain unchanged.
- Inventory ledger entries MUST be created using transaction type `Inventory Transfer Reservation`.

## 19.6 Transfer In Transit Rule

When a transfer moves from `Pending` to `In Transit`:

- Sent quantity MUST be greater than zero.
- Sent quantity MUST NOT exceed reserved quantity.
- If sent quantity is lower than reserved quantity, the difference MUST be released.
- Released difference MUST increase source branch available stock.
- The system MUST record sent by and sent timestamp.

## 19.7 Transfer Receiving Rule

When a transfer moves from `In Transit` to `Received`:

- Received quantity MUST be greater than or equal to zero.
- Received quantity MUST NOT exceed sent quantity.
- Source branch on-hand stock MUST decrease by sent quantity.
- Source branch reserved stock MUST decrease by sent quantity.
- Destination branch on-hand stock MUST increase by received quantity.
- FIFO reservation allocations created during transfer submission MUST be consumed oldest-first.
- FIFO layers for the received quantity MUST be moved from source to destination preserving unit cost.
- Destination FIFO layer received date MUST be the transfer received date.
- Destination FIFO layer MUST reference the original source FIFO layer.
- Inventory ledger entries MUST be created for transfer out and transfer in.
- If received quantity is lower than sent quantity, the missing quantity MUST create an `Inventory Transfer Variance Loss` ledger entry and MUST consume the corresponding FIFO value as inventory variance loss.

## 19.8 Transfer Variance Rule

If received quantity is lower than sent quantity:

- The difference MUST be recorded as transfer variance.
- A variance reason MUST be required.
- The variance MUST be audit logged.
- The variance quantity and FIFO value MUST appear in inventory movement reports.
- The system MUST create an `Inventory Transfer Variance Loss` ledger entry for the missing quantity.
- The system MUST NOT automatically add missing quantity to destination stock.
- The system MUST NOT create supplier payable, customer receivable, revenue, or expense records from transfer variance. The variance is inventory loss reporting only.

## 19.9 In-Transit Cancellation Rule

An `In Transit` transfer can be cancelled only by a user with `inventory.transfer.cancel` permission.

Cancelling an `In Transit` transfer MUST require selecting one disposition:

| Disposition        | Inventory Effect                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Returned to source | Reserved stock is released; source on-hand remains unchanged.                                                                                                                                        |
| Lost or damaged    | Reserved stock is released; source on-hand is decreased; FIFO layers are consumed using the transfer reservation allocations; reason required; ledger entry uses `Inventory Transfer Variance Loss`. |

The system MUST audit log the cancellation and disposition.

---

# 20. Supplier Management

## 20.1 Supplier Features

The system MUST support:

- Create supplier
- Edit supplier
- Deactivate supplier
- Reactivate supplier
- Store supplier contact information
- View purchase history
- View supplier balance
- View supplier reports

## 20.2 Supplier Required Fields

A supplier MUST have:

| Field          | Requirement                                            |
| -------------- | ------------------------------------------------------ |
| Supplier name  | Required. Unique within tenant among active suppliers. |
| Contact person | Optional.                                              |
| Mobile number  | Optional.                                              |
| Email          | Optional.                                              |
| Address        | Optional.                                              |
| Notes          | Optional.                                              |
| Status         | One of `active` or `inactive`.                         |

## 20.3 Supplier Scope

Suppliers are tenant-wide.

Purchase records linked to suppliers are branch-specific because stock is received into a branch.

## 20.4 Supplier Deactivation

A supplier can be deactivated only when:

- The supplier has no open purchase orders.
- The supplier has no unpaid accounts payable balance.

A deactivated supplier MUST remain visible in historical purchase records.

## 20.5 Supplier Reactivation Rules

Supplier reactivation MUST:

- Require `suppliers.update` permission.
- Require the supplier to belong to the same tenant.
- Re-check supplier name uniqueness among active suppliers.
- Restore the supplier to `active` status.
- Write an audit log entry.

A reactivated supplier MUST become selectable for new purchase orders and supplier returns only after reactivation succeeds.

---

# 21. Purchase Management and Accounts Payable

## 21.1 Purchase Features

The system MUST support:

- Purchase orders
- Purchase receiving
- Partial receiving
- Purchase cancellation
- Purchase history
- Supplier balances
- Accounts payable
- Manual supplier payment recording

## 21.2 Purchase Order Statuses

The system MUST support exactly these purchase order statuses:

```text
Draft
Ordered
Partially Received
Received
Closed
Cancelled
```

## 21.3 Purchase Order Required Fields

A purchase order MUST have:

| Field                 | Requirement                               |
| --------------------- | ----------------------------------------- |
| Tenant                | Required.                                 |
| Branch                | Required. Receiving branch.               |
| Supplier              | Required. Active supplier in same tenant. |
| Purchase order number | Required. Generated automatically.        |
| Line items            | Required before moving to `Ordered`.      |
| Payment terms         | Required. One of `cash`, `credit`.        |
| Order date            | Required.                                 |
| Expected receive date | Optional.                                 |
| Created by            | Required.                                 |

## 21.3.1 Purchase Line and Receiving Line Requirements

Each purchase order line MUST include:

| Field            | Requirement                                            |
| ---------------- | ------------------------------------------------------ |
| Product          | Required. Active product in the same tenant.           |
| Ordered quantity | Required. Greater than zero.                           |
| Unit cost        | Required. Zero or greater.                             |
| Line total       | System-calculated from ordered quantity and unit cost. |
| Notes            | Optional.                                              |

Each purchase receiving line MUST include:

| Field               | Requirement                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Purchase order line | Required.                                                                                  |
| Received quantity   | Required. Greater than zero.                                                               |
| Received unit cost  | Required. Defaults from purchase order line unit cost but MAY be corrected before posting. |
| Receiving branch    | Required. Must match purchase order branch.                                                |
| Receiving timestamp | Required.                                                                                  |
| Received by         | Required.                                                                                  |

Changing received unit cost before posting MUST update the FIFO layer unit cost created by the receiving transaction.

Posted receiving records MUST NOT be directly edited. Corrections after posting MUST use supplier return or inventory adjustment workflows.

## 21.3.2 Purchase Order Numbering

The system MUST generate purchase order numbers automatically using this format:

```text
PO-YYYYMMDD-000001
```

The sequence number MUST be tenant-wide and reset daily.

Purchase order numbers MUST be unique within the tenant.

Purchase order numbers MUST be immutable after creation.

Cancelled, closed, or received purchase order numbers MUST NOT be reused.

## 21.4 Purchase Order Transition Matrix

| From Status        | To Status          | Allowed | Required Conditions                                          |
| ------------------ | ------------------ | ------: | ------------------------------------------------------------ |
| None               | Draft              |     Yes | Purchase creation succeeds.                                  |
| Draft              | Ordered            |     Yes | Supplier and line items are complete.                        |
| Draft              | Cancelled          |     Yes | Reason required.                                             |
| Ordered            | Partially Received |     Yes | At least one line received but not all lines fully received. |
| Ordered            | Received           |     Yes | All lines fully received in one receiving action.            |
| Ordered            | Cancelled          |     Yes | No stock received. Reason required.                          |
| Partially Received | Received           |     Yes | All remaining quantities received.                           |
| Partially Received | Closed             |     Yes | User confirms no remaining quantity will be received.        |
| Received           | Closed             |     Yes | AP state confirmed.                                          |
| Closed             | Any other status   |      No | Closed purchase order is final.                              |
| Cancelled          | Any other status   |      No | Cancelled purchase order is final.                           |

## 21.5 Receiving Stocks

When stock is received:

- The receiving branch MUST be active.
- Received quantity MUST be greater than zero.
- Received quantity MUST NOT exceed remaining ordered quantity unless over-receiving is enabled by platform configuration.
- Over-receiving is disabled by default.
- Inventory ledger entries MUST be created using transaction type `Purchase Receive`.
- FIFO cost layers MUST be created.
- Branch on-hand stock MUST increase.
- Supplier balance MUST be updated if payment terms are credit.
- The receiving action MUST be audit logged.

## 21.6 Accounts Payable Definition

Accounts payable is the unpaid amount owed to suppliers for received purchases.

The system MUST calculate supplier payable balance as:

```text
Supplier Balance = Total Credit Purchases Received - Supplier Payments - Supplier Credits
```

Supplier credits are created only by supplier return records or approved supplier credit adjustments. Manual supplier credit adjustments MUST require `supplier_credits.create` permission. Supplier credits MUST reference the supplier, branch when applicable, amount, reason, source record, and creator.

## 21.7 Supplier Payments

The system MUST support manual supplier payment recording.

A supplier payment MUST include:

- Supplier
- Amount
- Payment date
- Payment method
- Reference number, if available
- Notes
- Created by

Supplier payments MUST reduce accounts payable.

The system MUST block supplier payment amounts greater than the supplier payable balance unless the excess is recorded as a supplier credit adjustment by a user with `supplier_credits.create` permission. Supplier overpayment credit workflows are not otherwise included in this build scope.

Supplier payments MUST NOT integrate with external banking or payment automation.

## 21.8 Purchase Cancellation

A purchase order with received stock MUST NOT be cancelled.

If received stock must be reversed, the system MUST use supplier return or inventory adjustment workflows.

## 21.9 Supplier Returns

The system MUST support supplier returns for stock previously received from a supplier.

A supplier return MUST:

- Reference one supplier.
- Reference the original purchase receiving record when available.
- Reference one active branch.
- Include one or more product lines.
- Require returned quantity greater than zero.
- Require returned quantity less than or equal to available unreserved stock for the branch.
- Require reason.
- Require `supplier_returns.create` permission.
- Create inventory ledger entries using transaction type `Supplier Return`.
- Consume FIFO layers oldest-first, preferring FIFO layers from the original purchase receiving record when traceable.
- Decrease branch on-hand stock.
- Create supplier credit when the supplier owes value back to the tenant.
- Reduce accounts payable when the returned stock belongs to an unpaid credit purchase.
- Write an audit log entry.

Supplier returns MUST NOT be allowed for quantities already consumed, transferred, reserved, or returned.

## 21.9.1 Supplier Return Valuation Rules

Supplier return inventory value MUST be calculated from the FIFO layers consumed by the supplier return.

Supplier return financial value MUST use the original received unit cost when the original purchase receiving record is traceable.

When the original purchase receiving record is not traceable, supplier return financial value MUST use the FIFO-consumed unit cost and require a reason.

For supplier returns from credit purchases:

- The return value MUST first reduce unpaid accounts payable for the related supplier.
- Any return value greater than the unpaid payable amount MUST create supplier credit.

For supplier returns from cash purchases or fully paid credit purchases:

- The return value MUST create supplier credit unless the user records an immediate supplier cash refund.
- Immediate supplier cash refund records MUST require payment method, amount, date, reference when available, and audit log entry.

Supplier return value MUST NOT create revenue, customer receivable, or tenant expense records.

## 21.10 Purchase Order Closure and Accounts Payable

Closing a purchase order confirms that no additional quantities will be received against that order.

Closing a purchase order MUST NOT erase accounts payable. Supplier payable balance remains outstanding until reduced by supplier payments or supplier credits.

## 21.11 Cash Purchase Payment Rule

For purchase orders with payment terms `cash`:

- The system MUST treat the received purchase amount as paid at receiving time.
- The system MUST NOT increase supplier accounts payable.
- The receiving user MUST record payment method and optional reference number.
- The cash purchase payment record MUST appear in purchase history and supplier history.
- The cash purchase payment record MUST NOT be treated as a supplier payable balance.

For purchase orders with payment terms `credit`, supplier payable balance MUST increase when stock is received and MUST remain outstanding until reduced by supplier payments or supplier credits.

---

# 22. Sales and Invoicing

## 22.1 Invoice Scope

The system MUST support invoices for service-related job orders.

The system MUST NOT support standalone retail POS invoices that are unrelated to job orders.

An invoice MUST be linked to at least one job order before issuance.

## 22.2 Invoice Features

The system MUST support:

- Invoice generation from job orders
- Discounts
- Taxes
- Payment collection
- Printable invoices
- Printable receipts
- Partial payments
- Split payments
- Refunds
- Void invoices
- Accounts receivable

## 22.3 Invoice and Job Order Relationships

The system MUST support:

- One invoice for one job order
- One invoice for multiple job orders
- Multiple invoices for one job order

Invoices linked to multiple job orders MUST meet all of the following conditions:

- All linked job orders MUST belong to the same tenant.
- All linked job orders MUST belong to the same customer.
- All linked job orders MUST belong to the same branch as the invoice.
- Linked job orders MUST NOT be `Cancelled` or `Released` at the time a new invoice is created.

For multiple invoices from one job order:

- Job order line items MUST track billed quantity and billed amount.
- The system MUST prevent billing more than the job order line authorized quantity or authorized amount.
- Each invoice line MUST reference the originating job order line when applicable.

A job order MAY be invoiced before completion, but inventory parts remain reserved until job order completion according to Section 14.10.

## 22.3.1 Invoice Billing Allocation Rules

To support multiple invoices for one job order, the system MUST track billing allocations per originating job order line.

Each invoice line that originates from a job order line MUST store:

- Originating job order line ID.
- Allocated quantity when the source line is quantity-based.
- Allocated amount when the source line is amount-based.
- Invoice ID.
- Invoice status snapshot or current invoice status reference.
- Allocation status.

Billing allocation statuses MUST be:

```text
Reserved
Final
Released
Closed
```

Allocation behavior MUST follow these rules:

| Invoice State                          | Allocation Rule                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Draft                                  | Allocations are `Reserved` and reduce remaining billable quantity or amount to prevent concurrent overbilling.                                                           |
| Pending, Partially Paid, Paid, Overdue | Allocations are `Final` and continue reducing remaining billable quantity or amount.                                                                                     |
| Cancelled                              | Allocations are `Released` and the job order line becomes billable again.                                                                                                |
| Voided                                 | Allocations are `Released` and the job order line becomes billable again for corrected invoicing.                                                                        |
| Refunded                               | Allocations are `Closed`; the job order line does not become automatically billable again because the invoice was explicitly closed with no further collection expected. |

The system MUST calculate remaining billable quantity or amount as:

```text
Remaining Billable = Authorized Line Quantity or Amount - Reserved Allocations - Final Allocations - Closed Allocations
```

The system MUST block invoice creation or draft updates that would make remaining billable quantity or amount negative.

Allocation creation, release, finalization, and closing MUST occur in the same database transaction as the corresponding invoice status change.

## 22.4 Invoice Required Fields

An invoice MUST have:

| Field          | Requirement                                                                         |
| -------------- | ----------------------------------------------------------------------------------- |
| Tenant         | Required.                                                                           |
| Branch         | Required.                                                                           |
| Customer       | Required.                                                                           |
| Invoice number | Required. Generated automatically.                                                  |
| Invoice date   | Required.                                                                           |
| Due date       | Required at issuance for all issued invoices. Defaults from tenant due-day setting. |
| Status         | Required.                                                                           |
| Line items     | Required before issuance.                                                           |
| Tax profile    | Copied from tenant settings at issuance.                                            |
| Tax mode       | Copied from tenant settings at issuance.                                            |
| Created by     | Required.                                                                           |

## 22.5 Invoice Numbering

The system MUST generate invoice numbers automatically using the tenant invoice prefix.

Format:

```text
{INVOICE_PREFIX}{6_DIGIT_SEQUENCE}
```

Example:

```text
MG-000001
MG-000002
MG-000003
```

Invoice sequence MUST be tenant-wide.

Invoice numbers MUST be unique within the tenant.

Invoice numbers MUST be assigned when the invoice is first created, including draft invoices.

Invoice numbers MUST be immutable after assignment.

Cancelled or voided invoice numbers MUST NOT be reused.

## 22.6 Invoice Statuses

The system MUST support exactly these invoice statuses:

```text
Draft
Pending
Partially Paid
Paid
Overdue
Cancelled
Voided
Refunded
```

## 22.7 Invoice Status Rules

| Status         | Meaning                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Draft          | Invoice is created but not issued. Editable. No payment allowed.                                     |
| Pending        | Invoice is issued and has zero net payments.                                                         |
| Partially Paid | Invoice has net payments but remaining collectible balance is greater than zero.                     |
| Paid           | Invoice remaining collectible balance is zero and no full-close refund has been processed.           |
| Overdue        | Invoice has remaining collectible balance greater than zero and due date is past.                    |
| Cancelled      | Draft or pending invoice with zero payments was cancelled.                                           |
| Voided         | Issued invoice was formally voided after all payments, if any, were refunded through refund records. |
| Refunded       | Invoice was fully refunded and explicitly closed with no further collection expected.                |

`Overdue` MUST be system-computed. A pending or partially paid invoice becomes overdue when:

```text
Current date > Due date AND Remaining Collectible Balance > 0
```

Status precedence MUST be:

```text
Voided > Refunded > Cancelled > Paid > Overdue > Partially Paid > Pending > Draft
```

## 22.7.1 Invoice Transition Matrix

| From Status    | To Status        | Allowed | Required Conditions                                                                                                                         |
| -------------- | ---------------- | ------: | ------------------------------------------------------------------------------------------------------------------------------------------- |
| None           | Draft            |     Yes | Invoice draft is created from at least one eligible job order and receives an invoice number.                                               |
| Draft          | Pending          |     Yes | Invoice has at least one line item, required tax fields are copied, and invoice is issued.                                                  |
| Draft          | Cancelled        |     Yes | Zero payments; cancellation reason required.                                                                                                |
| Pending        | Partially Paid   |     Yes | Payment is recorded and remaining collectible balance is greater than zero.                                                                 |
| Pending        | Paid             |     Yes | Payment is recorded and remaining collectible balance becomes zero.                                                                         |
| Pending        | Overdue          |     Yes | System-computed when due date has passed and remaining collectible balance is greater than zero.                                            |
| Pending        | Cancelled        |     Yes | Zero payments; cancellation reason required.                                                                                                |
| Pending        | Voided           |     Yes | Void reason required; zero payments or all payments have already been fully refunded through refund records.                                |
| Partially Paid | Paid             |     Yes | Additional payment makes remaining collectible balance zero.                                                                                |
| Partially Paid | Overdue          |     Yes | System-computed when due date has passed and remaining collectible balance is greater than zero.                                            |
| Partially Paid | Voided           |     Yes | Void reason required; all payments have already been fully refunded through refund records.                                                 |
| Paid           | Pending          |     Yes | Refund is recorded, net payments become zero, collection should continue, and due date has not passed.                                      |
| Paid           | Partially Paid   |     Yes | Refund is recorded, net payments remain greater than zero, remaining collectible balance is greater than zero, and due date has not passed. |
| Paid           | Overdue          |     Yes | Refund is recorded, collection should continue, remaining collectible balance is greater than zero, and due date has passed.                |
| Paid           | Refunded         |     Yes | All payments are fully refunded and user explicitly closes invoice with no further collection expected.                                     |
| Paid           | Voided           |     Yes | Void reason required; all payments have already been fully refunded through refund records.                                                 |
| Overdue        | Partially Paid   |     Yes | Payment is recorded but remaining collectible balance remains greater than zero.                                                            |
| Overdue        | Paid             |     Yes | Payment is recorded and remaining collectible balance becomes zero.                                                                         |
| Overdue        | Voided           |     Yes | Void reason required; all payments have already been fully refunded through refund records.                                                 |
| Cancelled      | Any other status |      No | Cancelled invoice is final.                                                                                                                 |
| Voided         | Any other status |      No | Voided invoice is final.                                                                                                                    |
| Refunded       | Any other status |      No | Refunded invoice is final.                                                                                                                  |

Blocked invoice transitions MUST return a clear validation error.

## 22.8 Invoice Editing Rules

Draft invoices MAY be edited by users with `invoices.update_draft` permission.

Once an invoice is issued:

- Line items MUST NOT be directly edited.
- Customer MUST NOT be changed.
- Branch MUST NOT be changed.
- Tax mode MUST NOT be changed.
- Corrections MUST be handled through cancellation, voiding, refund, or new invoice.

Once an invoice has received payment:

- The invoice MUST NOT be directly edited.
- Corrections MUST be handled through refunds or new invoices.
- All correction actions MUST be audit logged.

## 22.9 Invoice Cancellation

Cancellation is allowed only when:

- Invoice status is `Draft` or `Pending`.
- Invoice has zero payments.
- Invoice has no refund records.
- User has `invoices.cancel` permission.
- Cancellation reason is provided.

Cancelled invoices MUST remain visible in invoice history and reports.

Cancelling an invoice MUST release related invoice billing allocations according to Section 22.3.1.

## 22.10 Invoice Void

Voiding an invoice MUST require:

- `invoices.void` permission.
- Void reason.
- Audit log entry.

Voiding an invoice MUST NOT automatically change linked job order status. Released job orders remain released unless a separately authorized operational correction is allowed elsewhere in this PRD.

The system MUST block voiding an invoice with non-refunded payments. Users MUST refund all payment amounts through refund records before the invoice can be voided.

If inventory effects already occurred because linked job order parts were consumed, voiding MUST NOT automatically restore inventory unless the user explicitly selects inventory reversal and has `inventory.adjust` or `inventory.force_adjust` permission.

When inventory reversal is selected:

- The system MUST create inventory ledger entries using transaction type `Void Inventory Reversal`.
- Returned stock MUST create FIFO layers using the original consumed cost where available.
- Returned quantity MUST NOT exceed the originally consumed quantity minus quantities already returned by prior refund or void reversals.

Voiding an invoice MUST release related invoice billing allocations according to Section 22.3.1.

## 22.11 Discounts

The system MUST support:

- Line-level fixed amount discount
- Line-level percentage discount
- Invoice-level fixed amount discount
- Invoice-level percentage discount

Discounts MUST be applied before tax calculation.

Total discount MUST NOT exceed subtotal before tax.

Discount reason MUST be required when total discount is greater than zero.

Discounts MUST be visible on printed invoice and reports.

## 22.12 Tax Calculation

The system MUST calculate tax per invoice line and round each line tax amount to 2 decimal places using standard half-up rounding.

The system MUST then sum rounded line tax amounts to calculate total invoice tax.

For `tax_exclusive` mode:

```text
Line Tax = Taxable Line Net Amount × VAT Rate
Line Total = Taxable Line Net Amount + Line Tax
```

For `tax_inclusive` mode:

```text
Taxable Base = Line Gross Amount / (1 + VAT Rate)
Line Tax = Line Gross Amount - Taxable Base
Line Total = Line Gross Amount
```

For `no_tax` mode:

```text
Line Tax = 0
Line Total = Line Net Amount
```

All monetary values MUST be stored using fixed-precision decimal types with 2 decimal precision in Philippine Peso unless tenant currency is changed by platform admin. Binary floating-point storage MUST NOT be used for monetary amounts.

## 22.13 Invoice-Level Discount Allocation and Taxable Base Rules

Invoice-level discounts MUST be allocated across invoice lines before tax calculation.

Allocation MUST follow these rules:

- Fixed invoice-level discounts MUST be allocated proportionally based on each line's pre-tax net amount before invoice-level discount.
- Percentage invoice-level discounts MUST apply the same percentage to each eligible line.
- Allocation rounding MUST use standard half-up rounding to 2 decimal places.
- Any rounding remainder MUST be applied to the last eligible line by line order so the sum of allocated discounts equals the invoice-level discount.
- Total line discount plus allocated invoice discount MUST NOT make any line net amount negative.

For tax calculation:

- The taxable line net amount is the line amount after line-level discount and allocated invoice-level discount.
- In `tax_exclusive` mode, VAT is calculated from the taxable line net amount.
- In `tax_inclusive` mode, the line gross amount after all discounts is used to derive the taxable base and VAT amount.
- In `no_tax` mode, tax is zero.

Line-level tax exemption is not included in this build scope. All invoice lines follow the invoice tax profile and tax mode copied at issuance.

---

# 23. Payments, Receipts, Refunds, and Accounts Receivable

## 23.1 Payment Methods

The system MUST support these payment methods:

| Enum Value      | Display Label |
| --------------- | ------------- |
| `cash`          | Cash          |
| `gcash`         | GCash         |
| `maya`          | Maya          |
| `bank_transfer` | Bank Transfer |
| `credit_card`   | Credit Card   |
| `check`         | Check         |
| `other`         | Other         |

The enum value MUST be used in APIs, database records, exports, and validation rules. The display label MAY be used in user interfaces and printable documents.

All payment methods are recorded manually. The system MUST NOT process external payment gateway charges.

For `bank_transfer`, `credit_card`, `check`, and `other`, the system SHOULD allow a reference number or note. The system MUST NOT require or store full payment card details.

## 23.1.1 Supplier and Expense Payment Method Rule

Supplier payments, cash purchase payments, immediate supplier cash refunds, and expense payment method fields MUST use the same payment method enum values defined in Section 23.1 unless a specific workflow explicitly restricts the allowed subset.

When payment method is `credit_card`, the system MUST store only manual reference information and MUST NOT store card number, CVV, magnetic stripe data, or equivalent sensitive cardholder data.

## 23.2 Payment Rules

A payment MUST:

- Reference one invoice.
- Have amount greater than zero.
- Have payment date.
- Have payment method.
- Have created by user.
- Generate one receipt.
- Reduce invoice remaining balance.
- Update invoice status.

The system MUST block payment amount greater than invoice remaining balance unless the user records the excess as customer credit. Customer credit is not supported in this build scope, therefore overpayment MUST be blocked.

## 23.2.1 Payment Correction Rule

Payments and receipts MUST NOT be directly edited after creation.

If a payment was recorded incorrectly, the correction MUST be handled by creating a refund record against the original payment and, when appropriate, recording a new correct payment.

The system MUST NOT delete the original payment or receipt.

Payment correction refunds MUST be audit logged and MUST appear in refund and payment history reports.

## 23.3 Partial Payments

The system MUST allow partial payments.

An invoice MUST remain `Partially Paid` until the remaining balance is zero or until it becomes overdue.

## 23.4 Split Payments

The system MUST allow split payments by recording multiple payment records against the same invoice.

Example:

```text
Invoice Total: ₱5,000
Payment 1: ₱2,000 Cash
Payment 2: ₱3,000 GCash
```

Each payment MUST generate its own receipt.

## 23.5 Receipt Numbering

The system MUST generate receipt numbers automatically using this format:

```text
RCPT-{6_DIGIT_SEQUENCE}
```

Example:

```text
RCPT-000001
RCPT-000002
```

Receipt sequence MUST be tenant-wide.

Receipt numbers MUST be unique within the tenant.

Receipt numbers MUST be immutable.

Receipt numbers MUST never be reused, including when the related payment is refunded or the related invoice is cancelled, voided, or refunded.

## 23.6 Receipt Immutability

Receipts MUST be immutable after creation.

The system MUST NOT allow direct editing of receipt amount, payment method, receipt number, customer, invoice, or payment date.

Corrections MUST be handled through refund records. No separate payment-reversal workflow is included unless represented as a refund record.

## 23.7 Refunds

The system MUST support partial and full refunds.

A refund MUST:

- Reference the original payment.
- Require `payments.refund` or `invoices.refund` permission.
- Require refund amount greater than zero.
- Require refund amount less than or equal to refundable amount.
- Require reason.
- Create audit log entry.
- Update payment refundable balance.
- Update invoice balance and status.

Refunds MUST NOT delete the original payment or receipt.

When a refund is recorded and collection should continue, the system MUST recalculate net paid amount, remaining collectible balance, due-date state, and invoice status. A previously `Paid` invoice MAY move back to `Pending`, `Partially Paid`, or `Overdue` according to the recalculated balance and due date.

Refund behavior MUST follow these status rules:

| Refund Case                                       | Invoice Effect                                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Partial refund and collection should continue     | Recalculate net paid amount, remaining collectible balance, and invoice status as `Pending`, `Partially Paid`, or `Overdue`. |
| Full refund and collection should continue        | Recalculate remaining collectible balance and include invoice in accounts receivable when eligible.                          |
| Full refund and no further collection is expected | Set invoice status to `Refunded`; require explicit close-after-refund confirmation and reason.                               |

A `Refunded` invoice MUST NOT appear in accounts receivable because it is closed for collection. If money is refunded but collection should continue, the invoice MUST NOT use the `Refunded` status.

## 23.8 Refund Inventory Reversal

Refunding money MUST NOT automatically return inventory to stock.

If the refund includes returned parts, the user MUST explicitly select inventory reversal.

When inventory reversal is selected:

- The user MUST have `inventory.adjust` or `inventory.force_adjust` permission.
- Returned quantity MUST NOT exceed originally consumed quantity minus quantities already returned by prior refund or void reversals.
- The system MUST create inventory ledger entries using transaction type `Refund Inventory Reversal`.
- FIFO layers MUST be recreated using original consumed cost where available.
- The action MUST be audit logged.

## 23.9 Accounts Receivable

Accounts receivable is the total unpaid balance from issued invoices.

An invoice MUST appear in accounts receivable when:

```text
Remaining Collectible Balance > 0 AND status is Pending, Partially Paid, or Overdue
```

Accounts receivable MUST track:

- Invoice number
- Customer
- Branch
- Invoice total
- Amount paid
- Remaining collectible balance
- Due date
- Payment status
- Aging bucket

Aging buckets MUST be:

```text
Current
1-30 days overdue
31-60 days overdue
61-90 days overdue
Over 90 days overdue
```

---

# 24. Tax Requirements

## 24.1 Tax Profiles

The system MUST support these tax profile enum values and display labels:

| Enum Value       | Display Label  |
| ---------------- | -------------- |
| `vat_registered` | VAT Registered |
| `non_vat`        | Non-VAT        |
| `no_tax`         | No Tax         |

The enum value MUST be used in APIs, database records, exports, and validation rules. The display label MAY be used in user interfaces and printable documents.

## 24.2 Tax Modes

The system MUST support these tax mode enum values and display labels:

| Enum Value      | Display Label |
| --------------- | ------------- |
| `tax_inclusive` | Tax Inclusive |
| `tax_exclusive` | Tax Exclusive |
| `no_tax`        | No Tax        |

The enum value MUST be used in APIs, database records, exports, and validation rules. The display label MAY be used in user interfaces and printable documents.

## 24.3 VAT Rate

The default VAT rate MUST be:

```text
12%
```

Authorized users MUST be able to update VAT rate in tenant settings.

Changing VAT rate MUST affect only invoices created after the change.

Issued invoices MUST retain the VAT rate copied at issuance time.

## 24.4 Tax Profile Behavior

| Tax Profile Enum | Allowed Tax Mode Enums           | Invoice Tax Behavior                                         |
| ---------------- | -------------------------------- | ------------------------------------------------------------ |
| `vat_registered` | `tax_inclusive`, `tax_exclusive` | VAT calculated using configured VAT rate.                    |
| `non_vat`        | `no_tax`                         | No VAT amount calculated. Invoice may display non-VAT label. |
| `no_tax`         | `no_tax`                         | No tax calculated or displayed except “No Tax” indicator.    |

The system MUST block incompatible tax profile and tax mode combinations.

---

# 25. Expense Management

## 25.1 Expense Features

The system MUST support:

- Create expense category
- Edit expense category
- Deactivate expense category
- Record expense
- Edit expense before voiding
- Void expense
- Attach receipt files
- View expense reports

## 25.2 Expense Required Fields

An expense MUST include:

| Field       | Requirement                  |
| ----------- | ---------------------------- |
| Tenant      | Required.                    |
| Branch      | Required.                    |
| Category    | Required.                    |
| Amount      | Required. Greater than zero. |
| Date        | Required.                    |
| Description | Required.                    |
| Attachment  | Optional.                    |
| Created by  | Required.                    |
| Status      | One of `active` or `voided`. |

## 25.3 Expense Void Rules

Voiding an expense MUST:

- Require `expenses.void` permission.
- Require void reason.
- Preserve original expense record.
- Exclude the expense from profit reports after voiding.
- Keep the expense visible in audit and expense history.
- Write an audit log entry.

## 25.3.1 Expense Editing Rules

Active expenses MAY be edited only by users with `expenses.update` permission.

Expense editing MUST:

- Require an edit reason when amount, date, branch, category, or description changes.
- Preserve the previous values in audit logs when safe to store.
- Recalculate expense reports using the current active expense values.
- Preserve linked attachment history.
- Block editing when the expense is voided.
- Block editing when the tenant is in `read_only`, `suspended`, `pending_deletion`, or `deleted` status.

If an expense was recorded against the wrong branch or amount after financial reports have already been exported, the system MUST still allow correction by authorized users but MUST audit the correction clearly.

## 25.4 Expense Category Deactivation Rules

Expense categories MUST be deactivated instead of hard deleted.

A deactivated expense category:

- MUST remain visible in historical expense records and reports.
- MUST NOT be selectable for new expenses.
- MAY be reactivated only when its category name remains unique within the tenant among active expense categories.

Expense category deactivation and reactivation MUST be audit logged.

---

# 26. Customer Reminders and CRM

## 26.1 Reminder Features

The system MUST support:

- Time-based reminders
- Mileage-based reminders
- Manual reminders
- Birthday greetings
- Follow-up reminders
- Reminder scheduling
- Reminder cancellation
- Reminder delivery tracking
- Reminder audit history

## 26.2 Reminder Categories

The system MUST support these reminder categories:

- Oil change
- Preventive maintenance service
- Registration renewal
- Birthday greeting
- Follow-up message
- Custom reminder

## 26.3 Reminder Statuses

The system MUST support exactly these reminder statuses:

```text
Scheduled
Due
Sent
Failed
Cancelled
```

## 26.4 Reminder Channels

The system MUST support these reminder channels:

- Internal in-app notification
- Internal push notification
- Internal email notification
- Customer email
- Customer SMS

Customer reminders MUST NOT use customer push notifications because customers do not have portal accounts in this build scope.

## 26.5 Plan-Based Reminder Behavior

| Plan  | Reminder Behavior                                                                                                                                                           |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basic | Can create reminders. Due reminders notify shop users through internal in-app and internal push only. Internal email, customer email, and customer SMS are blocked.         |
| Mid   | Can create reminders. Due reminders can notify shop users through internal in-app, internal push, and internal email, and customers through email. Customer SMS is blocked. |
| High  | Can create reminders. Due reminders can notify shop users through internal in-app, internal push, and internal email, and customers through email or SMS.                   |

## 26.6 Time-Based Reminder Rule

A time-based reminder MUST become due when:

```text
Current date >= Reminder due date
```

The system MUST evaluate due reminders at least once per day using the tenant timezone.

## 26.7 Mileage-Based Reminder Rule

A mileage-based reminder MUST include:

- Motorcycle
- Due mileage
- Reminder category
- Message template

A mileage-based reminder MUST become due when:

```text
Motorcycle latest mileage >= Reminder due mileage
```

The system MUST evaluate mileage-based reminders whenever a motorcycle mileage is updated and during daily reminder checks.

## 26.8 Birthday Reminder Rule

Birthday reminders MUST be evaluated daily using the tenant timezone.

A birthday reminder is due when the customer's birthday month and day match the current month and day.

## 26.9 Reminder Delivery Tracking

The system MUST track:

- Reminder type
- Customer
- Motorcycle, if applicable
- Channel
- Message content snapshot
- Delivery status
- Sent timestamp
- Failure reason, if failed
- User who created the reminder

Reminder status is the aggregate status of the reminder record. Delivery status is tracked separately per selected channel.

Aggregate reminder status MUST follow these rules:

| Aggregate Status | Rule                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Scheduled`      | Reminder is scheduled for a future due condition.                                                                                  |
| `Due`            | Reminder due condition is met and at least one configured channel has not completed delivery.                                      |
| `Sent`           | All required selected channels have successful delivery or have been manually marked complete by an authorized user.               |
| `Failed`         | All selected delivery channels failed or no selected channel is available because of missing contact details or plan restrictions. |
| `Cancelled`      | Reminder was cancelled before completion.                                                                                          |

A reminder MUST NOT silently switch to another customer channel when the selected customer channel is blocked by plan, missing contact information, or provider failure.

## 26.10 Reminder Delivery Retry Rules

Reminder delivery attempts through external providers MUST be retried only for transient provider or network failures.

The system MUST attempt at most 3 delivery attempts per selected external channel within 24 hours.

Permanent failures, such as missing customer contact details, blocked plan channel, invalid recipient address, or invalid phone number, MUST NOT be retried automatically.

Each delivery attempt MUST record:

- Attempt number
- Provider or channel
- Timestamp
- Result status
- Failure reason when available

After all retry attempts fail, the channel delivery status MUST be marked `Failed`.

---

# 27. Internal Notifications

## 27.1 Notification Types

The system MUST support internal notifications for:

- Low stock alerts
- New job orders
- Job order assignment
- Service completion
- New payments
- Subscription renewal alerts
- Inventory transfer updates
- Purchase receiving updates
- Reminder due alerts
- Failed reminder delivery
- Employee deactivation
- Role or permission changes

## 27.2 Notification Recipients

The system MUST determine recipients based on:

- Tenant
- Branch access
- User permissions
- Notification type
- User notification preferences
- Subscription plan channel availability

Example: A low stock alert for Branch A MUST be sent only to users who can access Branch A and have inventory-related notification access.

## 27.3 Notification Preferences

Users MUST be able to configure notification preferences by notification type and channel.

The system MUST NOT allow users to enable channels blocked by the tenant plan.

## 27.4 Notification Delivery Status

The system MUST track delivery status per notification recipient and channel.

Supported delivery statuses:

```text
Pending
Sent
Failed
Read
Dismissed
```

`Read` and `Dismissed` apply only to internal in-app notifications. Email, SMS, and push notification deliveries MUST use `Pending`, `Sent`, or `Failed` unless the provider supplies a stronger delivery event.

If a browser or device does not grant push notification permission, push delivery MUST be marked `Failed` or unavailable for that recipient and MUST NOT be silently replaced by email or SMS.

---

# 28. File Management

## 28.1 File Attachment Scope

The system MUST support file attachments for:

- Motorcycle photos
- Service photos
- Job order attachments
- Receipt attachments
- Warranty documents
- Expense receipts
- Estimate approval attachments
- Supplier documents
- Purchase documents

## 28.2 Supported File Types

Images MUST support:

- JPG
- JPEG
- PNG
- WEBP

Documents MUST support:

- PDF
- DOCX
- XLSX

The system MUST block unsupported file types.

## 28.3 File Size Limits

The system MUST enforce:

| File Type | Maximum Size |
| --------- | -----------: |
| Image     |         5 MB |
| Document  |        20 MB |

## 28.4 File Security

The system MUST:

- Store files under tenant-scoped storage paths.
- Associate each file with an owning tenant.
- Associate each file with a linked entity when applicable.
- Enforce access based on the linked entity access rules.
- Block access to files from other tenants.
- Scan uploaded files for malware when scanning service is configured.
- Generate time-limited signed URLs for private file access.

Public permanent file URLs MUST NOT be used for tenant files.

Malware scanning is optional infrastructure in this build. When a malware scanning service is configured, uploaded files MUST be marked as pending scan until the scan completes, and infected files MUST be quarantined or blocked from normal tenant access.

## 28.5 File Deletion

Files MUST be soft deleted for 30 days before permanent deletion.

Soft-deleted files:

- MUST NOT appear in default attachment lists.
- MUST remain restorable for 30 days.
- MUST remain accessible to platform admins for audit support.

Files linked to financial records, receipts, invoices, or audit-relevant documents MUST NOT be permanently deleted before the tenant retention policy allows deletion.

---

# 29. Reports and Dashboard

## 29.1 Dashboard Features

The dashboard MUST show:

- Daily sales
- Monthly revenue
- Pending jobs
- Jobs by status
- Inventory alerts
- Revenue chart
- Customer growth
- Accounts receivable summary
- Accounts payable summary
- Low stock summary
- Open transfer summary
- Pending purchase receiving summary

## 29.2 Dashboard Branch Filtering

Dashboard data MUST be filterable by branch for users with multi-branch access.

Branch-scoped users MUST only see dashboard data for assigned branches.

## 29.3 Sales Reports

The system MUST support:

- Daily sales
- Weekly sales
- Monthly sales
- Yearly sales
- Sales by branch
- Sales by service advisor
- Sales by payment method
- Discount summary
- Tax summary
- Refund summary
- Voided invoice summary

## 29.4 Service Reports

The system MUST support:

- Most common services
- Mechanic productivity
- Job order status summary
- Service revenue
- Average job completion time
- Released jobs with unpaid balance
- Cancelled job order report

## 29.5 Inventory Reports

The system MUST support:

- Stock valuation
- Fast-moving products
- Slow-moving products
- Low stock products
- Inventory movement history
- Inventory transfer history
- FIFO layer report
- Inventory adjustment report
- Transfer variance report

## 29.6 Customer Reports

The system MUST support:

- New customers
- Repeat customers
- Inactive customers
- Customer service history
- Customer motorcycle count
- Reminder engagement summary

## 29.7 Financial Reports

The system MUST support:

- Revenue
- Expenses
- Gross profit
- Cost of goods sold
- Accounts receivable
- Accounts payable
- Refunds
- Voided invoices
- Payment collection summary
- Supplier balance summary

## 29.8 Report Export

Reports MUST be exportable as:

- PDF
- Excel
- CSV

Exports MUST respect tenant and branch access rules.

Large exports MUST be processed as background jobs when they exceed synchronous response limits.

A large export is defined as any export estimated to contain more than 10,000 rows or expected to take more than 10 seconds.

## 29.9 Report Access by Plan

| Report Type                  |    Basic |      Mid |    High |
| ---------------------------- | -------: | -------: | ------: |
| Basic sales reports          |  Enabled |  Enabled | Enabled |
| Basic service reports        |  Enabled |  Enabled | Enabled |
| Basic inventory reports      |  Enabled |  Enabled | Enabled |
| Accounts receivable          |  Enabled |  Enabled | Enabled |
| Accounts payable             |  Enabled |  Enabled | Enabled |
| Branch comparison reports    | Disabled |  Enabled | Enabled |
| Advanced operational reports | Disabled | Disabled | Enabled |
| Export to CSV                |  Enabled |  Enabled | Enabled |
| Export to Excel              |  Enabled |  Enabled | Enabled |
| Export to PDF                |  Enabled |  Enabled | Enabled |

Advanced operational reports are defined as mechanic productivity, transfer variance, FIFO layer report, inventory adjustment report, released jobs with unpaid balance, branch comparison reports, and any report requiring cross-branch comparison or cost-layer-level detail.

## 29.10 Financial Report Calculation Rules

Financial reports are operational management reports, not formal accounting statements.

Unless a report explicitly states that it is cash-basis, the system MUST calculate revenue using issued invoice activity.

Revenue report rules:

- Draft and cancelled invoices MUST be excluded from revenue.
- Voided invoices MUST be excluded from revenue.
- Refunded invoices closed as `Refunded` MUST reduce revenue by the refunded amount.
- Partial refunds where collection continues MUST reduce net collected amount and update receivable balance, but the invoice remains revenue-bearing unless later voided or closed as refunded.
- Discounts MUST reduce revenue.
- Tax amounts MUST be reported separately from net revenue when tax reporting is enabled.

Payment collection report rules:

- Payment collection reports MUST be based on payment records minus refund records.
- Each payment MUST be reported by payment date, payment method, branch, tenant, and invoice.
- Refunds MUST reduce collections on the refund date.

Cost and profit report rules:

- Cost of goods sold MUST be recognized when job order parts are consumed at job order completion.
- Supplier returns MUST reduce inventory value and AP or supplier credit according to supplier return rules, but MUST NOT create revenue.
- Transfer variance loss MUST appear in inventory movement and inventory loss reporting, but MUST NOT appear as revenue, AP, AR, or operating expense.
- Gross profit MUST be calculated as net service and parts revenue minus cost of goods sold for consumed parts.
- Operating expenses MUST be reported from active expense records and must exclude voided expenses.

Accounts receivable and accounts payable reports MUST use current outstanding balances according to Sections 23.9 and 21.6.

All report date filters MUST use tenant timezone unless the report explicitly states a different timezone.

---

# 30. Audit Logs

## 30.1 Audit Log Requirement

The system MUST audit critical actions.

Audit logs MUST be immutable.

Tenant users MUST NOT be able to edit or delete audit logs.

## 30.2 Required Audit Coverage

The system MUST audit:

- Login attempts
- Failed login lockouts
- User creation
- User email changes
- Employee invitation creation, acceptance, revocation, and expiration
- Employee reactivation
- User deactivation
- Password resets by admin
- Role changes
- Role deactivation and reactivation when applicable
- Permission changes
- Platform admin creation
- Platform support access session start and end
- Branch creation
- Branch deactivation
- Branch reactivation
- Customer merge
- Customer soft deletion
- Customer restoration
- Motorcycle ownership link change
- Mileage correction
- Motorcycle restoration
- Job order creation
- Job order status changes
- Job order cancellation
- Job order release with balance
- Inventory reservations
- Inventory reservation releases
- Inventory consumption
- Inventory adjustments
- Inventory adjustment approvals, rejections, and postings
- Inventory force adjustments
- Inventory transfers
- Transfer variances
- Purchase receiving
- Supplier returns
- Supplier reactivation
- Supplier credits
- Supplier payments
- Invoice creation
- Invoice issuance
- Invoice cancellation
- Invoice voiding
- Invoice billing allocation release or closing
- Payment creation
- Payment correction refunds
- Refunds
- Receipt generation
- Expense editing
- Expense voiding
- Expense category deactivation and reactivation
- Reminder sending
- Notification delivery failures
- Subscription changes
- Plan overrides
- Settings changes
- Country or currency corrections
- Data exports
- Subscription activation and renewal actions
- Platform support access
- Tenant deletion events

## 30.3 Audit Log Fields

Audit logs MUST include:

| Field       | Requirement                                             |
| ----------- | ------------------------------------------------------- |
| Tenant      | Required for tenant actions.                            |
| Branch      | Required when action is branch-specific.                |
| Actor user  | Required when action is user-triggered.                 |
| Actor type  | Required. `tenant_user`, `platform_admin`, or `system`. |
| Action      | Required.                                               |
| Entity type | Required.                                               |
| Entity ID   | Required when entity exists.                            |
| Old value   | Required when value changed and safe to store.          |
| New value   | Required when value changed and safe to store.          |
| Reason      | Required for corrective or destructive actions.         |
| Timestamp   | Required.                                               |
| IP address  | Required when available.                                |
| User agent  | Required when available.                                |

Sensitive values such as passwords, password reset tokens, access tokens, and refresh tokens MUST NOT be stored in audit logs.

## 30.4 Audit Retention

Audit logs MUST be retained for at least 3 years.

Platform admins MAY configure longer retention.

Platform admins MUST NOT configure retention shorter than 3 years.

When tenant operational data is permanently deleted, platform-retained audit logs MAY remain for the required retention period. Retained audit logs MUST preserve security, compliance, and operational metadata, but MUST NOT retain unnecessary sensitive payloads, passwords, tokens, or full attachment contents.

---

# 31. Data Export and Retention

## 31.1 Tenant Data Export

The system MUST allow Shop Owners to export tenant data.

Export MUST include:

- Customers
- Motorcycles
- Job orders
- Estimates
- Invoices
- Payments
- Receipts
- Refunds
- Inventory products
- Inventory balances
- Inventory ledger
- FIFO layers
- Inventory transfers
- Suppliers
- Purchases
- Supplier payments
- Expenses
- Reports
- Tenant-visible audit logs
- File metadata
- Attachment manifest

## 31.1.1 Full Export Attachment Packaging

A full tenant data export MUST include attachment files unless the Shop Owner explicitly selects metadata-only export.

When attachment files are included:

- The ZIP file MUST contain an `/attachments` directory.
- Attachment filenames inside the ZIP MUST be generated safely and MUST NOT rely on untrusted original filenames alone.
- The attachment manifest MUST map exported attachment filenames to original file metadata, linked entity, tenant ID, and checksum when available.
- Soft-deleted files that are still within restore retention MAY be included only when the export request explicitly includes soft-deleted records.
- Quarantined or malware-flagged files MUST NOT be included as downloadable files; the manifest MUST identify them as excluded due to security status.
- Export generation MUST respect tenant and branch access rules.
- Large attachment exports MUST run asynchronously.

Metadata-only exports MUST clearly state that file binaries are not included.

## 31.2 Export Format

Tenant data export MUST be generated as a ZIP file.

The ZIP file MUST contain:

- CSV files for tabular operational data
- JSON files for relationship-preserving structured data
- Attachment manifest file
- Audit log export file
- README file explaining export contents

Large exports MUST be processed asynchronously.

Export download links MUST expire after 7 days.

## 31.3 Data Retention

Active tenant operational data MUST be retained while tenant is active.

Cancelled or expired tenant data MUST follow the subscription expiration lifecycle.

Soft-deleted operational records MUST remain available for historical integrity until tenant deletion.

Tenant deletion MUST remove active production operational records according to Section 4.8, while platform-retained audit logs follow the retention rule in Section 30.4.

## 31.4 Resubscription After Deletion

If a deleted tenant resubscribes after permanent deletion:

- The system MUST create a new tenant record.
- The system MUST NOT restore old deleted data.
- The system MAY allow reuse of shop name if no active tenant conflict exists.

---

# 32. Offline Support

## 32.1 Offline Scope

The system MUST support:

- Offline PWA shell
- Read-only cache of recently viewed records

The system MUST NOT support offline transaction creation, offline editing, or offline synchronization conflict resolution.

## 32.2 Offline Shell

The PWA MUST be installable and capable of loading the application shell without network connection.

The offline shell MUST clearly indicate offline status.

## 32.3 Read-Only Cache

The system MUST cache recently viewed data for offline viewing, including:

- Recent customers
- Recent motorcycles
- Recent job orders
- Recent invoices

The cache MUST:

- Be read-only.
- Be scoped to the logged-in user.
- Be cleared on logout.
- Expire cached records after 7 days.
- Store only the minimum data needed for recently viewed read-only screens.
- Avoid caching signed file URLs beyond their URL expiration time.
- Prevent viewing cached records after user deactivation once the client reconnects and receives deactivation state.

Cached data SHOULD use browser storage protections available to the PWA platform. The system MUST NOT promise offline revocation before reconnect because deactivation cannot be known by an offline client until connectivity returns.

## 32.4 Offline Restrictions

The following MUST NOT be created, edited, submitted, deleted, or approved offline:

- Customers
- Motorcycles
- Job orders
- Estimates
- Invoices
- Payments
- Receipts
- Refunds
- Inventory adjustments
- Inventory adjustment approvals, rejections, and postings
- Inventory force adjustments
- Inventory transfers
- Purchases
- Supplier payments
- Expenses
- Files
- Roles and permissions
- Settings

Offline screens MUST show a clear message when an action is unavailable offline.

---

# 33. Security Requirements

## 33.1 Tenant Isolation

The system MUST enforce tenant isolation at application and database query levels.

Every tenant-owned query MUST be scoped by `tenant_id`.

The system MUST block any request where authenticated tenant context does not match the requested record's tenant.

## 33.2 Branch-Level Access

Branch-specific records MUST be scoped by both `tenant_id` and `branch_id`.

The system MUST enforce branch assignment before returning branch-specific data.

## 33.3 HTTPS

The system MUST use HTTPS for all production traffic.

Plain HTTP MUST redirect to HTTPS or be blocked.

## 33.4 Data Protection

The system MUST use:

- Password hashing
- Encryption at rest for database storage where supported by infrastructure
- Encryption at rest for object storage
- Encrypted backups
- Secure token generation
- Secrets stored outside source code

## 33.5 Sensitive Data Handling

The system MUST NOT log:

- Passwords
- Access tokens
- Refresh tokens
- Password reset tokens
- Email verification tokens
- Full payment card details

Credit card payment method records MUST store only manual reference information. The system MUST NOT store card numbers, CVV, or magnetic stripe data.

## 33.6 Rate Limits

The system MUST enforce these rate limits:

| Endpoint Category           | Limit                                                                       |
| --------------------------- | --------------------------------------------------------------------------- |
| Login                       | 5 failed attempts per 15 minutes per account and IP                         |
| Password reset request      | 3 requests per account per hour                                             |
| Email verification resend   | 5 requests per account per hour                                             |
| File uploads                | 30 uploads per user per minute                                              |
| Public unauthenticated APIs | 60 requests per IP per minute                                               |
| Reminder sending            | 500 customer messages per tenant per day unless platform admin raises limit |
| Export generation           | 5 export requests per tenant per day                                        |

Rate limit violations MUST be logged.

## 33.7 Backup Policy

The system MUST perform daily backups.

Backups MUST be retained for at least 30 days.

Backups MUST be encrypted.

Backup restoration MUST be tested at least quarterly by platform operators.

## 33.8 Disaster Recovery Targets

The system MUST target:

```text
RPO: 24 hours
RTO: 4 hours
```

RPO means the platform accepts a maximum of 24 hours of data loss during disaster recovery.

RTO means the platform targets restoration of core service within 4 hours after disaster declaration.

## 33.9 Transaction Consistency and Idempotency

Critical write operations MUST be atomic and idempotency-safe.

The following operations MUST run inside database transactions:

- Invoice issuance
- Payment creation and receipt generation
- Refund creation
- Invoice cancellation and voiding
- Job order completion with inventory consumption
- Inventory reservation and reservation release
- Inventory adjustment posting
- Purchase receiving
- Supplier return posting
- Supplier payment creation
- Inventory transfer status changes that affect reservations, on-hand stock, FIFO layers, or ledger entries
- Tenant deletion job execution

The system MUST use concurrency controls such as row-level locking, optimistic locking, unique constraints, or equivalent safeguards to prevent:

- Duplicate invoice numbers
- Duplicate receipt numbers
- Duplicate job order, estimate, purchase order, or transfer numbers
- Double payment submission
- Double refund submission
- Double inventory consumption
- Over-reservation of FIFO layers
- Overbilling of job order lines
- Over-receiving purchase quantities
- Duplicate tenant deletion execution

Client-retryable critical write APIs MUST support idempotency keys or an equivalent server-side duplicate prevention mechanism.

Idempotency keys MUST be scoped by tenant, authenticated user, endpoint, and request intent.

Repeated requests with the same valid idempotency key MUST return the original operation result or a safe duplicate-response without repeating side effects.

---

# 34. Non-Functional Requirements

## 34.1 Performance Targets

The system MUST target the following performance metrics under normal operating load:

| Metric            |                                                          Target |
| ----------------- | --------------------------------------------------------------: |
| Initial page load | Less than 3 seconds on modern mobile browser over 4G connection |
| API P50 latency   |                                                 Less than 200ms |
| API P95 latency   |                                                 Less than 500ms |
| API P99 latency   |                                                Less than 1000ms |

These targets exclude:

- File uploads
- Large report exports
- Background jobs
- Third-party SMS provider delays
- Third-party email provider delays
- Cold starts during infrastructure scaling events

## 34.2 Report Performance

Interactive report screens MUST load summary data within 5 seconds for default date ranges up to 90 days.

Reports requiring more than 10 seconds MUST run as background exports.

## 34.3 Availability

The system MUST target:

```text
99.9% monthly uptime
```

Uptime calculation excludes scheduled maintenance windows announced at least 24 hours in advance.

Third-party email, SMS, storage, or analytics provider outages MUST be tracked separately from core application uptime.

## 34.4 Scalability Targets

The system MUST support at least:

```text
500 active shops
10,000 total tenant users
2,000 active branches
1,000,000 customers
1,500,000 motorcycles
2,000,000 job orders
5,000,000 inventory ledger entries
```

The architecture MUST support horizontal scaling of application servers.

The database design MUST include tenant, branch, date, and status indexes for high-volume operational queries.

## 34.5 Mobile Experience

The system MUST be:

- Mobile-first
- Responsive
- Installable as a PWA
- Usable on modern mobile browsers
- Optimized for touch interactions
- Usable on small screens with minimum width of 360px

Primary operational workflows MUST be usable on mobile:

- Customer lookup
- Motorcycle lookup
- Job order creation
- Mechanic work session updates
- Inventory lookup
- Payment recording
- Receipt viewing

## 34.6 Observability

The system MUST track:

- API error rate
- API latency
- Background job failures
- SMS delivery failures
- Email delivery failures
- Storage usage
- Database growth
- Authentication failures
- Failed authorization checks
- Export job status
- Reminder delivery status
- Inventory transaction failures

The system MUST produce structured logs with correlation IDs for request tracing.

Critical background job failures MUST generate internal admin alerts.

## 34.7 Background Job Reliability

Background jobs MUST be designed to be retry-safe and observable.

The system MUST use background jobs for:

- Large data exports
- Large report exports
- Reminder due evaluation
- Reminder delivery
- Subscription lifecycle status transitions
- Deletion warning notifications
- Tenant deletion execution
- File permanent deletion after retention period
- Low stock alert evaluation when not triggered synchronously
- Email and SMS provider delivery processing when asynchronous delivery is used

Background jobs MUST track:

- Job type
- Tenant when applicable
- Status: `Queued`, `Running`, `Succeeded`, `Failed`, or `Cancelled`
- Attempt count
- Last error
- Created timestamp
- Started timestamp
- Completed timestamp
- Correlation ID when available

Failed background jobs MUST be retried only when the operation is safe to retry.

Critical background job failures MUST generate internal platform admin alerts.

Tenant deletion, inventory posting, payment, refund, and receipt-generation jobs MUST be idempotent and MUST NOT duplicate irreversible side effects when retried.

---

# 35. Integrations

## 35.1 Required Integration Categories

The system MUST support integrations for:

- Email provider
- SMS gateway
- Cloud object storage
- Analytics
- Error monitoring

## 35.2 Email Provider

Email provider integration MUST support:

- Email verification
- Password reset
- Subscription warnings
- Customer reminders for eligible plans
- Export-ready notifications
- Operational notification emails for eligible plans

## 35.3 SMS Gateway

SMS gateway integration MUST support:

- Customer SMS reminders for High Plan tenants
- Delivery status tracking when provider supports it
- Failure logging

SMS MUST be blocked for Basic and Mid tenants unless platform admin grants explicit tenant override.

## 35.4 Cloud Storage

Cloud storage integration MUST support:

- Tenant-scoped file storage
- Private file access
- Time-limited signed URLs
- File soft deletion
- File permanent deletion after retention rules

## 35.5 Analytics

Analytics integration MUST support product and operational metrics without exposing sensitive customer data unnecessarily.

Analytics events MUST include tenant identifiers only when needed for SaaS operations and MUST avoid storing sensitive free-text notes.

## 35.6 Error Monitoring

Error monitoring integration MUST support:

- Frontend error capture.
- Backend exception capture.
- Background job failure capture.
- Correlation ID capture when available.
- Environment tagging.
- Release/version tagging.
- Alerting for critical production errors.

Error monitoring MUST NOT capture passwords, tokens, full payment card details, or unnecessary sensitive free-text customer/service notes.

## 35.7 Payment Gateway

The system MUST NOT integrate with payment gateways for automatic payment collection in this build scope.

Customer payments and supplier payments MUST be recorded manually.

---

# 36. System Settings

## 36.1 Tenant Settings

The system MUST support tenant settings for:

- Shop information
- Business hours
- Tax profile
- Tax mode
- VAT rate
- Receipt footer
- Reminder templates
- Notification preferences
- Low stock behavior
- Inventory adjustment approval threshold
- Default invoice due days
- Timezone
- Country
- Currency

## 36.2 Immutable Settings

The following settings MUST be immutable after onboarding or first use:

| Setting                          | Immutable Trigger                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Invoice prefix                   | After onboarding completion                                                                              |
| Country                          | After onboarding completion, unless changed by platform admin before first operational record is created |
| Currency                         | After the first invoice, payment, purchase, supplier payment, refund, or expense is created              |
| Tenant ID                        | Always immutable                                                                                         |
| First branch historical identity | Branch can be renamed but historical records keep branch ID                                              |
| Invoice number                   | After invoice creation                                                                                   |
| Receipt number                   | After receipt creation                                                                                   |

Tenant users MUST NOT change currency after financial records exist. Platform admins MAY correct currency before financial records exist, and the correction MUST be audit logged.

## 36.3 Default Invoice Due Days

The system MUST default invoice due date to:

```text
Invoice date + 7 days
```

Authorized users MAY change the tenant default due days.

Changing default due days MUST affect only newly created invoices.

## 36.4 Timezone Change Rules

Tenant timezone changes MUST:

- Require `settings.update` permission.
- Be audit logged.
- Affect future date calculations after the change.
- Preserve historical timestamps in UTC or the system's canonical timestamp storage.
- Preserve the original display timezone snapshot for issued financial documents when needed for legal or operational traceability.

The system MUST block tenant-user timezone changes while the tenant is in `read_only`, `suspended`, `pending_deletion`, or `deleted` status.

Platform admins MAY correct timezone configuration for support or operational recovery only through audited platform support or platform administration workflows.

Subscription lifecycle calculations MUST use the tenant timezone effective at the time the lifecycle evaluation runs. Timezone changes MUST NOT be used to bypass expired, suspended, pending-deletion, or deletion rules.

---

# 37. Acceptance Criteria

## 37.1 Tenant Isolation Acceptance Criteria

The system is acceptable only if:

- Users from one tenant cannot access another tenant's data.
- All tenant-owned records are scoped by `tenant_id`.
- Branch-specific records are scoped by both `tenant_id` and `branch_id`.
- File access enforces tenant isolation.
- Reports enforce tenant isolation.
- Exports enforce tenant isolation.

## 37.2 Branch Access Acceptance Criteria

The system is acceptable only if:

- Branch-scoped users can access only assigned branch operational records.
- Tenant-wide users can access all branch operational records within the tenant.
- Tenant-wide customer and motorcycle records are visible to authorized users, while linked branch histories remain branch-restricted.

## 37.3 Subscription Acceptance Criteria

The system is acceptable only if:

- Basic Plan tenants cannot create more than one active branch.
- Mid Plan tenants can create up to three active branches by default.
- High Plan tenants can create up to ten active branches by default.
- Plan overrides are enforced and audit logged.
- Disabled notification channels are blocked.
- Expiration lifecycle follows exact status and day rules.
- Read-only mode blocks all operational writes.
- Suspended tenants restrict access according to owner/export rules.
- Pending-setup tenants cannot access operational modules before onboarding completion.
- Owner signup is blocked unless default plan and default subscription duration are configured.
- Renewal requests do not restore access until platform admin confirmation.

## 37.4 Job Order Acceptance Criteria

The system is acceptable only if:

- Job orders start as `Pending`.
- Only allowed status transitions are accepted.
- Blocked transitions return clear errors.
- Job order parts reserve inventory automatically.
- Reserved parts are consumed only when job order becomes `Completed`.
- Released job orders cannot be modified or cancelled.
- Release with unpaid balance requires explicit permission and reason.
- Job order status corrections are audit logged.

## 37.5 Inventory Accuracy Acceptance Criteria

The system is acceptable only if:

- All stock changes generate inventory ledger entries.
- Available stock equals on-hand stock minus reserved stock.
- Normal transactions cannot create negative available stock.
- FIFO layers are created on receiving events.
- FIFO layers are consumed oldest-first.
- Transfer receiving moves FIFO cost layers to destination branch.
- Inventory adjustments require reasons and approvals when threshold is reached.
- Low stock alerts are branch-specific and resolve automatically.
- Inventory adjustment approvals do not affect stock until posting.
- FIFO reservation allocation prevents double-allocation under concurrent reservations.

## 37.6 Invoice and Payment Acceptance Criteria

The system is acceptable only if:

- Every issued invoice is linked to at least one job order.
- One invoice can support one or more job orders.
- One job order can support one or more invoices without overbilling line items.
- Partial payments are supported.
- Split payments are supported.
- Every payment generates exactly one immutable receipt.
- Paid invoices cannot be directly edited.
- Overdue status is computed from due date and remaining balance.
- Voids and refunds are audit logged.
- Refunds do not automatically restore inventory unless inventory reversal is explicitly selected.
- Paid invoices that are refunded with collection continuing recalculate back to `Pending`, `Partially Paid`, or `Overdue` instead of using `Refunded` status.
- Invoice billing allocations prevent overbilling across concurrent draft and issued invoices.
- Cancelled and voided invoice allocations are released for corrected invoicing.
- Invoice-level discounts are allocated across lines before tax calculation.
- Payment methods use defined enum values and do not store sensitive card data.

## 37.7 Tax Acceptance Criteria

The system is acceptable only if:

- VAT Registered tenants can use tax-inclusive or tax-exclusive invoices.
- Non-VAT and No Tax tenants use no-tax invoice behavior.
- VAT defaults to 12%.
- Tax is calculated per line and rounded to 2 decimals.
- Issued invoices retain the tax profile, tax mode, and VAT rate used at issuance.

## 37.8 Purchase and Accounts Payable Acceptance Criteria

The system is acceptable only if:

- Purchase receiving increases branch on-hand stock.
- Purchase receiving creates FIFO layers.
- Credit purchases increase supplier payable balance.
- Supplier payments reduce supplier payable balance.
- Purchase orders with received stock cannot be cancelled.
- Supplier balances are visible in AP reports.
- Supplier returns decrease branch on-hand stock and create supplier credits or reduce accounts payable according to payment status.
- Cash purchases do not create supplier accounts payable.
- Purchase order lines define ordered quantity, received quantity, unit cost, and receiving correction behavior.
- Supplier reactivation re-checks active supplier name uniqueness.
- Supplier, cash purchase, and supplier refund payment records use defined payment method enums.

## 37.9 Reminder and Notification Acceptance Criteria

The system is acceptable only if:

- Time-based reminders become due on or after due date.
- Mileage reminders become due when latest mileage reaches due mileage.
- Birthday reminders evaluate daily by tenant timezone.
- Customer email reminders are blocked for Basic Plan.
- Customer SMS reminders are blocked for Basic and Mid Plans.
- Notification delivery status is tracked.
- Failed reminder deliveries are visible to authorized users.
- External reminder delivery retries are capped and delivery attempts are recorded.

## 37.10 Offline Acceptance Criteria

The system is acceptable only if:

- PWA shell loads offline.
- Recently viewed records can be viewed from cache.
- Cached data is read-only.
- Offline transaction creation is blocked.
- Offline editing is blocked.
- Cache clears on logout.

## 37.11 Auditability Acceptance Criteria

The system is acceptable only if:

- Critical actions produce audit logs.
- Audit logs identify actor, action, entity, timestamp, and affected data where applicable.
- Corrective and destructive actions require reasons.
- Audit logs are immutable.
- Audit logs are retained for at least 3 years.
- Role, employee, supplier, customer, motorcycle, expense, and settings corrections are audit logged.

## 37.12 Data Export and Retention Acceptance Criteria

The system is acceptable only if:

- Shop Owners can export tenant data.
- Export is generated as ZIP with CSV, JSON, attachment manifest, audit export, and README.
- Cancelled or expired tenants can export data only during allowed lifecycle windows.
- Tenant data is permanently deleted after the deletion window.
- Deleted tenants do not regain old data when resubscribing.
- Full tenant exports include attachment files unless metadata-only export is explicitly selected.

## 37.13 Security Acceptance Criteria

The system is acceptable only if:

- HTTPS is enforced.
- Passwords are strongly hashed.
- Sensitive tokens are never logged.
- Rate limits are enforced for sensitive endpoints.
- Files are private and tenant-scoped.
- Platform support access is audit logged.
- Backups are encrypted and retained for at least 30 days.
- Critical write operations are atomic and idempotency-safe.

## 37.14 Financial Reporting Acceptance Criteria

The system is acceptable only if:

- Revenue reports exclude draft, cancelled, and voided invoices.
- Payment collection reports are based on payment records minus refund records.
- Cost of goods sold is recognized when job order inventory is consumed.
- Gross profit uses net service and parts revenue minus consumed inventory cost.
- Operating expense reports exclude voided expenses.
- AR and AP reports use current outstanding balances.
- Report date filters use tenant timezone unless explicitly stated otherwise.

---

# 38. Panel Review Resolution Appendix

This section records the build-readiness decisions resolved during the specialist panel review.

| Area                            | Final Resolution                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Subscription deletion           | `pending_deletion` runs from Day 61 through Day 67 after expiration; deletion job may run on Day 68 or later.                                          |
| Subscription status ownership   | Status is system-computed from expiration unless platform admin applies an audited override.                                                           |
| Signup default plan             | Owner signup requires a configured default plan from Basic, Mid, or High. No separate trial tier is included.                                          |
| Tax enums                       | APIs and database use snake_case enum values; UI may display human labels.                                                                             |
| Invoice branch scope            | Multi-job-order invoices are allowed only for job orders with the same tenant, customer, and branch.                                                   |
| Invoice lifecycle               | Invoice drafts are created from eligible job orders and receive immutable invoice numbers immediately.                                                 |
| Voiding paid invoices           | Voiding is blocked until all payments are refunded through refund records.                                                                             |
| Refund and AR behavior          | Refunded status is only for invoices fully refunded and closed with no further collection expected.                                                    |
| Supplier returns                | Supplier return workflow is required to reverse received supplier stock and update AP or supplier credits.                                             |
| Customer returns                | Standalone customer return workflow is excluded; returned service parts use refund or void inventory reversal.                                         |
| Transfer variance               | Missing transfer quantity is inventory variance loss, not AP, AR, revenue, or expense.                                                                 |
| FIFO reservations               | Reservations allocate FIFO layer quantities but consume FIFO only when the inventory event becomes final.                                              |
| Inventory adjustment threshold  | Approval threshold value is calculated from adjustment quantity and unit cost or FIFO-estimated cost before posting.                                   |
| Mechanic sessions               | A mechanic can have only one unfinished session at a time, whether active or paused.                                                                   |
| Audit retention                 | Audit logs have a minimum 3-year retention even after tenant operational deletion, with sensitive payloads excluded.                                   |
| Reminder aggregate status       | Reminder status is aggregate; channel delivery status is tracked per selected channel.                                                                 |
| Notification read/dismiss       | Read and dismissed statuses apply only to internal in-app notifications.                                                                               |
| Offline cache                   | Offline cache is read-only, minimum necessary, and cannot guarantee revocation until reconnect.                                                        |
| Branch deactivation             | Branch deactivation is blocked while stock, open operational work, active reservations, open purchases, or in-transit transfers remain.                |
| Supplier return permission      | Supplier returns are required and use dedicated `supplier_returns.create` permission.                                                                  |
| Cash purchases                  | Cash purchase receiving records payment details and does not create AP.                                                                                |
| Estimate expiration             | Estimates require a valid-until date before presentation and expire based on that date.                                                                |
| Paid-invoice refund state       | Paid invoices refunded with continued collection recalculate to pending, partially paid, or overdue.                                                   |
| Internal email reminders        | Internal email is an explicit reminder channel gated by plan email notification access.                                                                |
| Error monitoring                | Error monitoring is a required integration category with sensitive-data capture restrictions.                                                          |
| Country and currency settings   | Country and currency are controlled by immutability rules to protect validation, localization, and financial consistency.                              |
| Employee invitations            | Employee invitations are single-use, expire after 7 days, and must be tenant-scoped and audit logged.                                                  |
| Service/category deactivation   | Services, product categories, and expense categories are deactivated instead of hard deleted and remain in history.                                    |
| Numbering formats               | Estimate, purchase order, and transfer numbering formats are explicitly tenant-wide, daily-reset, and immutable.                                       |
| Job order line edits            | Job order lines are editable before completion only within reservation and billing safety rules; post-completion corrections use controlled workflows. |
| Invoice billing allocation      | Draft and issued invoices reserve/finalize job order line allocations to prevent concurrent overbilling.                                               |
| Supplier return valuation       | Supplier return financial value is based on original received cost when traceable, otherwise FIFO-consumed value with reason.                          |
| Inventory adjustment workflow   | Adjustments requiring approval remain non-posted until approved and posted in a transaction.                                                           |
| Full export attachments         | Full tenant exports include attachment files unless metadata-only export is selected.                                                                  |
| Transaction idempotency         | Critical write operations require atomic transactions and duplicate side-effect protection.                                                            |
| Background jobs                 | Background jobs must be retry-safe, observable, and idempotent for irreversible operations.                                                            |
| Pending setup access            | Pending setup allows only owner onboarding, profile setup, subscription information, password management, and logout.                                  |
| Subscription activation         | Owner signup requires default plan and default subscription duration; renewal restores access only after platform admin confirmation.                  |
| Role template behavior          | Seeded role templates belong to the tenant; Shop Owner role capabilities are protected from destructive edits.                                         |
| Employee reactivation           | Employee reactivation re-checks active role, active branch assignment, email uniqueness, and current access rules.                                     |
| Customer and motorcycle restore | Restoration workflows re-check active relationships and duplicate constraints before restoring records.                                                |
| Supplier reactivation           | Supplier reactivation re-checks active supplier name uniqueness and is audit logged.                                                                   |
| Payment method enums            | Customer, supplier, cash purchase, supplier refund, and expense payment methods use shared enum values.                                                |
| Discount allocation             | Invoice-level discounts are allocated proportionally across lines before tax calculation.                                                              |
| Financial report basis          | Revenue, collection, COGS, gross profit, AR, AP, expenses, and variance reports have explicit operational calculation rules.                           |
| Expense editing                 | Active expenses can be edited only with permission, reason, report recalculation, and audit logging.                                                   |
| Timezone changes                | Timezone changes affect future calculations, preserve historical timestamps, and cannot bypass subscription lifecycle rules.                           |

---

# 39. Final Product Decisions

| Area                              | Final Decision                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Platform                          | Mobile-first PWA                                                                                                |
| Business model                    | Multi-tenant SaaS subscription                                                                                  |
| Implementation mode               | Single build scope, no phases                                                                                   |
| Tenant structure                  | Tenant can have multiple branches based on plan                                                                 |
| Basic Plan                        | 1 active branch                                                                                                 |
| Mid Plan                          | 3 active branches by default                                                                                    |
| High Plan                         | 10 active branches by default                                                                                   |
| Plan overrides                    | Allowed only by platform admin and audit logged                                                                 |
| Subscription payment collection   | Manual outside system                                                                                           |
| Employee registration             | Created or invited by authorized tenant users; no public employee self-registration                             |
| Customer scope                    | Tenant-wide                                                                                                     |
| Motorcycle scope                  | Tenant-wide                                                                                                     |
| Motorcycle ownership history      | Not tracked                                                                                                     |
| Job order scope                   | One motorcycle, one customer, one branch per job order                                                          |
| Job order inventory reservation   | Created when parts are added                                                                                    |
| Job order inventory consumption   | On job order completion                                                                                         |
| Released job order                | Final and immutable                                                                                             |
| Release with balance              | Allowed only with explicit permission and reason                                                                |
| Estimate inventory effect         | No inventory reservation                                                                                        |
| Invoice scope                     | Service/job-order invoices only                                                                                 |
| Standalone retail POS             | Excluded                                                                                                        |
| Inventory tracking                | Ledger-based                                                                                                    |
| Product deactivation              | Blocked while on-hand stock, reservations, or open operational references exist                                 |
| Branch reactivation               | Enforced against active branch plan limits and audit logged                                                     |
| Service deactivation              | Blocked while referenced by open work or active pre-conversion estimates                                        |
| Category deactivation             | Categories are deactivated, not deleted, and remain available in historical reports                             |
| Inventory costing                 | FIFO                                                                                                            |
| FIFO transfer behavior            | Cost layers move to destination with original cost reference                                                    |
| Accounts receivable               | Required                                                                                                        |
| Accounts payable                  | Required                                                                                                        |
| Supplier payments                 | Manual recording only                                                                                           |
| Supplier returns                  | Required with dedicated permission and AP/supplier-credit handling                                              |
| Supplier return valuation         | Based on original received unit cost when traceable, otherwise FIFO-consumed cost                               |
| Cash purchases                    | Recorded as paid at receiving and excluded from AP                                                              |
| Partial payments                  | Required                                                                                                        |
| Split payments                    | Required                                                                                                        |
| Refunds                           | Partial and full refunds supported                                                                              |
| Invoice voiding                   | Required with reason and audit log                                                                              |
| Invoice editing after issuance    | Not allowed except draft editing before issuance                                                                |
| Invoice prefix                    | One-time setup during onboarding                                                                                |
| Invoice number                    | Generated at invoice creation and immutable                                                                     |
| Estimate number                   | Generated at estimate creation and immutable                                                                    |
| Purchase order number             | Generated at purchase order creation and immutable                                                              |
| Transfer number                   | Generated at transfer creation and immutable                                                                    |
| Receipt number                    | Generated per payment and immutable                                                                             |
| Tax profiles                      | VAT Registered, Non-VAT, No Tax                                                                                 |
| VAT rate                          | 12% default, copied to invoice at issuance                                                                      |
| Customer reminders                | Required, channel-gated by plan                                                                                 |
| Customer portal                   | Excluded                                                                                                        |
| Notification plan gating          | Required                                                                                                        |
| Offline mode                      | Shell and read-only cache only                                                                                  |
| Mechanic time tracking            | Required                                                                                                        |
| Multiple mechanics per job        | Supported                                                                                                       |
| Customer merge                    | Required                                                                                                        |
| Soft deletes                      | Required for operational records                                                                                |
| Data export                       | Required as ZIP                                                                                                 |
| Export attachments                | Included in full tenant export unless metadata-only export is selected                                          |
| Tenant deletion window            | Pending deletion begins Day 61 after expiration; permanent deletion job runs Day 68 or later if not renewed     |
| Report export                     | PDF, Excel, CSV                                                                                                 |
| Audit log retention               | Minimum 3 years                                                                                                 |
| Target scale                      | 500 shops and 10,000 users minimum                                                                              |
| Critical write safety             | Atomic and idempotency-safe for financial, inventory, billing, and deletion actions                             |
| Pending setup access              | Limited to onboarding, profile setup, subscription information, password management, and logout                 |
| Subscription activation           | Requires effective plan and expiration date; owner signup also requires configured default duration             |
| Subscription renewal              | External payment only; platform admin confirmation restores or extends access                                   |
| Role templates                    | Seeded tenant roles are editable with audit controls except protected Shop Owner capabilities                   |
| Employee reactivation             | Requires current valid role, branch access, email uniqueness, and audit log                                     |
| Supplier reactivation             | Requires active-name uniqueness check and audit log                                                             |
| Customer restoration              | Requires duplicate re-check and does not automatically restore linked records                                   |
| Motorcycle restoration            | Requires active linked customer and duplicate identifier re-check                                               |
| Payment method enums              | Shared enum values are used for customer, supplier, purchase, refund, and expense payment records               |
| Invoice-level discount allocation | Allocated across invoice lines before tax calculation                                                           |
| Financial reports                 | Operational reports with explicit revenue, collections, COGS, gross profit, AR, AP, expense, and variance rules |
| Timezone changes                  | Affect future calculations only and cannot bypass subscription lifecycle enforcement                            |
| Native mobile app                 | Excluded                                                                                                        |
| Full accounting                   | Excluded                                                                                                        |
| Payroll                           | Excluded                                                                                                        |
| Direct BIR filing                 | Excluded                                                                                                        |
| E-commerce marketplace            | Excluded                                                                                                        |

---

# 40. Build Readiness Checklist

The PRD is build-ready only when the implementation team can produce the following downstream artifacts directly from this document:

- Requirements matrix
- User stories
- Permission matrix
- Role template configuration matrix
- Entity relationship diagram
- Database schema
- API contracts
- Status transition diagrams
- Background job design
- Subscription lifecycle job design
- Transaction and idempotency design
- Notification delivery design
- Data export design
- Attachment export packaging design
- Financial report calculation specification
- Security test plan
- QA acceptance test cases
- Deployment and operations plan

This PRD intentionally defines business behavior, workflow boundaries, access rules, and acceptance criteria in enough detail to support those artifacts without requiring additional product interpretation.
