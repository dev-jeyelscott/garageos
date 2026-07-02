# GarageOS UI Tokens

**Document:** `ui-tokens.md`  
**Project:** GarageOS  
**Status:** Source-aligned frontend design-system guidance  
**Default Theme:** Light mode  
**Supported Theme Modes:** Light, dark, and system  
**Primary Source:** `garageos-ui-inventory.md`  
**Supporting Sources:** `ux-sreen-map.md`, `requirements-v2.4.md`, `architecture.md`, `tech-stack.md`, `api-contracts.md`, `permission-matrix.md`, `user-stories.md`

---

## 1. Purpose

This document defines the GarageOS visual token system for frontend UI and page creation.

It gives frontend engineers a consistent foundation for:

- Tailwind CSS theme values.
- CSS custom properties.
- shadcn/ui theme variables.
- Mobile-first responsive layouts.
- Accessible component styling.
- Consistent light, dark, and system-aware theme behavior.
- Workflow, status, alert, and blocked-state styling.

This document does **not** introduce new product modules, routes, roles, workflows, permissions, or business behavior. It only defines reusable visual and interaction tokens for the documented GarageOS mobile-first PWA.

---

## 2. Source Alignment

GarageOS frontend UI must remain aligned with the approved source documents.

Core alignment rules:

1. The UI is a **mobile-first PWA**.
2. The default visual theme is **light mode**.
3. Dark mode must be supported.
4. System theme mode must be supported.
5. UI implementation should align with **Next.js, React, TypeScript, Tailwind CSS, and shadcn/ui**.
6. UI state must reflect documented tenant status, permissions, branch access, plan limits, workflow status, offline mode, and API errors.
7. UI permission checks improve usability but do not replace backend authorization.
8. Offline mode is read-only only.
9. Financial, receipt, refund, inventory ledger, FIFO, and audit records must visually communicate immutability or correction-only behavior where applicable.
10. Tokens must not imply undocumented product behavior.

---

## 3. Brand Interpretation from Logo

The provided GarageOS logo communicates:

| Logo Attribute                | UI Interpretation                                             |
| ----------------------------- | ------------------------------------------------------------- |
| Orange and gold gradient mark | Primary brand energy, action, speed, shop-floor activity      |
| Chrome/silver accents         | Precision, machinery, reliability, professional tooling       |
| Graphite/black garage shape   | Operational seriousness, contrast, technical depth            |
| White wordmark                | Clarity, readability, clean SaaS interface                    |
| Dimensional badge shape       | Strong app identity, but UI should remain clean and practical |

### Brand Direction

GarageOS UI should feel:

- Operational.
- Fast.
- Reliable.
- Professional.
- Mechanic-friendly.
- Modern SaaS, not decorative or game-like.

### Brand Usage Rule

Use the orange/gold brand palette for primary actions, highlights, and key navigation affordances. Do **not** overuse high-saturation orange across dense operational screens, because GarageOS includes forms, tables, workflows, reports, invoices, and status-heavy views that require calm readability.

---

## 4. Token Naming Model

Use semantic tokens first. Raw brand colors should rarely be used directly in components.

### Token Layers

| Layer            | Purpose                           | Example                                |
| ---------------- | --------------------------------- | -------------------------------------- |
| Base palette     | Raw brand and neutral colors      | `brand-orange-500`, `graphite-900`     |
| Semantic tokens  | UI meaning                        | `primary`, `background`, `destructive` |
| Component tokens | Component-specific mappings       | `card`, `popover`, `input`, `sidebar`  |
| Workflow tokens  | Product status and business state | `status-success`, `workflow-blocked`   |

### Naming Rules

- Prefer semantic names in component code.
- Keep raw colors in theme configuration only.
- Keep light and dark mode values in CSS variables.
- Use status colors consistently across badges, banners, alerts, filters, timelines, and tables.
- Do not invent new workflow states. Use documented API/schema enums.

---

## 5. Base Color Palette

The following palette is inspired by the logo and adjusted for usable UI contrast.

### Brand Colors

| Token              | Hex       | Intended Use                  |
| ------------------ | --------- | ----------------------------- |
| `brand-orange-50`  | `#FFF4E6` | Light brand surface           |
| `brand-orange-100` | `#FFE2BF` | Soft active background        |
| `brand-orange-200` | `#FFC680` | Light highlight               |
| `brand-orange-300` | `#FFAA40` | Hover accent                  |
| `brand-orange-400` | `#FF8A00` | Brand accent                  |
| `brand-orange-500` | `#F97300` | Primary brand action          |
| `brand-orange-600` | `#EA580C` | Primary action hover          |
| `brand-orange-700` | `#C2410C` | Active/pressed                |
| `brand-orange-800` | `#9A3412` | Strong text on light surfaces |
| `brand-orange-900` | `#7C2D12` | Deep brand foreground         |

### Gold Accent

| Token            | Hex       | Intended Use                   |
| ---------------- | --------- | ------------------------------ |
| `brand-gold-50`  | `#FFF9DB` | Soft warning/highlight surface |
| `brand-gold-100` | `#FFF0A6` | Light gold chip                |
| `brand-gold-300` | `#FFD84D` | Accent highlight               |
| `brand-gold-500` | `#FBBF24` | Warning/accent                 |
| `brand-gold-700` | `#B7791F` | Text on light gold surfaces    |

### Red-Orange Accent

| Token           | Hex       | Intended Use             |
| --------------- | --------- | ------------------------ |
| `brand-red-100` | `#FFE0D5` | Soft destructive surface |
| `brand-red-500` | `#DC2626` | Destructive action       |
| `brand-red-700` | `#991B1B` | Destructive text         |

### Graphite and Metal Neutrals

| Token          | Hex       | Intended Use                 |
| -------------- | --------- | ---------------------------- |
| `graphite-950` | `#0B0B0C` | Dark mode app background     |
| `graphite-900` | `#111113` | Dark surfaces                |
| `graphite-850` | `#18181B` | Elevated dark surface        |
| `graphite-800` | `#27272A` | Dark border/surface          |
| `graphite-700` | `#3F3F46` | Muted dark text/border       |
| `metal-600`    | `#71717A` | Secondary text               |
| `metal-500`    | `#A1A1AA` | Muted text                   |
| `metal-300`    | `#D4D4D8` | Light border                 |
| `metal-200`    | `#E4E4E7` | Subtle border                |
| `metal-100`    | `#F4F4F5` | Light surface                |
| `metal-50`     | `#FAFAFA` | Page background              |
| `white`        | `#FFFFFF` | Card/page foreground surface |

---

## 6. Semantic Color Tokens

### Core Semantic Tokens

| Token                    | Light Mode | Dark Mode | Use                        |
| ------------------------ | ---------- | --------- | -------------------------- |
| `background`             | `#FAFAFA`  | `#0B0B0C` | App background             |
| `foreground`             | `#18181B`  | `#FAFAFA` | Primary text               |
| `card`                   | `#FFFFFF`  | `#18181B` | Cards, panels              |
| `card-foreground`        | `#18181B`  | `#FAFAFA` | Card text                  |
| `popover`                | `#FFFFFF`  | `#18181B` | Menus, popovers            |
| `popover-foreground`     | `#18181B`  | `#FAFAFA` | Popover text               |
| `primary`                | `#F97300`  | `#FF8A00` | Main CTA                   |
| `primary-foreground`     | `#FFFFFF`  | `#111113` | Text on primary            |
| `secondary`              | `#F4F4F5`  | `#27272A` | Secondary buttons/surfaces |
| `secondary-foreground`   | `#18181B`  | `#FAFAFA` | Text on secondary          |
| `muted`                  | `#F4F4F5`  | `#27272A` | Muted backgrounds          |
| `muted-foreground`       | `#71717A`  | `#A1A1AA` | Muted text                 |
| `accent`                 | `#FFF4E6`  | `#3A2415` | Soft brand accent          |
| `accent-foreground`      | `#9A3412`  | `#FFD84D` | Text on accent             |
| `destructive`            | `#DC2626`  | `#F87171` | Destructive actions        |
| `destructive-foreground` | `#FFFFFF`  | `#111113` | Text on destructive        |
| `border`                 | `#E4E4E7`  | `#27272A` | Default border             |
| `input`                  | `#D4D4D8`  | `#3F3F46` | Inputs                     |
| `ring`                   | `#F97300`  | `#FFAA40` | Focus ring                 |

---

## 7. Light Mode Token Defaults

Light mode is the default GarageOS theme.

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
```

---

## 8. Dark Mode Token Overrides

Dark mode must preserve readability and should use orange/gold sparingly for active states.

```css
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

---

## 9. Theme Mode Behavior

GarageOS must support:

| Theme Mode | Behavior                                                  |
| ---------- | --------------------------------------------------------- |
| Light      | Force light token set                                     |
| Dark       | Force dark token set                                      |
| System     | Follow OS/browser preference using `prefers-color-scheme` |

### Implementation Guidance

Use a theme provider compatible with Next.js and class-based dark mode.

Recommended behavior:

1. Default new sessions to `system` when no user preference exists.
2. Resolve system to light/dark at runtime.
3. Avoid hydration mismatch by delaying theme-dependent rendering until mounted when necessary.
4. Persist explicit user preference locally only for UI preference.
5. Do not store sensitive auth/session data in theme storage.
6. Use `class="dark"` on the document root for dark mode.
7. Keep CSS variables as the single source for shadcn/ui and Tailwind mappings.

### Theme Switching UX

Use a simple menu in the user/account menu:

- Light.
- Dark.
- System.

Do not make theme selection part of product onboarding unless a documented requirement later adds it.

---

## 10. Semantic Status Tokens

Status colors must support badges, timeline nodes, banners, table chips, filter chips, and detail headers.

### General Status Tokens

| Token             | Light Surface | Light Text | Dark Surface | Dark Text | Use                                  |
| ----------------- | ------------- | ---------- | ------------ | --------- | ------------------------------------ |
| `status-neutral`  | `#F4F4F5`     | `#3F3F46`  | `#27272A`    | `#D4D4D8` | Draft, inactive, default             |
| `status-info`     | `#DBEAFE`     | `#1D4ED8`  | `#1E3A8A`    | `#BFDBFE` | Informational, queued                |
| `status-progress` | `#FFF4E6`     | `#C2410C`  | `#3A2415`    | `#FFAA40` | In progress, running                 |
| `status-success`  | `#DCFCE7`     | `#15803D`  | `#14532D`    | `#BBF7D0` | Paid, completed, succeeded           |
| `status-warning`  | `#FEF3C7`     | `#B45309`  | `#451A03`    | `#FDE68A` | Grace, pending approval, low stock   |
| `status-danger`   | `#FEE2E2`     | `#B91C1C`  | `#7F1D1D`    | `#FECACA` | Blocked, failed, suspended           |
| `status-readonly` | `#E4E4E7`     | `#52525B`  | `#3F3F46`    | `#D4D4D8` | Read-only tenant or read-only record |
| `status-offline`  | `#E4E4E7`     | `#52525B`  | `#27272A`    | `#D4D4D8` | Offline read-only state              |

---

## 11. Workflow-State Token Guidance

Use documented status enum values as the data source. The UI may group them into visual categories, but must not invent additional workflow states.

### Tenant Lifecycle

| Status             | Visual Token      | UI Treatment                                               |
| ------------------ | ----------------- | ---------------------------------------------------------- |
| `pending_setup`    | `status-warning`  | Setup gate and onboarding checklist                        |
| `active`           | `status-success`  | Normal access                                              |
| `grace_period`     | `status-warning`  | Persistent renewal warning; writes remain permission-based |
| `read_only`        | `status-readonly` | Read-only banner; writes disabled                          |
| `suspended`        | `status-danger`   | Suspended screen; owner renewal/export only                |
| `pending_deletion` | `status-danger`   | Operational access blocked                                 |
| `deleted`          | `status-danger`   | Tenant unavailable/account inactive                        |

### Common Workflow Mapping

| Workflow Meaning    | Visual Token      | Examples                                            |
| ------------------- | ----------------- | --------------------------------------------------- |
| Draft/editable      | `status-neutral`  | Draft estimate, draft invoice, draft purchase       |
| Waiting/review      | `status-warning`  | Pending approval, ordered, pending                  |
| Active work         | `status-progress` | In progress, running, in transit                    |
| Complete/final      | `status-success`  | Paid, completed, received, succeeded                |
| Cancelled/voided    | `status-neutral`  | Cancelled, voided, released                         |
| Failed/blocked      | `status-danger`   | Failed job, rejected action, blocked access         |
| Immutable/read-only | `status-readonly` | Receipt, issued payment, audit record, ledger entry |

---

## 12. Alert and Blocking Tokens

Use alert tokens for system-level notices, API errors, and workflow blockers.

| Token            | Use                                               |
| ---------------- | ------------------------------------------------- |
| `alert-info`     | General guidance, contextual help                 |
| `alert-success`  | Completed action confirmation                     |
| `alert-warning`  | Renewal warning, pending setup, approval required |
| `alert-danger`   | Suspended tenant, destructive action, failed job  |
| `alert-readonly` | Read-only tenant or immutable record              |
| `alert-offline`  | Offline mode and blocked write attempt            |

### Required Blocking States

The UI must provide consistent presentation for:

- `forbidden`.
- `branch_access_denied`.
- `subscription_access_blocked`.
- `plan_limit_exceeded`.
- `validation_failed`.
- `workflow_transition_blocked`.
- `inventory_insufficient_available_stock`.
- `invoice_overpayment_blocked`.
- `invoice_overbilling_blocked`.
- `version_conflict`.
- `idempotency_conflict`.
- Offline write attempt.

---

## 13. Typography Tokens

### Font Families

| Token          | Value                                                                                 | Use                                             |
| -------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `font-sans`    | `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | Product UI                                      |
| `font-mono`    | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace` | IDs, technical values, logs                     |
| `font-numeric` | `font-variant-numeric: tabular-nums`                                                  | Currency, quantity, timestamps, invoice numbers |

Do not use the logo wordmark style as the application UI font. The logo is a brand asset, not a text-system font.

### Type Scale

| Token       |       Size | Line Height |    Weight | Use                                 |
| ----------- | ---------: | ----------: | --------: | ----------------------------------- |
| `text-xs`   |  `0.75rem` |      `1rem` | `400/500` | Badges, helper text, table metadata |
| `text-sm`   | `0.875rem` |   `1.25rem` | `400/500` | Default body, inputs, table cells   |
| `text-base` |     `1rem` |    `1.5rem` | `400/500` | Primary body, mobile form labels    |
| `text-lg`   | `1.125rem` |   `1.75rem` |     `600` | Card titles, section headers        |
| `text-xl`   |  `1.25rem` |   `1.75rem` | `600/700` | Page titles on mobile               |
| `text-2xl`  |   `1.5rem` |      `2rem` |     `700` | Desktop page titles                 |
| `text-3xl`  | `1.875rem` |   `2.25rem` |     `700` | Dashboard hero metrics              |
| `text-4xl`  |  `2.25rem` |    `2.5rem` | `700/800` | Rare marketing/auth hero use        |

### Typography Rules

- Use `text-sm` as the default dense operations size.
- Use tabular numbers for money, quantities, invoice numbers, receipt numbers, document numbers, and timestamps.
- Keep operational screens compact but not cramped.
- Use clear hierarchy for mobile: page title, section label, card title, field label, helper/error text.
- Avoid decorative text effects inside operational screens.

---

## 14. Spacing Tokens

Use Tailwind’s spacing scale with these semantic aliases.

| Token      |     Value | Use                             |
| ---------- | --------: | ------------------------------- |
| `space-0`  |       `0` | No gap                          |
| `space-1`  | `0.25rem` | Tight icon/text gap             |
| `space-2`  |  `0.5rem` | Dense row gap                   |
| `space-3`  | `0.75rem` | Default internal card gap       |
| `space-4`  |    `1rem` | Default section gap             |
| `space-5`  | `1.25rem` | Form group gap                  |
| `space-6`  |  `1.5rem` | Page section gap                |
| `space-8`  |    `2rem` | Large page block gap            |
| `space-10` |  `2.5rem` | Auth/onboarding vertical rhythm |
| `space-12` |    `3rem` | Large marketing/auth spacing    |

### Layout Spacing

| Token                     |     Value | Use                                   |
| ------------------------- | --------: | ------------------------------------- |
| `page-padding-mobile`     |    `1rem` | Mobile page padding                   |
| `page-padding-tablet`     |  `1.5rem` | Tablet page padding                   |
| `page-padding-desktop`    |    `2rem` | Desktop content padding               |
| `shell-bottom-nav-height` |    `4rem` | Mobile bottom navigation safe spacing |
| `sticky-action-height`    |  `4.5rem` | Sticky mobile action region           |
| `form-control-height`     | `2.75rem` | Touch-friendly control height         |
| `compact-control-height`  | `2.25rem` | Dense table/filter controls           |
| `touch-target-min`        | `2.75rem` | Minimum touch target                  |

---

## 15. Radius Tokens

Use moderate radius values. The logo has strong badge geometry, but product UI should remain clean and practical.

| Token         |      Value | Use                             |
| ------------- | ---------: | ------------------------------- |
| `radius-none` |        `0` | Tables and joined controls      |
| `radius-xs`   |  `0.25rem` | Small badges                    |
| `radius-sm`   | `0.375rem` | Inputs, small controls          |
| `radius-md`   |   `0.5rem` | Buttons, cards in dense layouts |
| `radius-lg`   |  `0.75rem` | Default cards, dialogs, sheets  |
| `radius-xl`   |     `1rem` | Feature cards, auth panels      |
| `radius-2xl`  |  `1.25rem` | Large onboarding/auth panels    |
| `radius-full` |   `9999px` | Pills, avatars, status chips    |

shadcn/ui base radius:

```css
:root {
  --radius: 0.75rem;
}
```

---

## 16. Shadow and Elevation Tokens

Keep elevation subtle. Operational interfaces should communicate hierarchy without visual noise.

| Token          | Value                              | Use                              |
| -------------- | ---------------------------------- | -------------------------------- |
| `shadow-none`  | `none`                             | Flat table rows, inline controls |
| `shadow-xs`    | `0 1px 2px rgb(0 0 0 / 0.05)`      | Inputs, small cards              |
| `shadow-sm`    | `0 1px 3px rgb(0 0 0 / 0.08)`      | Default cards                    |
| `shadow-md`    | `0 4px 12px rgb(0 0 0 / 0.10)`     | Sticky bars, dropdowns           |
| `shadow-lg`    | `0 12px 24px rgb(0 0 0 / 0.14)`    | Dialogs, drawers                 |
| `shadow-brand` | `0 8px 24px rgb(249 115 0 / 0.20)` | Rare primary CTA emphasis        |

### Elevation Rules

- Do not use heavy shadow on every card.
- Use borders plus light shadow for most surfaces.
- Use `shadow-lg` only for overlays.
- Use `shadow-brand` sparingly for primary onboarding/auth moments, not dense workflows.

---

## 17. Border Tokens

| Token            | Light     | Dark      | Use                               |
| ---------------- | --------- | --------- | --------------------------------- |
| `border-default` | `#E4E4E7` | `#27272A` | Cards, tables, separators         |
| `border-strong`  | `#D4D4D8` | `#3F3F46` | Active panels, important sections |
| `border-muted`   | `#F4F4F5` | `#18181B` | Subtle dividers                   |
| `border-primary` | `#F97300` | `#FF8A00` | Focus/selected brand state        |
| `border-danger`  | `#DC2626` | `#F87171` | Error/destructive state           |
| `border-warning` | `#F59E0B` | `#FBBF24` | Warning state                     |
| `border-success` | `#16A34A` | `#4ADE80` | Success state                     |

### Border Rules

- Prefer 1px borders for cards, lists, tables, filters, and inputs.
- Use left-border accents for important alerts and status timelines.
- Use brand border only for selected/active states, not decoration.

---

## 18. Icon Usage Guidance

GarageOS iconography should be simple, outline-based, and operational.

### Icon Rules

- Use one icon style consistently across the app.
- Prefer line icons with `1.75px` to `2px` stroke.
- Use icons to support scanning, not replace labels on critical actions.
- All icon-only buttons require accessible labels.
- Use status icons consistently:
  - Success: check.
  - Warning: alert triangle.
  - Error/destructive: circle alert or octagon alert.
  - Info: info circle.
  - Offline: wifi-off/cloud-off.
  - Locked/read-only: lock.
  - Branch: map-pin/building.
  - Support access: shield/user-check.
  - Audit/history: clock/history.

### Size Tokens

| Token     |       Size | Use                |
| --------- | ---------: | ------------------ |
| `icon-xs` | `0.875rem` | Tiny metadata      |
| `icon-sm` |     `1rem` | Inline labels      |
| `icon-md` |  `1.25rem` | Buttons/navigation |
| `icon-lg` |   `1.5rem` | Empty states/cards |
| `icon-xl` |     `2rem` | Large empty states |

---

## 19. Component Token Usage

### Buttons

| Variant       | Token Use                               | Usage                                 |
| ------------- | --------------------------------------- | ------------------------------------- |
| `primary`     | `primary`, `primary-foreground`         | Main screen CTA                       |
| `secondary`   | `secondary`, `secondary-foreground`     | Secondary actions                     |
| `outline`     | `border`, `background`                  | Neutral actions                       |
| `ghost`       | Transparent + hover muted               | Low-emphasis actions                  |
| `destructive` | `destructive`, `destructive-foreground` | Delete, cancel, void, reject          |
| `readonly`    | `readonly`                              | Disabled/read-only explanation action |
| `link`        | `primary` text                          | Inline navigation                     |

Rules:

- Use one primary CTA per screen region.
- Use destructive styling only for destructive or corrective actions.
- Disabled buttons must have explanatory nearby text, tooltip, or blocked-state message when the reason is not obvious.
- Offline, read-only tenant, and permission-blocked states must disable operational write actions.

### Forms

| Element         | Token Guidance                                    |
| --------------- | ------------------------------------------------- |
| Label           | `foreground`, `text-sm`, `font-medium`            |
| Input           | `background`, `input`, `foreground`, focus `ring` |
| Helper text     | `muted-foreground`, `text-xs`                     |
| Error text      | `destructive`, `text-xs`                          |
| Required marker | `destructive` or `primary`                        |
| Field group     | `space-2` to `space-3`                            |
| Form section    | `card`, `border`, `radius-lg`, `space-4`          |

Rules:

- Use field-level validation messages for API `validation_failed`.
- Preserve user input on validation failure.
- Use optimistic UI only where safe; do not fake completion of critical writes.
- Use idempotency-aware submission for critical writes.

### Tables

| Element       | Token Guidance                                             |
| ------------- | ---------------------------------------------------------- |
| Header        | `muted`, `muted-foreground`, `text-xs`, uppercase optional |
| Row           | `card/background`, border bottom                           |
| Hover         | `muted`                                                    |
| Selected row  | `accent`, `accent-foreground`                              |
| Numeric cells | `font-numeric`, right aligned                              |
| Status cell   | Status badge                                               |
| Empty table   | Empty state pattern                                        |

Rules:

- Tables must collapse into cards or row summaries on mobile where horizontal density is too high.
- Keep actions in row menu on mobile.
- Use sticky headers only when useful and performant.
- Use cursor pagination patterns for high-volume lists.

### Cards

| Token             | Use               |
| ----------------- | ----------------- |
| `card`            | Surface           |
| `card-foreground` | Text              |
| `border`          | Boundary          |
| `radius-lg`       | Shape             |
| `shadow-sm`       | Default elevation |

Rules:

- Use cards for mobile list items, dashboard metrics, detail sections, and workflow summaries.
- Avoid deep card nesting on mobile.
- Use section headers inside cards for dense operational forms.

### Modals and Dialogs

Use dialogs for:

- Confirmation.
- Destructive action.
- Workflow transition.
- Reason-required action.
- Short forms.

Token guidance:

- Surface: `popover`.
- Border: `border`.
- Radius: `radius-lg`.
- Shadow: `shadow-lg`.

Rules:

- Dialog titles must clearly name the action.
- Dialogs for corrective actions must show impact summary.
- Use destructive styling for irreversible or corrective actions.
- Do not place long multi-step workflows in small dialogs.

### Drawers and Sheets

Use drawers/sheets for:

- Mobile filters.
- Detail side panels.
- Long forms.
- Review summaries.
- Workflow action panels.

Rules:

- Prefer bottom drawer on mobile.
- Prefer side sheet on tablet/desktop.
- Keep sticky action footer for long mobile forms.
- Always preserve context when closing without submitting.

### Toasts

Use toasts for:

- Save success.
- Background job queued.
- Non-blocking error summary.
- Export started.
- Session or network notices.

Rules:

- Blocking errors require inline alert or state page, not only toast.
- Toasts must not contain sensitive payloads.
- Include recovery action only when documented and safe.

### Navigation

| Component         | Token Use                                                   |
| ----------------- | ----------------------------------------------------------- |
| Active nav item   | `accent`, `accent-foreground`, optional `primary` indicator |
| Inactive nav item | `muted-foreground`                                          |
| Disabled nav item | `muted-foreground` with blocked state                       |
| Tenant banner     | Status token                                                |
| Branch chip       | `secondary`, `secondary-foreground`                         |
| Offline indicator | `status-offline`                                            |

---

## 20. Accessibility Requirements

GarageOS UI must support accessible, touch-friendly, mobile-first workflows.

### Required Practices

- Maintain accessible contrast in light and dark themes.
- Do not use color alone to communicate status.
- Pair status color with text and/or icon.
- Use semantic HTML elements.
- Provide visible focus states with `ring`.
- Ensure keyboard navigation for dialogs, menus, sheets, forms, and tables.
- Provide accessible labels for icon-only actions.
- Maintain minimum touch target size of `2.75rem`.
- Respect reduced-motion preferences.
- Avoid flashing or excessive animation.
- Ensure error messages are associated with fields.
- Ensure modals trap focus and restore focus on close.
- Ensure disabled actions have an understandable reason when blocked by permission, tenant status, plan, branch access, read-only mode, or offline mode.

---

## 21. Responsive Tokens

### Breakpoints

Use Tailwind defaults unless the project changes them through an approved frontend ADR.

| Token |    Width | Use                             |
| ----- | -------: | ------------------------------- |
| `sm`  |  `640px` | Large phones / small tablets    |
| `md`  |  `768px` | Tablet                          |
| `lg`  | `1024px` | Desktop layout begins           |
| `xl`  | `1280px` | Wide desktop                    |
| `2xl` | `1536px` | Data-heavy admin/report layouts |

### Mobile-First Layout Rules

- Design at `360px` minimum width first.
- Use single-column forms on mobile.
- Use sticky bottom actions for primary submit actions on long forms.
- Use drawers for filters on mobile.
- Use tables only when readable; otherwise use card rows.
- Promote side-by-side summary panels only on tablet/desktop.
- Keep branch, tenant, offline, and support-access context visible.

---

## 22. Tailwind Implementation Notes

### Tailwind Theme Mapping

Use CSS variables as the source for shadcn/ui and Tailwind colors.

Example:

```ts
// tailwind.config.ts
export default {
  darkMode: ['class'],
  theme: {
    extend: {
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
      },
    },
  },
};
```

---

## 23. shadcn/ui Implementation Notes

GarageOS should use shadcn/ui-compatible variables for:

- `background`.
- `foreground`.
- `card`.
- `card-foreground`.
- `popover`.
- `popover-foreground`.
- `primary`.
- `primary-foreground`.
- `secondary`.
- `secondary-foreground`.
- `muted`.
- `muted-foreground`.
- `accent`.
- `accent-foreground`.
- `destructive`.
- `destructive-foreground`.
- `border`.
- `input`.
- `ring`.
- `radius`.

Component variants should be extended only when they map to documented UI needs such as:

- `readonly`.
- `offline`.
- `warning`.
- `success`.
- `info`.

Do not create component variants for undocumented product flows.

---

## 24. Token Governance

### Adding Tokens

A new token may be added only when:

1. Existing semantic tokens cannot represent the need.
2. The need applies to more than one component or screen.
3. The token does not introduce undocumented product behavior.
4. Light and dark values are both defined.
5. Accessibility contrast has been checked.
6. The token name describes semantic purpose, not a one-off page.

### Modifying Tokens

A token may be changed only when:

1. The visual change improves consistency, accessibility, or implementation maintainability.
2. It does not break documented states.
3. shadcn/ui and Tailwind mappings remain valid.
4. Affected components are reviewed in light, dark, and system modes.
5. Regression screenshots or UI tests are updated where applicable.

---

## 25. Acceptance Criteria

`ui-tokens.md` is acceptable when:

- It keeps light mode as the default theme.
- It supports dark mode.
- It supports system theme mode.
- It maps cleanly to Tailwind CSS variables.
- It maps cleanly to shadcn/ui theming.
- It reflects the GarageOS logo without overusing decorative brand styling.
- It supports mobile-first PWA layouts.
- It supports accessible contrast and visible focus states.
- It defines semantic status, alert, workflow, offline, read-only, and tenant lifecycle tokens.
- It does not introduce undocumented modules, routes, roles, permissions, or workflows.
