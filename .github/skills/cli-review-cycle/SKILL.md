---
name: cli-review-cycle
description: >
  Runs the full quality gate for DEP CLI changes: simplify → code review →
  security review → DEP-specific compliance checks → regression checkpoint.
  Loops until all phases are clean and all acceptance criteria still pass. Use
  whenever the user says "start review", "prepare PR", "ready for review", or
  after all /cli-verify passes. This is Phase 3 of the hill-climbing
  workflow — only run it after Phase 2 (implement + verify) is complete.
---

# cli-review-cycle

## What this skill does

Runs a structured five-phase quality gate over all DEP CLI changes. Each loop
iteration runs every phase in order. If any fix is made in phases 1–4, the
loop restarts at Phase 1. The loop exits only when all five phases complete
with nothing to fix and all checkpoint criteria pass.

```
Phase 1: Simplify
Phase 2: Code review
Phase 3: Security review
Phase 4: DEP compliance
Phase 5: Regression checkpoint
→ If any fix was made in phases 1–4: loop back to Phase 1
→ Exit when all five phases complete clean AND all checkpoints pass
```

---

## Phase 1 — Simplify

Review all changed code for reuse, quality, and efficiency. Check for unnecessary
abstractions, duplicated logic, and avoidable work. Prefer existing repository
helpers and keep changes scoped to the requested behavior. Apply justified fixes
and record what changed. This phase does not require a separate `simplify` skill.

---

## Phase 2 — Code review

Review the current branch diff and relevant neighboring code for bugs, behavioral
regressions, error handling gaps, and missing verification. Ground each finding
in a file and line. This phase does not require a separate `review` skill.
For each finding, classify and act:

- **Must-fix** — fix it immediately; note what changed
- **Suggestion** — apply it if it aligns with .github/copilot-instructions.md rules; skip if it
  conflicts; note the decision either way
- **Question** — answer it inline; no code change needed

---

## Phase 3 — Security review

Review the changed code for credential exposure, unsafe input handling, shell
injection, path traversal, and unintended destructive API calls. Apply confirmed
fixes. This phase does not require a separate `security-review` skill.
In addition, manually verify these DEP CLI-specific checks:

- No credentials or env values hardcoded in any file
- No user-controlled input passed to shell commands (no `exec`/`spawn` with
  user data)
- No direct file path traversal from user input

---

## Phase 4 — DEP compliance check

Rules are defined in `.github/copilot-instructions.md`. The table below lists how to verify each one against the changed files. Report each check as ✓ pass or ✗ fail with the specific `file:line` when failing.

| Check | Method | Must be |
| --- | --- | --- |
| `lib/` is prompt-free | grep changed lib files for `import.*prompts` | zero matches |
| Actions are thin orchestrators | grep changed action files for `axios` | zero matches |
| One API call per lib file | count `axios` calls in each changed lib file | exactly one per file |
| Menu sentence case | inspect each changed menu.js choice `name` field | first word capitalized, rest lowercase except acronyms listed in `.github/instructions/menu-conventions.instructions.md` |
| "Go back" value intact | inspect menu.js break check | value is lowercase `back` |
| UTF-8 no BOM | inspect the first three bytes of each changed file | no UTF-8 BOM (`EF BB BF`) |
| Modern inquirer API | grep all changed files for `inquirer.prompt(` | zero matches |

---

## Phase 5 — Regression checkpoint

Re-run all acceptance criteria from the plan file using
cli-verify. Every criterion must still pass.

If any criterion fails, a review-phase fix broke the implementation. Fix the
regression first, then loop back to Phase 1.

---

## Loop logic

```
After phases 1–4:
  if ANY fix was made → restart at Phase 1

After phase 5:
  if ANY criterion failed → fix regression → restart at Phase 1

Exit condition:
  phases 1–4 produced zero fixes AND phase 5 all criteria pass
```

If the same fix keeps being re-introduced on successive loop iterations, stop
and ask the user before continuing.

---

## Exit output

When the loop exits cleanly, produce this summary:

```
## Review cycle complete ✓

### What was changed during review
- [one bullet per fix, noting which phase caught it]

### Checkpoint results
- ✓ Criterion 1 — [label]
- ✓ Criterion 2 — [label]
...

### PR-ready summary
Title: [70 characters or fewer]

Summary:
- [bullet]
- [bullet]

Test plan:
- [x] Criterion 1 verified via [method]
- [x] Criterion 2 verified via [method]
```

---

## Key behaviors

- Never skip a phase — all five run on every loop iteration
- Never declare done if any criterion is failing, even when all review phases
  are otherwise clean
- If the same issue recurs across loop iterations, stop and ask the user
- This is Phase 3 of the hill-climbing workflow; it runs after all
  /cli-verify passes and before opening a PR
- When the loop exits cleanly (all five phases clean, all criteria pass): report back to the
  calling context so it can automatically proceed to Phase 4 (cli-github). Do not prompt the
  user to run the next step.
