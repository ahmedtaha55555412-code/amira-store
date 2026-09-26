# Error Protocol

## Purpose
Prevent the AI agent from hiding failures, applying random workarounds, or changing unrelated code while fixing a problem.

## Required issue entry
Every meaningful failure gets an entry with:
- ID
- Phase
- Date
- Severity: BLOCKER / HIGH / MEDIUM / LOW
- Symptom
- Reproduction
- Root cause
- Affected layer/files
- Minimal fix
- Verification command/check
- Final status

## Severity
- BLOCKER: prevents phase completion or risks data/security/production integrity.
- HIGH: major feature broken or incorrect data/business behavior.
- MEDIUM: feature works but a meaningful edge case or UX/quality defect exists.
- LOW: cosmetic/non-blocking issue that does not change business correctness.

## Fix rules
1. Fix the root cause, not the symptom.
2. Touch the smallest possible surface.
3. Do not remove tests to hide a failure.
4. Do not relax validation just to make input pass.
5. Do not add unrelated dependencies.
6. Do not refactor unrelated modules.
7. Re-run focused verification.
8. Re-run full phase checks.
9. Record the result in `ISSUE_LOG.md`.

## When to stop
Stop the phase if the root cause is ambiguous, a production/data migration is unsafe, a security boundary is uncertain, or a fix requires changing an earlier phase's contract. Update the plan and status before continuing.
