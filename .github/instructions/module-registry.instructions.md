---
description: "Use when resolving DEP CLI modules, manifests, sandbox reset safety, and schema deletion locks."
applyTo: "**"
---

# DEP CLI Module Registry

Single source of truth for module directory names, menu labels, lab-pack manifest paths,
and module-specific exceptions. Referenced by `.github/copilot-instructions.md`.

---

## Module directory → menu label

| Directory | Menu label |
| --- | --- |
| `aepFoundations` | AEP Foundations |
| `ajoArchFoundations` | AJO Arch Foundations |
| `sandboxManagement` | Sandbox Management |

---

## Module → lab-pack manifest path

| Module | `deploy.yaml` path |
| --- | --- |
| `aepFoundations` | `industry/{vertical}/lab-packs/aep-foundations/deploy.yaml` |
| `ajoArchFoundations` | `industry/{vertical}/lab-packs/ajo-foundations/deploy.yaml` |

`{vertical}` is resolved at runtime by listing subdirectories of `industry/` and excluding
`_templates` and `sources`. There should be exactly one result; if there are zero or multiple,
surface an error rather than guessing.

```bash
node -e "
const fs = require('fs');
const dirs = fs.readdirSync('./industry').filter(
  d => !d.startsWith('_') && !d.startsWith('.') && d !== 'sources'
);
console.log(JSON.stringify(dirs));
"
```

---

## sandboxManagement exceptions

- **No "Clean sandbox" pinned entry** — this module has no clean action.
- **`sandboxManagement` has no deployable AEP/AJO artifacts** to verify.

**Sandbox reset — critical safety rules**:
The reset action may be invoked when absolutely necessary, but it is **extremely dangerous**:
resetting the wrong sandbox results in **permanent, unrecoverable artifact loss**.

Before running a reset:
- Always confirm the target sandbox name explicitly (show it to the user and require confirmation)
- Never infer the sandbox from session state alone — re-read it from the user

After a reset completes:
- Wait for the sandbox to reach "ready" state
- Then apply the standard timing rules:
  - **60 min** before general AEP/profile use
  - **120 min** before working with the AJO relational store
- See `code-conventions.md` for the authoritative timing rule definition.

---

## Schema lock detection rule

A schema **cannot be deleted** (requires sandbox reset instead) when **both** conditions are
true:

1. Its class is `XDM Individual Profile` (`https://ns.adobe.com/xdm/context/profile`)
2. It has `meta:immutableTags: ["union"]`

All other profile-enabled schemas — including XDM ExperienceEvent and custom record classes —
**can** be deleted normally, even if they are profile-enabled.

This rule applies in:
- `lib/schemas/cleanSchemaModel.js` (sandbox cleanup)
- Any verification step that checks whether artifacts can be removed
