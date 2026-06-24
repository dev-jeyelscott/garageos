# GarageOS Schema Drift Checklist

## Purpose

This checklist prevents undocumented or unsafe database drift between the GarageOS source documentation, migrations, seed data, tests, and runtime schema.

Every migration or schema-impacting feature ticket must complete this checklist before merge.

---

## 1. Source Alignment

- [ ] Migration references the relevant PRD requirement.
- [ ] Migration references the relevant database-schema section.
- [ ] Migration references the relevant API contract when API behavior is affected.
- [ ] Migration references the relevant permission matrix entry when access control is affected.
- [ ] Migration does not introduce undocumented product scope.
- [ ] Explicitly excluded capabilities remain excluded.

---

## 2. Migration Safety

- [ ] Migration file is versioned and committed under `packages/db/migrations`.
- [ ] Migration uses deterministic SQL.
- [ ] Migration has an `up` path.
- [ ] Migration has a `down` path where safe for local/dev rollback.
- [ ] Migration does not depend on local-only state.
- [ ] Migration does not require real secrets.
- [ ] Migration can run on an empty database.
- [ ] Migration can run after all previous migrations.
- [ ] Migration order respects foreign key dependencies.

---

## 3. Tenant and Branch Scoping

- [ ] Every tenant-owned business table includes `tenant_id`.
- [ ] Every branch-specific operational table includes both `tenant_id` and `branch_id`.
- [ ] Foreign keys preserve tenant scope where possible.
- [ ] Branch-specific foreign keys use `(tenant_id, branch_id)` where possible.
- [ ] Tenant clients cannot rely on client-supplied `tenant_id`.
- [ ] Cross-tenant references are not possible through foreign keys.

---

## 4. Constraints and Indexes

- [ ] Primary keys exist.
- [ ] Required foreign keys exist.
- [ ] Required unique indexes exist.
- [ ] Tenant-scoped indexes exist for tenant-owned queries.
- [ ] Branch-scoped indexes exist for branch-specific queries.
- [ ] Status values are protected by check constraints.
- [ ] Monetary columns use `numeric(14,2)` unless explicitly documented otherwise.
- [ ] Quantity columns use `numeric(14,3)`.
- [ ] Timestamps use `timestamptz`.
- [ ] Business dates use `date`.
- [ ] No money or quantity column uses floating point types.

---

## 5. Workflow and Immutability Rules

- [ ] Workflow status columns use documented enum/check values.
- [ ] Status history/event tables exist for workflow records where required.
- [ ] Reason fields exist for corrective, cancellation, void, refund, override, or support-access actions where required.
- [ ] Ledger-style records are append-only by design.
- [ ] Financial records are immutable or correction-only by design.
- [ ] Inventory stock-changing workflows use ledger/FIFO scaffolding.
- [ ] Critical writes have idempotency support where required.

---

## 6. Seed Data

- [ ] Seed script is idempotent.
- [ ] Standard subscription plans remain exactly `basic`, `mid`, and `high`.
- [ ] Plan limits are present for all standard plans.
- [ ] Permission catalog matches the documented permission set.
- [ ] Non-owner default role grants are not finalized without explicit approval.
- [ ] Seed counts are validated after repeated seed execution.

Expected baseline seed counts:

| Seed Area                  | Expected Count |
| -------------------------- | -------------: |
| `subscription_plans`       |              3 |
| `subscription_plan_limits` |             27 |
| `permissions`              |            128 |

---

## 7. Migration Validation Commands

Run before merge:

```bash
pnpm db:migrate
pnpm db:seed
pnpm db:seed
```

Validate:

```bash
docker compose exec postgres psql -U garageos -d garageos_dev -c "select count(*) from schema_migrations;"
docker compose exec postgres psql -U garageos -d garageos_dev -c "select count(*) from information_schema.tables where table_schema = 'public';"
docker compose exec postgres psql -U garageos -d garageos_dev -c "select count(*) from subscription_plans;"
docker compose exec postgres psql -U garageos -d garageos_dev -c "select count(*) from subscription_plan_limits;"
docker compose exec postgres psql -U garageos -d garageos_dev -c "select count(*) from permissions;"
```
