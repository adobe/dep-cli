---
name: cli-menu
description: >
  Scaffolds the three files needed for a new DEP CLI menu action: the menu.js
  entry, the action.js file pre-wired to the standard pattern, and the lib
  function stub. Use whenever the user says "scaffold a new action", "add a
  menu item", "create a new CLI option", or when the plan identifies that a
  new menu entry + action file + lib function are needed. Run AFTER planning
  (which defines what the action should do) and BEFORE filling in business
  logic.
---

# cli-menu

## What this skill does

Scaffolds the three files needed for a new DEP CLI menu action: a `menu.js`
edit, a new `action.js` pre-wired to the standard pattern, and a new `lib`
function stub. It enforces all `.github/copilot-instructions.md` architectural rules at the point of
creation so nothing has to be corrected later.

---

## Step 1 — Gather inputs

If not already clear from context (e.g., from the plan), ask or infer:

- **Module**: `aepFoundations`, `ajoArchFoundations`, or `sandboxManagement`
- **Action name** in camelCase (e.g., `checkDatasetStatus`)
- **Menu label** in sentence case (e.g., "Check dataset status") — enforce
  sentence case: only the first word is capitalized; acronyms stay uppercase
  throughout (canonical list in `.github/instructions/menu-conventions.instructions.md`)
- **What the lib function does** — one sentence describing the API call (e.g.,
  "calls GET /datasets/{id} to check status")
- **Lib subdirectory** the function belongs in: `schemas`, `datasets`,
  `identity`, `flows`, `ingestion`, `utils`, or `env`

---

## Step 2 — Read the target menu.js

Read `menus/{module}/menu.js` to understand the current menu structure and
where to insert the new choice (always before "Go back").

---

## Step 3 — Show a diff preview

Before writing anything, display a preview of all three files:

```
Will create/modify:
  ✦ menus/{module}/menu.js         — add numbered choice (not pinned)
  ✦ menus/{module}/{actionName}.js — new action file
  ✦ lib/{area}/{functionName}.js   — new lib stub

[show the full content of each new/modified file]
```

Ask for confirmation before writing.

---

## Step 4 — Write the files

Use Copilot's file-editing tools for manual edits. Never use shell commands to
write source files (PowerShell 5.1 can introduce a UTF-8 BOM).

### menu.js change

Add a new `{ name: '{Label}', action: {actionName} }` entry to the `choices`
array. Add the corresponding import at the top of the file.

**"Clean sandbox" and "Go back" are pinned shortcuts — never numbered choices.**
New operational actions always go into `choices`. See
`.github/docs/menu-architecture.md` for the full pinned choices structure,
dispatch loop, break check, and `sandboxManagement` exception.

### action.js and lib stub templates

Use the canonical templates in `.github/docs/menu-architecture.md`. They
include notes on conditional imports (`path`, `checkSandboxReady`) and
`withRetry()` requirements.

---

## Step 5 — Report

After writing, summarize what was created and remind the user to:

1. Replace the `TODO` in the lib stub with the actual API endpoint and logic
2. Fill in the action business logic where `// TODO: implement` appears
3. Run `cli-verify` once business logic is complete

---

## Key enforcement rules

Verify these before confirming any write. Full architectural rules are in
`.github/copilot-instructions.md`; menu-specific structure and templates are in
`.github/docs/menu-architecture.md`.

| Rule | Where enforced |
| --- | --- |
| `lib/` is prompt-free — no `import` from `lib/prompts/` | lib stub |
| Actions are thin orchestrators — no `axios` calls | action.js |
| One API call per lib file — exactly one `axios` call | lib stub |
| `envMap` destructured at function top | lib stub |
| `withRetry()` wraps all POST/DELETE calls | lib stub |
| Menu labels use sentence case; acronyms stay uppercase | menu.js choice name |
| Menu entry format is `{ name, action }` — no `value` field | menu.js choices |
| "Clean sandbox" and "Go back" are `pinnedChoices`, never numbered | menu.js |
| Manual edits use Copilot's file-editing tools — never PowerShell | all files |
