# GarageOS QA Automation Structure

This directory contains the root-level QA automation scaffold for GarageOS.

Milestone 0 only scaffolds the structure. Real test cases must be added later through traceable feature tickets.

## Folder Purpose

| Folder          | Purpose                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| `unit/`         | Pure business-rule, calculation, validation, and state-machine tests.                                          |
| `integration/`  | Database-backed service, repository, transaction, lock, idempotency, and rollback tests.                       |
| `api-contract/` | API request/response envelope, validation, auth, permission, branch access, idempotency, and error-code tests. |
| `e2e/`          | Full user workflow tests for the mobile-first PWA.                                                             |
| `fixtures/`     | Shared test data builders, seed payloads, and reusable scenario fixtures.                                      |

## Source Alignment

Future tests must trace to the approved GarageOS source documents:

- PRD / requirements
- database design
- database schema
- architecture
- API contracts
- permission matrix
- user stories
- UX screen map
- QA acceptance test plan
- ADRs / ARDs where applicable

## Rules

1. Do not add tests for undocumented product scope.
2. Do not add tests for excluded capabilities.
3. Prefer deterministic fixtures over ad hoc inline data.
4. Keep tenant and branch isolation explicit in test setup.
5. Critical write tests must eventually cover idempotency, rollback, and concurrency.
6. E2E tests must eventually include mobile viewport coverage.
7. API contract tests must verify response envelopes, error envelopes, status codes, and machine-readable error codes.
