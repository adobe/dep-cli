---
name: cli-create-profile-verify
description: >
  Validates that "Create profile base" completed successfully. Checks that
  expected schemas, datasets, merge policies, and segment definitions (audiences)
  exist in the sandbox. Owns cleanup of those four artifact types only — flows,
  connections, mapping sets, and identity namespaces are left intact. Use when
  verifying createProfileBase.
---

# cli-create-profile-verify

Verifies that the full `createProfileBase` action completed successfully —
schemas, datasets, merge policies, and audiences. Owns cleanup of those four
artifact types only — no flows, connections, mapping sets, or identity
namespaces.

## Copilot execution

Run API checks in a Node process using the selected module's configuration and
the setup in `.github/docs/verification-catalog.md`. Snippets below are templates;
use the in-memory `envMap` and `accessToken`, never substituted credential values.
Use ESM imports with `.js` extensions and PowerShell here-strings for multiline
scripts. Redact sensitive fields from reported responses. Cleanup stays limited
to the four artifact types listed above; never reset a sandbox automatically.

---

## Setup

1. Read `.github/validate-config.json`:
   ```json
   {
     "aepFoundations":     { "envFile": "envFiles/s.json", "sandbox": "standard-testing" },
     "ajoArchFoundations": { "envFile": "envFiles/r.json", "sandbox": "relational-testing" }
   }
   ```
   If missing or the target module key is absent, prompt once for env file + sandbox and save.

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

5. Resolve deploy.yaml path:
   - AEP: `industry/{vertical}/lab-packs/aep-foundations/deploy.yaml`
   - AJO: `industry/{vertical}/lab-packs/ajo-foundations/deploy.yaml`

---

## Layer 1 — Schemas exist

```
node --input-type=module --eval "
import { listSchemas } from './lib/schemas/listSchemas.js';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]', PREFIX_NAME: 'dep' };
const schemas = await listSchemas('[TOKEN]', envMap);
console.log(JSON.stringify({ total: schemas.length, titles: schemas.map(s => s.title) }));
"
```

**PASS**: count > 0 and titles include the schemas listed in deploy.yaml `standard.schemas`
**SKIP**: count = 0 — sandbox empty; note "Run 'Create profile base' from the menu first"
**FAIL**: expected schema names are missing from the response

---

## Layer 2 — Datasets exist

```
node --input-type=module --eval "
import axios from 'axios';
const headers = {
  Authorization: 'Bearer [TOKEN]',
  'x-api-key': '[API_KEY]',
  'x-gw-ims-org-id': '[IMS_ORG]',
  'x-sandbox-name': '[SANDBOX_NAME]',
};
const r = await axios.get('https://platform.adobe.io/data/catalog/dataSets?limit=100', { headers });
const prefix = 'dep';
const datasets = Object.values(r.data ?? {}).filter(d => d.name?.startsWith(prefix + ':'));
console.log(JSON.stringify({ total: datasets.length, names: datasets.map(d => d.name) }));
"
```

**PASS**: count > 0 and names include expected datasets
**SKIP**: count = 0 — consistent with Layer 1 SKIP
**FAIL**: expected dataset names missing

---

## Layer 3 — Merge policies exist

```
node --input-type=module --eval "
import axios from 'axios';
const headers = {
  Authorization: 'Bearer [TOKEN]',
  'x-api-key': '[API_KEY]',
  'x-gw-ims-org-id': '[IMS_ORG]',
  'x-sandbox-name': '[SANDBOX_NAME]',
};
const r = await axios.get(
  'https://platform.adobe.io/data/core/ups/config/mergePolicies?limit=100',
  { headers, validateStatus: () => true }
);
const items = r.data?.children ?? [];
const prefix = 'dep';
const found = items.filter(p => p.name?.startsWith(prefix + ':'));
console.log(JSON.stringify({ total: found.length, names: found.map(p => p.name) }));
"
```

**PASS**: merge policies found matching the names in deploy.yaml `standard.mergePolicies`
**SKIP**: none found — consistent with Layer 1 SKIP
**FAIL**: expected policy names missing

---

## Layer 4 — Audiences (segment definitions) exist

```
node --input-type=module --eval "
import { listSegmentDefinitions } from './lib/profileService/segments/listSegmentDefinitions.js';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]', PREFIX_NAME: 'dep' };
const segments = await listSegmentDefinitions('[TOKEN]', envMap);
const prefix = 'dep';
const found = segments.filter(s => s.name?.startsWith(prefix + ':'));
console.log(JSON.stringify({ total: found.length, names: found.map(s => s.name) }));
"
```

**PASS**: audience count > 0 and names match deploy.yaml `standard.audiences`
**SKIP**: count = 0 — consistent with Layer 1 SKIP
**FAIL**: expected audience names missing

---

## Reporting

```
## [MODULE_LABEL] (sandbox-name)

Layer 1 — Schemas
  ✓ 10/10 expected schemas found
  (or ✗ FAIL: "dep: Customer Account" missing)
  (or — SKIP: no dep: schemas found)

Layer 2 — Datasets
  ✓ 10/10 expected datasets found
  (or ✗ FAIL: "dep: Customer Account Dataset" missing)
  (or — SKIP: no dep: datasets found)

Layer 3 — Merge policies
  ✓ 2/2 expected merge policies found
  (or ✗ FAIL: "dep: No-stitch" missing)
  (or — SKIP: no dep: merge policies found)

Layer 4 — Audiences
  ✓ 1/1 expected audiences found
  (or ✗ FAIL: "dep: Any Event Streaming" missing)
  (or — SKIP: no dep: audiences found)

Overall: PASS / FAIL / SKIP
```

---

## Cleanup

Removes schemas, datasets, field groups, classes, merge policies, and segment
definitions (audiences) created by `createProfileBase`. Leaves flows,
connections, mapping sets, and identity namespaces intact.

### Step 1 — Schemas, datasets, field groups, classes

```
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
```

Note: identity namespaces are never removed by `cleanSchemaModel` (by design).

### Step 2 — Delete merge policies

```
node --input-type=module --eval "
import axios from 'axios';
import { deleteMergePolicy } from './lib/profileService/mergePolicies/deleteMergePolicy.js';
const token = '[TOKEN]';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]' };
const headers = {
  Authorization: 'Bearer ' + token,
  'x-api-key': '[API_KEY]',
  'x-gw-ims-org-id': '[IMS_ORG]',
  'x-sandbox-name': '[SANDBOX_NAME]',
};
const r = await axios.get('https://platform.adobe.io/data/core/ups/config/mergePolicies?limit=100', { headers, validateStatus: () => true });
const items = r.data?.children ?? [];
const prefix = 'dep';
const toDelete = items.filter(p => p.name?.startsWith(prefix + ':'));
for (const p of toDelete) {
  try {
    await deleteMergePolicy(token, envMap, p.id);
    console.log(p.name, 'deleted');
  } catch (err) {
    console.log(p.name, 'failed:', err.message);
  }
}
console.log(JSON.stringify({ deleted: toDelete.length }));
"
```

### Step 3 — Delete segment definitions (audiences)

```
node --input-type=module --eval "
import { listSegmentDefinitions } from './lib/profileService/segments/listSegmentDefinitions.js';
import { deleteSegmentDefinition } from './lib/profileService/segments/deleteSegmentDefinition.js';
const token = '[TOKEN]';
const envMap = { API_KEY: '[API_KEY]', IMS_ORG: '[IMS_ORG]', SANDBOX_NAME: '[SANDBOX_NAME]' };
const segments = await listSegmentDefinitions(token, envMap);
const prefix = 'dep';
const toDelete = segments.filter(s => s.name?.startsWith(prefix + ':'));
for (const s of toDelete) {
  try {
    await deleteSegmentDefinition(token, envMap, s.id);
    console.log(s.name, 'deleted');
  } catch (err) {
    console.log(s.name, 'failed:', err.message);
  }
}
console.log(JSON.stringify({ deleted: toDelete.length }));
"
```

### Cleanup report format

```
### [MODULE_LABEL] cleanup (create-profile)
Schemas:
  Status: clean | done | partial
  Removed: N datasets, N descriptors, N schemas, N field groups, N classes  (or "nothing to remove")
  Locked:  [list locked titles + reason]  (or "none")
  Note: identity namespaces not removed (expected)
Merge policies deleted: N
Segment definitions (audiences) deleted: N
```
