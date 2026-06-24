# GarageOS ADR Panel Discussion Summary

## Outcome

The panel accepted ARD-0001 through ARD-0024 as implementation decision records. These records do not add product scope and must remain subordinate to the PRD, database design/schema, architecture, and API contracts.

## Clarifications Resolved

| Question                                                                                                         | Resolution                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Are milestones product phases?                                                                                   | No. They are engineering checkpoints only.                                                                                            |
| Are offline writes allowed?                                                                                      | No. Offline support is app shell plus read-only cache only.                                                                           |
| Is automatic subscription charging included?                                                                     | No. Subscription payment collection happens outside GarageOS and is reflected manually by platform admins.                            |
| Are native apps, customer portal, POS checkout, payroll, full accounting, loyalty, marketplace, or 2FA included? | No. These remain explicit exclusions.                                                                                                 |
| Are exact providers final?                                                                                       | No. Provider adapter strategy is accepted; exact vendors are deferred to milestone-specific selection.                                |
| Is RLS mandatory from the first migration?                                                                       | No. Repository/service scoping is mandatory from day one; RLS is defense-in-depth before production for high-risk tables once tested. |
| Are non-owner role-template grants final?                                                                        | No. Product Manager / BA and Business Owner approval is required before final seed migration.                                         |

## Final Recommendation

Use this ADR package as the Milestone 0 baseline. Database work should start only after the team accepts these records or intentionally supersedes individual records through the ADR process.
