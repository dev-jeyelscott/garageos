# GarageOS ADR Package

# GarageOS Architecture Decision Records

This directory contains the source-aligned Architecture Decision Records for GarageOS.

Accepted ARDs are binding implementation guidance unless superseded by a later accepted ARD. Product behavior remains governed by the approved source documents.

## Source-of-Truth Rules

1. `requirements.md` remains the highest product authority.
2. `database-design.md` and `database-schema.md` remain the persistence and data-integrity authorities.
3. `architecture.md` remains the architecture authority.
4. `api-contracts.md` remains the API behavior authority.
5. Downstream artifacts guide implementation, QA, UX, traceability, and delivery but do not override the PRD.
6. ARDs must not introduce excluded capabilities.
7. If an ARD conflicts with the PRD, schema, architecture, or API contracts, revise or supersede the ARD.

## ADR Format

Each ADR includes:

- Status
- Date
- Decision Owner
- Decision Type
- Required Before
- Source Alignment
- Context
- Decision
- Consequences
- Validation
- Risks
- Follow-ups

## Required ADR Inventory

| ADR                       | Title                                         | Status                                    | Required Before                                          |
| ------------------------- | --------------------------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| [ARD-0001](./ARD-0001.md) | Architecture Record Governance                | Accepted                                  | Milestone 1                                              |
| [ARD-0002](./ARD-0002.md) | Repository Model and TypeScript Workspace     | Accepted                                  | Milestone 1                                              |
| [ARD-0003](./ARD-0003.md) | Frontend Framework and PWA Strategy           | Accepted                                  | Milestone 1                                              |
| [ARD-0004](./ARD-0004.md) | UX Design System Strategy                     | Accepted                                  | Milestone 1                                              |
| [ARD-0005](./ARD-0005.md) | Backend Framework and Modular Monolith        | Accepted                                  | Milestone 1                                              |
| [ARD-0006](./ARD-0006.md) | REST API Contract, Naming, and DTO Style      | Accepted                                  | Milestone 1                                              |
| [ARD-0007](./ARD-0007.md) | Validation Strategy                           | Accepted                                  | Milestone 1                                              |
| [ARD-0008](./ARD-0008.md) | SQL-Visible Query Layer                       | Accepted                                  | Milestone 1                                              |
| [ARD-0009](./ARD-0009.md) | Migration Tool and Schema Drift Control       | Accepted                                  | Milestone 1                                              |
| [ARD-0010](./ARD-0010.md) | Database Enum Strategy                        | Accepted                                  | Milestone 1                                              |
| [ARD-0011](./ARD-0011.md) | Identifier Strategy                           | Accepted                                  | Milestone 1                                              |
| [ARD-0012](./ARD-0012.md) | Tenant/Branch Isolation and RLS Timing        | Accepted                                  | Milestone 1                                              |
| [ARD-0013](./ARD-0013.md) | PWA Token Transport and Session Security      | Accepted                                  | Milestone 2                                              |
| [ARD-0014](./ARD-0014.md) | Idempotency and Optimistic Locking            | Accepted                                  | Milestone 2                                              |
| [ARD-0015](./ARD-0015.md) | Append-Only Immutability Protections          | Accepted                                  | Milestone 1 baseline; production hardening before launch |
| [ARD-0016](./ARD-0016.md) | Background Job Locking and Outbox Processing  | Accepted                                  | Milestone 2                                              |
| [ARD-0017](./ARD-0017.md) | Reporting/Search Read Model Refresh Strategy  | Accepted                                  | Milestone 6 baseline; full before Milestone 12           |
| [ARD-0018](./ARD-0018.md) | File Upload, Download, and Object Storage     | Accepted                                  | Milestone 11                                             |
| [ARD-0019](./ARD-0019.md) | External Provider Adapter Strategy            | Accepted with provider selection deferred | Milestone 10/13                                          |
| [ARD-0020](./ARD-0020.md) | Server-Side Cache Policy                      | Accepted                                  | Milestone 1                                              |
| [ARD-0021](./ARD-0021.md) | Append-Only Table Partitioning Threshold      | Accepted                                  | Milestone 13 hardening                                   |
| [ARD-0022](./ARD-0022.md) | OpenAPI Generation and Contract Drift Control | Accepted                                  | Milestone 2                                              |
| [ARD-0023](./ARD-0023.md) | Environments, Deployment Units, and CI/CD     | Accepted                                  | Milestone 1                                              |
| [ARD-0024](./ARD-0024.md) | Observability, Backup, and Disaster Recovery  | Accepted                                  | Milestone 13                                             |

## Panel Summary

| Role                 | Resolution                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Business Owner       | Preserve SaaS monetization, lifecycle enforcement, exports, deletion controls, and support access.                   |
| Product Manager / BA | Treat these as implementation decisions only; do not alter PRD scope.                                                |
| SMEs                 | Prefer conservative transactional architecture for real motorcycle shop workflows.                                   |
| End Users            | Keep the PWA mobile-first, role-aware, and offline read-only.                                                        |
| Architect            | Use modular monolith, PostgreSQL source of truth, jobs/outbox, and private object storage.                           |
| Senior Engineers     | Require SQL visibility, transactions, idempotency, locks, and integration tests.                                     |
| UX Designer          | Follow the UX screen map and lifecycle/permission/offline states.                                                    |
| QA                   | Make every decision testable through unit, integration, contract, E2E, concurrency, security, and operational tests. |
| Security             | Prioritize tenant isolation, token safety, file privacy, support access, rate limits, and sensitive-log controls.    |
| DevOps               | Use containers, CI/CD, staging parity, logs/metrics/errors/traces, backups, and restore runbooks.                    |
| Project Manager      | Keep foundational ARDs accepted before database work starts.                                                         |

---

# ARD-0001 — Architecture Record Governance

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Governance  
**Required Before:** Milestone 1  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

GarageOS has many cross-cutting technical choices that affect security, data integrity, operations, and cost. The roadmap requires an ADR directory and foundational records before Milestone 1.

### Decision

Create an `/docs/adr/` directory in the repository. Each architecture decision must be recorded using this structure:

```text
# ARD-XXXX — Title
Status: Proposed | Accepted | Superseded | Deprecated
Date:
Decision Owner:
Source Alignment:
Context:
Decision:
Consequences:
Validation:
Risks:
Follow-ups:
```

Accepted ARDs are binding implementation guidance unless superseded by a later accepted ARD. Product behavior remains governed by the PRD and source documents.

### Consequences

- Prevents undocumented technical drift.
- Provides auditability for engineering decisions.
- Adds documentation overhead for high-impact technical changes.

### Validation

- CI or review checklist confirms every high-impact technical change references an ARD.
- Feature tickets include PRD, RTM, API, schema, permission, UX, QA, and ARD references where applicable.

### Risks

- ADR process may become stale if not enforced during reviews.
- Engineers may bypass ADR updates for high-impact technical changes under schedule pressure.
- Conflicting ADRs may cause implementation drift if supersession is not explicit.

### Follow-ups

- Add ADR reference checks to PR template or review checklist.
- Define when an ADR must be superseded versus edited.
- Keep README inventory updated when records change.

---

# ARD-0002 — Repository Model and TypeScript Workspace

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Repository / Tooling  
**Required Before:** Milestone 1  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

The approved stack uses TypeScript across the PWA and backend. Shared DTOs, validation schemas, API clients, test utilities, and domain primitives need consistency.

### Decision

Use a TypeScript monorepo managed with `pnpm` workspaces.

Recommended package layout:

```text
apps/
  web/        # Next.js PWA
  api/        # NestJS API
  worker/     # background worker entrypoint
  scheduler/  # scheduled job enqueueing entrypoint
packages/
  shared/     # shared types, constants, money/time utilities
  api-client/ # typed REST client
  config/     # shared lint/ts/test configuration
  test-utils/ # test fixtures and helpers
docs/
  adr/
  runbooks/
  api/
```

### Consequences

- Simplifies shared types and API contract alignment.
- Enables coordinated CI for frontend/backend/schema.
- Requires strict package boundaries to avoid coupling frontend to backend internals.

### Validation

- `pnpm install`, lint, typecheck, unit tests, and migration validation run in CI.
- No circular dependencies between packages.
- Shared packages contain only cross-cutting primitives and generated/shared contracts, not domain service logic.

### Risks

- Shared packages may become dumping grounds for domain logic.
- Monorepo dependency boundaries may weaken over time.
- Workspace tooling failures can block all apps if CI is not scoped carefully.

### Follow-ups

- Add dependency-boundary linting or review rules.
- Document package ownership and allowed dependencies.
- Add workspace bootstrap instructions to README.

---

# ARD-0003 — Frontend Framework and PWA Strategy

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Frontend / PWA  
**Required Before:** Milestone 1  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

GarageOS is required to be a mobile-first PWA. Offline mode is limited to app shell and read-only recent-record cache.

### Decision

Use **Next.js with React and TypeScript** for the web application. Implement PWA capabilities using a web app manifest, service worker, app-shell caching, and explicitly read-only recent-record cache.

Offline mode must:

- Show a visible offline indicator.
- Allow app shell access and recently viewed read-only records only.
- Block all operational writes, approvals, uploads, payments, inventory actions, and sync behavior.
- Clear user-scoped cache on logout or session invalidation.

### Consequences

- Supports mobile-first UX and installability.
- Avoids unsupported offline-write complexity.
- Requires careful service worker cache invalidation and authenticated cache controls.

### Validation

- Playwright tests cover PWA shell, offline indicator, blocked offline write attempts, and cache clearing on logout.
- QA validates 360px minimum-width core workflows.

### Risks

- Service worker cache mistakes can expose stale or unauthorized data.
- PWA install/offline behavior may vary by browser and device.
- Accidental offline write support could violate explicit product exclusions.

### Follow-ups

- Define service worker cache strategy before offline cache implementation.
- Add Playwright mobile/offline scenarios.
- Document logout/session invalidation cache cleanup behavior.

---

# ARD-0004 — UX Design System Strategy

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** UX / UI  
**Required Before:** Milestone 1  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

The UX screen map defines screen inventory but not pixel-level wireframes. The roadmap requires low-fidelity wireframes and a design-system baseline without adding scope.

### Decision

Use **Tailwind CSS** with a **shadcn/ui-style component foundation** built on accessible primitives. Produce low-fidelity wireframes first for high-frequency workflows before detailed UI implementation.

Required baseline patterns:

- Mobile navigation shell.
- Tenant status banners.
- Branch selector/indicator.
- Permission-aware action states.
- Offline read-only indicator.
- Workflow action confirmation modals.
- Reason-field pattern for audited/corrective actions.
- Form validation and conflict states.
- Background job status components.

### Consequences

- Speeds implementation while preserving consistency.
- Avoids heavy design-system overhead early.
- Requires disciplined component reuse and accessibility checks.

### Validation

- UI components pass accessibility checks where practical.
- UX screens map to documented route groups only.
- QA verifies permission, lifecycle, offline, empty, loading, validation, and conflict states.

### Risks

- Component reuse may drift without ownership and review.
- Accessibility gaps may appear if primitives are customized incorrectly.
- Wireframes may imply undocumented workflow scope if not traced to the UX map.

### Follow-ups

- Create low-fidelity wireframe backlog from ux-sreen-map.md.
- Define reusable form, modal, banner, and job-status components.
- Add accessibility checks to frontend review workflow.

---

# ARD-0005 — Backend Framework and Modular Monolith

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Backend Architecture  
**Required Before:** Milestone 1  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

GarageOS has many workflows requiring atomic multi-table transactions: job completion with inventory consumption, invoice issuance, payment plus receipt, transfer receiving, purchase receiving, refunds, exports, deletion jobs, and supplier returns.

### Decision

Use **NestJS with TypeScript** as a modular monolith.

The backend must be organized around domain modules with internal layers:

```text
module/
  api/
  application/
  domain/
  persistence/
  policies/
  events/
  tests/
```

Modules communicate through application services and domain events/outbox records, not direct cross-module table mutation.

### Consequences

- Preserves transaction safety and implementation simplicity.
- Supports strong module boundaries and future extraction if production evidence justifies it.
- Requires engineering discipline to prevent “big ball of mud” coupling.

### Validation

- Module dependency rules are enforced by code review or dependency linting.
- Critical commands use explicit transaction wrappers.
- Integration tests verify rollback behavior across multi-table workflows.

### Risks

- Module boundaries can erode into cross-module table mutation.
- Large modular monoliths can become hard to maintain without dependency rules.
- Future microservice extraction may be harder if domain boundaries are unclear.

### Follow-ups

- Create backend module dependency rules.
- Add shared transaction wrapper before high-risk workflows.
- Document event/outbox use between modules.

---

# ARD-0006 — REST API Contract, Naming, and DTO Style

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** API  
**Required Before:** Milestone 1  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

The API contract requires REST over HTTPS, `/api/v1`, JSON envelopes, explicit workflow action endpoints, stable enum values, and consistent error semantics.

### Decision

Implement a REST-first API under `/api/v1`. Use `snake_case` JSON fields to align with schema columns, enum values, exports, and the human-readable API contract.

Use explicit action endpoints for workflow transitions, such as:

```text
POST /invoices/{id}/issue
POST /invoices/{id}/payments
POST /payments/{id}/refunds
POST /inventory-transfers/{id}/send
POST /inventory-transfers/{id}/receive
```

Do not expose arbitrary status PATCHing for state machines.

### Consequences

- Improves predictability for frontend and QA.
- Preserves workflow invariants.
- Frontend may use TypeScript mapping helpers if components prefer camelCase internally, but API payloads remain snake_case.

### Validation

- API contract tests verify response envelope, error envelope, status codes, error codes, correlation IDs, and snake_case payloads.
- Workflow transition tests verify unsupported status changes are blocked.

### Risks

- Open-ended action endpoints may be added without API contract trace.
- snake_case/camelCase mapping may create frontend friction.
- Inconsistent error envelopes would reduce QA determinism.

### Follow-ups

- Create API controller conventions and example endpoint.
- Add contract tests for envelope/error/idempotency patterns.
- Generate initial OpenAPI after API skeleton exists.

---

# ARD-0007 — Validation Strategy

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** API / Backend  
**Required Before:** Milestone 1  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

The API requires deterministic validation errors, stable DTO behavior, precision checks for money/quantity, and clear blocked-action messages.

### Decision

Use **Zod schemas** for request validation and shared schema-derived typing where practical, integrated into NestJS pipes. Keep service-layer business validation separate from DTO shape validation.

Validation layers:

1. Request DTO/schema validation.
2. Authorization and tenant/branch/status/plan guards.
3. Business-rule validation inside command services.
4. Database constraints as final invariant protection.

### Consequences

- Keeps validation close to API contracts and testable.
- Avoids relying only on frontend validation.
- Requires discipline to avoid duplicating business rules in DTO schemas.

### Validation

- Contract tests assert `422 validation_failed` and field-level errors.
- Business-rule tests assert domain-specific errors such as inventory insufficiency, overpayment, over-refund, and workflow transition blocking.

### Risks

- Business rules may be duplicated across DTOs and services.
- Validation schemas may drift from database constraints.
- Overly strict request validation may block valid workflow states.

### Follow-ups

- Define NestJS validation pipe integration.
- Create shared error-code mapping for validation and business rules.
- Add schema/API enum drift tests.

---

# ARD-0008 — SQL-Visible Query Layer

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Database Access  
**Required Before:** Milestone 1  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

Critical workflows require row locks, optimistic locking, FIFO allocation, idempotency checks, report queries, and tenant/branch scoping. The query layer must not obscure SQL semantics.

### Decision

Use **Kysely with `node-postgres`** as the primary query layer. Maintain a raw SQL escape hatch for locks, CTEs, reporting queries, migration-time data fixes, and performance-critical paths.

Repository rules:

- Every tenant-owned query requires `tenant_id`.
- Every branch-specific query requires `tenant_id` and `branch_id` where applicable.
- Critical commands must run inside explicit transactions.
- Row locks and optimistic locks must be visible in repository code.

### Consequences

- Provides typed SQL ergonomics without hiding transactional semantics.
- Enables complex FIFO and financial queries.
- Requires developers to understand SQL and indexing.

### Validation

- Integration tests run against real PostgreSQL using Testcontainers.
- Query review required for high-volume lists, reports, ledgers, and FIFO operations.
- Critical concurrency tests prove no over-reservation, overpayment, overbilling, duplicate receipts, or duplicate numbers.

### Risks

- Developers must understand SQL, locking, and index behavior.
- Raw SQL escape hatches may reduce type safety if overused.
- Repository methods may miss tenant or branch predicates without tests/review.

### Follow-ups

- Create repository method templates requiring tenant/branch scope.
- Add Testcontainers PostgreSQL integration test harness.
- Document approved raw SQL use cases.

---

# ARD-0009 — Migration Tool and Schema Drift Control

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Database Migration  
**Required Before:** Milestone 1  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

The schema is the canonical physical blueprint, but not yet migration files. Migrations must be versioned, forward-only in production, and CI-validated.

### Decision

Use **node-pg-migrate** as the canonical migration tool. Allow raw SQL migration bodies for constraints, indexes, triggers, RLS policies, and PostgreSQL-specific features.

Migration rules:

- Production migrations are forward-only.
- Seed scripts are idempotent.
- Destructive changes require backup and rollout plan.
- Migrations must include tests for constraints and indexes where applicable.
- Migration validation runs in CI against a clean PostgreSQL database.

### Consequences

- Strong compatibility with PostgreSQL features.
- Avoids ORM-generated schema drift.
- Requires careful migration review discipline.

### Validation

- CI applies all migrations from zero to latest.
- CI runs schema snapshot/drift checks against expected tables, enums/check constraints, indexes, and seed data.
- Rollback rehearsal is documented for non-production only where practical.

### Risks

- Migration scripts can drift from database-schema.md if not reviewed.
- Forward-only migrations require careful recovery planning for bad releases.
- Destructive migrations can cause data loss without backup and rollout evidence.

### Follow-ups

- Create initial migration folder and naming convention.
- Add CI clean-database migration validation.
- Document backup/rollout requirements for destructive migrations.

---

# ARD-0010 — Database Enum Strategy

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Database Schema  
**Required Before:** Milestone 1  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

The schema allows PostgreSQL enum types or `text` with check constraints. API enums must remain lowercase, stable, and schema-aligned.

### Decision

Use **`text` columns with explicit `CHECK` constraints** for business status and workflow enums during the initial build.

Rules:

- Enum values must exactly match API-safe lowercase values in the schema and API contract.
- Check constraints must be named and migration-controlled.
- Shared TypeScript enum/const definitions must be generated or maintained from the same canonical source used by API DTOs.

### Consequences

- Easier enum evolution during build without PostgreSQL enum migration complexity.
- Still protects invalid values at the database layer.
- Requires consistent generation/review to prevent drift between schema, API, and frontend types.

### Validation

- Schema tests verify invalid enum values are rejected.
- API tests verify only documented enum values are accepted and returned.
- Contract drift checks compare API DTO enum values to migration/check-constraint source.

### Risks

- Text/check enum definitions can drift from TypeScript/API constants.
- Changing check constraints requires careful migration sequencing.
- Inconsistent enum naming would break API/schema alignment.

### Follow-ups

- Create canonical enum constant source for TypeScript/API.
- Add tests comparing enum constants to database check constraints.
- Document enum-change migration procedure.

---

# ARD-0011 — Identifier Strategy

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Database / API  
**Required Before:** Milestone 1  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

The schema specifies UUID primary IDs with UUIDv7 preferred. Document numbers must be tenant-scoped and never reused.

### Decision

Use **UUIDv7 stored in PostgreSQL `uuid` columns** for primary entity IDs.

Rules:

- IDs are generated server-side for authoritative records.
- Public API IDs are UUID strings.
- Do not use ULID/text IDs for primary relational identifiers in the initial build.
- Tenant-scoped business document numbers are generated separately from UUID IDs and protected by unique constraints and transaction locks.

### Consequences

- Time-sortable UUIDs improve index locality while preserving UUID compatibility.
- Avoids mixed ID formats across services.
- Requires selecting a maintained UUIDv7 library during implementation.

### Validation

- Unit tests verify generated IDs are valid UUIDs.
- Database constraints verify UUID columns and tenant-scoped document number uniqueness.
- Concurrency tests verify document numbers are never duplicated or reused.

### Risks

- UUIDv7 library quality or API may change before production.
- Business document numbers can still collide if sequence locking is wrong.
- Time-sortable identifiers may leak rough creation ordering.

### Follow-ups

- Select and pin a maintained UUIDv7 library.
- Create tenant-scoped document-number allocation strategy.
- Add concurrency tests for document numbers.

---

# ARD-0012 — Tenant/Branch Isolation and RLS Timing

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Security / Database  
**Required Before:** Milestone 1  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

Tenant isolation is foundational. The architecture recommends repository/service scoping and optional RLS defense-in-depth. RLS timing is an explicitly required decision.

### Decision

Use layered isolation from day one:

1. Authenticated tenant context from session.
2. Tenant status guard.
3. Permission guard.
4. Branch access guard.
5. Repository methods requiring `tenant_id` and `branch_id` where applicable.
6. Database foreign keys, indexes, and constraints.
7. PostgreSQL RLS introduced after repository policies stabilize, but before production launch for high-risk tenant-owned tables where policies can be tested safely.

RLS must never be treated as the only isolation layer.

### Consequences

- Reduces risk of cross-tenant data leakage.
- Avoids untested RLS policies blocking early development unexpectedly.
- Requires dedicated RLS test fixtures before production.

### Validation

- Tenant isolation tests attempt cross-tenant reads/writes across customers, motorcycles, products, invoices, reports, files, and exports.
- Branch access tests verify unassigned branch records are blocked.
- RLS policy tests run in staging before production enablement.

### Risks

- Repository/service scoping bugs can leak tenant data before RLS is enabled.
- RLS policies may block legitimate queries if introduced without fixtures.
- Support-access workflows can accidentally bypass tenant/branch safeguards.

### Follow-ups

- Implement tenant/branch repository fixtures.
- Prototype RLS policies on high-risk tables in staging.
- Add support-access tests proving no silent impersonation.

---

# ARD-0013 — PWA Token Transport and Session Security

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Authentication / Security  
**Required Before:** Milestone 2  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

The PRD requires access token expiry within 15 minutes, refresh token rotation, remember-me sessions up to 30 days, session revocation, and rate limits. The API contract leaves exact token transport mechanics as an engineering decision.

### Decision

Use:

- Short-lived access tokens returned to the PWA and held in memory by default.
- Rotating refresh tokens stored in `HttpOnly`, `Secure`, `SameSite=Lax` cookies when same-site deployment is used.
- CSRF protection for refresh/logout flows if cookies are used.
- Hashed refresh tokens in the database.
- Immediate refresh-session revocation on logout-all, user deactivation, and admin-triggered password reset.

If deployment requires cross-site app/API origins, revisit cookie settings and CSRF protections in a superseding ARD before production.

### Consequences

- Reduces persistent token exposure to XSS.
- Requires careful CSRF handling for cookie-backed refresh flows.
- Access tokens must be refreshed on page reload.

### Validation

- Security tests verify refresh token rotation, reuse detection, session revocation, deactivated user lockout, password reset revocation, and no tokens in logs.
- API tests verify access token expiry behavior and logout/logout-all behavior.

### Risks

- Cookie-based refresh requires CSRF controls.
- In-memory access tokens require robust refresh handling on reload.
- Cross-origin deployments may force cookie/security settings to be revisited.

### Follow-ups

- Confirm same-site versus cross-site deployment before production.
- Add CSRF strategy for cookie-backed refresh/logout.
- Add token redaction tests for logs and errors.

---

# ARD-0014 — Idempotency and Optimistic Locking

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Reliability / Data Integrity  
**Required Before:** Milestone 2  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

Critical writes include invoice issuance, payments, refunds, inventory reservations, job completion, purchase receiving, supplier returns, supplier payments, transfers, exports, and tenant deletion. Mobile networks and retries can duplicate side effects.

### Decision

Implement a shared idempotency service for critical writes.

Idempotency key scope:

- Tenant.
- Authenticated user.
- Endpoint/action.
- Request intent hash.
- Idempotency key hash.

Mutable records use `lock_version` optimistic locking where documented. High-contention financial/inventory commands use row locks where needed.

Use raw `lock_version` for initial `If-Match` support. An ETag wrapper may be added later without changing service behavior.

### Consequences

- Protects against duplicate payments, receipts, inventory movements, exports, and deletion effects.
- Adds complexity around request hashing and replayed responses.
- Requires idempotency retention and cleanup policy.

### Validation

- API tests verify same key/same intent returns replay behavior.
- API tests verify same key/different intent returns conflict.
- Concurrency tests verify no overpayment, over-refund, overbilling, over-reservation, double FIFO consumption, or duplicate receipts.

### Risks

- Incorrect request intent hashing can replay wrong responses or block valid retries.
- Idempotency retention cleanup can remove records too early.
- Optimistic locking alone may be insufficient for high-contention inventory/financial workflows.

### Follow-ups

- Create idempotency table/service implementation.
- Define idempotency retention and cleanup policy.
- Add concurrency tests for listed critical writes.

---

# ARD-0015 — Append-Only Immutability Protections

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Database Integrity / Security  
**Required Before:** Milestone 1 baseline; production hardening before launch  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

Financial records, receipts, refunds, inventory ledgers, FIFO records, and audit logs must be immutable or correction-only. Source docs explicitly require deciding whether immutability triggers are enabled from the first migration.

### Decision

Implement append-only protections in two levels:

1. **Application level from first implementation:** command services expose no direct update/delete paths for immutable records.
2. **Database level before production launch:** triggers block updates/deletes on immutable tables, except approved correction/status fields where documented.

Critical immutable tables include audit logs, receipts, issued invoice records/lines where applicable, payments, refunds, inventory ledger entries, FIFO allocations/consumptions, and background side-effect history.

### Consequences

- Strongly protects audit, financial, and inventory integrity.
- Requires carefully scoped correction workflows.
- Early trigger enablement may slow migrations unless exceptions are explicit.

### Validation

- Schema tests attempt unauthorized update/delete and expect rejection.
- API tests verify correction/void/refund workflows create new records or allowed status changes instead of mutating issued records.
- Security review verifies privileged users cannot bypass audit logging through application APIs.

### Risks

- Triggers may block legitimate correction workflows if exceptions are incomplete.
- Late trigger implementation may reveal app paths that incorrectly mutate immutable rows.
- Database superuser or migration scripts can still bypass protections without process controls.

### Follow-ups

- Identify exact immutable tables and allowed correction fields.
- Create trigger migration templates.
- Add production-hardening checklist before launch.

---

# ARD-0016 — Background Job Locking and Outbox Processing

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Background Processing  
**Required Before:** Milestone 2  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

GarageOS requires retry-safe background jobs for reminders, notifications, lifecycle evaluation, exports, file retention, provider delivery, outbox events, and deletion jobs. The architecture and tech stack recommend PostgreSQL-backed jobs/outbox first.

### Decision

Use PostgreSQL-backed `background_jobs` and `outbox_events` as the initial queue/outbox mechanism.

Worker locking algorithm:

```sql
select *
from background_jobs
where status = 'queued'
  and run_at <= now()
order by priority desc, run_at asc, created_at asc
for update skip locked
limit :batch_size;
```

Rules:

- Workers claim jobs inside transactions.
- Jobs track attempts, max attempts, last error summary, next retry time, and dead-letter status.
- Irreversible side effects must have idempotent provider keys or internal side-effect records.
- Jobs must emit structured logs, metrics, and failure alerts.

### Consequences

- Avoids extra queue infrastructure initially.
- Keeps enqueueing transactional with source-table writes.
- May need a dedicated queue only after production evidence shows PostgreSQL-backed jobs are insufficient.

### Validation

- Worker tests verify no duplicate claims under concurrent workers.
- Retry tests verify safe reprocessing and dead-letter behavior.
- Operational tests verify job status visibility and alerting.

### Risks

- PostgreSQL-backed queue may become a bottleneck at scale.
- Workers can duplicate irreversible provider side effects if idempotency is incomplete.
- Long-running jobs can hold locks or starve smaller jobs if batching is poor.

### Follow-ups

- Create background_jobs and outbox_events repository patterns.
- Add worker claim/retry/dead-letter tests.
- Document when to consider external queue extraction.

---

# ARD-0017 — Reporting/Search Read Model Refresh Strategy

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Reporting / Performance  
**Required Before:** Milestone 6 baseline; full before Milestone 12  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

Reports, dashboards, and search must not overload transactional workflows. The database design allows materialized reporting tables or maintained aggregate tables.

### Decision

Use PostgreSQL-backed rebuildable read models:

- Search documents maintained by transactional events/outbox where practical.
- Dashboard snapshots refreshed by background jobs.
- Report summary tables maintained by scheduled refresh or event-driven refresh based on report type.
- Transactional source tables remain authoritative.

Initial approach:

- Use maintained aggregate tables for high-frequency dashboard metrics.
- Use search tables with PostgreSQL FTS/trigram indexes for customers, motorcycles, products, suppliers, invoices, job orders where documented.
- Use asynchronous report export jobs for large exports.

### Consequences

- Improves list/search/report performance.
- Introduces read-model freshness considerations.
- Requires reconciliation/rebuild jobs.

### Validation

- Report formula tests compare read model outputs to transactional source truth.
- Rebuild jobs can regenerate read models from source tables.
- Performance tests cover dashboard, search, ledger pagination, reports, and exports.

### Risks

- Read models may become stale or inconsistent with source tables.
- Report formulas may drift from financial calculation rules.
- Search indexes may underperform without query-plan review.

### Follow-ups

- Define freshness targets per report/read model.
- Create rebuild/reconciliation job designs.
- Add formula verification fixtures for reports.

---

# ARD-0018 — File Upload, Download, and Object Storage

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Files / Security  
**Required Before:** Milestone 11  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

GarageOS requires private tenant-scoped files, signed URLs, attachments, tenant exports, deletion lifecycle, and no permanent public tenant file URLs. API contracts recommend direct-to-object-storage signed uploads.

### Decision

Use private S3-compatible object storage with direct signed upload/download URLs.

Flow:

1. Client requests upload intent from API.
2. API validates tenant, branch, permission, tenant status, plan/status restrictions, file type/size rules.
3. API creates a file metadata record in pending/active state as appropriate.
4. API returns a short-lived signed upload URL.
5. Worker or API finalizes file metadata after upload confirmation.
6. Downloads require API authorization before generating signed URL.

Provider vendor remains an environment/operations decision as long as it is S3-compatible and supports private buckets, signed URLs, lifecycle policies, and export packages.

### Consequences

- Reduces backend bandwidth pressure.
- Preserves private file access control.
- Requires careful metadata cleanup for abandoned uploads.

### Validation

- Security tests verify unauthorized tenants/branches cannot generate signed URLs.
- Upload tests verify read-only/suspended/offline states block uploads.
- File deletion/export tests verify tenant deletion and retention rules.

### Risks

- Signed URLs can leak if TTLs are too long or logs capture them.
- Abandoned uploads can leave orphan metadata or storage objects.
- Object storage provider behavior may differ across S3-compatible vendors.

### Follow-ups

- Select concrete S3-compatible provider before Milestone 11.
- Define file type/size validation and abandoned-upload cleanup.
- Add signed URL authorization tests.

---

# ARD-0019 — External Provider Adapter Strategy

**Status:** Accepted with provider selection deferred  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Integrations / Operations  
**Required Before:** Milestone 10/13  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

Source documents require provider categories for email, SMS, push, analytics, and error monitoring but do not require exact vendors. Automated subscription payment collection remains out of scope.

### Decision

Implement provider adapters behind internal interfaces:

```text
EmailProvider
SmsProvider
PushProvider
AnalyticsProvider
ErrorMonitoringProvider
StorageProvider
MalwareScanProvider optional/deferred by risk decision
```

Exact vendors are deferred to environment/cost/compliance review. The first implementation must use adapters so vendor replacement does not change domain logic.

Provider selection criteria:

- Availability in target market.
- Delivery logs/status callbacks where applicable.
- Secure secret management.
- Cost predictability.
- Sandbox support.
- Operational monitoring support.
- Ability to avoid logging sensitive payloads.

### Consequences

- Keeps product logic vendor-neutral.
- Allows provider selection without scope change.
- Requires adapter contracts and provider simulation in tests.

### Validation

- Integration tests use fake providers.
- Staging uses sandbox providers where available.
- Delivery attempts and failures are visible through logs/background job records without leaking secrets.

### Risks

- Deferred provider selection can delay Milestone 10/13 integration work.
- Adapters may under-model provider-specific delivery status or failures.
- Provider secrets or payloads could leak without redaction tests.

### Follow-ups

- Select concrete providers before their milestone gates.
- Create fake provider implementations for tests.
- Define provider secret and payload redaction checks.

---

# ARD-0020 — Server-Side Cache Policy

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Performance / Data Consistency  
**Required Before:** Milestone 1  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

The architecture allows browser PWA cache plus optional server-side ephemeral cache. PostgreSQL remains authoritative. Offline cache must be read-only.

### Decision

Do not introduce Redis or another server-side cache in the initial build unless a measured performance issue requires it.

Allowed caches:

- Browser PWA app-shell cache.
- User-scoped read-only recent-record cache.
- In-process ephemeral caches for low-risk configuration values, with short TTL and invalidation on relevant admin changes.

Disallowed initially:

- Server-side cache as source of truth.
- Cache-backed stock quantities, invoice balances, permission decisions without invalidation, or tenant lifecycle status without freshness control.

### Consequences

- Reduces infrastructure and consistency risk.
- Keeps PostgreSQL as the source of truth.
- May require adding Redis later if production metrics justify it.

### Validation

- Performance tests establish whether server-side cache is needed.
- Security tests verify offline/user cache is cleared on logout/session revocation.
- Permission and tenant status changes are reflected without stale unsafe authorization.

### Risks

- Lack of server-side cache may expose performance issues under load.
- In-process caches can become stale across multiple API instances.
- Caching authorization or tenant status incorrectly can cause unsafe access.

### Follow-ups

- Measure API/report performance before adding Redis.
- Define allowed in-process cache TTLs and invalidation triggers.
- Add stale-permission/status test cases if any cache is introduced.

---

# ARD-0021 — Append-Only Table Partitioning Threshold

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Database Performance  
**Required Before:** Milestone 13 hardening  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

Append-only tables such as audit logs, inventory ledger entries, outbox events, background jobs, notification attempts, and lifecycle events can grow quickly. The architecture recommends partition-ready append-only tables.

### Decision

Design append-only high-volume tables to be partition-ready from the first migration, but defer physical partitioning until data volume or performance metrics justify it.

Initial threshold for partitioning review:

- Any append-only table exceeds **10 million rows**, or
- P95 query latency for indexed list/report queries exceeds accepted performance targets, or
- Table/index bloat materially affects vacuum/autovacuum performance, or
- Export/report workloads create sustained operational pressure.

Default partitioning strategy when triggered:

- Time-based monthly partitions for audit/log/job/notification-style tables.
- Tenant/date-aware indexing on partitions.
- Retention and archive policy aligned to PRD retention rules.

### Consequences

- Avoids premature partition complexity.
- Keeps migration path open.
- Requires monitoring table growth and query latency.

### Validation

- Migrations avoid designs that block future partitioning.
- Database monitoring tracks row counts, index bloat, autovacuum lag, and P95 query latency.
- Partition rehearsal is performed in staging before production activation.

### Risks

- Deferring partitioning may require complex migration once tables are large.
- Partitioning too late can affect vacuum, backups, and query latency.
- Partition strategy may conflict with retention/deletion requirements if not rehearsed.

### Follow-ups

- Track row-count and index-bloat metrics for append-only tables.
- Document partition rehearsal procedure.
- Revisit thresholds during Milestone 13 hardening.

---

# ARD-0022 — OpenAPI Generation and Contract Drift Control

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** API Documentation / CI  
**Required Before:** Milestone 2  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

The API contract is canonical but not an OpenAPI YAML file yet. API behavior must stay synchronized with implementation.

### Decision

Generate OpenAPI from NestJS route metadata and DTO/schema annotations, then validate generated output against `api-contracts.md` expectations through CI contract tests.

Rules:

- Generated OpenAPI is checked into the repository or published as a CI artifact.
- Public API changes require PR review against API contracts and RTM trace.
- Error envelopes, response envelopes, auth headers, idempotency headers, pagination, enum values, and status codes must be covered by contract tests.

### Consequences

- Reduces manual OpenAPI drift.
- Requires DTO annotations to stay disciplined.
- Human-readable API contract remains the primary design document until OpenAPI is fully generated and reviewed.

### Validation

- CI fails when OpenAPI generation changes without committed artifact/update approval.
- API contract tests cover representative endpoints across modules.
- Frontend typed API client is generated or validated from OpenAPI when stable.

### Risks

- Generated OpenAPI may not fully capture runtime guards and business errors.
- DTO annotations can drift from api-contracts.md without review.
- Frontend client generation may break on unstable API surfaces.

### Follow-ups

- Add OpenAPI generation to CI after API skeleton.
- Define committed artifact path under docs/api.
- Validate generated client once endpoint surface stabilizes.

---

# ARD-0023 — Environments, Deployment Units, and CI/CD

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** DevOps / Deployment  
**Required Before:** Milestone 1  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

The roadmap requires local, development, staging, and production environments; containerized PWA/API/worker/scheduler services; CI; secrets handling; migration checks; and production readiness evidence.

### Decision

Use Dockerized deployment units:

| Unit             | Responsibility                                                         |
| ---------------- | ---------------------------------------------------------------------- |
| PWA static app   | Client shell/assets.                                                   |
| API service      | Authenticated REST API, command/query handlers, signed URL generation. |
| Worker service   | Background jobs, exports, reminders, lifecycle tasks, outbox.          |
| Scheduler        | Periodic job enqueueing.                                               |
| PostgreSQL       | Transactional source of truth.                                         |
| Object storage   | Tenant files and export packages.                                      |
| Monitoring stack | Logs, metrics, traces, errors, alerts.                                 |

Required environments:

- `local`
- `development`
- `staging`
- `production`

CI baseline:

- Lint.
- Typecheck.
- Unit tests.
- Migration validation.
- API contract tests.
- Integration tests where practical.
- Dependency/security scanning.

### Consequences

- Supports predictable releases and staging parity.
- Requires environment configuration and secrets discipline.
- Worker/scheduler separation avoids overloading API processes.

### Validation

- A new developer can run the app locally with documented steps.
- CI blocks failing lint/type/unit/migration checks.
- Staging runs migrations, workers, storage sandbox, provider sandboxes, and E2E tests before production.

### Risks

- Environment differences can hide deployment defects until production.
- Secrets may be mishandled if configuration patterns are not documented.
- Workers and schedulers can be mis-scaled independently of API load.

### Follow-ups

- Document local/dev/staging/prod environment variables.
- Add deployment runbook and rollback checklist.
- Configure staging parity for workers, storage, and provider sandboxes.

---

# ARD-0024 — Observability, Backup, and Disaster Recovery

**Status:** Accepted  
**Date:** 2026-06-24  
**Decision Owner:** Engineering  
**Decision Type:** Operations / Reliability  
**Required Before:** Milestone 13  
**Source Alignment:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`, `qa-acceptance-test-plan.md`, `requirements-traceability-matrix.md`, `user-stories.md`, `permission-matrix.md`, `ux-sreen-map.md`, `tech-stack.md`, `build-roadmap.md`, `architecture-records.md`

### Context

GarageOS requires structured logs, metrics, error monitoring, correlation IDs, background job visibility, encrypted backups, quarterly restore tests, RPO 24 hours, and RTO 4 hours.

### Decision

Implement observability and recovery as foundational production requirements:

- Structured JSON logs with request ID, correlation ID, tenant context where safe, actor type, endpoint/action, outcome, and error code.
- OpenTelemetry-compatible traces/metrics where practical.
- Error monitoring for API, PWA, workers, provider failures, auth failures, authorization denials, exports, reminders, and inventory failures.
- Background job dashboards/status views for operations.
- Daily encrypted PostgreSQL backups.
- Object storage lifecycle and backup/retention strategy aligned to tenant deletion/retention rules.
- Quarterly restore tests.
- RPO target: 24 hours.
- RTO target: 4 hours.

Sensitive data must not be logged, exported unnecessarily, or included in error payloads.

### Consequences

- Improves production support and incident response.
- Adds operational setup work before launch.
- Requires careful log redaction and access control.

### Validation

- QA/DevOps verify logs contain correlation IDs and safe error summaries.
- Restore drill evidence exists before launch.
- Background job failures trigger alerts and expose safe diagnostic summaries.
- Sensitive log review passes before production release.

### Risks

- Observability setup can lag behind feature delivery.
- Logs can leak sensitive data without redaction tests.
- Backup existence does not prove recoverability without restore drills.

### Follow-ups

- Define log redaction test cases.
- Create backup/restore runbook and evidence template.
- Configure alerting for API, worker, provider, backup, and DB failures.
