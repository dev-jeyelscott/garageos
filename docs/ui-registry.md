# GarageOS UI Registry

**Document:** `ui-registry.md`  
**Project:** GarageOS  
**Status:** Source-aligned frontend component and page-composition guidance  
**Primary Source:** `garageos-ui-inventory.md`  
**Supporting Sources:** `ux-sreen-map.md`, `requirements-v2.4.md`, `architecture.md`, `tech-stack.md`, `api-contracts.md`, `permission-matrix.md`, `user-stories.md`, `ui-tokens.md`

---

## 1. Purpose

This document defines the GarageOS frontend UI registry.

It guides frontend engineers when creating:

- Reusable components.
- Page shells.
- Module layouts.
- Workflow action patterns.
- List/detail/create/edit screens.
- Blocking states.
- Offline/read-only states.
- Permission-aware UI.
- Tenant lifecycle-aware UI.
- shadcn/ui-based implementations.

This registry does **not** introduce new product scope. Components must be used only to implement documented GarageOS pages, workflows, statuses, permissions, and API behavior.

---

## 2. Source Alignment

GarageOS UI must follow these documented rules:

1. GarageOS is a mobile-first PWA.
2. The frontend stack aligns with Next.js, React, TypeScript, Tailwind CSS, and shadcn/ui.
3. UI must respect tenant status, role permissions, branch access, plan limits, support-access context, and offline restrictions.
4. The backend API remains authoritative for authorization and business validation.
5. Workflow transitions must be explicit actions, not arbitrary status edits.
6. Offline mode is read-only only.
7. Issued financial records, receipts, refunds, inventory ledgers, FIFO records, and audit logs are immutable or correction-only where documented.
8. Component patterns must not imply excluded features such as native apps, offline writes, customer portal, standalone POS checkout, payroll, full accounting, automatic subscription payment collection, or 2FA.

---

## 3. Registry Structure

Every reusable UI component should be documented using this structure.

| Field                      |      Required | Description                                                          |
| -------------------------- | ------------: | -------------------------------------------------------------------- |
| Component name             |           Yes | Stable PascalCase name                                               |
| Category                   |           Yes | App shell, navigation, form, data display, feedback, workflow, state |
| Purpose                    |           Yes | What problem the component solves                                    |
| Source alignment           |           Yes | Which documented UI/API behavior it supports                         |
| Props/data contract        |           Yes | Required inputs and expected shape                                   |
| Permissions/guards         | If applicable | Tenant, permission, branch, plan, or offline conditions              |
| States                     |           Yes | Loading, empty, error, forbidden, offline, conflict, etc.            |
| shadcn/ui mapping          |           Yes | Underlying primitive(s)                                              |
| Accessibility requirements |           Yes | ARIA, focus, keyboard, contrast, labels                              |
| Mobile behavior            |           Yes | Mobile-first rendering and touch interactions                        |
| Desktop behavior           |  If different | Layout enhancement for larger screens                                |
| Anti-patterns              |           Yes | What not to use it for                                               |

### Component Status

| Status             | Meaning                               |
| ------------------ | ------------------------------------- |
| `foundation`       | Low-level shared primitive or wrapper |
| `pattern`          | Reusable composition pattern          |
| `module-component` | Domain-specific reusable component    |
| `page-scaffold`    | Full page layout pattern              |
| `deprecated`       | Do not use for new work               |

---

## 4. Page Layout Patterns

### 4.1 Auth Layout

**Use for:** Login, owner signup, email verification, forgot password, reset password, change password where unauthenticated or auth-focused.

| Region      | Content                                                  |
| ----------- | -------------------------------------------------------- |
| Brand panel | Logo, product name, short source-aligned message         |
| Form panel  | Auth form, validation summary, primary CTA               |
| Footer      | Support/legal text only if documented or already present |

Rules:

- Keep forms single-column.
- Use logo-inspired brand accent sparingly.
- Do not add marketing claims not found in source docs.
- Rate limit, invalid credentials, unverified email, expired token, and lockout states must render through form/alert states.

shadcn/ui mapping:

- `Card`.
- `Form`.
- `Input`.
- `Button`.
- `Alert`.
- `Separator`.

---

### 4.2 Tenant App Shell Layout

**Use for:** Authenticated tenant-user operational screens.

| Region             | Content                                                             |
| ------------------ | ------------------------------------------------------------------- |
| Top bar            | Page title, branch context, tenant status, notifications, user menu |
| Status banners     | Tenant status, offline, support-access marker if applicable         |
| Main content       | Page-specific layout                                                |
| Bottom navigation  | Dashboard, Job Orders, Customers, Inventory, More                   |
| Sticky action area | Mobile primary action where applicable                              |

Rules:

- Always resolve session context before rendering protected navigation.
- Show branch context on branch-scoped screens.
- Hide or disable inaccessible actions based on effective permissions, but backend remains authoritative.
- Show offline indicator when offline and disable writes.
- Show tenant lifecycle banners before page-specific content where blocking applies.

shadcn/ui mapping:

- `Sheet`.
- `DropdownMenu`.
- `Button`.
- `Badge`.
- `Alert`.
- `Separator`.
- `ScrollArea`.

---

### 4.3 Platform Admin Shell Layout

**Use for:** Platform tenant management, plans, support access, exports, deletion jobs, platform audit logs.

| Region          | Content                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| Top bar         | Platform context, admin user menu                                           |
| Side/mobile nav | Tenants, Plans, Support Access, Exports, Deletion Jobs, Platform Audit Logs |
| Main content    | Platform list/detail/action views                                           |
| Support marker  | Required when viewing tenant data through support access                    |

Rules:

- Platform admin UI must not silently impersonate tenant users.
- Support access must be visibly marked.
- Support access mode, actor, tenant, reason, and expiry must be visible where applicable.
- Tenant data access must be audited by backend behavior.

shadcn/ui mapping:

- `NavigationMenu` or custom responsive sidebar.
- `Sheet`.
- `Badge`.
- `Alert`.
- `Table`.
- `Card`.

---

### 4.4 List Page Layout

**Use for:** Customers, motorcycles, job orders, invoices, payments, products, suppliers, purchases, reports, audit logs, background jobs.

| Region         | Content                                                     |
| -------------- | ----------------------------------------------------------- |
| Header         | Title, description, primary action                          |
| Filters        | Search, branch, status, date range, module-specific filters |
| Summary        | Optional metric cards when documented                       |
| Results        | Table on desktop, cards/list rows on mobile                 |
| Pagination     | Cursor-based where API supports high-volume lists           |
| Empty state    | Source-aligned empty message and allowed action             |
| Blocked states | Permission, branch, subscription, plan, offline             |

Rules:

- Search/filter controls must map to documented API query behavior.
- Do not add filters that have no API/source support.
- Mobile list rows must expose primary identifier, status, key metadata, and row action menu.
- Desktop tables should use numeric alignment and tabular numbers for money/quantity.
- Use loading skeletons for initial data loads.

shadcn/ui mapping:

- `Input`.
- `Select`.
- `Popover`.
- `Command`.
- `Button`.
- `Table`.
- `Card`.
- `Badge`.
- `DropdownMenu`.
- `Skeleton`.

---

### 4.5 Detail Page Layout

**Use for:** Customer detail, motorcycle detail, job order detail, estimate detail, invoice detail, product detail, purchase detail, supplier detail, background job detail.

| Region                     | Content                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Header                     | Record title, status badge, key actions                                            |
| Summary card               | Main identifiers and key fields                                                    |
| Tabs/sections              | Details, history, related records, attachments, audit where applicable             |
| Workflow panel             | Available explicit actions                                                         |
| Immutable/read-only notice | Where record is final, ledger-backed, receipt, audit, read-only tenant, or offline |
| Related records            | Source-aligned linked data only                                                    |

Rules:

- Do not allow arbitrary status editing.
- Use explicit workflow action components for transitions.
- Show status history where documented.
- Show audit panel for critical records where documented.
- Disable writes when tenant is read-only, suspended, pending deletion, deleted, or offline.
- Show branch context for branch-specific records.

shadcn/ui mapping:

- `Card`.
- `Badge`.
- `Tabs`.
- `Table`.
- `Button`.
- `DropdownMenu`.
- `Alert`.
- `Sheet`.
- `Separator`.

---

### 4.6 Create/Edit Form Layout

**Use for:** Documented create/edit screens.

| Region               | Content                                     |
| -------------------- | ------------------------------------------- |
| Header               | Page title, back/cancel                     |
| Form sections        | Grouped fields                              |
| Validation summary   | API and client validation                   |
| Sticky action footer | Save/create/cancel                          |
| Help text            | Only source-aligned implementation guidance |

Rules:

- Use documented fields only.
- Preserve values after validation failure.
- Include `lock_version` handling for mutable updates where applicable.
- Critical writes must support idempotent submit behavior when required by API contracts.
- Do not allow offline submit.
- Do not allow submit when tenant status blocks writes.
- Do not allow submit when permission or branch access is missing.

shadcn/ui mapping:

- `Form`.
- `Input`.
- `Textarea`.
- `Select`.
- `Checkbox`.
- `RadioGroup`.
- `Switch`.
- `Button`.
- `Alert`.
- `Card`.

---

### 4.7 Workflow Action Layout

**Use for:** Estimate approval, job status transitions, inventory reservations, adjustment approval/posting, transfer send/receive, invoice issue/void, payment record, refund submit, supplier return post, export trigger.

| Region              | Content                                                           |
| ------------------- | ----------------------------------------------------------------- |
| Action title        | Explicit workflow action                                          |
| Impact summary      | What will change                                                  |
| Required fields     | Reason, dates, quantities, amount, method, notes where documented |
| Validation blockers | Business rules and API errors                                     |
| Confirmation        | Required for high-risk actions                                    |
| Submit footer       | Primary action, cancel                                            |

Rules:

- Never implement workflow status changes as freeform status dropdown edits unless documentation explicitly allows it.
- Show reason fields for corrective or audited actions where required.
- Show idempotency/conflict recovery.
- Show optimistic locking conflict recovery.
- Use destructive styling for void, refund, cancel, reject, delete, suspend, or destructive actions.
- For inventory/financial workflows, do not show fake optimistic success before server confirmation.

shadcn/ui mapping:

- `Dialog`.
- `AlertDialog`.
- `Sheet`.
- `Form`.
- `Alert`.
- `Button`.
- `Badge`.

---

## 5. App Shell Components

### 5.1 AuthGate

| Field           | Guidance                                                             |
| --------------- | -------------------------------------------------------------------- |
| Category        | App shell                                                            |
| Purpose         | Protect authenticated app routes                                     |
| Required inputs | Session loading state, user, tenant, permissions, branches           |
| States          | Loading, unauthenticated, unverified email, tenant blocked           |
| shadcn/ui       | `Skeleton`, `Alert`, `Button`                                        |
| Rules           | Must not expose protected screen data before auth/session resolution |

---

### 5.2 TenantStatusBanner

| Field     | Guidance                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------- |
| Category  | Feedback/app shell                                                                                 |
| Purpose   | Display tenant lifecycle warnings and blockers                                                     |
| Inputs    | `tenant.status`, subscription/expiration metadata where available                                  |
| States    | `pending_setup`, `active`, `grace_period`, `read_only`, `suspended`, `pending_deletion`, `deleted` |
| shadcn/ui | `Alert`, `Badge`, `Button`                                                                         |
| Rules     | Must appear before operational content when status affects access                                  |

---

### 5.3 BranchContextIndicator

| Field     | Guidance                                             |
| --------- | ---------------------------------------------------- |
| Category  | App shell/navigation                                 |
| Purpose   | Show active branch context for branch-scoped screens |
| Inputs    | Active branch, branch list, tenant-wide access flag  |
| States    | Single branch, multi-branch, branch denied           |
| shadcn/ui | `Badge`, `Select`, `Popover`, `Command`              |
| Rules     | Must not allow unauthorized branch switching         |

---

### 5.4 PermissionAwareNavigation

| Field     | Guidance                                                                     |
| --------- | ---------------------------------------------------------------------------- |
| Category  | Navigation                                                                   |
| Purpose   | Render accessible nav groups based on effective permissions and tenant state |
| Inputs    | Session permissions, tenant status, plan capabilities, role context          |
| States    | Normal, hidden item, disabled item with reason                               |
| shadcn/ui | `NavigationMenu`, `Sheet`, `Button`, `Tooltip`                               |
| Rules     | UI filtering is not authorization; backend remains authoritative             |

---

### 5.5 OfflineIndicator

| Field     | Guidance                                                                        |
| --------- | ------------------------------------------------------------------------------- |
| Category  | App shell/feedback                                                              |
| Purpose   | Communicate read-only offline mode                                              |
| Inputs    | Browser network status and PWA cache state                                      |
| States    | Online, offline, reconnecting                                                   |
| shadcn/ui | `Alert`, `Badge`, `Toast`                                                       |
| Rules     | Offline mode blocks all writes, approvals, uploads, payments, and sync behavior |

---

### 5.6 SupportAccessMarker

| Field     | Guidance                                                    |
| --------- | ----------------------------------------------------------- |
| Category  | App shell/security                                          |
| Purpose   | Visibly mark platform support access sessions               |
| Inputs    | Platform actor, tenant, mode, reason, expiry                |
| States    | Read-only support, write-allowed support                    |
| shadcn/ui | `Alert`, `Badge`, `Tooltip`                                 |
| Rules     | Must be persistent and unmistakable during support sessions |

---

### 5.7 UserMenu

| Field     | Guidance                                                              |
| --------- | --------------------------------------------------------------------- |
| Category  | Navigation/account                                                    |
| Purpose   | User account actions                                                  |
| Inputs    | User identity, role, tenant/platform context                          |
| Actions   | Change password, logout, logout all, theme selection                  |
| shadcn/ui | `DropdownMenu`, `Button`, `Avatar`                                    |
| Rules     | Logout and password management must remain available where documented |

---

## 6. Navigation Components

### Registered Components

| Component          | Purpose                                    | shadcn/ui Mapping                     |
| ------------------ | ------------------------------------------ | ------------------------------------- |
| `MobileBottomNav`  | High-frequency tenant navigation           | `Button`, custom nav                  |
| `MoreMenu`         | Secondary/admin module access              | `Sheet`, `Button`, `ScrollArea`       |
| `DesktopSidebar`   | Desktop app navigation                     | `ScrollArea`, `Separator`, custom nav |
| `Breadcrumbs`      | Detail/edit route context                  | Custom, `Button`/link                 |
| `PageHeader`       | Title, description, status, primary action | `Badge`, `Button`                     |
| `PrimaryActionBar` | Sticky mobile action footer                | `Button`, `Separator`                 |
| `BranchSelector`   | Branch context switching                   | `Popover`, `Command`, `Select`        |
| `ModuleTabs`       | Detail-page sections                       | `Tabs`                                |
| `ActionMenu`       | Row/detail secondary actions               | `DropdownMenu`                        |

### Navigation Rules

- Bottom navigation is reserved for high-frequency tenant workflows.
- More menu contains secondary modules such as invoices, payments, purchases, suppliers, reports, reminders, employees, settings, audit logs, and exports.
- Platform admin navigation is separate from tenant navigation.
- Do not expose platform permissions to tenant roles.
- Navigation must respond to tenant status, permission, branch, plan, and offline state.

---

## 7. Data Display Components

### Registered Components

| Component              | Purpose                               | shadcn/ui Mapping                   |
| ---------------------- | ------------------------------------- | ----------------------------------- |
| `StatusBadge`          | Show documented enum/status values    | `Badge`                             |
| `TenantStatusBadge`    | Tenant lifecycle status               | `Badge`                             |
| `WorkflowTimeline`     | Status history with actor/time/reason | `Card`, `Separator`                 |
| `AuditPanel`           | Sanitized audit record display        | `Card`, `Table`                     |
| `DataTable`            | Desktop list/table display            | `Table`                             |
| `MobileRecordList`     | Mobile list/card display              | `Card`, `Badge`                     |
| `MetricCard`           | Dashboard/report summary metric       | `Card`                              |
| `MoneyValue`           | Currency display                      | Custom text with tabular numbers    |
| `QuantityValue`        | Quantity display                      | Custom text with tabular numbers    |
| `DateTimeValue`        | Timestamp display                     | Custom text                         |
| `DocumentNumber`       | Invoice/receipt/job/order numbers     | Custom text with mono/tabular style |
| `ReadOnlyRecordNotice` | Immutable/correction-only notice      | `Alert`                             |
| `AttachmentList`       | Linked files where documented         | `Card`, `Button`                    |
| `AsyncJobStatusCard`   | Export/report/background job status   | `Card`, `Badge`, `Alert`            |

### Data Display Rules

- Use documented enum values.
- Do not create display-only statuses that can be confused with persisted workflow states.
- Use tabular numbers for money, quantities, dates, and document numbers.
- Use safe summaries for background job errors.
- Do not display sensitive tokens, provider secrets, passwords, or unsafe payload data.
- For unauthorized resources, show blocked state without leaking record existence.

---

## 8. Form Components

### Registered Components

| Component          | Purpose                        | shadcn/ui Mapping                  |
| ------------------ | ------------------------------ | ---------------------------------- |
| `FormSection`      | Group related fields           | `Card`, `Form`                     |
| `TextField`        | Text input                     | `Input`, `FormField`               |
| `TextareaField`    | Long text                      | `Textarea`, `FormField`            |
| `SelectField`      | Controlled options             | `Select`, `FormField`              |
| `ComboboxField`    | Search/select resource         | `Popover`, `Command`, `FormField`  |
| `DateField`        | Business date selection        | `Popover`, `Calendar`, `FormField` |
| `MoneyField`       | Fixed-precision money input    | `Input`, `FormField`               |
| `QuantityField`    | Fixed-precision quantity input | `Input`, `FormField`               |
| `CheckboxField`    | Boolean input                  | `Checkbox`, `FormField`            |
| `RadioGroupField`  | Option selection               | `RadioGroup`, `FormField`          |
| `SwitchField`      | Settings toggle                | `Switch`, `FormField`              |
| `PasswordField`    | Password input with rules      | `Input`, `FormField`               |
| `SubmitButton`     | Safe submit action             | `Button`                           |
| `FormErrorSummary` | API/client validation summary  | `Alert`                            |

### Form Rules

- Use documented fields only.
- Use API schema/DTO types where available.
- Use `snake_case` mapping at API boundaries.
- Preserve form input on validation failure.
- Show field-level errors for `validation_failed`.
- Show conflict recovery for `version_conflict`.
- Disable submit during in-flight request.
- Prevent duplicate submit for critical writes.
- Do not submit operational writes offline.
- Do not submit operational writes when tenant status blocks writes.
- Do not submit actions without required permission/branch access.

---

## 9. Feedback Components

### Registered Components

| Component                  | Purpose                              | shadcn/ui Mapping         |
| -------------------------- | ------------------------------------ | ------------------------- |
| `InlineAlert`              | Contextual info/warning/error        | `Alert`                   |
| `ToastMessage`             | Non-blocking feedback                | `Toast` or `Sonner`       |
| `LoadingState`             | Page or section loading              | `Skeleton`                |
| `EmptyState`               | No data state                        | `Card`, `Button`          |
| `ValidationErrorState`     | Field/object validation errors       | `Alert`, `FormMessage`    |
| `ForbiddenState`           | Missing permission                   | `Alert`, `Button`         |
| `BranchDeniedState`        | Branch access denied                 | `Alert`                   |
| `PlanLimitState`           | Plan limit exceeded                  | `Alert`, `Button`         |
| `SubscriptionBlockedState` | Tenant lifecycle block               | `Alert`, `Button`         |
| `OfflineReadOnlyState`     | Offline write blocked                | `Alert`                   |
| `ConflictState`            | Optimistic lock/idempotency conflict | `Alert`, `Button`         |
| `NotFoundState`            | Not visible or missing resource      | `Alert`                   |
| `ErrorBoundaryState`       | Unexpected client error              | Custom boundary + `Alert` |

### Feedback Rules

- Blocking errors must not be toast-only.
- API error codes should map to stable UI states.
- Safe correlation/request ID may be shown for support diagnostics.
- Do not leak unauthorized data in forbidden or not-found states.
- Offline write attempt must clearly explain that offline mode is read-only and requires reconnecting.

---

## 10. Workflow and Action Components

### Registered Components

| Component                 | Purpose                                | shadcn/ui Mapping         |
| ------------------------- | -------------------------------------- | ------------------------- |
| `WorkflowActionDialog`    | Short workflow action confirmation     | `Dialog`, `Form`, `Alert` |
| `WorkflowActionSheet`     | Mobile or longer workflow action       | `Sheet`, `Form`, `Alert`  |
| `DestructiveActionDialog` | Delete/cancel/void/reject confirmation | `AlertDialog`             |
| `ReasonField`             | Required reason capture                | `Textarea`, `FormField`   |
| `ImpactSummary`           | Show effects before submit             | `Card`, `Table`           |
| `IdempotentSubmitButton`  | Critical write submit                  | `Button`                  |
| `VersionConflictResolver` | Reload/retry guidance                  | `Alert`, `Button`         |
| `ReadOnlyActionBlocker`   | Explain disabled write action          | `Alert`, `Tooltip`        |
| `PermissionActionBlocker` | Explain missing permission             | `Alert`, `Tooltip`        |
| `OfflineActionBlocker`    | Explain offline write block            | `Alert`, `Tooltip`        |

### Workflow Rules

- Workflow actions must align with documented API action endpoints.
- Actions must not mutate status directly unless the API explicitly supports that command.
- Critical writes must be idempotency-aware.
- Mutable updates must be optimistic-lock-aware when `lock_version` applies.
- Corrective actions must show impact summary and reason fields where documented.
- Inventory and financial workflow actions must wait for confirmed server success before showing final success.
- Destructive/corrective actions must use clear confirmation language and destructive styling.

---

## 11. Required State Patterns

Every applicable page must account for these states.

### 11.1 Empty State

Use when a list has no data after a successful request.

Required content:

- Clear title.
- Plain explanation.
- Primary action only if user has permission, tenant status allows writes, branch access exists, plan allows it, and app is online.
- No undocumented onboarding tips.

### 11.2 Loading State

Use when data is loading.

Required content:

- Skeleton that resembles final layout.
- Avoid layout shift.
- Keep shell visible where session permits.
- For blocking auth/session load, use full-page loading state.

### 11.3 Validation Error State

Use for API `validation_failed`.

Required content:

- Field-level messages where possible.
- Summary message for object-level validation.
- Preserve user input.
- Keep submit disabled only while request is in flight, not after fixable validation.

### 11.4 Conflict State

Use for `version_conflict` or `idempotency_conflict`.

Required content:

- Explain that the record/action changed or duplicate retry conflicted.
- Provide reload/retry action.
- Do not discard user input without warning.
- Do not imply the operation succeeded unless API confirms success.

### 11.5 Offline State

Use when offline.

Required content:

- Visible offline indicator.
- Read-only explanation.
- Disabled create/edit/delete/approve/upload/payment/inventory actions.
- Recovery prompt to reconnect.
- Recently viewed read-only records may remain visible if cached.

### 11.6 Permission-Blocked State

Use for `forbidden`.

Required content:

- Safe missing-permission explanation.
- No sensitive data.
- No confirmation that a hidden record exists when not allowed.
- Optional instruction to contact shop owner/manager if appropriate and source-aligned.

### 11.7 Branch-Blocked State

Use for `branch_access_denied`.

Required content:

- Explain that the selected branch or record is outside assigned access.
- Offer branch switch only to authorized branches.
- Do not expose branch data beyond safe labels already available in session.

### 11.8 Tenant-Status-Blocked State

Use for `subscription_access_blocked` or tenant lifecycle blocks.

Required content by status:

| Tenant Status      | Required UI State                                     |
| ------------------ | ----------------------------------------------------- |
| `pending_setup`    | Onboarding/setup gate                                 |
| `grace_period`     | Renewal warning with full permission-based operations |
| `read_only`        | Read-only banner; writes disabled; renewal prompt     |
| `suspended`        | Suspended screen; owner renewal/export only           |
| `pending_deletion` | Pending deletion message; operational access blocked  |
| `deleted`          | Tenant unavailable/account inactive                   |

### 11.9 Plan-Limit State

Use for `plan_limit_exceeded`.

Required content:

- Current limit.
- Blocked capability.
- Required plan or upgrade instruction where documented.
- No automatic payment collection UI.

### 11.10 Read-Only Record State

Use for immutable or correction-only records.

Required content:

- Explanation that record is immutable or correction-only.
- Hide edit controls.
- Show documented corrective actions only if allowed.
- Preserve audit/history visibility where documented.

---

## 12. shadcn/ui Component Mapping

| GarageOS Need                         | Recommended shadcn/ui Primitive      |
| ------------------------------------- | ------------------------------------ |
| Primary/secondary/destructive actions | `Button`                             |
| Cards and panels                      | `Card`                               |
| Forms                                 | `Form`, `Input`, `Textarea`, `Label` |
| Selects                               | `Select`                             |
| Searchable selects                    | `Popover`, `Command`                 |
| Checkboxes                            | `Checkbox`                           |
| Radio options                         | `RadioGroup`                         |
| Toggles                               | `Switch`                             |
| Dialogs                               | `Dialog`                             |
| Destructive confirmation              | `AlertDialog`                        |
| Mobile drawer / side panel            | `Sheet` or `Drawer`                  |
| Alerts and banners                    | `Alert`                              |
| Badges/status chips                   | `Badge`                              |
| Tabs/detail sections                  | `Tabs`                               |
| Tables                                | `Table`                              |
| Menus                                 | `DropdownMenu`                       |
| Tooltips                              | `Tooltip`                            |
| Loading states                        | `Skeleton`                           |
| Toasts                                | `Toast` or `Sonner`                  |
| Calendar/date picker                  | `Calendar`, `Popover`                |
| Separators                            | `Separator`                          |
| Scroll areas                          | `ScrollArea`                         |
| Accordion disclosure                  | `Accordion`                          |
| Avatar/user menu                      | `Avatar`, `DropdownMenu`             |

### Mapping Rules

- Wrap shadcn primitives with GarageOS components only when the wrapper adds consistent source-aligned behavior.
- Do not wrap primitives just to rename them.
- Keep variant names aligned with `ui-tokens.md`.
- Keep component APIs typed with TypeScript.
- Keep accessibility behavior from primitives intact.

---

## 13. Module Component Registry

### 13.1 Authentication

| Component                 | Purpose                            |
| ------------------------- | ---------------------------------- |
| `AuthCard`                | Shared auth form panel             |
| `PasswordPolicyHint`      | Password rules display             |
| `EmailVerificationNotice` | Verification required/resend state |
| `SessionSummaryPanel`     | Current session display            |
| `LogoutConfirmDialog`     | Logout/logout-all confirmation     |

Rules:

- Do not add 2FA components.
- Do not expose token values.
- Do not disclose whether an account exists during password reset beyond documented safe behavior.

---

### 13.2 Onboarding and Settings

| Component              | Purpose                     |
| ---------------------- | --------------------------- |
| `OnboardingChecklist`  | Setup progress and blockers |
| `ShopProfileForm`      | Shop profile fields         |
| `TaxLocalizationForm`  | Tax/localization fields     |
| `InvoicePrefixForm`    | Invoice prefix setup        |
| `FirstBranchForm`      | First branch setup          |
| `SubscriptionInfoCard` | Plan/subscription display   |
| `SettingsSectionCard`  | Reusable settings section   |

Rules:

- Pending setup users see setup-only UX.
- Operational navigation remains blocked until onboarding completion.
- Do not add automatic subscription payment UI.

---

### 13.3 Dashboard

| Component               | Purpose                             |
| ----------------------- | ----------------------------------- |
| `DashboardMetricGrid`   | Summary metrics                     |
| `RevenueChartCard`      | Revenue chart where API supports it |
| `InventoryAlertList`    | Low-stock/stock alert display       |
| `RenewalWarningPanel`   | Tenant lifecycle renewal warning    |
| `DashboardShortcutGrid` | Role-aware shortcuts                |

Rules:

- Dashboard widgets must map to documented report/dashboard APIs.
- Plan-limited report widgets must render plan-limit state.

---

### 13.4 Customers and Motorcycles

| Component                      | Purpose                                   |
| ------------------------------ | ----------------------------------------- |
| `CustomerSearchBox`            | Customer lookup                           |
| `CustomerSummaryCard`          | Customer list/detail summary              |
| `CustomerHistoryTimeline`      | Customer activity/service history         |
| `MotorcycleSummaryCard`        | Motorcycle list/detail summary            |
| `MotorcycleServiceHistoryList` | Linked service history                    |
| `MergeCustomerDialog`          | Merge flow where documented               |
| `RestoreRecordBanner`          | Soft-deleted restore prompt where allowed |

Rules:

- Customer records are tenant-wide.
- Motorcycle records link to one active customer at a time.
- Do not add customer portal/login UX.

---

### 13.5 Service, Estimates, and Job Orders

| Component                 | Purpose                              |
| ------------------------- | ------------------------------------ |
| `ServiceCatalogPicker`    | Select documented services           |
| `EstimateLineEditor`      | Estimate line editing                |
| `EstimateApprovalDialog`  | Explicit approval workflow           |
| `JobOrderStatusBadge`     | Job order status display             |
| `JobOrderLineEditor`      | Service/labor/part lines             |
| `JobOrderWorkflowActions` | Allowed job transitions              |
| `MechanicAssignmentPanel` | Mechanic assignment                  |
| `MechanicWorkSessionCard` | Active/paused/finished work sessions |
| `JobPartReservationPanel` | Part reservation workflow            |
| `ServiceHistoryTimeline`  | Motorcycle/job service timeline      |

Rules:

- Status changes use workflow actions.
- Mechanics see assigned work-session-oriented UI.
- Strong validation is required before inventory reservation, job order completion, and job line actions.

---

### 13.6 Inventory and Products

| Component                  | Purpose                         |
| -------------------------- | ------------------------------- |
| `ProductSearchBox`         | Product lookup                  |
| `ProductSummaryCard`       | Product list/detail summary     |
| `StockBalanceTable`        | Branch stock balances           |
| `FifoLayerTable`           | FIFO layer visibility           |
| `InventoryLedgerTable`     | Immutable ledger entries        |
| `LowStockAlertCard`        | Low-stock notice                |
| `InventoryAdjustmentForm`  | Draft/request adjustment        |
| `AdjustmentApprovalDialog` | Approval/rejection              |
| `TransferSummaryCard`      | Transfer list/detail            |
| `TransferReceiveDialog`    | Receive transfer workflow       |
| `StockMovementBadge`       | Ledger transaction type display |

Rules:

- Stock-changing operations must use documented ledger/FIFO workflows.
- Do not provide direct quantity edit components.
- Inventory ledgers are immutable views.
- Strong validation is required before transfer receive, adjustment post, reservation, and supplier return workflows.

---

### 13.7 Suppliers and Purchases

| Component                 | Purpose                              |
| ------------------------- | ------------------------------------ |
| `SupplierSummaryCard`     | Supplier list/detail                 |
| `PurchaseOrderLineEditor` | Purchase lines                       |
| `PurchaseReceivingForm`   | Receive stock workflow               |
| `PurchaseStatusBadge`     | Purchase status                      |
| `SupplierReturnForm`      | Supplier return workflow             |
| `AccountsPayableSummary`  | Supplier/AP summary where documented |

Rules:

- Posted receiving details must communicate immutability where applicable.
- Payment terms and supplier balances must follow documented API/schema behavior.
- Do not add full accounting/general-ledger UX.

---

### 13.8 Invoices, Payments, Receipts, Refunds

| Component                   | Purpose                         |
| --------------------------- | ------------------------------- |
| `InvoiceSummaryCard`        | Invoice balance/status summary  |
| `InvoiceLineTable`          | Service/labor/part/custom lines |
| `InvoiceIssueDialog`        | Issue invoice workflow          |
| `PaymentRecordForm`         | Record payment                  |
| `ReceiptViewer`             | Immutable receipt view          |
| `RefundSubmitDialog`        | Refund workflow                 |
| `VoidActionDialog`          | Void workflow where documented  |
| `AccountsReceivableSummary` | AR display where documented     |
| `PaymentMethodBadge`        | Payment method display          |

Rules:

- Receipts are immutable.
- Payment creates exactly one receipt.
- Overpayment and overbilling blockers must be shown clearly.
- Refunds and voids must use corrective workflows.
- Do not add payment-gateway charging or automatic subscription collection UI.

---

### 13.9 Reports, Exports, Jobs, Audit

| Component                  | Purpose                           |
| -------------------------- | --------------------------------- |
| `ReportFilterDrawer`       | Mobile report filters             |
| `ReportSummaryCards`       | Report metrics                    |
| `ReportTable`              | Report details                    |
| `ExportActionButton`       | Trigger async export              |
| `ExportJobStatusCard`      | Export/job status                 |
| `BackgroundJobTable`       | Background job list               |
| `BackgroundJobDetailPanel` | Job attempts/status/error summary |
| `AuditLogTable`            | Audit log list                    |
| `AuditLogDetailPanel`      | Sanitized audit details           |

Rules:

- Large exports/reports may be asynchronous.
- Safe error summaries and correlation IDs may be shown.
- Do not expose sensitive provider payloads or secrets.
- Audit data must remain sanitized.

---

### 13.10 Offline and Notifications

| Component                     | Purpose                         |
| ----------------------------- | ------------------------------- |
| `OfflineShellNotice`          | App shell offline state         |
| `OfflineRecentRecordsList`    | Read-only cached recent records |
| `OfflineBlockedActionMessage` | Offline write blocker           |
| `NotificationIndicator`       | Notification entry in shell     |
| `NotificationList`            | Notification center             |
| `NotificationDetailPanel`     | Notification detail             |
| `NotificationStatusBadge`     | Delivery/read/dismissed state   |

Rules:

- Offline records are read-only.
- Offline writes, approvals, uploads, payments, and inventory actions are blocked.
- Clear user-scoped cache on logout/session invalidation where implemented.
- Notification UI must follow documented delivery/status behavior.

---

## 14. Mobile-First Layout Guidance

### Mobile Rules

- Start page designs at 360px width.
- Use single-column content by default.
- Use sticky bottom action footer for long forms and workflows.
- Use bottom navigation for high-frequency tenant operations.
- Use sheets/drawers for filters and secondary panels.
- Collapse tables into cards when horizontal density is too high.
- Keep tenant, branch, offline, and support-access context visible.
- Avoid hover-only interactions.
- Use large touch targets.
- Keep action menus reachable with one thumb where practical.

### Tablet/Desktop Enhancements

- Add side navigation or persistent secondary navigation where useful.
- Use two-column detail layouts.
- Show tables and charts side by side when space allows.
- Use side sheets for detail previews.
- Keep mobile and desktop behavior backed by the same components and state logic.

---

## 15. Page Creation Checklist

Before creating or modifying a GarageOS page, confirm:

### Source and Scope

- [ ] The page exists in `garageos-ui-inventory.md` or is directly derived from documented source scope.
- [ ] The page does not introduce excluded functionality.
- [ ] The route aligns with documented route groups or approved frontend routing ADR.
- [ ] The page maps to documented API endpoints or known contract placeholders.
- [ ] The page uses documented roles and permissions only.

### Access and Guards

- [ ] Authenticated session behavior is defined.
- [ ] Email verification behavior is defined where applicable.
- [ ] Tenant status behavior is defined.
- [ ] Permission behavior is defined.
- [ ] Branch access behavior is defined for branch-scoped data.
- [ ] Plan limit behavior is defined where applicable.
- [ ] Offline behavior is defined.
- [ ] Support-access behavior is defined where applicable.

### Data and API

- [ ] API request/response envelope is handled.
- [ ] API error envelope is handled.
- [ ] `validation_failed` maps to fields.
- [ ] `forbidden`, `branch_access_denied`, `subscription_access_blocked`, and `plan_limit_exceeded` are handled.
- [ ] `version_conflict` is handled for mutable updates where applicable.
- [ ] `idempotency_conflict` is handled for critical writes where applicable.
- [ ] Loading, empty, success, and error states are present.

### UI Composition

- [ ] Page uses registered layout pattern.
- [ ] Page uses registered components where available.
- [ ] Page uses `ui-tokens.md` semantic tokens.
- [ ] Page uses shadcn/ui primitives consistently.
- [ ] Mobile layout is designed first.
- [ ] Dark mode and system theme are supported.
- [ ] Accessible labels and focus states are present.
- [ ] Table/card responsive behavior is defined.

### Workflow Safety

- [ ] Workflow status changes use explicit actions.
- [ ] Destructive/corrective actions use confirmation.
- [ ] Reason fields are present where documented.
- [ ] Financial/inventory finality is clearly communicated.
- [ ] Read-only/immutable records do not expose edit actions.
- [ ] Offline/read-only tenant states block writes.

### Testing

- [ ] Unit/component tests cover component states where applicable.
- [ ] E2E tests cover mobile viewport.
- [ ] Blocked path tests cover permission, branch, tenant status, plan, and offline cases.
- [ ] Critical workflow tests cover validation, conflict, and retry behavior.
- [ ] Accessibility checks are included where practical.

---

## 16. Rules for Avoiding Undocumented Behavior

Do **not** add UI for:

- Native iOS or Android app flows.
- Offline write queues or sync conflict resolution.
- Customer portal or customer login.
- Standalone retail POS/cart checkout independent of job orders/service invoices.
- Payroll.
- Full accounting/general ledger/chart of accounts/bank reconciliation.
- Direct BIR/tax filing submission.
- E-commerce marketplace or online checkout.
- Loyalty/rewards.
- Service packages.
- Predictive analytics, AI recommendations, or custom BI beyond documented reports.
- Automatic subscription payment collection.
- Two-factor authentication.
- Microservices/platform UI concepts that are not part of source docs.

Do **not** add:

- New roles.
- New permissions.
- New workflow statuses.
- New tenant statuses.
- New branch rules.
- New plan capabilities.
- New financial correction behavior.
- New inventory movement behavior.
- New report formulas.
- New routes that imply unsupported modules.

When a page or component need is unclear:

1. Check `garageos-ui-inventory.md`.
2. Check `ux-sreen-map.md`.
3. Check `requirements-v2.4.md`.
4. Check `api-contracts.md`.
5. Check `permission-matrix.md`.
6. If still missing, document the gap and request a source-doc or ADR decision.

---

## 17. Acceptance Criteria for Adding or Modifying UI Components

A new or modified UI component is acceptable only when:

- It serves a documented page, workflow, state, or layout pattern.
- It uses tokens from `ui-tokens.md`.
- It maps to shadcn/ui primitives where appropriate.
- It supports light, dark, and system theme behavior.
- It supports mobile-first layout requirements.
- It exposes accessible labels, focus behavior, and keyboard support.
- It has documented loading, empty, error, blocked, offline, and conflict states where applicable.
- It does not bypass backend authorization or business validation.
- It does not introduce undocumented routes, roles, permissions, workflows, or product scope.
- It can be tested through unit/component/E2E coverage appropriate to its risk.
- It handles API envelope/error conventions where it performs API-bound work.
- It preserves immutable/read-only/correction-only behavior for financial, receipt, refund, inventory ledger, FIFO, and audit views.
- It clearly communicates tenant status, branch context, permission, plan, support access, and offline restrictions where relevant.

---

## 18. Registry Governance

### Adding Components

Add a component when:

1. The same UI pattern appears in at least two places, or
2. The component encapsulates high-risk behavior, such as permission blocking, workflow submission, idempotency, conflict handling, offline blocking, or tenant status handling.

Do not create abstractions for one-off styling unless the behavior is high-risk or likely to repeat.

### Updating Components

When updating a registered component:

1. Review all usage sites.
2. Confirm source-doc alignment.
3. Validate light/dark/system themes.
4. Validate mobile layout.
5. Validate blocked states.
6. Update tests.
7. Update this registry when behavior changes.

### Deprecating Components

Mark a component as deprecated when:

1. It is replaced by a safer or more consistent pattern.
2. It no longer maps cleanly to source documents.
3. It duplicates another registered component.
4. It encourages undocumented behavior.

Deprecated components must not be used for new GarageOS pages.

---

## 19. Final Implementation Guidance

GarageOS UI should be built from a small set of reliable patterns:

- Auth layout.
- Tenant app shell.
- Platform admin shell.
- List page.
- Detail page.
- Create/edit form.
- Workflow action dialog/sheet.
- Status/blocked-state components.
- Mobile-first card/table switching.
- Tenant/branch/permission/offline-aware action controls.

Prefer consistency over novelty. Every page should make the current tenant, branch, permission, workflow, and offline/read-only state clear before the user performs an action.
