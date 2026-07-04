# GarageOS Branch Protection Runbook

**Status:** Source-aligned engineering runbook  
**Scope:** Manual GitHub branch protection setup for `main` and `develop`  
**Task:** ENG-LOOP-01 — Add PR template and branch protection checklist

---

## 1. Purpose

This runbook defines the recommended GitHub branch protection settings for GarageOS.

The goal is to make the engineering delivery loop safer by requiring:

- Dedicated task branches.
- Pull requests before merging.
- Deterministic CI checks.
- Visible advisory AI review.
- Conversation resolution.
- Human final merge decision.
- Protection against force pushes and branch deletion.

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
chore/eng-loop-pr-template-branch-protection
```

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

Expected checks may appear in GitHub using workflow/job names such as:

```text
CI / Quality Gate
CI / Database Gate
AI PR Review / Advisory AI PR Review
```

If GitHub displays a shorter or slightly different check name, use the exact visible name shown in the pull request checks UI.

### Important Note About `develop`

Do not require a check on `develop` until that check appears on a pull request targeting `develop`.

If `CI / Quality Gate` or `CI / Database Gate` does not appear on a `develop` pull request, update the CI workflow trigger in a separate source-aligned task before making those checks required.

---

## 6. Recommended Protection for `develop`

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
- [ ] Require branches to be up to date before merging if merge conflicts or stale checks become a recurring issue.
- [ ] Require conversation resolution before merging.
- [ ] Block force pushes.
- [ ] Block branch deletion.
- [ ] Keep human final merge decision.
- [ ] Do not allow bypass unless explicitly needed for repository administrators.

Recommended required checks after they are visible and stable:

```text
CI / Quality Gate
CI / Database Gate
```

Recommended advisory check:

```text
AI PR Review / Advisory AI PR Review
```

The AI PR Review check may remain non-required at first. Make it required only after it proves stable and does not create flaky merge blockers.

For solo development, required approval count may remain `0` initially while still requiring pull requests, checks, and conversation resolution.

When additional collaborators join, increase required approvals to at least `1`.

---

## 7. Recommended Protection for `main`

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
- [ ] Require conversation resolution before merging.
- [ ] Block force pushes.
- [ ] Block branch deletion.
- [ ] Prefer PRs from `develop` into `main`.
- [ ] Keep human final merge decision.
- [ ] Do not allow bypass unless explicitly needed for emergency repository administration.

Recommended required checks after they are visible and stable:

```text
CI / Quality Gate
CI / Database Gate
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

## 8. Pull Request Evidence Requirements

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
- AI reviewer notes.
- Rollback notes.

The PR template enforces these fields.

A PR with missing source-alignment or validation evidence should not be merged until the evidence is added or a clear waiver is documented.

---

## 9. Required Status Check Guidance

### Deterministic Checks

These checks should be treated as authoritative once configured:

```text
CI / Quality Gate
CI / Database Gate
```

The current CI gate should validate the relevant baseline checks such as formatting, linting, typechecking, tests, build, dependency audit, migrations, seeds, and schema validation.

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

---

## 10. Manual Validation Procedure

After adding or changing the PR template and protection settings:

1. Push a dedicated task branch.
2. Open a test pull request into `develop`.
3. Confirm the PR template appears automatically.
4. Fill in the PR template fields.
5. Confirm required checks are visible.
6. Confirm AI PR Review appears when configured and eligible.
7. Confirm conversations must be resolved before merge.
8. Confirm direct commits to protected branches are blocked or avoided by policy.
9. Confirm force pushes are disabled.
10. Confirm branch deletion is disabled.
11. Repeat the critical checks for `main`.

---

## 11. Troubleshooting

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

---

## 12. Completion Criteria

This runbook is complete when:

- `.github/pull_request_template.md` exists.
- New GitHub pull requests automatically show the PR template.
- Branch protection guidance exists for `main` and `develop`.
- The runbook states GitHub branch protection is manual.
- AI review is documented as advisory.
- Deterministic CI and human final merge decision remain authoritative.
- No repository settings are changed by code.
