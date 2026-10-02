---
name: cli-github
description: >
  Handles all GitHub workflow steps for DEP CLI changes: PR creation with
   a mandatory versioning and changelog gate, checkpoint evidence, CI monitoring,
   reviewer comment triage and response,
  and merge readiness check. Use whenever the user says "create PR", "open PR",
  "check CI", "respond to review", "address comments", "is it ready to merge",
  or after cli-review-cycle completes successfully. This is the final phase of
  the hill-climbing workflow.
---

# cli-github

## What this skill does

Manages all GitHub workflow steps for DEP CLI feature branches across four modes.
Detect the correct mode from context and user phrasing before proceeding.

---

## Mode 1 — PR creation

Triggered by: "create PR", "open PR", "push and PR", or immediately after cli-review-cycle reports complete.

### Required versioning preflight

Before drafting, committing, pushing, or opening a PR, read
[CLI versioning](../../instructions/versioning.instructions.md) and complete
every applicable step. This also applies when pushing updates to an existing PR.
Check the refreshed target base, all pending and committed changes, SemVer impact,
the three package/lockfile version fields, and the versioned changelog entry.
Report the base and proposed versions or an explicit no-release justification.
Do not proceed with push or PR creation when a required version or changelog
update is missing. Recheck this gate after scope changes and before later pushes.
Versioning corrections do not authorize release tagging or publishing.

Steps:

1. Run `git status` — if uncommitted changes exist, stop and tell the user to commit first.
2. Run `git log main..HEAD --oneline` to see all commits on this branch.
3. Look in the conversation for the goal statement from the plan file and acceptance criteria results from the most recent cli-verify run.
4. Draft the PR:
   - **Title**: 70 characters or fewer, active voice, matches the plan goal (e.g., "Add check dataset status action to AJO menu")
   - **Body**:
     ```
     ## Summary
     - [1-3 bullets describing what changed]

     ## Test plan
     - [x] Criterion 1: [label] — verified via [method] ✓
     - [x] Criterion 2: [label] — verified via [method] ✓
     ...

   Prepared with GitHub Copilot
     ```
5. Confirm the versioning preflight passed against the refreshed base, then push
   the branch: `git push -u origin HEAD`.
6. Create the PR: `gh pr create --title "..." --body "..."`.
   **If `gh pr create` reports that a PR already exists on this branch:**
   1. **Stop.** Do NOT call `gh pr edit` to modify the title or body.
   2. Fetch the existing PR's URL, title, and a one-line summary of its body: `gh pr view --json url,title,body`.
   3. Report all three back to the user.
   4. Ask how to proceed: (a) append a new summary to the existing body, (b) leave the PR alone and just push the new commits, (c) replace the title/body entirely (requires explicit "yes, replace" from user), or (d) close the PR and open a fresh one. Do not act until the user chooses.
7. Return the PR URL.

---

## Mode 2 — CI monitoring

Triggered by: "check CI", "how are the checks", "did CI pass", or after PR creation.

Steps:

1. Get the PR number if not already known: `gh pr view --json number`
2. Run `gh pr checks <number>` to see current check status.
3. If all checks are passing: confirm "All checks green" and prompt to request review if not yet done.
4. If any check is failing:
   - Run `gh run view <run-id> --log-failed` to get the failure log.
   - Identify the failing step and likely cause.
   - If it is a fixable code issue: implement the fix, run cli-verify to verify, then commit and push.
   - If it is an infrastructure or environment issue: explain what the user needs to do manually.
5. Re-check after any fix is applied.

---

## Mode 3 — Review response

Triggered by: "respond to review", "address comments", "reviewer left feedback", or when the user pastes review feedback.

Steps:

1. Read all review comments: `gh pr view <number> --comments`
2. Also fetch inline code comments:
   - Resolve owner/repo first: `gh repo view --json nameWithOwner`
   - Then: `gh api repos/{owner}/{repo}/pulls/<number>/comments`
3. Triage each comment into one of three categories:
   - **Must-fix**: reviewer explicitly requests a change; blocks approval.
   - **Suggestion**: phrased as "consider", "might want to", "optional" — apply if it aligns with `.github/copilot-instructions.md` rules.
   - **Question**: informational only — answer inline, no code change required.
4. For each must-fix:
   - Implement the change.
   - Run cli-verify on affected acceptance criteria to verify no regression.
   - Note what was changed for the reply.
5. Reply to each comment thread:
   - Must-fix: describe what was changed.
   - Suggestion (applied): confirm it was applied and why.
   - Suggestion (skipped): explain why — usually because it conflicts with an architectural rule in `.github/copilot-instructions.md`.
   - Question: answer directly.
   - Use: `gh api repos/{owner}/{repo}/pulls/<number>/comments/<comment-id>/replies -f body="..."`
6. After all must-fixes are addressed, re-request review: `gh pr review <number> --request-review <reviewer>`

---

## Mode 4 — Merge readiness check

Triggered by: "is it ready to merge", "can we merge", "check merge status"

Steps:

1. Run: `gh pr view <number> --json mergeable,reviewDecision,statusCheckRollup`
2. Check each gate:
   - CI: all status checks passing
   - Reviews: at least one approval, no outstanding requested changes
   - Threads: all review threads resolved
   - Criteria: run cli-verify — all acceptance criteria must pass
3. Report "Ready to merge" if all gates are clear, or list each blocking item with what is needed to unblock it.

---

## Key behaviors

- Never force-push. If the branch needs rewriting, stop and ask the user.
- Never merge without an explicit user instruction, even when all gates pass.
- **Never overwrite an existing PR's title or body without explicit user confirmation, even when scope appears to have grown.** When `gh pr create` reports a PR already exists on this branch, stop and ask the user how to proceed (see Mode 1 step 6).
- Always run cli-verify after any code change made in response to a review comment (Mode 3).
- Always resolve the repo owner/name with `gh repo view` — do not hardcode it.
- If gh CLI is not authenticated, tell the user to run `gh auth login` first.
