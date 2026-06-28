# GarageOS UI Registry

**Document:** `ui-registry.md`  
**Project:** GarageOS  
**Status:** Source-aligned frontend component and page-composition guidance  
**Primary Source:** `garageos-ui-inventory.md`  
**Supporting Sources:** `ux-sreen-map.md`, `requirements.md`, `architecture.md`, `tech-stack.md`, `api-contracts.md`, `permission-matrix.md`, `user-stories.md`, `ui-tokens.md`

---

## 1. Purpose

This registry guides GarageOS frontend page and component creation for the mobile-first PWA. It defines reusable layouts, app shell patterns, component categories, state handling, shadcn/ui usage, and page-safety checks.

It does **not** add product scope. Components may only implement documented GarageOS pages, workflows, statuses, permissions, API behavior, and UX states.

---

## 2. Source-Aligned UI Rules

GarageOS UI must follow these rules:

1. Mobile-first PWA using Next.js, React, TypeScript, Tailwind CSS, and shadcn/ui.
2. Backend/API/database authorization and validation remain authoritative.
3. UI must reflect tenant status, permissions, branch access, plan limits, support-access context, and offline state.
4. Workflow transitions use explicit action commands, not arbitrary status edits.
5. Offline mode is read-only only.
6. Financial records, receipts, refunds, inventory ledgers, FIFO records, and audit logs are immutable or correction-only where documented.
7. Components must not imply excluded scope: native apps, offline writes, customer portal, standalone POS, payroll, full accounting, automatic subscription collection, 2FA, unsupported roles, unsupported routes, unsupported statuses, unsupported reports, or unsupported workflows.

---

## 3. Component Documentation Format

Document reusable components with this compact structure:

| Field         | Required Content                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Name          | Stable PascalCase component name                                                                                                         |
| Status        | `foundation`, `pattern`, `module-component`, `page-scaffold`, or `deprecated`                                                            |
| Purpose       | What source-aligned UI problem it solves                                                                                                 |
| Inputs        | Props/data contract, including session/tenant/branch/permission inputs when relevant                                                     |
| Guards        | Tenant status, permission, branch, plan, support, offline, immutable/correction-only rules                                               |
| States        | Loading, empty, validation, forbidden, branch denied, plan blocked, subscription blocked, offline, conflict, not found, unexpected error |
| shadcn/ui     | Primitive mapping                                                                                                                        |
| A11y/mobile   | Labels, focus, keyboard, contrast, touch targets, mobile behavior                                                                        |
| Anti-patterns | Scope or behavior the component must not enable                                                                                          |

Add a component only when the pattern repeats, or when it encapsulates high-risk behavior such as permission blocking, workflow submission, idempotency, conflict handling, offline blocking, or tenant-status handling.

---

## 4. Page Layout Patterns

| Pattern              | Use For                                                                                                                                           | Required Regions                                                                                     | shadcn/ui                                                                                               | Key Rules                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuthLayout`         | Login, owner signup, email verification, forgot/reset/change password                                                                             | Brand panel, form card, validation/error area                                                        | `Card`, `Form`, `Input`, `Button`, `Alert`, `Separator`                                                 | Single-column forms; no undocumented marketing claims; support invalid credentials, lockout, unverified email, expired/used token, rate limits. |
| `TenantAppShell`     | Authenticated tenant screens                                                                                                                      | Top bar, status banners, main content, bottom nav, sticky action area                                | `Sheet`, `DropdownMenu`, `Button`, `Badge`, `Alert`, `ScrollArea`                                       | Resolve session before protected nav; show tenant/branch/offline/support context; disable unavailable actions; backend remains authoritative.   |
| `PlatformAdminShell` | Platform tenants, plans, support access, exports, deletion jobs, audit logs                                                                       | Platform top bar, platform nav, main content, support marker                                         | `NavigationMenu`/sidebar, `Sheet`, `Badge`, `Alert`, `Table`, `Card`                                    | Never silently impersonate tenant users; show support mode, tenant, reason, actor, expiry; tenant access must be audited.                       |
| `ListPage`           | Customers, motorcycles, job orders, invoices, payments, products, suppliers, purchases, reports, audit logs, jobs                                 | Header, filters, optional summary, results, pagination, empty/blocked states                         | `Input`, `Select`, `Popover`, `Command`, `Button`, `Table`, `Card`, `Badge`, `DropdownMenu`, `Skeleton` | Filters must map to documented API query paths; mobile cards, desktop tables; no unsupported filters/statuses.                                  |
| `DetailPage`         | Entity detail screens                                                                                                                             | Header, status, summary, sections/tabs, workflow panel, related records, audit/history if documented | `Card`, `Badge`, `Tabs`, `Table`, `Button`, `DropdownMenu`, `Alert`, `Sheet`                            | No arbitrary status editing; use workflow action components; show immutable/read-only notices; preserve branch context.                         |
| `CreateEditForm`     | Documented create/update screens                                                                                                                  | Header, grouped sections, validation summary, sticky footer                                          | `Form`, `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Button`, `Alert`, `Card`    | Use documented fields only; preserve input after errors; handle `lock_version`; block offline/read-only/unauthorized submits.                   |
| `WorkflowAction`     | Estimate approval, job transitions, reservations, adjustment post, transfer receive, invoice issue/void, payment, refund, supplier return, export | Action title, impact summary, fields, blockers, confirmation, submit footer                          | `Dialog`, `AlertDialog`, `Sheet`, `Form`, `Alert`, `Button`, `Badge`                                    | Align with API action endpoints; reason fields where required; idempotency/conflict recovery; no fake success for financial/inventory actions.  |

---

### 4.1 PublicMarketingLayout

| Field         | Guidance                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name          | `PublicMarketingLayout`                                                                                                                                                   |
| Status        | `page-scaffold`                                                                                                                                                           |
| Purpose       | Compose the public GarageOS homepage as a modern SaaS marketing page without exposing tenant app functionality.                                                           |
| Inputs        | Static marketing copy, public nav items, product-preview sample data, CTA URLs.                                                                                           |
| Guards        | Must not depend on authenticated session, tenant data, branch data, permissions, plan state, or private API payloads.                                                     |
| States        | Responsive mobile/desktop layout, public navigation, accessible CTAs, static product-preview cards.                                                                       |
| shadcn/ui     | `Card`, `Badge`, `Button`, layout wrappers, icon primitives.                                                                                                              |
| A11y/mobile   | 360px minimum layout support, readable contrast, visible labels, touch targets at least 44px / 2.75rem.                                                                   |
| Anti-patterns | Do not imply customer portal, standalone POS, payroll, full accounting, automatic subscription collection, native apps, offline writes, 2FA, or unsupported AI/custom BI. |

## 5. App Shell Registry

| Component                   | Purpose                          | Inputs                                                      | States / Guards                                                                                                                   | shadcn/ui                                      |
| --------------------------- | -------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `AuthGate`                  | Protect authenticated routes     | Session loading, user, tenant, permissions, branches        | Loading, unauthenticated, unverified, tenant blocked; never expose protected data before session resolution                       | `Skeleton`, `Alert`, `Button`                  |
| `TenantStatusBanner`        | Tenant lifecycle warning/blocker | Tenant status, subscription/expiration metadata             | `pending_setup`, `active`, `grace_period`, `read_only`, `suspended`, `pending_deletion`, `deleted`; shown before affected content | `Alert`, `Badge`, `Button`                     |
| `BranchContextIndicator`    | Show/switch branch context       | Active branch, branch list, tenant-wide access              | Single branch, multi-branch, denied; no unauthorized branch switching                                                             | `Badge`, `Select`, `Popover`, `Command`        |
| `PermissionAwareNavigation` | Render allowed nav/actions       | Permissions, tenant status, plan capabilities, role context | Normal, hidden, disabled with reason; UI filtering is not authorization                                                           | `NavigationMenu`, `Sheet`, `Button`, `Tooltip` |
| `OfflineIndicator`          | Show read-only offline state     | Network/cache state                                         | Online, offline, reconnecting; block writes, approvals, uploads, payments, inventory actions                                      | `Alert`, `Badge`, `Toast`                      |
| `SupportAccessMarker`       | Mark platform support session    | Platform actor, tenant, mode, reason, expiry                | Read-only/write-allowed support; persistent and unmistakable                                                                      | `Alert`, `Badge`, `Tooltip`                    |
| `UserMenu`                  | Account actions                  | User identity, role, tenant/platform context                | Change password, logout, logout all, theme selection where supported                                                              | `DropdownMenu`, `Button`, `Avatar`             |

---

## 6. Shared Component Registry

### Navigation

| Component          | Purpose                                           | shadcn/ui                             |
| ------------------ | ------------------------------------------------- | ------------------------------------- |
| `MobileBottomNav`  | Dashboard, Job Orders, Customers, Inventory, More | `Button`, custom nav                  |
| `MoreMenu`         | Secondary/admin modules                           | `Sheet`, `Button`, `ScrollArea`       |
| `DesktopSidebar`   | Desktop navigation enhancement                    | `ScrollArea`, `Separator`, custom nav |
| `Breadcrumbs`      | Route/detail context                              | Custom links/buttons                  |
| `PageHeader`       | Title, description, status, primary action        | `Badge`, `Button`                     |
| `PrimaryActionBar` | Sticky mobile action footer                       | `Button`, `Separator`                 |
| `BranchSelector`   | Branch switching                                  | `Popover`, `Command`, `Select`        |
| `ModuleTabs`       | Detail sections                                   | `Tabs`                                |
| `ActionMenu`       | Row/detail secondary actions                      | `DropdownMenu`                        |

Rules: tenant and platform nav are separate; platform permissions never appear in tenant roles; nav reacts to tenant status, permission, branch, plan, and offline state.

### Data Display

| Component                                                                                             | Purpose                                | shadcn/ui                           |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------- |
| `StatusBadge`, `TenantStatusBadge`, `JobOrderStatusBadge`, `PaymentMethodBadge`, `StockMovementBadge` | Documented enum/status values only     | `Badge`                             |
| `WorkflowTimeline`                                                                                    | Status history with actor/time/reason  | `Card`, `Separator`                 |
| `AuditPanel`                                                                                          | Sanitized audit records                | `Card`, `Table`                     |
| `DataTable` / `MobileRecordList`                                                                      | Desktop/mobile lists                   | `Table` / `Card`                    |
| `MetricCard`                                                                                          | Dashboard/report metric                | `Card`                              |
| `MoneyValue`, `QuantityValue`, `DateTimeValue`, `DocumentNumber`                                      | Formatted numeric/date/document values | Custom text with tabular/mono style |
| `ReadOnlyRecordNotice`                                                                                | Immutable/correction-only warning      | `Alert`                             |
| `AttachmentList`                                                                                      | Linked files where documented          | `Card`, `Button`                    |
| `AsyncJobStatusCard`                                                                                  | Export/report/background job status    | `Card`, `Badge`, `Alert`            |

Rules: no display-only fake persisted statuses; tabular numbers for money/quantity/dates/documents; safe job error summaries only; never show passwords, tokens, secrets, or unsafe payloads.

### Forms

| Component                                         | Purpose                       | shadcn/ui                                  |
| ------------------------------------------------- | ----------------------------- | ------------------------------------------ |
| `FormSection`                                     | Group fields                  | `Card`, `Form`                             |
| `TextField`, `TextareaField`, `PasswordField`     | Text inputs                   | `Input`/`Textarea`, `FormField`            |
| `SelectField`, `ComboboxField`, `DateField`       | Controlled/search/date inputs | `Select`, `Popover`, `Command`, `Calendar` |
| `MoneyField`, `QuantityField`                     | Fixed precision inputs        | `Input`, `FormField`                       |
| `CheckboxField`, `RadioGroupField`, `SwitchField` | Boolean/choice fields         | `Checkbox`, `RadioGroup`, `Switch`         |
| `SubmitButton`, `IdempotentSubmitButton`          | Safe submit                   | `Button`                                   |
| `FormErrorSummary`                                | API/client errors             | `Alert`                                    |

Rules: use documented fields; map API boundary fields to `snake_case`; preserve values on validation failure; disable in-flight submit; prevent duplicate critical submit; block offline/read-only/unauthorized writes.

### Feedback and State

| Component                                    | Use For                                               | shadcn/ui                    |
| -------------------------------------------- | ----------------------------------------------------- | ---------------------------- |
| `InlineAlert`, `ToastMessage`                | Contextual/non-blocking feedback                      | `Alert`, `Toast`/`Sonner`    |
| `LoadingState`, `EmptyState`                 | Loading/no data                                       | `Skeleton`, `Card`, `Button` |
| `ValidationErrorState`                       | `validation_failed`                                   | `Alert`, `FormMessage`       |
| `ForbiddenState`, `BranchDeniedState`        | `forbidden`, `branch_access_denied`                   | `Alert`, `Button`            |
| `PlanLimitState`, `SubscriptionBlockedState` | `plan_limit_exceeded`, `subscription_access_blocked`  | `Alert`, `Button`            |
| `OfflineReadOnlyState`                       | Offline write blocked                                 | `Alert`                      |
| `ConflictState`                              | `version_conflict`, `idempotency_conflict`            | `Alert`, `Button`            |
| `NotFoundState`, `ErrorBoundaryState`        | Missing/invisible resource or unexpected client error | `Alert`                      |

Rules: blocking errors are not toast-only; map API error codes to stable UI states; safe request/correlation IDs may be shown; forbidden/not-found states must not leak resource existence.

### Workflow and Actions

| Component                                                                  | Purpose                                | shadcn/ui                         |
| -------------------------------------------------------------------------- | -------------------------------------- | --------------------------------- |
| `WorkflowActionDialog` / `WorkflowActionSheet`                             | Workflow command UI                    | `Dialog`/`Sheet`, `Form`, `Alert` |
| `DestructiveActionDialog`                                                  | Delete/cancel/void/reject confirmation | `AlertDialog`                     |
| `ReasonField`                                                              | Required reason capture                | `Textarea`, `FormField`           |
| `ImpactSummary`                                                            | Preview effects before submit          | `Card`, `Table`                   |
| `VersionConflictResolver`                                                  | Reload/retry guidance                  | `Alert`, `Button`                 |
| `ReadOnlyActionBlocker`, `PermissionActionBlocker`, `OfflineActionBlocker` | Explain disabled actions               | `Alert`, `Tooltip`                |

Rules: commands must match documented API workflow endpoints; corrective/destructive actions show confirmation, reason, and impact where required; inventory/financial workflows wait for server confirmation.

---

## 7. Required Page States

Every applicable page must cover:

| State                      | Required Behavior                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty                      | Clear title/explanation; primary action only when permission, tenant status, branch, plan, and online state allow it.                                                                                                                                           |
| Loading                    | Skeleton matching final layout; avoid layout shift; full-page loading only for blocking auth/session load.                                                                                                                                                      |
| Validation                 | Field/object errors; preserve input; allow retry after fix.                                                                                                                                                                                                     |
| Conflict                   | Explain stale version or idempotency mismatch; offer reload/retry; do not imply success.                                                                                                                                                                        |
| Offline                    | Visible offline banner; read-only explanation; block create/edit/delete/approve/upload/payment/inventory/settings writes; show reconnect prompt.                                                                                                                |
| Permission blocked         | Safe missing-access explanation; no sensitive data or hidden-record confirmation.                                                                                                                                                                               |
| Branch blocked             | Explain branch access limit; allow switch only to authorized branches.                                                                                                                                                                                          |
| Tenant-status blocked      | `pending_setup`: onboarding gate. `grace_period`: renewal warning and normal access. `read_only`: read-only banner and renewal prompt. `suspended`: owner renewal/export only. `pending_deletion`: operational access blocked. `deleted`: unavailable/inactive. |
| Plan limit                 | Show blocked capability, current limit, required plan/upgrade instruction where documented; no automatic payment collection UI.                                                                                                                                 |
| Immutable/read-only record | Hide edit controls; explain final/correction-only state; show documented corrective actions only.                                                                                                                                                               |

---

## 8. shadcn/ui Primitive Mapping

| Need               | Primitive                                               |
| ------------------ | ------------------------------------------------------- |
| Actions            | `Button`                                                |
| Cards/panels       | `Card`                                                  |
| Forms              | `Form`, `Input`, `Textarea`, `Label`                    |
| Select/search/date | `Select`, `Popover`, `Command`, `Calendar`              |
| Boolean/choice     | `Checkbox`, `RadioGroup`, `Switch`                      |
| Dialogs/actions    | `Dialog`, `AlertDialog`, `Sheet`/`Drawer`               |
| Alerts/status      | `Alert`, `Badge`, `Tooltip`, `Toast`/`Sonner`           |
| Sections/data      | `Tabs`, `Table`, `Accordion`, `Separator`, `ScrollArea` |
| Loading/account    | `Skeleton`, `Avatar`, `DropdownMenu`                    |

Wrap shadcn primitives only when the wrapper adds consistent GarageOS behavior. Do not wrap only to rename. Keep variants aligned with `ui-tokens.md`, TypeScript APIs, accessibility behavior, and mobile-first layout.

---

## 9. Module Component Registry

| Module                           | Components                                                                                                                                                                                                                          | Rules                                                                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth                             | `AuthCard`, `PasswordPolicyHint`, `EmailVerificationNotice`, `SessionSummaryPanel`, `LogoutConfirmDialog`                                                                                                                           | No 2FA; never expose tokens; password reset must avoid unsafe account disclosure.                                                                                     |
| Onboarding / Settings            | `OnboardingChecklist`, `ShopProfileForm`, `TaxLocalizationForm`, `InvoicePrefixForm`, `FirstBranchForm`, `SubscriptionInfoCard`, `SettingsSectionCard`                                                                              | Pending setup is setup-only; no automatic subscription payment UI.                                                                                                    |
| Dashboard                        | `DashboardMetricGrid`, `RevenueChartCard`, `InventoryAlertList`, `RenewalWarningPanel`, `DashboardShortcutGrid`                                                                                                                     | Widgets map to documented dashboard/report APIs; plan-limited widgets show plan-limit state.                                                                          |
| Customers / Motorcycles          | `CustomerSearchBox`, `CustomerSummaryCard`, `CustomerHistoryTimeline`, `MotorcycleSummaryCard`, `MotorcycleServiceHistoryList`, `MergeCustomerDialog`, `RestoreRecordBanner`                                                        | Customers are tenant-wide; motorcycles link to one active customer; no customer portal UX.                                                                            |
| Services / Estimates / Jobs      | `ServiceCatalogPicker`, `EstimateLineEditor`, `EstimateApprovalDialog`, `JobOrderLineEditor`, `JobOrderWorkflowActions`, `MechanicAssignmentPanel`, `MechanicWorkSessionCard`, `JobPartReservationPanel`, `ServiceHistoryTimeline`  | Workflow actions only; mechanics get work-session-oriented UI; strong validation before reservations, completion, and line actions.                                   |
| Inventory / Products             | `ProductSearchBox`, `ProductSummaryCard`, `StockBalanceTable`, `FifoLayerTable`, `InventoryLedgerTable`, `LowStockAlertCard`, `InventoryAdjustmentForm`, `AdjustmentApprovalDialog`, `TransferSummaryCard`, `TransferReceiveDialog` | No direct quantity edit; stock changes use ledger/FIFO workflows; ledgers are immutable.                                                                              |
| Suppliers / Purchases            | `SupplierSummaryCard`, `PurchaseOrderLineEditor`, `PurchaseReceivingForm`, `PurchaseStatusBadge`, `SupplierReturnForm`, `AccountsPayableSummary`                                                                                    | Posted receiving is immutable where documented; no full accounting/general-ledger UX.                                                                                 |
| Invoices / Payments / Refunds    | `InvoiceSummaryCard`, `InvoiceLineTable`, `InvoiceIssueDialog`, `PaymentRecordForm`, `ReceiptViewer`, `RefundSubmitDialog`, `VoidActionDialog`, `AccountsReceivableSummary`                                                         | Receipts immutable; one payment creates one receipt; show overpayment/overbilling blockers; no payment-gateway charging UI.                                           |
| Reports / Exports / Jobs / Audit | `ReportFilterDrawer`, `ReportSummaryCards`, `ReportTable`, `ExportActionButton`, `ExportJobStatusCard`, `BackgroundJobTable`, `BackgroundJobDetailPanel`, `AuditLogTable`, `AuditLogDetailPanel`                                    | Large reports/exports may be async; show safe errors/correlation IDs; sanitize audit/job payloads.                                                                    |
| Offline / Notifications          | `OfflineShellNotice`, `OfflineRecentRecordsList`, `OfflineBlockedActionMessage`, `NotificationIndicator`, `NotificationList`, `NotificationDetailPanel`, `NotificationStatusBadge`                                                  | Offline records are read-only; clear user-scoped cache on logout/session invalidation where implemented; notification UI follows documented delivery/status behavior. |

---

## 10. Mobile-First Rules

- Start at 360px width.
- Use single-column layouts by default.
- Use sticky bottom action footers for long forms/workflows.
- Use bottom nav for high-frequency tenant workflows and sheets/drawers for filters/secondary panels.
- Collapse dense tables into cards on mobile.
- Keep tenant, branch, offline, and support-access context visible.
- Avoid hover-only interactions.
- Use large touch targets.
- Enhance tablet/desktop with side navigation, two-column detail layouts, tables/charts, and side sheets without changing source behavior.

---

## 11. Page Creation Checklist

Before creating or modifying a page, confirm:

### Source / Scope

- [ ] Page exists in `garageos-ui-inventory.md` or is directly derived from documented scope.
- [ ] No excluded functionality is introduced.
- [ ] Route aligns with documented route groups or approved frontend routing ADR.
- [ ] API endpoint/contract placeholder exists.
- [ ] Roles and permissions are documented.

### Guards / Access

- [ ] Auth/session and email-verification behavior are defined.
- [ ] Tenant status, permission, branch, plan, offline, and support-access behavior are handled.
- [ ] Backend remains authoritative.

### API / Data

- [ ] Success/error envelopes are handled.
- [ ] `validation_failed`, `forbidden`, `branch_access_denied`, `subscription_access_blocked`, `plan_limit_exceeded`, `version_conflict`, and `idempotency_conflict` are handled where applicable.
- [ ] Loading, empty, success, error, blocked, offline, conflict, and not-found states are present.

### UI / Workflow

- [ ] Uses registered layout/component patterns and `ui-tokens.md` semantic tokens.
- [ ] Uses shadcn/ui consistently.
- [ ] Mobile-first, dark/system theme, labels, focus, and keyboard behavior are covered.
- [ ] Workflow status changes use explicit actions.
- [ ] Destructive/corrective actions confirm impact and reason where documented.
- [ ] Immutable/read-only records hide edit controls and expose only documented corrective actions.

### Testing

- [ ] Component/unit tests cover key states.
- [ ] E2E covers mobile viewport and blocked paths.
- [ ] Critical workflow tests cover validation, conflict, retry/idempotency, and offline/read-only behavior.

---

## 12. Anti-Scope Rules

Do **not** add UI for native apps, offline write queues/sync conflict resolution, customer portal/login, standalone POS, payroll, full accounting/GL, direct tax filing, e-commerce, loyalty, service packages, predictive AI/custom BI beyond documented reports, automatic subscription payment collection, 2FA, or microservices/platform concepts not in source docs.

Do **not** add undocumented roles, permissions, workflow statuses, tenant statuses, branch rules, plan capabilities, financial correction behavior, inventory movement behavior, report formulas, or routes implying unsupported modules.

When unclear: check `garageos-ui-inventory.md`, `ux-sreen-map.md`, `requirements.md`, `api-contracts.md`, and `permission-matrix.md`; then document the gap and request a source-doc or ADR decision.

---

## 13. Component Acceptance Criteria

A new or modified component is acceptable only when it:

- Serves a documented page, workflow, state, or layout pattern.
- Uses `ui-tokens.md`, shadcn/ui where appropriate, and TypeScript props.
- Supports light, dark, system theme, mobile-first layout, accessibility, focus, and keyboard behavior.
- Handles loading, empty, error, blocked, offline, and conflict states where applicable.
- Does not bypass backend authorization or validation.
- Does not introduce undocumented routes, roles, permissions, workflows, statuses, or product scope.
- Handles API envelopes/errors when API-bound.
- Preserves immutable/read-only/correction-only behavior for financial, receipt, refund, inventory ledger, FIFO, and audit views.
- Clearly communicates tenant, branch, permission, plan, support access, and offline restrictions where relevant.
- Has unit/component/E2E coverage appropriate to risk.

---

## 14. Governance

| Action              | Rule                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add component       | Add when reused or when it centralizes high-risk behavior. Avoid one-off styling abstractions.                                                        |
| Update component    | Review usages, confirm source alignment, validate themes/mobile/blocked states, update tests and registry.                                            |
| Deprecate component | Mark deprecated when replaced, duplicated, source-misaligned, or encouraging undocumented behavior. Deprecated components are not used for new pages. |

Final guidance: build GarageOS UI from a small reliable set of auth, app shell, platform shell, list, detail, form, workflow action, blocked-state, and mobile card/table patterns. Prefer consistency over novelty. Every page should make tenant, branch, permission, workflow, offline, and read-only state clear before action.

## 14. Motion and Animation Governance

GarageOS motion exists to improve comprehension, orientation, feedback, and professional polish. Motion must not create undocumented product scope, imply unsupported capabilities, hide important operational state, or make critical workflows appear complete before backend/API confirmation.

This section is documentation and planning guidance only. It does not install GSAP, does not require animation implementation in this step, and does not change any documented product workflow.

### 14.1 Motion Scope Rules

| Motion Area                     | Rule                                                                                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product scope                   | Motion must only support documented pages, workflows, states, permissions, tenant lifecycle rules, and API behavior.                                                                            |
| Backend authority               | UI animation must never override, preempt, or fake backend/API/database authorization or workflow state.                                                                                        |
| Critical workflows              | Success animation for inventory, financial, billing, refund, receipt, export, support-access, tenant lifecycle, and workflow-transition actions may render only after confirmed server success. |
| Offline mode                    | Offline motion must reinforce read-only behavior and must not imply queued writes, sync retries, conflict resolution, or offline mutation support.                                              |
| Permission/plan/tenant blockers | Motion must not obscure blocked states. Disabled or blocked actions must remain explicit and readable.                                                                                          |
| Dense operational surfaces      | Tables, ledgers, audit logs, inventory records, financial records, workflow histories, report tables, and FIFO views must remain productivity-first with minimal motion.                        |
| Accessibility                   | Reduced-motion preferences must be respected across CSS and JavaScript-driven motion.                                                                                                           |

### 14.2 When GSAP Is Allowed

GSAP is allowed only when the animation benefits from timeline control, scroll orchestration, staged sequencing, or reusable motion context management that is difficult to maintain with CSS/Tailwind alone.

| Allowed GSAP Use               | Guidance                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Public marketing homepage      | Richer reveal sequences, hero polish, product storytelling, scroll-linked highlights, and non-critical visual emphasis. |
| Public marketing sections      | Sequential card reveals, workflow storytelling, trust indicators, and CTA emphasis.                                     |
| Auth and onboarding            | Restrained entrance/reveal motion that supports orientation without slowing form completion.                            |
| Dashboard summary cards        | Light, non-blocking metric reveals after confirmed data is loaded.                                                      |
| Workflow action dialogs/sheets | Focused entry/exit, impact summary reveal, and server-confirmed completion states.                                      |
| Empty states                   | Gentle reveal of source-aligned empty-state guidance and allowed primary action.                                        |
| Progress or status indicators  | Only when backed by documented workflow state or async job status.                                                      |

Future implementation should prefer scoped client-side animation patterns such as `@gsap/react` / `useGSAP`, cleanup-safe animation contexts, and reusable motion hooks. GSAP must be isolated to client components and must not run during server rendering.

### 14.3 When CSS/Tailwind-Only Motion Is Preferred

Use CSS/Tailwind transitions for simple interaction feedback.

| CSS-Only Use                         | Guidance                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Hover states                         | Buttons, links, cards, nav items, menus, and simple affordance feedback.                             |
| Focus states                         | Keyboard-visible focus rings and input focus treatments.                                             |
| Active/pressed states                | Button press, chip selection, tab selection, and toggle state.                                       |
| Simple opacity/transform transitions | Lightweight component entry where no sequencing or timeline coordination is required.                |
| Sheet/dialog default transitions     | Use shadcn/ui or existing primitive behavior unless a workflow-specific motion pattern is justified. |
| Loading skeletons                    | Prefer static or subtle CSS skeletons over complex animation.                                        |
| Dense data rows                      | Avoid row choreography; use simple hover/focus styles only.                                          |

### 14.4 Motion Anti-Patterns

Do **not** use motion to:

- Add native app-like behavior or imply iOS/Android native apps.
- Suggest offline writes, offline queues, conflict resolution, or background sync for operational mutations.
- Suggest customer portal, standalone POS, payroll, full accounting, automatic subscription payment collection, 2FA, unsupported AI/custom BI, or other excluded capabilities.
- Hide permission, branch, plan, tenant lifecycle, suspended, read-only, or offline blockers.
- Animate around validation errors so aggressively that the user misses the corrective message.
- Show success before the API confirms a critical write.
- Animate financial, receipt, refund, inventory ledger, FIFO, audit, or workflow history rows in a way that harms scanability.
- Use parallax, scroll hijacking, long delays, autoplay loops, or decorative motion on operational task screens.
- Create one-off animation behavior that should be governed by shared motion tokens or reusable motion patterns.

### 14.5 Reduced-Motion Requirements

GarageOS must respect `prefers-reduced-motion`.

| Requirement   | Rule                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Detection     | Motion utilities must detect reduced-motion preference before running JavaScript timelines.                            |
| CSS behavior  | CSS motion tokens must collapse to no-motion or near-instant transitions when reduced motion is enabled.               |
| GSAP behavior | GSAP timelines must be skipped, disabled, or replaced with immediate final states when reduced motion is enabled.      |
| Critical UX   | Reduced motion must not remove important content, state, validation messages, workflow blockers, or workflow feedback. |
| Testing       | Motion-enabled components should include reduced-motion validation where practical.                                    |

### 14.6 Page-Pattern Motion Guidance

| Page / Pattern          | Motion Guidance                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public marketing pages  | Best first GSAP implementation target. Richer but still purposeful motion is allowed for storytelling, trust, product highlights, and CTA focus.    |
| Auth pages              | Use restrained CSS or GSAP reveal motion. Forms must remain fast, readable, and accessible.                                                         |
| Onboarding              | Use restrained progress/reveal motion to clarify setup steps. Do not imply operational access before onboarding completion.                         |
| Tenant app shell        | Keep motion minimal. Navigation, status banners, branch context, support marker, and offline indicator should prioritize clarity over decoration.   |
| Dashboard               | Use light metric/card reveals after successful data load. Do not animate numbers in a way that implies unverified data.                             |
| Lists                   | Prefer minimal motion. Use hover/focus states only for dense lists, tables, ledgers, audit logs, inventory records, financial records, and reports. |
| Detail pages            | Use subtle section reveal only when it improves orientation. Immutable/read-only notices must be immediately visible.                               |
| Workflow action dialogs | Use restrained entrance/exit and impact-summary reveal. Server-confirmed success states only.                                                       |
| Blocked states          | Permission, plan, branch, tenant, suspended, read-only, and offline blockers must appear clearly without delayed animation.                         |

### 14.7 Future Implementation Guardrails

- Do not install GSAP until a later implementation phase explicitly approves dependency changes.
- Keep motion implementation isolated from business logic.
- Keep backend/API/database state authoritative.
- Use reusable hooks/components for repeated animation behavior.
- Clean up animation contexts on unmount.
- Avoid global selectors that can affect unrelated screens.
- Prefer semantic motion tokens from `ui-tokens.md`.
- Validate mobile viewport behavior first.
- Validate reduced-motion behavior before shipping.

---
