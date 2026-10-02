# Menu Architecture

Canonical reference for DEP CLI menu structure, pinned choices, dispatch, sentence-case rules, and scaffolding templates. This is the source of truth — skill files reference here rather than duplicating.

---

## Modules

Three top-level modules, each with its own `menus/<module>/menu.js`:

| Directory | Label in CLI |
| --- | --- |
| `aepFoundations` | AEP Foundations |
| `ajoArchFoundations` | AJO Arch Foundations |
| `sandboxManagement` | Sandbox Management |

---

## Numbered choices vs. pinned choices

`numberedMenuPrompt` takes two arrays and renders them together:

1. **`choices`** — numbered operational actions. Every new action goes here. Format: `{ name: string, action: async fn }`. No `value` field.
2. **`pinnedChoices`** — shortcut actions rendered below the numbered list, accepted by single keypress. Format: `{ key: string, name: string, action: async fn }`. `key` must be a single lowercase letter.

```javascript
const choices = [
  { name: 'Check dataset status', action: checkDatasetStatus },
  // ... more actions
];

const pinnedChoices = [
  { key: "c", name: "Clean sandbox", action: cleanSandbox },
  {
    key: "b",
    name: 'Go back to "Main Menu"',
    action: async () => { console.log("\n🔙 Returning to Main Menu...\n"); },
  },
];

await numberedMenuPrompt(choices, "AEP Foundations Menu", pinnedChoices);
```

Signature: `numberedMenuPrompt(choices, title, pinnedChoices = [], disabledChoices = [])` — `choices` first, then `title`, then optional `pinnedChoices`, then optional `disabledChoices`.

Input is trimmed and lowercased before matching, so users may type upper or lower case. The prompt label is always `"Enter selection:"`.

**Separators:** A `choices` entry with `{ separator: true, name: "Label" }` renders as a dim section header and is skipped during numbering and selection. Use to visually group actions within a single menu. Example:

```javascript
const choices = [
  { separator: true, name: "Profile" },
  { name: "Create profile base", action: createProfileBase },
  { name: "Load profile data", action: loadProfileData },
  { separator: true, name: "Relational" },
  { name: "Create relational base", action: createRelationalBase },
];
```

**Disabled choices:** `disabledChoices` entries render below the numbered list in dim text with an optional reason: `{ name: "Some action", disabled: "(coming soon)" }`. They are never selectable.

**Runtime rendering (with separators):**

```text
AJO Arch Foundations Menu:

  ─── Profile ───
  1) Create profile base
  2) Load profile data
  3) Check profile health

  ─── Relational ───
  4) Create relational base
  5) Load relational data
  6) Deploy relational base & data

  c) Clean sandbox
  b) Go back to "Main Menu"

Enter selection:
```

**`sandboxManagement` exception:** omits the `"c"` (Clean sandbox) pinned entry — it has no clean action of its own.

---

## Dispatch and break check

The menu loop dispatches via `selection.action()` — there is no switch block. The break check uses:

```javascript
if (selection.name.includes("back")) break;
```

The "Go back" name **must** contain the word `back`. The existing `'Go back to "Main Menu"'` value satisfies this. Do not change this string.

---

## Sentence-case rules

Menu choice `name` fields use sentence case:

- Only the **first word** is capitalized.
- **Acronyms stay uppercase throughout**: AEP, AJO, XDM, HTTP, DLZ.

Examples:
- ✓ `"Check dataset status"`
- ✓ `"Deploy AJO relational schemas"`
- ✗ `"Check Dataset Status"`
- ✗ `"deploy ajo relational schemas"`

---

## Canonical action.js template

```javascript
import path from 'path';
import { getValidEnvContext } from '../../lib/env/envContext.js';
import { getAccessToken } from '../../lib/env/getAccessToken.js';
import { checkSandboxReady } from '../../lib/env/checkSandboxReady.js';
import { functionName } from '../../lib/{area}/{functionName}.js';
import chalk from 'chalk';

export async function actionName() {
  try {
    const context = await getValidEnvContext();
    if (!context) return;

    const { envMap } = context;
    const accessToken = await getAccessToken(envMap);
    if (!accessToken) return;

    const ready = await checkSandboxReady(envMap, accessToken);
    if (!ready) return;

    // TODO: implement
    const result = await functionName(accessToken, envMap);
    if (!result) {
      console.log(chalk.red('  ✗') + ' Operation failed');
      return;
    }
    console.log(chalk.green('  ✓') + ' Operation complete');
  } catch (err) {
    console.log(chalk.red('  ✗') + ` ${err.message}`);
  }
}
```

**Conditional imports:**
- `import path from 'path'` — include only when the action resolves file paths (e.g., reads a YAML from disk); omit for pure API actions.
- `checkSandboxReady` — include for any action that creates or modifies platform resources; omit for read-only health checks and dry-run operations.

---

## Canonical lib stub template

```javascript
import axios from 'axios';

export async function functionName(accessToken, envMap) {
  const { API_KEY: apiKey, IMS_ORG: imsOrg, SANDBOX_NAME: sandbox } = envMap;

  const url = `https://platform.adobe.io/TODO`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'x-api-key': apiKey,
    'x-gw-ims-org-id': imsOrg,
    'x-sandbox-name': sandbox,
  };

  const response = await axios.get(url, { headers });
  return response.data;
}
```

**Notes:**
- Always destructure `envMap` at the top of the function body (not inline at the call site).
- For `POST` / `DELETE` calls, wrap the axios call in `withRetry()` from `lib/utils/withRetry.js` — bare `axios.post/delete` is not allowed.
- One API call per lib file — orchestration and pre-existence checks belong in the action file or a separate orchestrator lib.
- Never import from `lib/prompts/` — lib files must be prompt-free.
