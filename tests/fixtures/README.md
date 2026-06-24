# GarageOS Test Fixtures

This folder will contain reusable test fixtures for GarageOS.

Milestone 0 does not define real data yet. Fixture builders should be added when the related database schema, API contract, and feature tickets exist.

Future fixture categories may include:

- tenants
- subscription plans
- users
- roles and permissions
- branches
- customers
- motorcycles
- products
- inventory layers
- job orders
- invoices
- payments
- background jobs

Rules:

1. Fixtures must never contain real secrets or real customer data.
2. Fixtures must make tenant ownership explicit.
3. Branch-specific fixtures must include both tenant and branch context.
4. Fixture builders should support isolated cleanup.
5. Shared fixtures should live here only when reused across multiple test layers.
