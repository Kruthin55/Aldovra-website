# Aldovra Job Matching QA Matrix

Use this matrix before declaring job matching production-ready. These cases are manual test specifications, not claims that the live website has passed them.

## Match evidence

| Student evidence | Job requirement | Expected behavior |
|---|---|---|
| Passed Python assessment | Python required | Show verified skill evidence and match it |
| Python saved as a skill, no passed assessment | Python required | Match as saved/profile skill; do not label verified |
| Python appears only in analyzed resume | Python required | Match as resume evidence; do not label verified |
| No Python evidence | Python required | Show Python as a gap |
| Requirement inferred from free-text description | No structured skill mapping | Label requirement as inferred when UI supports it; avoid treating extraction as employer-verified data |

## Role and location cases

- Internship title and internship employment type should classify as internship.
- Junior/graduate/trainee role with explicit 0–1 year requirement should classify as entry-level.
- Senior/lead/manager title should not be recommended as an entry-level role without a clear reason.
- A mention such as “our company has 10 years of history” must not be interpreted as a 10-year candidate experience requirement.
- Test Hyderabad, Bengaluru, Pune, Chennai, India-remote, and general remote listings.
- A location preference is a ranking signal, not a hard eligibility gate unless the student explicitly chooses a strict filter.

## Application tracker workflow

1. Sign in as a normal student.
2. Save a job; verify it appears under Saved & tracked after reload.
3. Open the employer application link; verify that this does not automatically mark the job as applied.
4. Confirm the existing “ready” state is only used when the dashboard's intended workflow records it.
5. Mark applied; verify status and timestamp update for that user's row only.
6. Verify another user cannot read or change the student's tracker rows.
7. Check network errors, missing URLs, duplicate save attempts, and reload persistence.

## Regression and release checks

- GitHub Actions dashboard smoke check must complete successfully.
- Run a JavaScript syntax check on every inline script.
- Confirm learning-plan, application-preparation, interview-prep, and application-analytics controls render once after job cards are refreshed.
- Confirm external resource links open safely and the UI stays usable on mobile.
- Confirm live hosting has deployed the intended main commit.
- Perform the above tests using a real authorized test account; never commit its credentials, resume, or personal data.

## Reporting discipline

Report each item as Pass, Fail, or Not tested. GitHub merge status and static marker checks are not substitutes for signed-in browser tests, database RLS checks, or deployment verification.
