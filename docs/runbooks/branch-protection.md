# GarageOS Branch Protection Runbook

**Status:** Source-aligned engineering runbook  
**Scope:** Manual GitHub branch protection setup and verification for `main` and `develop`  
**Task:** ENG-LOOP-06 — Enforce branch protection for `main` and `develop`  
**Repository:** `dev-jeyelscott/garageos`  
**Last Updated:** 2026-07-05

---

## 1. Purpose

This runbook defines the required GitHub branch protection settings for GarageOS.

The goal is to make the engineering delivery loop safer by requiring:

- Dedicated task branches.
- Pull requests before merging into `develop` or `main`.
- Stable deterministic validation checks before merge.
- Conversation resolution before merge.
- Human final merge decision.
- Protection against force pushes and branch deletion.
- Clear evidence for manual branch protection configuration.

This runbook is documentation only. Branch protection must be configured manually by a repository owner or administrator in GitHub repository settings.

---

## 2. Source Alignment

GarageOS development must remain:

- Documentation-first.
- Source-aligned.
- Incremental.
- Validation-driven.
- Human-reviewed before merge.
- Protected from undocumented scope expansion.

Branch protection supports the GarageOS engineering foundation by ensuring that code reaches `develop` and `main` only through controlled pull request paths and passing validation gates.

The AI PR reviewer is advisory. It may produce findings and risk classification, but it must not be the only reviewer and must not blindly approve production merges.

Deterministic CI gates remain authoritative for merge safety.

---

## 3. Non-Scope

Do not use this runbook to:

- Auto-merge pull requests.
- Make AI review the only reviewer.
- Remove human final merge decision.
- Add undocumented product functionality.
- Change milestone implementation scope.
- Mutate GitHub repository settings through repository code.
- Configure production deployment rules.
- Replace module-specific validation requirements.
- Replace GitHub repository owner/admin review of branch protection settings.

---

## 4. Branching Model

GarageOS should use this branch flow:

```text
main
  ^ merge from develop through PR only
develop
  ^ merge from task branches through PR only
task branches
```

Recommended branch naming:

```text
feature/<short-task-name>
fix/<short-task-name>
chore/<short-task-name>
docs/<short-task-name>
test/<short-task-name>
```

For this task:

```text
chore/eng-loop-branch-protection
```

After ENG-LOOP-06 is complete, Milestone 10 and later development should use:

```text
develop
  ^ task branch
  ^ pull request
```

Do not continue feature work directly on `main`.

---

## 5. Pre-Configuration Checklist

Before enabling required checks, confirm the target branch exists and workflows run on pull requests targeting that branch.

### Required Branches

- [ ] `main` exists.
- [ ] `develop` exists.

If `develop` does not exist yet, create it from the latest stable `main`:

```bash
git checkout main
git pull origin main
git checkout -b develop
git push -u origin develop
```

### Required Workflow Visibility

Open or update a test pull request into `develop` and confirm the expected checks appear.

Expected stable validation checks:

```text
validation-quick
validation-security
validation-e2e
```

Use the exact visible check names shown in the GitHub pull request checks UI.

Do not configure package script names as required checks. These are validation commands, not necessarily GitHub check names:

```text
pnpm validate:quick
pnpm validate:security
pnpm validate:e2e
```

### Important Note About Required Checks

A GitHub required check should be enabled only after GitHub has seen that check on a pull request for the target branch.

If any required check does not appear on a pull request targeting `develop` or `main`, update the workflow trigger in a separate source-aligned task before making that check required.

Avoid requiring checks that are skipped by path filters, draft-only conditions, or branch-only workflow rules. A skipped required check can leave a pull request blocked.

---

## 6. Required Check Policy

### Required Deterministic Checks

These checks are authoritative once configured:

```text
validation-quick
validation-security
validation-e2e
```

These checks are expected to map to the repository validation profiles:

```bash
pnpm validate:quick
pnpm validate:security
pnpm validate:e2e
```

### Advisory Checks

These checks are useful but should be treated carefully:

```text
AI PR Review / Advisory AI PR Review
```

AI review should:

- Flag source-alignment concerns.
- Flag scope drift.
- Flag security risks.
- Flag tenant isolation risks.
- Flag API contract drift.
- Flag data-integrity risks.
- Flag missing tests.
- Flag frontend state coverage gaps.

AI review should not:

- Auto-approve production merges.
- Replace deterministic CI.
- Replace human final decision.
- Become required before it is stable.

Recommended ENG-LOOP-06 policy:

- Require `validation-quick`.
- Require `validation-security`.
- Require `validation-e2e`.
- Keep AI review advisory until it proves stable and non-flaky.

---

## 7. Recommended Protection for `develop`

Use this for day-to-day task branches.

GitHub path:

```text
Repository → Settings → Branches → Branch protection rules → Add branch ruleset/rule
```

Branch name pattern:

```text
develop
```

Recommended settings:

- [ ] Require a pull request before merging.
- [ ] Require status checks to pass before merging.
- [ ] Require branches to be up to date before merging.
- [ ] Require conversation resolution before merging.
- [ ] Require linear history if compatible with the project merge strategy.
- [ ] Block force pushes.
- [ ] Block branch deletion.
- [ ] Keep human final merge decision.
- [ ] Do not allow bypass unless explicitly needed for repository administrators.

Required checks after they are visible and stable:

```text
validation-quick
validation-security
validation-e2e
```

Recommended advisory check:

```text
AI PR Review / Advisory AI PR Review
```

For solo development, required approval count may remain `0` initially while still requiring pull requests, checks, and conversation resolution.

When additional collaborators join, increase required approvals to at least `1`.

---

## 8. Recommended Protection for `main`

Use this for release/stable integration.

GitHub path:

```text
Repository → Settings → Branches → Branch protection rules → Add branch ruleset/rule
```

Branch name pattern:

```text
main
```

Recommended settings:

- [ ] Require a pull request before merging.
- [ ] Require status checks to pass before merging.
- [ ] Require branches to be up to date before merging.
- [ ] Require conversation resolution before merging.
- [ ] Require linear history if compatible with the project merge strategy.
- [ ] Block force pushes.
- [ ] Block branch deletion.
- [ ] Prefer PRs from `develop` into `main`.
- [ ] Keep human final merge decision.
- [ ] Do not allow bypass unless explicitly needed for emergency repository administration.

Required checks after they are visible and stable:

```text
validation-quick
validation-security
validation-e2e
```

Recommended advisory check:

```text
AI PR Review / Advisory AI PR Review
```

For `main`, prefer stricter controls than `develop`.

Recommended approval policy:

- Solo development stage: approvals may remain `0` if no second human reviewer is available.
- Multi-developer stage: require at least `1` approval.
- Pre-production or production stage: require at least `1` approval and require stale approvals to be dismissed after new commits.

---

## 9. Solo Developer Policy

GarageOS is currently in solo-development mode.

Recommended solo-development branch protection:

- Require pull requests.
- Require stable validation checks.
- Require conversation resolution.
- Block force pushes.
- Block branch deletion.
- Keep required human approval count at `0` until another trusted reviewer is available.

Do not enable a required approval count of `1` unless another collaborator can review and approve pull requests. Otherwise, the repository owner may block their own delivery loop.

---

## 10. Pull Request Evidence Requirements

Every PR should include evidence for:

- Notion ticket.
- Goal.
- Scope.
- Source docs reviewed.
- Documentation alignment.
- Affected areas.
- Risk class.
- Validation commands run.
- Validation results.
- Screenshots or recordings for UI changes.
- AI reviewer notes, when available.
- Rollback notes.

The PR template prompts contributors to provide these fields. Branch protection, required checks, and human review are responsible for enforcing that the evidence is complete before merge.

A PR with missing source-alignment or validation evidence should not be merged until the evidence is added or a clear waiver is documented.

---

## 11. ENG-LOOP-06 Manual Configuration Evidence

Record evidence after configuring branch protection in GitHub.

Date configured: `YYYY-MM-DD`  
Repository: `dev-jeyelscott/garageos`  
Configured by: `<repository owner/admin>`

### Protected Branches

| Branch    | Protected | PR Required | Required Checks                                             | Up-to-date Required | Force Push Blocked | Delete Blocked | Evidence                             |
| --------- | --------- | ----------- | ----------------------------------------------------------- | ------------------- | ------------------ | -------------- | ------------------------------------ |
| `main`    | Pending   | Pending     | `validation-quick`, `validation-security`, `validation-e2e` | Pending             | Pending            | Pending        | Pending GitHub settings verification |
| `develop` | Pending   | Pending     | `validation-quick`, `validation-security`, `validation-e2e` | Pending             | Pending            | Pending        | Pending GitHub settings verification |

### Verification Notes

Replace this checklist with completed evidence after GitHub configuration:

- [ ] Confirmed `main` has branch protection enabled.
- [ ] Confirmed `develop` has branch protection enabled.
- [ ] Confirmed required checks use stable GitHub Actions check names.
- [ ] Confirmed direct pushes to protected branches are blocked or avoided by enforced policy.
- [ ] Confirmed force pushes are blocked.
- [ ] Confirmed branch deletions are blocked.
- [ ] Confirmed PR conversation resolution is required.
- [ ] Confirmed pull requests cannot merge until required validation checks pass.

### Validation Commands

Run these commands from the repository root after updating this runbook:

```bash
pnpm validate:quick
pnpm validate:security
pnpm validate:e2e
```

### Validation Result

```text
Pending local validation.
```

When validation passes, replace the result with:

```text
pnpm validate:quick: PASS
pnpm validate:security: PASS
pnpm validate:e2e: PASS
```

---

## 12. Manual Validation Procedure

After adding or changing branch protection settings:

1. Push a dedicated task branch.
2. Open a test pull request into `develop`.
3. Confirm the PR template appears automatically.
4. Fill in the PR template fields.
5. Confirm required checks are visible.
6. Confirm `validation-quick` is required.
7. Confirm `validation-security` is required.
8. Confirm `validation-e2e` is required.
9. Confirm AI PR Review appears when configured and eligible.
10. Confirm conversations must be resolved before merge.
11. Confirm direct commits to protected branches are blocked or avoided by enforced policy.
12. Confirm force pushes are disabled.
13. Confirm branch deletion is disabled.
14. Repeat the critical checks for `main`.

---

## 13. Troubleshooting

### PR Template Does Not Appear

Check that the file exists at exactly:

```text
.github/pull_request_template.md
```

GitHub also supports templates under `.github/PULL_REQUEST_TEMPLATE/`, but GarageOS uses the single default template path above.

### Required Checks Do Not Appear

A check can only be required after GitHub has seen it on a pull request for the branch.

Confirm:

- The workflow has `pull_request` triggers for the target branch.
- The PR targets the correct branch.
- The workflow file is present on the base branch.
- The job name shown in GitHub matches the required check name.
- The PR is not a draft if the workflow skips draft PRs.
- The workflow is not skipped by path filters or branch conditions.

### AI PR Review Does Not Run

Confirm:

- The PR is not a draft.
- The PR is from the same repository when the workflow requires same-repository PRs.
- `OPENAI_API_KEY` is configured as a GitHub repository secret.
- Optional `OPENAI_REVIEW_MODEL` repository variable is valid.
- The AI reviewer script passes syntax validation.

### Solo Developer Gets Blocked

For solo development, keep approval count at `0` while still requiring:

- Pull requests.
- CI checks.
- Conversation resolution.
- No force pushes.
- No branch deletion.

Increase approval requirements later when another human reviewer is available.

### Required Check Blocks Merge Forever

If a required check remains pending indefinitely:

1. Confirm the check actually runs on pull requests targeting the branch.
2. Confirm the workflow is not skipped.
3. Confirm the required check name exactly matches the GitHub UI.
4. Remove the unstable required check temporarily only through manual repository admin action.
5. Create a follow-up Notion ticket to stabilize the workflow.

---

## 14. Completion Criteria

ENG-LOOP-06 is complete when:

- `main` has branch protection configured.
- `develop` has branch protection configured.
- Pull requests are required before merging to `main`.
- Pull requests are required before merging to `develop`.
- Required checks are configured using stable check names:
  - `validation-quick`
  - `validation-security`
  - `validation-e2e`
- Conversation resolution is required.
- Force pushes are blocked.
- Branch deletion is blocked.
- Evidence is recorded in this runbook.
- Validation commands pass:
  - `pnpm validate:quick`
  - `pnpm validate:security`
  - `pnpm validate:e2e`
- `docs/progress-tracker.md` is updated.
- Notion ENG-LOOP-06 is moved to Done.

---

## 15. Suggested Commit Message

```text
docs: update branch protection runbook for stable validation gates
```

---

## 16. Next-Chat Handoff Prompt

Use this prompt after applying this runbook update and completing manual GitHub branch protection:

```md
ENG-LOOP-06 branch protection has been configured manually for main and develop.

Evidence recorded:

- docs/runbooks/branch-protection.md updated with protected branch settings and validation evidence.

Validation results:

- pnpm validate:quick: PASS
- pnpm validate:security: PASS
- pnpm validate:e2e: PASS

Next:

1. Update docs/progress-tracker.md to mark ENG-LOOP-06 Done.
2. Update Notion ENG-LOOP-06 to Done.
3. Identify the next ENG-LOOP ticket.
```

<!-- ENG-LOOP-10:REQUIRED-CHECK-MATRIX:START -->

## CI Status Check Required-Check Matrix

Use the canonical CI status check names from `docs/engineering/ci-status-checks.md` when configuring branch protection. GitHub required checks must match the emitted workflow job names exactly.

| Status Check                         | Required on `main` | Required on `develop` | Blocking | Local Reproduction                                |
| ------------------------------------ | -----------------: | --------------------: | -------: | ------------------------------------------------- |
| `PR Evidence / validate-pr-evidence` |                Yes |                   Yes |      Yes | `node ./.github/scripts/validate-pr-evidence.cjs` |
| `GarageOS CI / validate:quick`       |                Yes |                   Yes |      Yes | `pnpm validate:quick`                             |
| `GarageOS CI / validate:web`         |                Yes |                   Yes |      Yes | `pnpm validate:web`                               |
| `GarageOS CI / validate:api`         |                Yes |                   Yes |      Yes | `pnpm validate:api`                               |
| `GarageOS CI / validate:db`          |                Yes |                   Yes |      Yes | `pnpm validate:db`                                |
| `GarageOS CI / validate:security`    |                Yes |                   Yes |      Yes | `pnpm validate:security`                          |
| `GarageOS CI / validate:e2e`         |                Yes |                   Yes |      Yes | `pnpm validate:e2e`                               |
| `GarageOS AI Review / advisory`      |                 No |                    No |       No | Advisory review only                              |

### Required Configuration Notes

- Configure the same blocking checks for both `main` and `develop` unless a future accepted architecture or release-management decision changes this policy.
- Keep `GarageOS AI Review / advisory` non-blocking. It may produce useful risk findings, but deterministic validation gates and human review remain authoritative.
- If a workflow job is renamed, update this matrix in the same PR before changing GitHub branch protection.
- If GitHub shows duplicate check names, rename the workflow jobs so each required status check is unique and stable.

<!-- ENG-LOOP-10:REQUIRED-CHECK-MATRIX:END -->
