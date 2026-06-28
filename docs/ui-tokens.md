# GarageOS UI Tokens

**Document:** `ui-tokens.md`  
**Project:** GarageOS  
**Status:** Source-aligned frontend design-system guidance  
**Default theme:** Light  
**Supported modes:** Light, dark, system  
**Implementation target:** Next.js, React, TypeScript, Tailwind CSS, shadcn/ui

> Purpose: provide compact, reusable UI token guidance for GarageOS frontend work. This document defines visual tokens only. It must not introduce product modules, routes, roles, workflows, permissions, or business behavior.

---

## 1. Source Alignment Rules

GarageOS UI is a mobile-first PWA. Tokens must support documented tenant status, permissions, branch access, plan limits, workflow states, offline read-only mode, API errors, immutability, and correction-only records.

Core rules:

- Use semantic tokens in components; keep raw colors in theme config.
- Backend/API/database remain authoritative; UI guards are usability aids only.
- Offline mode disables writes and presents read-only cached views only.
- Issued financial records, receipts, refunds, ledgers, FIFO records, and audit logs must look immutable or correction-only.
- Do not invent workflow states; map documented enums to visual groups.
- Light mode is default; dark and system modes must be supported.

---

## 2. Brand Direction

GarageOS brand input from the logo:

| Attribute                   | UI direction                                  |
| --------------------------- | --------------------------------------------- |
| Orange/gold mark            | Primary action, active navigation, highlights |
| Graphite/black garage shape | Operational seriousness, strong contrast      |
| Chrome/silver accents       | Precision, reliability, machinery             |
| White wordmark              | Clarity and clean SaaS readability            |

UI tone: operational, fast, reliable, mechanic-friendly, modern SaaS. Use orange/gold sparingly on dense screens to preserve readability.

### 2.1 Public Marketing Token Guidance

Public marketing pages may use a slightly more expressive version of the GarageOS visual system while still relying on the same semantic tokens.

| Token usage            | Guidance                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Marketing background   | Prefer `background`, `card`, `muted`, and soft radial/linear gradients based on brand orange/gold.                     |
| Marketing CTA          | Use `primary` with restrained orange/gold gradient treatment for primary conversion actions.                           |
| Product mockup         | Use graphite/dark neutral preview panels to communicate operational software while keeping the surrounding page light. |
| Marketing card shadow  | Use soft, wide shadows sparingly for hero preview, feature cards, and CTA panels.                                      |
| Marketing border       | Use `border` plus low-opacity primary borders for highlighted cards.                                                   |
| Marketing icon surface | Use `accent` background with `primary` foreground for feature and workflow icons.                                      |

Rules:

- Do not introduce new product states through visual tokens.
- Do not overuse saturated orange across dense operational screens.
- Public marketing styling must not override tenant app readability, accessibility, permission, lifecycle, offline, or immutable-record states.

---

## 3. Token Model

| Layer        | Purpose                 | Example                                |
| ------------ | ----------------------- | -------------------------------------- |
| Base palette | Raw colors              | `brand-orange-500`, `graphite-900`     |
| Semantic     | UI meaning              | `primary`, `background`, `destructive` |
| Component    | shadcn/Tailwind mapping | `card`, `popover`, `input`, `ring`     |
| Workflow     | Product state           | `status-success`, `status-readonly`    |

Naming rules:

- Component code should use semantic tokens, not raw hex colors.
- Define light and dark values for every semantic token.
- Status tokens must be consistent across badges, alerts, tables, timelines, and filters.
- Token additions require reusable need, accessibility check, and source alignment.

---

## 4. Base Palette

| Token              | Hex       | Use                    |
| ------------------ | --------- | ---------------------- |
| `brand-orange-50`  | `#FFF4E6` | Soft brand surface     |
| `brand-orange-100` | `#FFE2BF` | Active background      |
| `brand-orange-300` | `#FFAA40` | Hover accent           |
| `brand-orange-400` | `#FF8A00` | Brand accent           |
| `brand-orange-500` | `#F97300` | Primary action         |
| `brand-orange-600` | `#EA580C` | Primary hover          |
| `brand-orange-700` | `#C2410C` | Pressed/active         |
| `brand-orange-800` | `#9A3412` | Brand text on light    |
| `brand-gold-50`    | `#FFF9DB` | Soft warning surface   |
| `brand-gold-300`   | `#FFD84D` | Highlight              |
| `brand-gold-500`   | `#FBBF24` | Warning/accent         |
| `brand-gold-700`   | `#B7791F` | Gold text              |
| `brand-red-100`    | `#FFE0D5` | Destructive surface    |
| `brand-red-500`    | `#DC2626` | Destructive            |
| `brand-red-700`    | `#991B1B` | Destructive text       |
| `graphite-950`     | `#0B0B0C` | Dark app bg            |
| `graphite-900`     | `#111113` | Dark surface           |
| `graphite-850`     | `#18181B` | Elevated dark surface  |
| `graphite-800`     | `#27272A` | Dark border/surface    |
| `graphite-700`     | `#3F3F46` | Muted dark border/text |
| `metal-600`        | `#71717A` | Secondary text         |
| `metal-500`        | `#A1A1AA` | Muted text             |
| `metal-300`        | `#D4D4D8` | Light border           |
| `metal-200`        | `#E4E4E7` | Subtle border          |
| `metal-100`        | `#F4F4F5` | Light surface          |
| `metal-50`         | `#FAFAFA` | Page bg                |
| `white`            | `#FFFFFF` | Card surface           |

---

## 5. Core Semantic Tokens

| Token                    | Light     | Dark      | Use                 |
| ------------------------ | --------- | --------- | ------------------- |
| `background`             | `#FAFAFA` | `#0B0B0C` | App background      |
| `foreground`             | `#18181B` | `#FAFAFA` | Primary text        |
| `card`                   | `#FFFFFF` | `#18181B` | Cards/panels        |
| `card-foreground`        | `#18181B` | `#FAFAFA` | Card text           |
| `popover`                | `#FFFFFF` | `#18181B` | Menus/popovers      |
| `popover-foreground`     | `#18181B` | `#FAFAFA` | Popover text        |
| `primary`                | `#F97300` | `#FF8A00` | Main CTA            |
| `primary-foreground`     | `#FFFFFF` | `#111113` | Text on primary     |
| `secondary`              | `#F4F4F5` | `#27272A` | Secondary surface   |
| `secondary-foreground`   | `#18181B` | `#FAFAFA` | Secondary text      |
| `muted`                  | `#F4F4F5` | `#27272A` | Muted bg            |
| `muted-foreground`       | `#71717A` | `#A1A1AA` | Muted text          |
| `accent`                 | `#FFF4E6` | `#3A2415` | Soft brand bg       |
| `accent-foreground`      | `#9A3412` | `#FFD84D` | Accent text         |
| `destructive`            | `#DC2626` | `#F87171` | Destructive actions |
| `destructive-foreground` | `#FFFFFF` | `#111113` | Text on destructive |
| `border`                 | `#E4E4E7` | `#27272A` | Default border      |
| `input`                  | `#D4D4D8` | `#3F3F46` | Inputs              |
| `ring`                   | `#F97300` | `#FFAA40` | Focus ring          |

---

## 6. CSS Variable Source

Use RGB component variables so Tailwind can support opacity via `rgb(var(--token) / <alpha-value>)`.

```css
:root {
  color-scheme: light;
  --background: 250 250 250;
  --foreground: 24 24 27;
  --card: 255 255 255;
  --card-foreground: 24 24 27;
  --popover: 255 255 255;
  --popover-foreground: 24 24 27;
  --primary: 249 115 0;
  --primary-foreground: 255 255 255;
  --secondary: 244 244 245;
  --secondary-foreground: 24 24 27;
  --muted: 244 244 245;
  --muted-foreground: 113 113 122;
  --accent: 255 244 230;
  --accent-foreground: 154 52 18;
  --destructive: 220 38 38;
  --destructive-foreground: 255 255 255;
  --border: 228 228 231;
  --input: 212 212 216;
  --ring: 249 115 0;
  --success: 22 163 74;
  --success-foreground: 255 255 255;
  --warning: 245 158 11;
  --warning-foreground: 24 24 27;
  --info: 37 99 235;
  --info-foreground: 255 255 255;
  --readonly: 82 82 91;
  --readonly-foreground: 255 255 255;
  --offline: 113 113 122;
  --offline-foreground: 255 255 255;
  --radius: 0.75rem;
}

.dark {
  color-scheme: dark;
  --background: 11 11 12;
  --foreground: 250 250 250;
  --card: 24 24 27;
  --card-foreground: 250 250 250;
  --popover: 24 24 27;
  --popover-foreground: 250 250 250;
  --primary: 255 138 0;
  --primary-foreground: 17 17 19;
  --secondary: 39 39 42;
  --secondary-foreground: 250 250 250;
  --muted: 39 39 42;
  --muted-foreground: 161 161 170;
  --accent: 58 36 21;
  --accent-foreground: 255 216 77;
  --destructive: 248 113 113;
  --destructive-foreground: 17 17 19;
  --border: 39 39 42;
  --input: 63 63 70;
  --ring: 255 170 64;
  --success: 74 222 128;
  --success-foreground: 17 17 19;
  --warning: 251 191 36;
  --warning-foreground: 17 17 19;
  --info: 96 165 250;
  --info-foreground: 17 17 19;
  --readonly: 161 161 170;
  --readonly-foreground: 17 17 19;
  --offline: 161 161 170;
  --offline-foreground: 17 17 19;
}
```

Theme behavior:

- `light`: force `:root` light tokens.
- `dark`: add `class="dark"` to document root.
- `system`: follow `prefers-color-scheme`.
- Persist only UI theme preference locally; never store auth/session secrets there.
- Avoid hydration mismatch by delaying theme-dependent rendering until mounted where needed.

---

## 7. Status and Workflow Tokens

| Token             | Light Surface/Text    | Dark Surface/Text     | Use                                |
| ----------------- | --------------------- | --------------------- | ---------------------------------- |
| `status-neutral`  | `#F4F4F5` / `#3F3F46` | `#27272A` / `#D4D4D8` | Draft, inactive, cancelled         |
| `status-info`     | `#DBEAFE` / `#1D4ED8` | `#1E3A8A` / `#BFDBFE` | Info, queued                       |
| `status-progress` | `#FFF4E6` / `#C2410C` | `#3A2415` / `#FFAA40` | In progress, running, in transit   |
| `status-success`  | `#DCFCE7` / `#15803D` | `#14532D` / `#BBF7D0` | Paid, completed, succeeded         |
| `status-warning`  | `#FEF3C7` / `#B45309` | `#451A03` / `#FDE68A` | Grace, pending approval, low stock |
| `status-danger`   | `#FEE2E2` / `#B91C1C` | `#7F1D1D` / `#FECACA` | Failed, suspended, blocked         |
| `status-readonly` | `#E4E4E7` / `#52525B` | `#3F3F46` / `#D4D4D8` | Read-only tenant/record            |
| `status-offline`  | `#E4E4E7` / `#52525B` | `#27272A` / `#D4D4D8` | Offline state                      |

Tenant status mapping:

| Tenant status      | Token             | UI treatment                                    |
| ------------------ | ----------------- | ----------------------------------------------- |
| `pending_setup`    | `status-warning`  | Setup gate/checklist                            |
| `active`           | `status-success`  | Normal access                                   |
| `grace_period`     | `status-warning`  | Renewal warning; writes remain permission-based |
| `read_only`        | `status-readonly` | Read-only banner; writes disabled               |
| `suspended`        | `status-danger`   | Suspended screen; owner renewal/export only     |
| `pending_deletion` | `status-danger`   | Operational access blocked                      |
| `deleted`          | `status-danger`   | Tenant unavailable                              |

Common workflow mapping:

| Meaning          | Token             | Examples                             |
| ---------------- | ----------------- | ------------------------------------ |
| Draft/editable   | `status-neutral`  | Draft estimate/invoice/purchase      |
| Waiting/review   | `status-warning`  | Pending approval, ordered            |
| Active work      | `status-progress` | In progress, running, in transit     |
| Final success    | `status-success`  | Paid, completed, received            |
| Cancelled/voided | `status-neutral`  | Cancelled, voided, released          |
| Failed/blocked   | `status-danger`   | Rejected, failed job, blocked access |
| Immutable        | `status-readonly` | Receipt, audit log, ledger entry     |

Required blocked states: `forbidden`, `branch_access_denied`, `subscription_access_blocked`, `plan_limit_exceeded`, `validation_failed`, `workflow_transition_blocked`, `inventory_insufficient_available_stock`, `invoice_overpayment_blocked`, `invoice_overbilling_blocked`, `version_conflict`, `idempotency_conflict`, and offline write attempt.

---

## 8. Type, Spacing, Radius, Elevation

Typography:

| Token       | Size / line          | Weight    | Use                         |
| ----------- | -------------------- | --------- | --------------------------- |
| `text-xs`   | `0.75rem / 1rem`     | `400/500` | Badges, helper text         |
| `text-sm`   | `0.875rem / 1.25rem` | `400/500` | Default body, inputs, cells |
| `text-base` | `1rem / 1.5rem`      | `400/500` | Mobile labels/body          |
| `text-lg`   | `1.125rem / 1.75rem` | `600`     | Card/section titles         |
| `text-xl`   | `1.25rem / 1.75rem`  | `600/700` | Mobile page titles          |
| `text-2xl`  | `1.5rem / 2rem`      | `700`     | Desktop page titles         |
| `text-3xl`  | `1.875rem / 2.25rem` | `700`     | Dashboard metrics           |

Rules: use system sans for UI, monospace for IDs/logs, tabular numbers for money, quantities, dates, invoice/receipt/document numbers, and timestamps.

Spacing aliases:

| Token                     |     Value | Use                      |
| ------------------------- | --------: | ------------------------ |
| `space-2`                 |  `0.5rem` | Dense row gap            |
| `space-3`                 | `0.75rem` | Card internal gap        |
| `space-4`                 |    `1rem` | Default section/form gap |
| `space-6`                 |  `1.5rem` | Page section gap         |
| `page-padding-mobile`     |    `1rem` | Mobile page padding      |
| `page-padding-tablet`     |  `1.5rem` | Tablet page padding      |
| `page-padding-desktop`    |    `2rem` | Desktop page padding     |
| `shell-bottom-nav-height` |    `4rem` | Mobile nav safe area     |
| `sticky-action-height`    |  `4.5rem` | Sticky action region     |
| `form-control-height`     | `2.75rem` | Touch-friendly inputs    |
| `touch-target-min`        | `2.75rem` | Minimum touch target     |

Radius:

| Token         |      Value | Use                        |
| ------------- | ---------: | -------------------------- |
| `radius-sm`   | `0.375rem` | Inputs/small controls      |
| `radius-md`   |   `0.5rem` | Buttons/dense cards        |
| `radius-lg`   |  `0.75rem` | Default cards/dialogs      |
| `radius-xl`   |     `1rem` | Feature/auth cards         |
| `radius-full` |   `9999px` | Pills/avatars/status chips |

Elevation: prefer border + subtle shadow. `shadow-sm` for cards, `shadow-md` for sticky bars/dropdowns, `shadow-lg` for dialogs/drawers, `shadow-brand` only for rare auth/onboarding emphasis.

---

## 9. Component Usage

Buttons:

- `primary`: main CTA.
- `secondary`/`outline`/`ghost`: lower-emphasis actions.
- `destructive`: delete, void, cancel, reject, corrective actions.
- `readonly`: explanation/action for read-only states.
- One primary CTA per screen region.
- Disabled actions must explain permission, branch, plan, tenant-status, read-only, or offline reason.

Forms:

- Use `foreground` labels, `input` borders, `ring` focus, `muted-foreground` helper text, `destructive` errors.
- Preserve input on validation failure.
- Use idempotency-aware submission for critical writes.
- Do not fake completion of financial/inventory/deletion workflows.

Tables and cards:

- Use cards for mobile list items, dashboards, detail sections, workflow summaries.
- Collapse dense tables into mobile card rows.
- Use tabular numbers and right alignment for money/quantity.
- Use status badges in list rows and detail headers.
- Use keyset/cursor pagination patterns for high-volume lists.

Dialogs/sheets/toasts:

- Dialogs: confirmations, destructive actions, reason-required transitions, short forms.
- Sheets: mobile filters, long forms, detail panels, review summaries.
- Toasts: save success, export queued, non-blocking notices. Blocking errors require inline alert/state.

Navigation:

- Active nav: `accent`/`accent-foreground` plus optional primary indicator.
- Branch chip: `secondary`.
- Tenant/offline/support banners: status tokens.
- Permission-hidden routes should not leak inaccessible data.

Icons:

- Use one outline icon style, `1.75px–2px` stroke.
- Icon-only buttons require accessible labels.
- Suggested semantics: check=success, alert=warning/error, info=info, wifi/cloud-off=offline, lock=read-only, shield=user support access, history=audit.

---

## 10. Accessibility and Responsive Rules

Accessibility:

- Maintain contrast in light/dark modes.
- Do not use color alone; pair status with text/icon.
- Use semantic HTML and visible focus rings.
- Support keyboard navigation for dialogs, menus, sheets, forms, and tables.
- Trap/restore focus in modals.
- Respect reduced motion.
- Associate errors with fields.
- Keep touch targets at least `2.75rem`.

Responsive:

| Breakpoint |    Width | Use                             |
| ---------- | -------: | ------------------------------- |
| `sm`       |  `640px` | Large phones                    |
| `md`       |  `768px` | Tablets                         |
| `lg`       | `1024px` | Desktop layout                  |
| `xl`       | `1280px` | Wide desktop                    |
| `2xl`      | `1536px` | Data-heavy admin/report layouts |

Design at `360px` minimum first. Use single-column mobile forms, sticky bottom actions, mobile filter drawers, and card rows where tables are too dense. Promote side panels and richer tables only on tablet/desktop.

---

## 11. Tailwind and shadcn Mapping

Use CSS variables as the single source for Tailwind and shadcn/ui.

```ts
// tailwind.config.ts excerpt
colors: {
  background: 'rgb(var(--background) / <alpha-value>)',
  foreground: 'rgb(var(--foreground) / <alpha-value>)',
  card: 'rgb(var(--card) / <alpha-value>)',
  'card-foreground': 'rgb(var(--card-foreground) / <alpha-value>)',
  popover: 'rgb(var(--popover) / <alpha-value>)',
  'popover-foreground': 'rgb(var(--popover-foreground) / <alpha-value>)',
  primary: 'rgb(var(--primary) / <alpha-value>)',
  'primary-foreground': 'rgb(var(--primary-foreground) / <alpha-value>)',
  secondary: 'rgb(var(--secondary) / <alpha-value>)',
  'secondary-foreground': 'rgb(var(--secondary-foreground) / <alpha-value>)',
  muted: 'rgb(var(--muted) / <alpha-value>)',
  'muted-foreground': 'rgb(var(--muted-foreground) / <alpha-value>)',
  accent: 'rgb(var(--accent) / <alpha-value>)',
  'accent-foreground': 'rgb(var(--accent-foreground) / <alpha-value>)',
  destructive: 'rgb(var(--destructive) / <alpha-value>)',
  'destructive-foreground': 'rgb(var(--destructive-foreground) / <alpha-value>)',
  border: 'rgb(var(--border) / <alpha-value>)',
  input: 'rgb(var(--input) / <alpha-value>)',
  ring: 'rgb(var(--ring) / <alpha-value>)',
  success: 'rgb(var(--success) / <alpha-value>)',
  warning: 'rgb(var(--warning) / <alpha-value>)',
  info: 'rgb(var(--info) / <alpha-value>)',
  readonly: 'rgb(var(--readonly) / <alpha-value>)',
  offline: 'rgb(var(--offline) / <alpha-value>)',
},
borderRadius: {
  lg: 'var(--radius)',
  md: 'calc(var(--radius) - 2px)',
  sm: 'calc(var(--radius) - 4px)',
}
```

shadcn-compatible variables: `background`, `foreground`, `card`, `card-foreground`, `popover`, `popover-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `accent`, `accent-foreground`, `destructive`, `destructive-foreground`, `border`, `input`, `ring`, `radius`.

Extend variants only for documented UI needs: `readonly`, `offline`, `warning`, `success`, `info`.

---

## 12. Governance and Acceptance Criteria

New tokens are allowed only when existing semantic tokens cannot represent a reusable need, both light/dark values are defined, accessibility is checked, and the token does not introduce undocumented behavior.

Token changes are allowed only when they improve consistency, accessibility, or maintainability; preserve documented states; keep Tailwind/shadcn mappings valid; and include light/dark/system review.

This token system is acceptable when it:

- Keeps light mode as default.
- Supports dark and system modes.
- Maps cleanly to Tailwind CSS and shadcn/ui.
- Reflects GarageOS brand without decorative overuse.
- Supports mobile-first PWA layouts.
- Provides accessible focus, contrast, and touch behavior.
- Defines semantic status, alert, workflow, offline, read-only, and tenant lifecycle tokens.
- Does not add undocumented modules, routes, roles, permissions, workflows, or behavior.
