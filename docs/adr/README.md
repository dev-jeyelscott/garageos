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
