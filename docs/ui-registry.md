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

## 15. Motion Architecture Planning

This section defines the planned frontend motion architecture for GarageOS.

This is a planning artifact only. It does not install GSAP, does not introduce runtime animation code, and does not add product scope. Motion remains a frontend presentation concern layered on top of documented GarageOS screens, permissions, tenant lifecycle states, offline rules, API contracts, and workflow behavior.

### 15.1 Purpose and Scope

| Area             | Guidance                                                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal             | Define where future motion utilities live, how they stay client-only, and how reusable motion contracts should be shaped.                                                        |
| Included         | Motion utility location, client-only boundaries, reusable contracts, reduced-motion strategy, first safe implementation slice, and acceptance criteria.                          |
| Excluded         | GSAP installation, runtime animation implementation, operational screen animation, backend/API/database changes, new routes, new permissions, and undocumented product behavior. |
| Source alignment | Motion supports documented UI behavior only. Backend/API/database state remains authoritative.                                                                                   |
| First target     | Public marketing homepage.                                                                                                                                                       |
| Operational rule | Operational screens remain productivity-first and animation-light until explicitly approved.                                                                                     |

### 15.2 Frontend Motion Utility Location

Motion utilities should live inside the web app because they are frontend-only, browser-dependent, and presentation-focused.

Recommended future location:

```text
apps/web/src/shared/motion/
  index.ts
  motion-provider.tsx
  motion-safe.tsx
  workflow-action-motion.tsx
  hooks/
    use-reduced-motion.ts
    use-reveal-motion.ts
    use-scroll-reveal-motion.ts
    use-counter-motion.ts
```

| Rule                    | Requirement                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend-only location  | Keep motion code under `apps/web/src/shared/motion/`.                                                                                                        |
| Shared package boundary | Do not place GSAP, `window`, `document`, `matchMedia`, `IntersectionObserver`, `requestAnimationFrame`, or browser animation utilities in `packages/shared`. |
| Domain boundary         | Do not place motion business logic inside module-specific domain folders.                                                                                    |
| Reuse                   | Module components should consume shared motion contracts instead of creating one-off animation behavior.                                                     |
| Replaceability          | Components should depend on GarageOS motion contracts, not directly on GSAP timelines.                                                                       |
| Productivity            | Motion must never delay task completion, validation visibility, permission feedback, or blocked-action recovery.                                             |

### 15.3 Client-Only Boundary Rules

Future GSAP usage must remain behind explicit client-only boundaries.

| Boundary          | Rule                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client modules    | Files that call GSAP or browser APIs must be client modules.                                                                                                  |
| Server components | Server components must not import GSAP directly.                                                                                                              |
| Initial render    | Server-rendered content must remain readable before animation runs.                                                                                           |
| Hydration safety  | Initial content must not be hidden behind JavaScript-only reveal behavior.                                                                                    |
| Mount timing      | Motion setup must run after mount.                                                                                                                            |
| Cleanup           | Timelines, observers, event listeners, and animation frames must be cleaned up on unmount.                                                                    |
| Dynamic loading   | Dynamic imports are preferred for GSAP when animation is not required during initial render.                                                                  |
| Reduced motion    | Reduced-motion users must receive the final readable state without transform-based movement.                                                                  |
| Blocked states    | Offline, permission-blocked, read-only tenant, plan-blocked, branch-blocked, and validation-error states must not depend on animation to communicate meaning. |

### 15.4 GSAP Usage Boundary

GSAP is allowed only where it provides clear value beyond CSS/Tailwind transitions.

| Area                    | Guidance                                                                                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Allowed future GSAP use | Public marketing homepage hero sequencing, feature/role section reveals, dashboard mockup highlight motion, non-authoritative count-up presentation, and non-critical visual polish with complete reduced-motion fallback.                                                      |
| Prefer CSS/Tailwind     | Button hover/focus states, navigation active state, form focus, badges/chips, toast transitions, shadcn/ui dialog or sheet transitions, dense lists, tables, filters, and forms.                                                                                                |
| Not allowed             | Authorization, tenant lifecycle, permission, branch access, plan limit, offline enforcement, inventory correctness, financial correctness, receipt/refund/ledger/FIFO/audit correctness, payment/invoice/job completion state, fake success, or hiding authoritative API state. |

### 15.5 Motion Contract Registry

| Contract                | Status       | Future Location                                                | Purpose                                                                | Guards / Rules                                                                                                                | Anti-patterns                                                                                                                          |
| ----------------------- | ------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `MotionProvider`        | `foundation` | `apps/web/src/shared/motion/motion-provider.tsx`               | Provide motion capability context.                                     | Reads reduced-motion preference after mount, exposes `canAnimate`, supports no-op fallback, and never changes business state. | Do not store sensitive data. Do not make authorization, tenant, branch, plan, or workflow decisions.                                   |
| `MotionSafe`            | `foundation` | `apps/web/src/shared/motion/motion-safe.tsx`                   | Wrap content that may animate but must remain readable without motion. | Renders children in final readable state when motion is disabled, unavailable, or reduced.                                    | Do not hide required content until animation loads.                                                                                    |
| `useReducedMotion`      | `foundation` | `apps/web/src/shared/motion/hooks/use-reduced-motion.ts`       | Resolve browser reduced-motion preference safely.                      | Must be SSR-safe and read browser APIs only after mount.                                                                      | Do not read `window` or `matchMedia` during server render.                                                                             |
| `useRevealMotion`       | `pattern`    | `apps/web/src/shared/motion/hooks/use-reveal-motion.ts`        | Provide one-time reveal behavior for simple elements.                  | CSS-first initially; may delegate to GSAP only after implementation approval.                                                 | Do not use for validation, permission, blocker, or critical workflow states.                                                           |
| `useScrollRevealMotion` | `pattern`    | `apps/web/src/shared/motion/hooks/use-scroll-reveal-motion.ts` | Provide viewport-based reveal for marketing sections.                  | Uses `IntersectionObserver` or future GSAP ScrollTrigger only after mount; final state must be visible for reduced motion.    | Do not use on dense operational lists, tables, ledgers, audit logs, or financial/inventory rows.                                       |
| `useCounterMotion`      | `pattern`    | `apps/web/src/shared/motion/hooks/use-counter-motion.ts`       | Provide count-up display for non-authoritative presentation numbers.   | Always renders final value for reduced motion and screen readers.                                                             | Do not compute or animate authoritative reports, totals, invoice amounts, stock, AR/AP, FIFO, ledger, or payment values.               |
| `WorkflowActionMotion`  | `pattern`    | `apps/web/src/shared/motion/workflow-action-motion.tsx`        | Provide server-confirmed-only workflow feedback.                       | Animates only after API success is confirmed and authoritative response data is available.                                    | Do not show success while pending. Do not mask validation, idempotency, conflict, permission, plan, branch, tenant, or offline errors. |

### 15.6 Planning Type Contracts

These contracts are planning references only. Do not implement them until the implementation phase is explicitly approved.

```ts
type MotionCapability = {
  canAnimate: boolean;
  reducedMotion: boolean;
  mounted: boolean;
};

type MotionProviderProps = {
  children: React.ReactNode;
};

type MotionSafeProps = {
  children: React.ReactNode;
  className?: string;
  motionName?: string;
  disabled?: boolean;
};

type RevealMotionOptions = {
  enabled?: boolean;
  once?: boolean;
  delayMs?: number;
  durationMs?: number;
  distance?: 'none' | 'xs' | 'sm' | 'md';
};

type CounterMotionOptions = {
  value: number;
  durationMs?: number;
  enabled?: boolean;
  format?: (value: number) => string;
};

type WorkflowActionMotionProps = {
  state: 'idle' | 'pending' | 'succeeded' | 'failed';
  children: React.ReactNode;
  successLabel?: string;
};
```

### 15.7 First Safe Implementation Slice

The first recommended motion implementation target is the public marketing homepage only.

| Area                  | Motion Type                    | Priority | Reduced-Motion Behavior     |
| --------------------- | ------------------------------ | -------: | --------------------------- |
| Hero headline/subcopy | Subtle reveal                  |        1 | Render final visible state. |
| Hero CTA group        | Subtle reveal and focus polish |        1 | Static final state.         |
| Dashboard mockup      | Entrance and small highlight   |        2 | Static mockup state.        |
| Feature cards         | Scroll reveal                  |        2 | Static card grid.           |
| Workflow preview      | Step reveal                    |        3 | Static timeline/cards.      |
| Role value cards      | Staggered card reveal          |        3 | Static cards.               |
| Final CTA             | Subtle emphasis                |        4 | Static CTA panel.           |

Do not include in the first slice:

- Auth screens.
- Tenant app shell.
- Dashboard operational metrics.
- Job order workflow actions.
- Inventory reservation, release, or consumption.
- FIFO, ledger, invoice, payment, receipt, refund, or audit screens.
- Platform admin support access screens.
- Offline cache screens.

### 15.8 Reduced-Motion Test Strategy

Future implementation must include reduced-motion validation before GSAP usage expands.

| Test Type     | Required Coverage                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Unit          | `useReducedMotion` with mocked `window.matchMedia`.                                              |
| Component     | `MotionSafe` renders children in final visible state when reduced motion is enabled.             |
| Component     | Reveal hooks do not apply transform animation when reduced motion is enabled.                    |
| Component     | Counter motion renders final value immediately when reduced motion is enabled.                   |
| E2E           | Public homepage works with browser reduced-motion emulation.                                     |
| E2E           | Public homepage at 360px width does not hide content behind animation.                           |
| Static review | GSAP is not imported by server components.                                                       |
| Accessibility | Screen readers receive final readable content and do not depend on animated intermediate states. |

### 15.9 Acceptance Criteria

Motion architecture planning is acceptable only when:

- No dependency installation is introduced.
- No GSAP runtime code is implemented.
- No operational screen animation is implemented.
- Future motion utility location is documented.
- Client-only boundaries are explicit.
- Reusable hook/component contracts are documented.
- Reduced-motion strategy is explicit.
- Reduced-motion testing strategy is explicit.
- Public marketing homepage remains the first recommended implementation target.
- Backend/API/database authority is preserved.
- Mobile-first PWA behavior is preserved.
- Critical workflow success motion remains server-confirmed only.
