---
description: "Use when editing DEP CLI code: architecture, retry behavior, timing, polling, prompts, output, and encoding."
applyTo: "**"
---

# DEP CLI Code Conventions

Single source of truth for architectural rules, naming, timing, and output
formatting. Referenced by `.github/copilot-instructions.md`.

---

## Architectural constraints

- **`lib/` is prompt-free.** No lib file may import from `lib/prompts/`.
- **Actions are thin orchestrators.** No direct `axios` calls — call lib functions only.
- **One API call per lib file.** Exactly one `axios` call per file. Pre-existence checks and
  orchestration belong in action files or orchestrator libs.
- **`withRetry()` wraps all POST/DELETE calls** from `lib/utils/withRetry.js`. No bare
  `axios.post/delete`. HTTP status semantics: `201` = created, `200`/`204` = success,
  `409` = idempotent success (already exists).
- **`envMap` destructured at function top:**
  `const { API_KEY: apiKey, IMS_ORG: imsOrg, SANDBOX_NAME: sandbox } = envMap;`
- **Actions never throw exceptions.** Guard with `if (!result) return;`. Every action must have
  an outer `try/catch` — without it, any API error crashes the menu process.
- **Per-iteration try/catch in loops.** When iterating a list of items to create or delete,
  wrap each iteration in its own `try/catch` so one failure does not abort the remaining items.
  The outer action-level `try/catch` remains the function-level safety net; the inner catch
  handles per-item isolation.
- **Orchestrators are idempotent.** Check for pre-existing items before creating; build ID maps
  (`classIdMap`, `schemaIdMap`) as items are created and use them to resolve cross-step
  references.
- **Schema `meta:altId` values must be URL-encoded** when used in URL paths:
  `encodeURIComponent(altId)`.

---

## Naming

- **Lib functions**: verb-first — `create*`, `delete*`, `enable*`, `lookup*`/`list*`,
  `check*`/`get*`, `stream*`, `patch*`
- **Private helpers**: `_` prefix, never exported

See [Menu conventions](menu-conventions.instructions.md) for menu naming and structural rules.

---

## Timing constants

All timing values that control code behaviour are defined in source. Never hardcode a
duplicate value in a skill or doc — reference the source file instead.

| Rule | Value | Source |
| --- | --- | --- |
| Inter-step schema propagation pause | 60,000 ms (60 s) | `PROPAGATION_DELAY_MS` in `lib/schemas/deploySchemaModel.js` |
| Sandbox ready → general AEP/profile use | **60 min** | User-facing messages in action files |
| Sandbox ready → AJO relational store use | **120 min** | User-facing messages in action files |
| Post-profile-object creation → load profile data | **60 min** | AEP control plane → data plane propagation |

**Sandbox creation / reset wait rule** (authoritative definition):
After a sandbox is created or reset, wait for it to reach "ready" state, then:
- Wait **at least 60 minutes** before any general AEP or profile use
- Wait **at least 120 minutes** before working with the AJO relational store

`actions/sandboxManagement/reset.js` tells users to "wait 120 minutes" as a conservative
single number. The two-threshold distinction above is the authoritative rule — use it when
surfacing guidance in prompts or documentation.

**Profile data loading wait rule**:
AEP has an eventual-consistency gap between the control plane and the data plane. Do not
load data into profile until **at least 60 minutes after** the underlying schemas, datasets,
and identity namespaces have been created.

---

## Polling conventions

- **Minimum interval: 30 seconds.** No polling loop may check faster than once every 30s.
- **One-time header.** On the first missed check, print a single line describing what is being
  waited for and the maximum wait time. Do not repeat this on subsequent attempts.
- **Per-attempt detail.** Every subsequent poll prints attempt count or time remaining only —
  no repeated description.
- **Skip polling for already-enabled artifacts.** If a reused artifact is already in the
  required state, return immediately. Polling is only needed after creation.

See `deploy-flows.md` for the Flow Service enabled-state rule that drives this pattern.

---

## Output format

```
chalk.green("  ✓") + " message"    // success
chalk.red("  ✗") + " message"      // failure
chalk.yellow("  !") + " message"   // warning
```

- All output lines start with a **2-space indent**.
- Wrap multi-step blocks with a leading and trailing blank line (`\n`).
- Progress lines: `icon + " Item (N/total) — N skipped (already existed)"`
- Timestamps: `new Date().toISOString()` — log at start and end of long operations.

---

## Prompt helpers (`lib/prompts/continuePrompt.js`)

| Use case | Helper |
| --- | --- |
| Destructive operation | `askConfirmDestructive(name)` |
| Time-gated operation (action takes N minutes) | `askConfirm(mins)` — renders as "This process takes N minutes to complete." Use only when the action itself takes that long. |
| Pre-condition gate (user must have waited N minutes) | `askConfirmGeneric(message)` — use when the user must have already waited before proceeding (e.g. schema propagation delay). `askConfirm` wording is wrong for this case. |
| Generic yes/no | `askConfirmGeneric(message)` |

All prompts default to `false` (require explicit confirmation). Ctrl+C is handled globally by
`safeConfirm`/`safeInput` in `lib/prompts/promptSafe.js` — do **not** add duplicate Ctrl+C
or SIGINT handlers in action files.

---

## File encoding

- **UTF-8 without BOM** for all source files.
- **Never use PowerShell to write or edit source files** — PowerShell 5.1 writes a BOM that
  corrupts multi-byte characters. Use Copilot's file-editing tools for manual edits.
