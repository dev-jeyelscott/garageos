# GarageOS Security Automation

**Status:** Active baseline  
**Owner:** Engineering / Security  
**Related task:** ENG-LOOP-09 — Add dependency and security automation

## Goal

GarageOS security automation complements the existing validation profiles by continuously checking dependency drift, known vulnerable packages, and static security risks before changes merge into protected branches.

This document does not add product scope. It documents engineering automation that supports the approved GarageOS security, CI, and QA requirements.

## Automation Added

| Automation                   | File                                             | Purpose                                                                  | Blocking Behavior                                                    |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Dependency update automation | `.github/dependabot.yml`                         | Opens weekly dependency and GitHub Actions update PRs against `develop`. | PR-based review and normal branch protection.                        |
| Dependency security workflow | `.github/workflows/dependency-security.yml`      | Runs `pnpm audit --audit-level high` and `pnpm validate:security`.       | Fails on high-or-critical audit findings or failed security profile. |
| Static security analysis     | `.github/workflows/static-security-analysis.yml` | Runs Semgrep OWASP, secrets, and TypeScript security rules.              | Fails when Semgrep reports matching blocking findings.               |

## Source-Aligned Scope

The automation is intentionally limited to engineering safeguards:

- Dependency scanning.
- GitHub Actions dependency updates.
- npm/pnpm package update PRs.
- Static security analysis.
- Existing GarageOS security validation profile execution.

It must not introduce runtime behavior, new product workflows, new permissions, new APIs, new modules, or excluded capabilities.

## Required PR Evidence

PRs affected by dependency or security automation should include evidence for the relevant commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:security
```

For dependency-only PRs, include:

```bash
pnpm install --frozen-lockfile
pnpm audit --audit-level high
pnpm validate:security
```

## Operational Notes

- Dependabot configuration is read from the repository default branch.
- Dependabot PRs target `develop` to align with the protected integration branch workflow.
- Semgrep is intentionally used instead of CodeQL in this baseline because it is portable for public and private repositories without requiring GitHub Advanced Security.
- If Semgrep produces a confirmed false positive, prefer a narrow inline suppression with justification over weakening the entire ruleset.
- If a vulnerable dependency has no safe upgrade, document the mitigation and keep the PR blocked until the risk is accepted by the repository owner.

## Validation

Run locally before opening the PR:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:security
```

After pushing, verify these GitHub Actions checks:

- Dependency Security
- Static Security Analysis
- Existing validation profile workflows

## Risks and Mitigations

| Risk                                                | Mitigation                                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Dependabot opens noisy PRs.                         | Group minor and patch updates for production, development, and GitHub Actions dependencies.                       |
| Static analysis produces false positives.           | Use narrow suppressions with justification; do not disable broad rule families without review.                    |
| Security automation duplicates existing validation. | Keep `validate:security` as the canonical project profile and use workflow automation to enforce it continuously. |
| Private repository lacks GitHub Advanced Security.  | Use pnpm audit and Semgrep instead of requiring CodeQL/dependency-review features.                                |

<!-- ENG-LOOP-09-SEMGREP-HARDENING -->

## Semgrep Supply-Chain Hardening Follow-up

The static security workflow intentionally treats supply-chain hygiene findings as blocking. If Semgrep flags GitHub Actions mutable tags, dependency cooldown policy, workflow-level secret scope, or pnpm release-age/trust settings, fix those controls rather than weakening the scan.

Current hardening baseline:

- GitHub Actions should be pinned to immutable 40-character commit SHAs.
- Dependabot update entries should include a 7-day cooldown.
- Secrets should be scoped to the narrowest required step.
- pnpm workspace security settings should include `minimumReleaseAge`, `trustPolicy`, and `blockExoticSubdeps`.
