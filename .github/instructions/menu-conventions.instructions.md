---
description: "Use when editing DEP CLI menus and actions: sentence case, action verbs, pinned choices, and Inquirer APIs."
applyTo: "**"
---

# DEP CLI Menu Conventions

Single source of truth for menu naming, action verb patterns, and structural rules.
Referenced by `.github/copilot-instructions.md`.

---

## Sentence case

Only the first word of a menu entry is capitalised. All other words are lowercase **except**
the following acronyms, which always stay uppercase: `AEP`, `AJO`, `XDM`, `HTTP`, `DLZ`.

---

## Action verb pattern

Every menu entry must start with one of the five canonical verbs:

| Verb | When to use | Example |
| --- | --- | --- |
| **Create** | Purely creating AEP artifacts (schemas, datasets, audiences, merge policies) | "Create profile base" |
| **Load** | Ingesting data into AEP — streaming or file-based, including any flow infrastructure needed to do so | "Load profile data" |
| **Deploy** | Full end-to-end orchestration: creates artifacts AND loads data in one action | "Deploy relational base & data" |
| **Check** | Health/validation reads | "Check profile health" |
| **Clean** | Destructive sandbox cleanup — pinned choice only | "Clean sandbox" |

**"Deploy" signals full orchestration.** When a single action covers both artifact creation and
data loading, use "Deploy" — it communicates that all steps are combined, without requiring
the user to run individual create and load actions.

**Exception: `sandboxManagement`** is not bound by the five canonical verbs above. Sandbox
lifecycle operations (Reset, and any future Create / Delete actions targeting sandboxes
themselves) are intrinsic to sandbox management and use the verb that fits the operation.
This mirrors the existing `sandboxManagement` exceptions in [Module registry](module-registry.instructions.md)
(no "Clean sandbox" pinned entry).

---

## Pinned choices

- **"Clean sandbox" and "Go back" are always `pinnedChoices`** — never numbered in `choices[]`.
  Exception: `sandboxManagement` omits the "Clean sandbox" entry (see `module-registry.md`).
- **"Go back" name constraint**: the pinned "Go back" choice name **must contain the word
  `back`** — the `selection.name.includes("back")` break check depends on it. Do not rename it.
- **New actions go in `choices[]`**, never `pinnedChoices[]`.

---

## API

**Modern `@inquirer/prompts` API only** — never the legacy `inquirer.prompt([...])` array form.
