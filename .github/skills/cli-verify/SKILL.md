---
name: cli-verify
description: >
  Verifies the current state of the DEP CLI project against acceptance criteria.
  When a plan file with acceptance criteria is in context, verifies its numbered
  criteria. When invoked standalone (no plan), traces changed files from git,
  groups affected actions by module, and runs them in parallel subagents — each
  against its own designated sandbox. Read-only — never modifies code. Use
  whenever the user says "verify", "checkpoint", "did it work", "check criterion N",
  "validate the CLI", "final gate", or after any implementation step. Also use
  when the user asks whether something was deployed correctly to their Adobe sandbox.
---

# CLI Verify Skill

Verifies the current state of the DEP CLI project. Two modes:

- **Spec mode**: a plan file with acceptance criteria is present in the conversation — extract its numbered criteria, group by module, and run one parallel subagent per module to verify them.
- **Standalone mode**: no plan file in context — trace changed files from git, determine all affected modules (including shared-lib fanout), and run one independent subagent per module in parallel.

Both modes use the same subagent execution path. The mode only affects what each subagent is asked to check.

Verification subagents never modify code. The main context may save selected
local validation targets and apply fixes reported by subagents, as described below.

## Copilot execution

Use the available subagent tool, with one independent invocation per module;
use the parallel tool wrapper when available. Do not select a read-only exploration
agent for verification that must exercise API calls or cleanup. If delegation is
unavailable, report a blocked gate instead of claiming verification ran.

Pass only workspace-relative paths, the selected sandbox, and the action or
criterion list. Each subagent loads its own credentials inside a Node process
using `.github/docs/verification-catalog.md`. Never pass secret values or tokens
in prompts. The snippets below are templates: use ESM imports with `.js`
extensions, PowerShell here-strings, and the in-memory `envMap` and `accessToken`;
do not substitute credential values into command text. Redact sensitive fields
before reporting API output, even where a template requests raw output.

**Module reference**: module directory names, menu labels, lab-pack manifest paths, and the
sandboxManagement exceptions (including when and how to use reset) are in
`.github/instructions/module-registry.instructions.md`. Read it whenever you need to resolve a module name,
manifest path, or determine cleanup scope.

---

## Prerequisite: Validate-config

Before any verification that involves calling Adobe APIs:

1. Check if `.github/validate-config.json` exists.

   - **Missing or incomplete**: for each module that has changed actions (in standalone mode) or is referenced by spec criteria, check if a config entry exists. For any missing entry, prompt once:
     - List files in `envFiles/`; ask which to use for this module
     - Ask for the sandbox name for this module
     - Save or update the entry in `.github/validate-config.json`

   The file uses per-module keys:
   ```json
   {
     "aepFoundations":     { "envFile": "envFiles/<file>.json", "sandbox": "<sandbox>" },
     "ajoArchFoundations": { "envFile": "envFiles/<file>.json", "sandbox": "<sandbox>" }
   }
   ```

  This selects verification targets only. A sandbox reset always requires fresh,
  explicit confirmation of its name, as required by the module registry.

2. Pass each module's selected `envFile` path and sandbox to its subagent, not
  the contents of the env file.

3. Each subagent loads its env file and gets an access token in memory using
  the setup in `.github/docs/verification-catalog.md`. Do not print the token.

---

## Modes

- **Spec mode**: a plan file with acceptance criteria is present in the conversation — verify its numbered criteria via parallel subagents.
- **Standalone mode**: no plan file in context — trace git changes, determine all affected modules, run one subagent per module in parallel.
- **Single criterion**: verify one numbered criterion when the user says "checkpoint 2" or "check criterion 3".

---

## Steps

### 1. Identify what to check

**If a plan file with acceptance criteria is in context (spec mode)**:

1. Pull the criteria from the plan file.
2. For each criterion, identify which module it relates to by examining which action file or lib it references:
   - References to `menus/aepFoundations/` or libs used exclusively by that module → `aepFoundations`
   - References to `menus/ajoArchFoundations/` or libs used exclusively by that module → `ajoArchFoundations`
   - References to a shared lib or cross-module concern → assign to all modules that import it
3. Group criteria by module. A criterion may appear in multiple module groups if it touches shared code.
4. Proceed to Step 2.

**If no spec is in context (standalone mode)**: run call-chain tracing to determine which modules and actions to exercise.

#### Call-chain tracing

1. Run `git diff --name-only main...HEAD` to identify changed files.

2. For each changed file, determine affected modules and actions:

   - **Action file** (`menus/<module>/[^menu].js`): module = the directory name (e.g. `aepFoundations`); affected actions = [this file].

   - **Lib file** (`lib/**/*.js`): grep ALL `menus/` subdirectories for any file that imports it. Collect the unique set of modules found (may be both `aepFoundations` AND `ajoArchFoundations`). Affected actions in each module = every non-destructive action file in that module that imports the lib (directly or transitively via another lib).

   - **Menu file** (`menus/<module>/menu.js`): module = the directory name; affected actions = every non-destructive action in that submenu.

   - **YAML/JSON config** (`industry/**`): grep menu files for the file path; collect modules found; affected actions = menu actions that reference the config.

3. Union all affected modules across all changed files. Even if a shared lib change only touched one function, every module that imports that lib must be included — a broken lib breaks all callers.

4. For each module in the union, collect its full affected action list. Skip any action whose file contains `askConfirmDestructive` — mark it `— SKIP (destructive)`. Skip `sandboxManagement` entirely.

5. For each non-skipped action, record it for subagent execution. Proceed to Step 2.

---

### 2. Execute the verification

Both spec mode and standalone mode execute through parallel subagents — verification never runs in the main context.

#### Print test assignment table

Print this table in the main context before spawning anything:

```
## Test assignments
| Module               | Subagent | Actions / criteria assigned             |
| -------------------- | -------- | --------------------------------------- |
| AEP Foundations      | SA-1     | [comma-separated list]                  |
| AJO Arch Foundations | SA-2     | [comma-separated list]                  |
```

This table is the only execution state tracked in the main context window. Do not accumulate subagent execution detail here — subagents own that.

#### Spawn subagents

Spawn **exactly one subagent per top-level module** in a single message (parallel, not sequential). Never combine modules into a single subagent.

---

**Standalone mode — subagent prompt template:**

```
You are running a CLI validation check for the [MODULE_LABEL] module of the DEP CLI
project in the current workspace.

Sandbox: [SANDBOX_NAME]
Env file path: [ENV_FILE]
Load credentials and acquire a token within your Node process; never print them.

Actions to validate:
[ACTION_NAME] | [MODULE_LABEL] → [action label in menu]
...

For each action:

1. Static wiring check — confirm the action is correctly exported:
  node --input-type=module --eval "import * as actionModule from './menus/[MODULE]/[action].js'; console.log(typeof actionModule.[FUNCTION_NAME]);"
   PASS if output is "function". FAIL if "undefined" or error.

2. Import resolution check — confirm no broken imports:
  node --input-type=module --eval "import './menus/[MODULE]/[action].js';" 2>&1
   PASS if silent (exit 0). FAIL if module-not-found or syntax error.

3. Direct lib function calls — call each lib function the action uses, in the order the action
   calls them, with real credentials. Read the action file first to identify the lib imports and
   call sequence, then exercise each one:

   node --input-type=module --eval "
   import { libFn } from './lib/path/to/lib.js';
   const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]', PREFIX_NAME: 'dep' };
   const result = await libFn('[TOKEN]', envMap, /* any required args */);
   console.log(JSON.stringify(result));
   "
   PASS if result is non-null/non-empty and matches expected shape. Show raw output.
   FAIL if the call throws, exits non-zero, or returns an unexpected shape.

   Do NOT call the action function itself — it contains interactive prompts that hang headlessly.
   Do NOT use curl — direct lib function calls are the authoritative test and catch JS-level errors
   (missing try/catch, wrong import paths, incorrect API response handling) that curl cannot.
   Do NOT skip this step — it is the primary way to detect runtime bugs before the user sees them.

Live action run: NOT performed — action functions require TTY due to @inquirer/prompts v13.
                The lib function calls above are the automated equivalent and cover the same API surface.

4. Data-load outcome check — ONLY when the action being verified is `loadProfileData`,
   `loadRelationalData`, or `deployRelationalFull`. Runs after step 3.

   Discover industry vertical first:
   node -e "const fs = require('fs'); const dirs = fs.readdirSync('./industry').filter(d => !d.startsWith('_') && !d.startsWith('.') && d !== 'sources'); console.log(dirs[0]);"

   a. Flows enabled — call listFlows via lib (ALL three actions):
      node --input-type=module --eval "
      import { listFlows } from './lib/flows/listFlows.js';
      const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]', PREFIX_NAME: 'dep' };
      const flows = await listFlows('[TOKEN]', envMap);
      const notEnabled = flows.filter(f => f.state !== 'enabled');
      console.log(JSON.stringify({ total: flows.length, enabled: flows.length - notEnabled.length, notEnabled: notEnabled.map(f => ({ name: f.name, state: f.state })) }));
      "
      PASS: total > 0 and all flows have state 'enabled'
      SKIP: total === 0 (nothing deployed — sandbox empty)
      FAIL: any flow has a state other than 'enabled'

   b. Base connection — call listConnections via lib (ALL three actions):
      node --input-type=module --eval "
      import { listConnections } from './lib/flows/listConnections.js';
      const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]', PREFIX_NAME: 'dep' };
      const conns = await listConnections('[TOKEN]', envMap);
      console.log(JSON.stringify(conns.map(c => c.name)));
      "
      PASS: at least one connection returned
      SKIP: empty array (consistent with sub-check a SKIP)

   c. Profile / lookup data — ONLY for `loadProfileData`.
      SKIP this sub-check entirely for `loadRelationalData` and `deployRelationalFull` —
      relational dataflows write to relational datasets, not the Profile store, so
      checkProfileHealth does not apply.

      node --input-type=module --eval "
      import { checkProfileHealth } from './lib/profileService/checkProfileHealth.js';
      import path from 'path';
      const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]', PREFIX_NAME: 'dep' };
      const healthYaml = path.resolve(process.cwd(), 'industry', '[VERTICAL]', 'lab-packs', '[LAB_PACK]', 'health.yaml');
      const { passed, results } = await checkProfileHealth('[TOKEN]', envMap, healthYaml);
      console.log(JSON.stringify({ passed, results }));
      "
      Lab-pack mapping: loadProfileData → lab-packs/aep-foundations/health.yaml (or ajo-foundations/health.yaml for ajoArchFoundations)
      PASS: passed === true (all identity expected counts match)
      SKIP: all identities return 0 events (sandbox empty — nothing deployed yet)
      FAIL: any identity count is non-zero but does not match `identity.expected`; result includes `children` with per-dataset event breakdown (dataset name — event count)

   If all applicable sub-checks are SKIP: mark the entire step as — SKIP and note
   "No deployed data found — run the data load menu option, wait ~15 min for Profile
   store propagation, then re-run cli-verify."

   Do NOT mark as FAIL when the sandbox is simply empty — that is a SKIP.

Report format for each action:
  ### [action name]
  ✓ PASS  (or ✗ FAIL or — SKIP or ~ MANUAL)
  Path: [MODULE_LABEL] → [action label in menu]
  Wiring: export ✓/✗  imports ✓/✗
  Lib calls: [PASS/FAIL + raw output excerpt for each lib function tested]
  [On FAIL only] Likely cause: ... / Fix direction: ...

End with:
  ## [MODULE_LABEL] summary
  ✓ N passed   ✗ N failed   — N skipped   ~ N manual

TTY note: @inquirer/prompts v13 requires a real TTY. Action functions (in menus/) cannot be called
headlessly — they contain interactive prompts. Lib functions (in lib/) have no prompts and CAN be
called via `node --input-type=module` without TTY — always do this. Mark ~ MANUAL only when the
criterion requires user-observable UI behavior (menu labels, prompt text, keyboard flow) that cannot
be verified programmatically. Never mark API behavior as ~ MANUAL.
```

---

**Spec mode — subagent prompt template:**

```
You are running a CLI validation check for the [MODULE_LABEL] module of the DEP CLI
project in the current workspace.

Sandbox: [SANDBOX_NAME]
Env file path: [ENV_FILE]
Load credentials and acquire a token within your Node process; never print them.

Criteria to verify:
[N] [criterion text]
...

For each criterion:

1. Determine the verification method:
   - static — parse YAML/JSON, validate a reference, confirm a file exists
   - wiring — verify function export and import resolution via node
   - lib-call — call a lib function directly via node --input-type=module
   - manual — criterion requires user-observable UI behavior (menu rendering, prompt text,
     keyboard flow) that genuinely cannot be verified programmatically → mark ~ MANUAL
     NOTE: "needs an API call" does NOT make a criterion manual — use lib-call instead.

2. Run the appropriate check:

   Static file existence:
   node -e "const fs = require('fs'); console.log(fs.existsSync('path') ? 'EXISTS' : 'MISSING')"

   Static YAML parse:
   node -e "const y = require('js-yaml'); const fs = require('fs'); console.log(JSON.stringify(y.load(fs.readFileSync('path','utf8')), null, 2))"

   Wiring — confirm export:
  node --input-type=module --eval "import * as actionModule from './menus/[MODULE]/[action].js'; console.log(typeof actionModule.[FUNCTION_NAME]);"
   PASS if "function". FAIL if "undefined" or error.

   Wiring — confirm imports resolve:
  node --input-type=module --eval "import './menus/[MODULE]/[action].js';" 2>&1
   PASS if silent. FAIL if module-not-found or syntax error.

   Direct lib function call — preferred for any criterion about API behavior:
   Read the relevant action file to find which lib functions it calls. Call each one directly:
   node --input-type=module --eval "
   import { libFn } from './lib/path/to/lib.js';
   const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]', PREFIX_NAME: 'dep' };
   const result = await libFn('[TOKEN]', envMap, /* args */);
   console.log(JSON.stringify(result));
   "
   PASS if result matches expected shape. FAIL if throws or returns unexpected value.
   Show raw output — never summarize.

   Do NOT use curl for API verification — lib function calls catch JS-level errors that curl cannot.
   Do NOT call action functions (menus/) headlessly — they hang due to @inquirer/prompts v13.

3. Report format for each criterion:
   ### Criterion [N] — [label]
   ✓ PASS  (or ✗ FAIL or — SKIP or ~ MANUAL)
   Method: static | wiring | lib-call | manual
   Sandbox: [sandbox used]
   Response: [relevant excerpt — always show raw detail]
   [On FAIL only]
   Likely cause: [specific file, line, or field]
   Fix direction: [one sentence — no code]

End with:
  ## [MODULE_LABEL] summary
  ✓ N passed   ✗ N failed   — N skipped   ~ N manual

TTY note: @inquirer/prompts v13 requires a real TTY. Action functions (in menus/) cannot be called
headlessly. Lib functions (in lib/) have no prompts and CAN be called via `node --input-type=module`
without TTY — always use lib-call for API verification. Mark ~ MANUAL only when the criterion
requires user-observable UI behavior that cannot be verified programmatically.
```

---

**Subagents report back two things only:**
1. Status per action/criterion: PASS / FAIL / SKIP / MANUAL
2. For each FAIL: the specific failure detail and a suggested fix direction

**After all subagents complete:** the main agent collects both reports, determines what code changes to make, and applies ALL fixes itself — subagents never modify code. Then re-spawn only the subagents for modules with at least one FAIL — independently, in a single parallel message — against the same original action/criteria list. Repeat until all are PASS / SKIP / MANUAL.

---

### 3. Sandbox cleanup

Runs **once**, after all verification subagents have completed and the overall verify summary has been printed. Never runs between individual action checks. Runs regardless of pass/fail outcome — a clean sandbox is required before the next test run.

#### Discover industry (main context)

```
node -e "const fs = require('fs'); const dirs = fs.readdirSync('./industry').filter(d => !d.startsWith('_') && !d.startsWith('.') && d !== 'sources'); console.log(JSON.stringify(dirs));"
```

- Exactly 1 result → use it for all cleanup subagents.
- 0 or multiple → skip automated cleanup; print: "Run **Clean sandbox** from the CLI menu for each module manually." Do not spawn cleanup subagents.

#### Print cleanup assignment table

```
## Cleanup assignments
| Module               | Subagent | Sandbox              |
| -------------------- | -------- | -------------------- |
| AEP Foundations      | CSA-1    | [sandbox name]       |
| AJO Arch Foundations | CSA-2    | [sandbox name]       |
```

#### Spawn cleanup subagents

Spawn **one cleanup subagent per module** that was tested, in a single parallel message. Pass the selected env file path and sandbox; each subagent loads credentials and gets its own token in memory. Include `[LIST_OF_VERIFIED_ACTIONS]` in each subagent prompt — the cleanup subagent uses this list to determine its scope (data-load, schemas, audiences, or a combination).

---

**Cleanup subagent prompt template:**

```
You are running a sandbox cleanup for the [MODULE_LABEL] module of the DEP CLI
project in the current workspace.

Sandbox: [SANDBOX_NAME]
Env file path: [ENV_FILE]
Load credentials and acquire a token within your Node process; never print them.
Prefix: dep
Industry: [INDUSTRY]
Lab-pack: [LAB_PACK]   (e.g. aep-foundations or ajo-foundations)

Actions verified in this run: [LIST_OF_VERIFIED_ACTIONS]

Module → lab-pack mapping:
  aepFoundations      → lab-packs/aep-foundations/deploy.yaml
  ajoArchFoundations  → lab-packs/ajo-foundations/deploy.yaml

---

## Determine cleanup scope

Use this dispatch table to decide which cleanup procedures to run:

| If any verified action is... | Run... |
|---|---|
| loadProfileData, loadRelationalData, deployRelationalFull | DATA-LOAD cleanup |
| createProfileBase | CREATE-PROFILE cleanup (schemas + datasets + merge policies + audiences) |
| createRelationalBase, deployRelationalFull | RELATIONAL-SCHEMAS cleanup |
| cleanSandbox | skip all cleanup |

Run ALL applicable cleanup procedures. `deployRelationalFull` triggers BOTH
DATA-LOAD and RELATIONAL-SCHEMAS cleanup because it deploys both. If the only
verified action is cleanSandbox, skip everything and report "no cleanup needed".

---

### DATA-LOAD CLEANUP (flows, connections, mapping sets, base connection)

Removes only flows, source/target connections, mapping sets, and base connection.
Schemas, datasets, merge policies, audiences, and identity namespaces are left intact.

Step 1 — List flows and collect IDs:
node --input-type=module --eval "
import axios from 'axios';
const headers = { Authorization: 'Bearer [TOKEN]', 'x-api-key': '[API_KEY]', 'x-gw-ims-org-id': '[IMS_ORG]', 'x-sandbox-name': '[SANDBOX_NAME]' };
const r = await axios.get('https://platform.adobe.io/data/foundation/flowservice/flows?limit=100', { headers });
const flows = (r.data?.items ?? []).filter(f => f.name?.startsWith('dep:'));
const summary = flows.map(f => ({
  id: f.id, name: f.name,
  sourceConnectionIds: f.sourceConnectionIds ?? [],
  targetConnectionIds: f.targetConnectionIds ?? [],
  mappingId: f.transformations?.[0]?.params?.mappingId ?? null,
}));
console.log(JSON.stringify(summary));
"

Step 2 — Delete flows (then wait 5 seconds):
node --input-type=module --eval "
import { deleteFlow } from './lib/flows/cleanup.js';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]' };
for (const id of [FLOW_IDS]) { const ok = await deleteFlow(id, '[TOKEN]', envMap); console.log(id, ok ? 'deleted' : 'failed'); }
"

Step 3 — Delete target connections:
node --input-type=module --eval "
import { deleteTargetConnection } from './lib/flows/cleanup.js';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]' };
for (const id of [TARGET_IDS]) { const ok = await deleteTargetConnection(id, '[TOKEN]', envMap); console.log(id, ok ? 'deleted' : 'failed'); }
"

Step 4 — Delete source connections:
node --input-type=module --eval "
import { deleteSourceConnection } from './lib/flows/cleanup.js';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]' };
for (const id of [SOURCE_IDS]) { const ok = await deleteSourceConnection(id, '[TOKEN]', envMap); console.log(id, ok ? 'deleted' : 'failed'); }
"

Step 5 — Delete mapping sets:
node --input-type=module --eval "
import { deleteMappingSet } from './lib/flows/deleteMappingSet.js';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]' };
for (const id of [MAPPING_IDS]) { try { await deleteMappingSet('[TOKEN]', envMap, id); console.log(id, 'deleted'); } catch (err) { console.log(id, 'failed:', err.message); } }
"

Step 6 — Delete base connections:
node --input-type=module --eval "
import { listConnections } from './lib/flows/listConnections.js';
import { deleteConnection } from './lib/flows/deleteConnection.js';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]', PREFIX_NAME: 'dep' };
const token = '[TOKEN]';
const conns = await listConnections(token, envMap);
for (const c of conns) { try { await deleteConnection(token, envMap, c.id); console.log(c.name, 'deleted'); } catch (err) { console.log(c.name, 'failed:', err.message); } }
console.log(JSON.stringify({ found: conns.length }));
"

---

### CREATE-PROFILE CLEANUP (schemas, datasets, field groups, classes, merge policies, audiences)

Runs against the aep-foundations `deploy.yaml`. Removes everything
`createProfileBase` creates. Identity namespaces, flows, connections, mapping
sets, and base connections are left intact.

Step 1 — Schemas, datasets, field groups, classes (`inspectSchemaModel` + `cleanSchemaModel`):
node --input-type=module --eval "
import path from 'path';
import { inspectSchemaModel, cleanSchemaModel } from './lib/schemas/cleanSchemaModel.js';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]', PREFIX_NAME: 'dep' };
const token = '[TOKEN]';
const deployYamlPath = path.resolve(process.cwd(), 'industry', '[INDUSTRY]', 'lab-packs', '[LAB_PACK]', 'deploy.yaml');
const inspection = await inspectSchemaModel(deployYamlPath, envMap, token);
if (inspection.totalFound === 0) { console.log(JSON.stringify({ status: 'clean' })); process.exit(0); }
await cleanSchemaModel(inspection, envMap, token);
console.log(JSON.stringify({ status: 'done', removed: inspection.toRemove, locked: inspection.locked }));
"

Step 2 — Delete merge policies:
node --input-type=module --eval "
import axios from 'axios';
import { deleteMergePolicy } from './lib/profileService/mergePolicies/deleteMergePolicy.js';
const token = '[TOKEN]';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]' };
const headers = { Authorization: 'Bearer ' + token, 'x-api-key': '[API_KEY]', 'x-gw-ims-org-id': '[IMS_ORG]', 'x-sandbox-name': '[SANDBOX_NAME]' };
const r = await axios.get('https://platform.adobe.io/data/core/ups/config/mergePolicies?limit=100', { headers, validateStatus: () => true });
const toDelete = (r.data?.children ?? []).filter(p => p.name?.startsWith('dep:'));
for (const p of toDelete) { try { await deleteMergePolicy(token, envMap, p.id); console.log(p.name, 'deleted'); } catch (err) { console.log(p.name, 'failed:', err.message); } }
console.log(JSON.stringify({ deleted: toDelete.length }));
"

Step 3 — Delete segment definitions (audiences):
node --input-type=module --eval "
import { listSegmentDefinitions } from './lib/profileService/segments/listSegmentDefinitions.js';
import { deleteSegmentDefinition } from './lib/profileService/segments/deleteSegmentDefinition.js';
const token = '[TOKEN]';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]' };
const segments = await listSegmentDefinitions(token, envMap);
const toDelete = segments.filter(s => s.name?.startsWith('dep:'));
for (const s of toDelete) { try { await deleteSegmentDefinition(token, envMap, s.id); console.log(s.name, 'deleted'); } catch (err) { console.log(s.name, 'failed:', err.message); } }
console.log(JSON.stringify({ deleted: toDelete.length }));
"

---

### RELATIONAL-SCHEMAS CLEANUP (relational schemas, datasets, field groups, classes)

Runs against the ajo-foundations `deploy.yaml` only. Skips merge policy and
audience deletion (relational has none). Identity namespaces are left intact.

node --input-type=module --eval "
import path from 'path';
import { inspectSchemaModel, cleanSchemaModel } from './lib/schemas/cleanSchemaModel.js';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]', PREFIX_NAME: 'dep' };
const token = '[TOKEN]';
const deployYamlPath = path.resolve(process.cwd(), 'industry', '[INDUSTRY]', 'lab-packs', 'ajo-foundations', 'deploy.yaml');
const inspection = await inspectSchemaModel(deployYamlPath, envMap, token);
if (inspection.totalFound === 0) { console.log(JSON.stringify({ status: 'clean' })); process.exit(0); }
await cleanSchemaModel(inspection, envMap, token);
console.log(JSON.stringify({ status: 'done', removed: inspection.toRemove, locked: inspection.locked }));
"

---

Report back:
  ### [MODULE_LABEL] cleanup
  Scope: [data-load | create-profile | relational-schemas | combined | none]

  Data-load (if run):
    Flows deleted: N/N
    Target connections deleted: N/N
    Source connections deleted: N/N
    Mapping sets deleted: N/N
    Base connections deleted: N/N

  Create-profile (if run):
    Schemas — Status: clean | done | partial
      Removed: N datasets, N descriptors, N schemas, N field groups, N classes
      Locked: [list locked titles]  (or "none")
      Note: identity namespaces not removed (expected)
    Merge policies deleted: N
    Segment definitions deleted: N

  Relational-schemas (if run):
    Status: clean | done | partial
    Removed: N datasets, N descriptors, N schemas, N field groups, N classes
    Locked: [list locked titles]  (or "none")
```

---

**After all cleanup subagents report back:** the main agent assembles a single cleanup summary section appended to the report (see Report format below).

---

## Report format

**Standalone mode** — one section per module (from subagent results), then an overall summary:

```
## AEP Foundations
### [action name]
✓ PASS
Path: AEP Foundations → Create profile base | sandbox: dep-aep-dev
Wiring: export ✓  imports ✓
Lib calls: ✓ listSchemas → 4 results | ✓ createSchema → id returned

## AJO Arch Foundations
### [action name]
✗ FAIL
Path: AJO Arch Foundations → Create relational base | sandbox: dep-ajo-dev
Wiring: export ✓  imports ✗ — Cannot find module './lib/datasets/enableRelationalDataset'
Lib calls: skipped (wiring failed)
Likely cause: lib/datasets/enableRelationalDataset.js — file renamed or path wrong
Fix direction: correct the import path in the action file

## Overall verify summary
✓ N passed   ✗ N failed   — N skipped   ~ N manual

[If any failed]: Next: fix [module] → [action] first — it is the likely blocker.
```

**Spec mode** — one block per criterion (from subagent results), then overall summary:

```
### Criterion N — [label]
✓ PASS  (or ✗ FAIL or — SKIP or ~ MANUAL)
Method: static | wiring | api | manual
Sandbox: [sandbox used]

Response: [relevant excerpt — always show raw detail]

[On FAIL only]
Likely cause: [specific file, line, or field]
Fix direction: [one sentence — no code]
```

```
## Verify summary
✓ N passed   ✗ N failed   — N skipped   ~ N manual

[If any failed]: Next: fix criterion N first — it is the likely blocker.
```

Both modes append the sandbox cleanup section after the verify summary:

```
## Sandbox Cleanup
### AEP Foundations (standard-testing)
Scope: data-load
  Flows deleted: 10/10
  Target connections deleted: 10/10
  Source connections deleted: 10/10
  Mapping sets deleted: 10/10
  Base connections deleted: 1/1
(or — Scope: create-profile)
  Schemas ✓ Removed: 4 datasets, 3 descriptors, 10 schemas, 10 field groups, 10 classes
  ⚠ Locked (profile-enabled — sandbox reset required): dep-customer-profile
  Merge policies deleted: 2
  Segment definitions deleted: 1
  Note: identity namespaces not removed (expected)
(or — Scope: relational-schemas)
  ✓ Removed: 11 datasets, 0 descriptors, 11 schemas, 0 field groups, 11 classes
(or — Scope: none — no cleanup needed)

### AJO Arch Foundations (relational-testing)
Scope: data-load
  ✓ Sandbox already clean — nothing to remove

## Cleanup summary
✓ N sandboxes cleaned   ⚠ N locked artifacts require sandbox reset
[If locked]: Run Sandbox Management → Reset Sandbox from the CLI menu to force-clear locked schemas.
```

---

## Error handling

| Situation | Response |
| --- | --- |
| 401 or 403 from API | Tell user to verify env file credentials and confirm CLIENT_ID/API_KEY matches the project in Adobe Developer Console |
| `session.json` missing | Tell user to run `npm start`, select an env file to cache it, then retry |
| Sandbox not ready (sandbox returns 404 or empty) | Tell user to wait — `checkSandboxReady` enforces 60 min (profile store) or 120 min (relational store) after creation or reset |
| YAML parse error on a static check | Show the exact parse error and the line number; flag which file to fix |
| `printf ... \| node index.js` hangs or exits code 13 | Expected — `@inquirer/prompts` v13 rejects piped stdin. Call lib functions directly via `node --input-type=module` instead |
| Headless `node -e "...actionFn()"` hangs | Expected — action functions contain interactive prompts. Call the underlying lib functions via `node --input-type=module` instead — never the action function |
| `.github/validate-config.json` missing a module entry | Prompt for that module's env file + sandbox, add the entry, then proceed |
| `sandboxManagement` actions in diff | Skip entirely; note "sandboxManagement skipped — all actions are destructive" |
| Shared lib changed but only one module's actions listed as affected | Re-run call-chain tracing; grep all menus for importers and add any missing modules before spawning subagents |
| Menu number lookup fails (action not found in menu.js) | Note "menu wiring could not be resolved — tested via static wiring checks only" |
| Action calls `askConfirmDestructive` | Skip; mark SKIP; note "run manually to validate" |
| `inspectSchemaModel` returns locked (profile-enabled) schemas | List locked titles; note "sandbox reset required — run Sandbox Management → Reset Sandbox from CLI menu" |
| Industry discovery returns 0 or multiple folders | Skip automated cleanup; print "Run Clean sandbox from the CLI menu for each module manually" |
| Artifacts still present after `cleanSchemaModel` runs | List remaining titles; tell user to re-run cleanup or reset the sandbox |
| No recognized actions in verified list | Default to DATA-LOAD + SCHEMAS cleanup to be safe; note "cleanup scope defaulted — unrecognized action list" |

---

## Key behaviors

- Never modify any code or file under any circumstances.
- Always show the raw API response excerpt — do not summarize away details.
- Do not skip a criterion because it seems obviously passing — run every check.
- **Both spec mode and standalone mode use parallel subagents** — verification never runs in the main context.
- Always print the test assignment table before spawning subagents.
- Spawn module subagents in a single message so they run in parallel — never sequentially.
- Always one subagent per top-level module, never combined. Subagents are independent and never share state.
- When a shared `lib/` file changes, fan out to every module that imports it — do not limit to the module whose action file changed directly.
- Subagents report status and fix direction only — they never modify code.
- The main agent applies all fixes. After fixes, re-spawn only the failing modules' subagents, independently, in one parallel message, against the same original action/criteria list.
- Never call action functions (menus/) headlessly — they hang due to `@inquirer/prompts` v13. Instead, call the underlying lib functions via `node --input-type=module`. Lib functions have no prompts and are the authoritative verification method for all API behavior.
- Direct lib function calls are the primary API verification method — not curl. Read the action file to identify which lib functions it calls, then exercise each one in sequence with real credentials.
- If a criterion verification command is ambiguous, run the most conservative interpretation and note the ambiguity in the report.
- After all verification subagents complete and the verify summary is printed, spawn one cleanup subagent per module in a single parallel message — never between individual action checks. If industry cannot be auto-discovered (0 or multiple folders), instruct the user to run Clean sandbox from the CLI menu.
- When all criteria reach PASS, SKIP, or MANUAL (no FAILs remain): report this status to the calling context so it can automatically proceed to Phase 3 (cli-review-cycle). Do not prompt the user to run the next step.
