---
name: cli-data-load-verify
description: >
  Validates that the "Load profile data" menu option completed successfully.
  Runs three layers: (1) all dep: flows are enabled via the list endpoint,
  (2) base connection exists, (3) profile and lookup records are present in the
  Profile store via checkProfileHealth. Use whenever the user says "validate
  data load", "verify streaming worked", "check profile data", "did the data
  load work", "validate the data load menu", or "check if data is in profile".
  Reads env file and sandbox from .github/validate-config.json. Supports AEP
  Foundations (default), AJO Arch Foundations (/cli-data-load-verify ajo), or
  both (/cli-data-load-verify all).
---

# cli-data-load-verify

Verifies that a "Load profile data" run completed successfully end-to-end across three
layers: flow state, base connection, and actual data in the Profile store.

## Copilot execution

Run API checks in a Node process using the selected module's configuration and
the setup in `.github/docs/verification-catalog.md`. Snippets below are templates;
use the in-memory `envMap` and `accessToken`, never substituted credential values.
Use ESM imports with `.js` extensions and PowerShell here-strings for multiline
scripts. Redact sensitive fields from reported responses and preserve the
namespace propagation precondition below.

---

## Determine scope from args

| Arg | Module(s) checked | Layer 3 |
| --- | --- | --- |
| (none) | AEP Foundations only | Run |
| `ajo` | AJO Arch Foundations only | Run |
| `all` | AEP Foundations, then AJO Arch Foundations | Run for both |
| `relational` | AJO Arch Foundations — relational data load only | Skip (relational data does not go to Profile store) |

Layer 3 runs for all profile data loads (AEP and AJO). Only skip Layer 3 when the arg is `relational`.

---

## Setup (per module)

1. Read `.github/validate-config.json`:

   ```json
   {
     "aepFoundations":     { "envFile": "envFiles/s.json", "sandbox": "standard-testing" },
     "ajoArchFoundations": { "envFile": "envFiles/r.json", "sandbox": "relational-testing" }
   }
   ```

   If the file is missing or the target module key is absent, prompt once:
   - List files in `envFiles/`; ask which to use for this module
   - Ask for the sandbox name
   - Save the entry to `.github/validate-config.json`

2. Parse the env file into `envMap`:

   ```javascript
   const envFile = JSON.parse(fs.readFileSync(envFilePath, "utf8"));
   const envMap = Object.fromEntries(
     envFile.values.filter(v => v.enabled !== false).map(v => [v.key, v.value])
   );
   ```

3. Get an access token in memory using the setup in
  `.github/docs/verification-catalog.md`. Do not print it or copy it into commands.

4. Discover the industry vertical:

   ```
  node -e "const fs = require('fs'); const dirs = fs.readdirSync('./industry', { withFileTypes: true }).filter(entry => entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.') && entry.name !== 'sources').map(entry => entry.name); if (dirs.length !== 1) throw new Error('Expected exactly one industry vertical'); console.log(dirs[0]);"
   ```

5. Resolve health yaml path:
   - AEP: `industry/{vertical}/lab-packs/aep-foundations/health.yaml`
   - AJO: `industry/{vertical}/lab-packs/ajo-foundations/health.yaml`

---

## Precondition check — namespace propagation

Before verifying data load, confirm that identity namespaces have propagated to the data plane (minimum 60 minutes after creation). This prevents false failures when schemas were deployed moments ago.

1. Locate `schemas.yaml` for the industry vertical: `industry/{vertical}/standard/schemas.yaml`
2. Extract namespace codes:
   ```
   node -e "const y = require('js-yaml'); const fs = require('fs'); const s = y.load(fs.readFileSync('./industry/[VERTICAL]/standard/schemas.yaml','utf8')); console.log(JSON.stringify(s.identityNamespaces.map(n => n.code)));"
   ```
3. Check each namespace's existence and age:
   ```
   node --input-type=module --eval "
   import axios from 'axios';
   const headers = { Authorization: 'Bearer [TOKEN]', 'x-api-key': '[API_KEY]', 'x-gw-ims-org-id': '[IMS_ORG]', 'x-sandbox-name': '[SANDBOX_NAME]' };
   const codes = [NAMESPACE_CODES];
   const results = [];
   for (const code of codes) {
     const r = await axios.get('https://platform.adobe.io/data/core/idnamespace/identities/' + code, { headers, validateStatus: () => true });
     if (r.status === 200) {
       const createdAt = r.data.createTime;
       const ageMs = Date.now() - createdAt;
       results.push({ code, found: true, createdAt: new Date(createdAt).toISOString(), ageMinutes: Math.floor(ageMs / 60000), propagated: ageMs > 3600000 });
     } else {
       results.push({ code, found: false, status: r.status });
     }
   }
   console.log(JSON.stringify(results));
   "
   ```

4. Evaluate:
   - **All found AND all `ageMinutes > 60`** → log "Namespace propagation complete — proceeding" and continue to Layer 1.
   - **Any namespace not found** → stop with "Namespace {code} not found — run 'Create profile base' from the menu first. Cannot verify data load before schemas are deployed."
   - **Any namespace found but `ageMinutes ≤ 60`** → **report to the orchestrator before waiting**: "Namespace {code} was created at {createdAt}. Propagation wait required until {createdAt + 60 min}. Waiting {remainingMinutes} minutes before proceeding with verification." Do not silently block — always state the wait reason and expected completion time before sleeping.

---

## Layer 1 — Flows enabled

Call `listFlows` directly (list endpoint returns `state`; single-item GET does not):

```
node --input-type=module --eval "
import { listFlows } from './lib/flows/listFlows.js';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]', PREFIX_NAME: 'dep' };
const flows = await listFlows('[TOKEN]', envMap);
const enabled = flows.filter(f => f.state === 'enabled');
const notEnabled = flows.filter(f => f.state !== 'enabled');
console.log(JSON.stringify({ total: flows.length, enabled: enabled.length, notEnabled: notEnabled.map(f => ({ name: f.name, state: f.state })) }));
"
```

**PASS**: `total > 0` and `enabled === total` (all flows enabled)

**FAIL**: any flow has a state other than `"enabled"` — list each by name and state

**SKIP**: `total === 0` — no `dep:` flows found; note "Run 'Load profile data' from the menu first"

---

## Layer 2 — Base connection present

Call `listConnections` directly:

```
node --input-type=module --eval "
import { listConnections } from './lib/flows/listConnections.js';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]', PREFIX_NAME: 'dep' };
const conns = await listConnections('[TOKEN]', envMap);
console.log(JSON.stringify(conns.map(c => c.name)));
"
```

**PASS**: at least one connection returned

**SKIP**: empty array — no `dep:` connections found (consistent with Layer 1 SKIP)

**FAIL**: API call throws or returns an error shape

---

## Layer 3 — Profile and lookup data

**Runs for all profile data loads (AEP and AJO).** Skip only when arg is `relational`.

**15-minute wait required.** Do not run Layer 3 until at least 15 minutes have elapsed since
the data load completed. If the user just finished streaming, report the time and wait:
"Data load completed at {time}. Waiting until {time + 15 min} before running health check."
Do not silently block — always state the wait reason and expected completion time.

Health yaml path per module:
- AEP: `industry/{vertical}/lab-packs/aep-foundations/health.yaml`
- AJO: `industry/{vertical}/lab-packs/ajo-foundations/health.yaml`

Call `checkProfileHealth` directly (substitute correct health yaml path per module):

```
node --input-type=module --eval "
import { checkProfileHealth } from './lib/profileService/checkProfileHealth.js';
import path from 'path';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]', PREFIX_NAME: 'dep' };
const healthYaml = path.resolve(process.cwd(), 'industry', '[VERTICAL]', 'lab-packs', '[aep-foundations|ajo-foundations]', 'health.yaml');
const { passed, results } = await checkProfileHealth('[TOKEN]', envMap, healthYaml);
console.log(JSON.stringify({ passed, results }));
"
```

**PASS**: `passed === true` (every identity's event count matches its `identity.expected`)

**FAIL**: any identity count is non-zero but does not match `identity.expected` — show `label` and render any `children` (per-dataset event breakdown: dataset name — actual count)

**SKIP**: all event counts are 0 — sandbox empty, consistent with Layers 1 and 2 SKIP

---

## Reporting

Print a summary after all layers for each module:

```
## AEP Foundations (standard-testing)

Layer 1 — Flows
  ✓ 10/10 enabled
  (or ✗ FAIL: "dep:Store Visits" state=disabled)
  (or — SKIP: no dep: flows found)

Layer 2 — Base connection
  ✓ Found: dep:HTTP API source connection
  (or — SKIP: no connections found)

Layer 3 — Profile data
  ✓ Depeche Mode profile traits
  ✓ Depeche Mode profile events
  ✓ Store lookup
  ✓ Plan lookup
  ✓ Product lookup
  (or on failure:)
  ✗ Depeche Mode profile events
    ✗ dep: Web — 34 events (expected 17)
    ✗ dep: Billing — 20 events (expected 10)

Overall: PASS / FAIL / SKIP
```

If any layer is FAIL, state exactly what is wrong and what the user should check.

If all layers are SKIP (sandbox empty), tell the user:
"Nothing deployed yet. Run 'Load profile data' from the menu, wait ~15 minutes for Profile
store propagation, then re-run /cli-data-load-verify."

---

## Known expected values

### AEP Foundations (`aep-foundations/health.yaml`)

| Check | Identity | Expected |
| --- | --- | --- |
| Depeche Mode traits | customerID: 266242885 | 3 |
| Depeche Mode events | customerID: 266242885 | 6 |
| Depeche Mode events | Email: depeche.mode@dep.com | 2 |
| Depeche Mode events | Email: dave.gahan@dep.com | 1 |
| Depeche Mode events | ECID: 34537...3542 | 6 |
| Depeche Mode events | ECID: 66385...3316 | 17 |
| Depeche Mode events | ECID: 11537...3597 | 10 |
| Store lookup | storeID: 1 | 1 |
| Plan lookup | planID: 1 | 1 |
| Product lookup | productID: 1 | 1 |

### AJO Arch Foundations (`ajo` arg, `ajo-foundations/health.yaml`)

| Check | Identity | Expected |
| --- | --- | --- |
| Depeche Mode profile traits | customerID: 266242885 | 2 |
| Depeche Mode events | Email: depeche.mode@dep.com | 1 |
| Depeche Mode events | Email: dave.gahan@dep.com | 1 |
| Depeche Mode events | ECID: 34537...3542 | 6 |
| Depeche Mode events | ECID: 66385...3316 | 17 |
| Depeche Mode events | ECID: 11537...3597 | 10 |
| Plan lookup | planID: 1 | 1 |
| Product lookup | productID: 1 | 1 |
| Stranger Things profiles | 16 customerIDs | 16 |
| Decision profiles | 3 customerIDs | 3 |

### Relational data (`relational` arg)

Layer 3 does not run. `loadRelationalData` writes to relational datasets, not the Profile
store — only Layers 1 and 2 (flows enabled + base connection) are checked.

These values are authoritative in the health.yaml files — the tables above are for quick
reference only. `checkProfileHealth` reads them directly from the yaml so they always match.

---

## Error handling

| Situation | Response |
| --- | --- |
| 401/403 from API | Ask user to verify env file credentials match the Adobe Developer Console project |
| Layer 3 partial results (some identities pass, some fail) | FAIL — data is inconsistent; show `children` dataset diagnostics; ask user to re-run data load or wait longer for propagation |
| `checkProfileHealth` throws | Show the raw error; likely an API connectivity or auth issue |
| All layers SKIP | Tell user to run data load menu option first, then wait ~15 min before re-checking |
| Layer 1 PASS but Layer 3 FAIL (all actual=0) | Data was streamed but has not propagated yet — wait 15 minutes and re-run |
| Layer 3 run before 15 min elapsed | State wait reason and expected completion time — do not run health check early |

---

## Cleanup

Removes only what `loadProfileData` and `loadRelationalData` create: flows, source/target connections, mapping sets, and the HTTP API base connection. Schemas, datasets, merge policies, audiences, and identity namespaces are left intact.

### Step 1 — List flows and collect IDs

```
node --input-type=module --eval "
import axios from 'axios';
const headers = {
  Authorization: 'Bearer [TOKEN]',
  'x-api-key': '[API_KEY]',
  'x-gw-ims-org-id': '[IMS_ORG]',
  'x-sandbox-name': '[SANDBOX_NAME]',
};
const r = await axios.get('https://platform.adobe.io/data/foundation/flowservice/flows?limit=100', { headers });
const prefix = 'dep';
const flows = (r.data?.items ?? []).filter(f => f.name?.startsWith(prefix + ':'));
const summary = flows.map(f => ({
  id: f.id,
  name: f.name,
  sourceConnectionIds: f.sourceConnectionIds ?? [],
  targetConnectionIds: f.targetConnectionIds ?? [],
  mappingId: f.transformations?.[0]?.params?.mappingId ?? null,
}));
console.log(JSON.stringify(summary));
"
```

Collect all `id`, `sourceConnectionIds`, `targetConnectionIds`, and `mappingId` values for the following steps.

### Step 2 — Delete flows

```
node --input-type=module --eval "
import { deleteFlow } from './lib/flows/cleanup.js';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]' };
const ids = [FLOW_IDS];
for (const id of ids) {
  const ok = await deleteFlow(id, '[TOKEN]', envMap);
  console.log(id, ok ? 'deleted' : 'failed');
}
"
```

Wait 5 seconds after all flows are deleted before proceeding.

### Step 3 — Delete target connections

```
node --input-type=module --eval "
import { deleteTargetConnection } from './lib/flows/cleanup.js';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]' };
const ids = [TARGET_IDS];
for (const id of ids) {
  const ok = await deleteTargetConnection(id, '[TOKEN]', envMap);
  console.log(id, ok ? 'deleted' : 'failed');
}
"
```

### Step 4 — Delete source connections

```
node --input-type=module --eval "
import { deleteSourceConnection } from './lib/flows/cleanup.js';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]' };
const ids = [SOURCE_IDS];
for (const id of ids) {
  const ok = await deleteSourceConnection(id, '[TOKEN]', envMap);
  console.log(id, ok ? 'deleted' : 'failed');
}
"
```

### Step 5 — Delete mapping sets

```
node --input-type=module --eval "
import { deleteMappingSet } from './lib/flows/deleteMappingSet.js';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]' };
const ids = [MAPPING_IDS];
for (const id of ids) {
  try {
    await deleteMappingSet('[TOKEN]', envMap, id);
    console.log(id, 'deleted');
  } catch (err) {
    console.log(id, 'failed:', err.message);
  }
}
"
```

### Step 6 — Delete base connections

```
node --input-type=module --eval "
import { listConnections } from './lib/flows/listConnections.js';
import { deleteConnection } from './lib/flows/deleteConnection.js';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]', PREFIX_NAME: 'dep' };
const token = '[TOKEN]';
const conns = await listConnections(token, envMap);
for (const c of conns) {
  try {
    await deleteConnection(token, envMap, c.id);
    console.log(c.name, 'deleted');
  } catch (err) {
    console.log(c.name, 'failed:', err.message);
  }
}
console.log(JSON.stringify({ found: conns.length, names: conns.map(c => c.name) }));
"
```

### Cleanup report format

```
### [MODULE_LABEL] cleanup (data-load)
Flows deleted: N/N
Target connections deleted: N/N
Source connections deleted: N/N
Mapping sets deleted: N/N
Base connections deleted: N/N
```

If any deletion fails: list the specific IDs that could not be deleted and note "check Flow Service manually".
