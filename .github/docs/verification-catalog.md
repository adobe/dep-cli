# Verification Catalog

Adobe Platform API endpoints for verifying every artifact type the CLI creates.

## Setup — credential loading

Before any API call, use the module target explicitly selected in
`.github/validate-config.json`. Ask for a missing target; never infer it from
the cached session. Run this setup and the relevant API checks in the same Node
process so the token stays in memory:

```javascript
import fs from 'node:fs';
import { getAccessToken } from '../../lib/env/getAccessToken.js';

const config = JSON.parse(fs.readFileSync('.github/validate-config.json', 'utf8'));
const target = config['[MODULE]'];
if (!target?.envFile || !target?.sandbox) throw new Error('Missing validation target');
const envFile = JSON.parse(fs.readFileSync(target.envFile, 'utf8'));
const envMap = Object.fromEntries(
  envFile.values.filter(value => value.enabled !== false).map(value => [value.key, value.value])
);
envMap.SANDBOX_NAME = target.sandbox;
const accessToken = await getAccessToken(envMap);
if (!accessToken) throw new Error('Authentication failed');
```

The import above is relative to this document. When executing from the workspace
root, use `./lib/env/getAccessToken.js`. Replace `[MODULE]` with the selected
module key, not credential values. Never print `envMap`, access tokens, or raw
responses containing sensitive fields.

On Windows PowerShell, use a single-quoted here-string for multiline scripts:

```powershell
@'
import fs from 'node:fs';
console.log(fs.existsSync('.github/validate-config.json'));
'@ | node --input-type=module
```

All API calls use these headers:
```
Authorization: Bearer {accessToken}
x-api-key: {envMap.API_KEY}
x-gw-ims-org-id: {envMap.IMS_ORG}
x-sandbox-name: {envMap.SANDBOX_NAME}
Content-Type: application/json
```

Base URL: `https://platform.adobe.io`

---

## Schema Registry (`/tenant/*`)

### Identity namespace

```
GET /data/core/idnamespace/namespaces
```

Filter by code in response array: `result.find(n => n.code === '<code>')`

Pass: entry found, `custom: true`

### Custom class

```
GET /data/foundation/schemaregistry/tenant/classes?property=title==<name>
Accept: application/vnd.adobe.xed-id+json
```

Pass: `results.length === 1`

### Field group

```
GET /data/foundation/schemaregistry/tenant/fieldgroups?property=title==<name>
Accept: application/vnd.adobe.xed-id+json
```

Pass: `results.length === 1`

### Schema — exists

```
GET /data/foundation/schemaregistry/tenant/schemas?property=title==<name>
Accept: application/vnd.adobe.xed-id+json
```

Pass: `results.length === 1`

### Schema — enabled for Real-time Customer Profile (standard schemas only)

Fetch the full schema first to get its `$id`, then:

```
GET /data/foundation/schemaregistry/tenant/schemas/<encodedSchemaId>
Accept: application/vnd.adobe.xed+json
```

Pass: `response['meta:immutableTags']` is an array containing `"union"`

Note: Only schemas based on XDM Individual Profile or XDM ExperienceEvent classes can be profile-enabled. Custom record-class schemas cannot be union-tagged.

### Identity descriptor

```
GET /data/foundation/schemaregistry/tenant/descriptors?property=@type==xdm:descriptorIdentity&property=xdm:sourceSchema==<encodedSchemaId>
```

Pass: `results.length >= 1`, verify `xdm:sourceProperty` matches expected field path

### Relationship descriptor

```
GET /data/foundation/schemaregistry/tenant/descriptors?property=@type==xdm:descriptorRelationship&property=xdm:sourceSchema==<encodedSchemaId>
```

Pass: `results.length` matches expected count

### Reference identity descriptor

```
GET /data/foundation/schemaregistry/tenant/descriptors?property=@type==xdm:descriptorReferenceIdentity&property=xdm:sourceSchema==<encodedSchemaId>
```

Pass: `results.length` matches expected count

### Friendly name descriptor

```
GET /data/foundation/schemaregistry/tenant/descriptors?property=@type==xdm:alternateDisplayInfo&property=xdm:sourceSchema==<encodedSchemaId>
```

Pass: `results.length` matches expected count

---

## Catalog API (`/datasets`)

### Dataset — exists

```
GET /data/foundation/catalog/datasets?name=<name>&limit=1
```

Pass: response object has at least one key (dataset ID)

### Dataset — enabled for Real-time Customer Profile

```
GET /data/foundation/catalog/datasets/<datasetId>
```

Check: `response[datasetId].tags.unifiedProfile` is an array containing `"enabled:true"`

Pass: `tags.unifiedProfile.includes('enabled:true')`

### Dataset — enabled for Identity Service

```
GET /data/foundation/catalog/datasets/<datasetId>
```

Check: `response[datasetId].tags.unifiedIdentity` is an array containing `"enabled:true"`

Pass: `tags.unifiedIdentity.includes('enabled:true')`

### Dataset — relational store enabled (AJO only)

```
GET /data/foundation/catalog/datasets/<datasetId>
```

Check `extensions.adobe_journeyOptimizer` in the response:

Pass: `enabled: true` AND `status: "COMPLETED"`

Fail states: `status: "FAILED"` (terminal), `enabled: false` (not yet enabled), missing key (never enabled)

---

## Flow Service API

### Source connection

```
GET /data/foundation/flowservice/sourceConnections?property=name==<name>
```

Pass: `items.length === 1`

### Target connection

```
GET /data/foundation/flowservice/targetConnections?property=name==<name>
```

Pass: `items.length === 1`

### Dataflow — exists and active

```
GET /data/foundation/flowservice/flows?property=name==<name>
```

Pass: `items.length === 1` AND `items[0].state === "enabled"`

Inactive state (`"disabled"`) means the flow exists but is not running — usually means streaming won't work.

### Mapping set

```
GET /data/foundation/conversion/mappingSets/<mappingSetId>
```

Pass: HTTP 200, response has `mappings` array with at least one entry

---

## Segmentation / Profile API

### Default merge policy

```
GET /data/core/ups/config/mergePolicies?property=default==true
```

Pass: `_page.count === 1`, check `isActiveOnEdge` matches expected value

### Named merge policy

```
GET /data/core/ups/config/mergePolicies
```

Filter response: `_embedded.mergePolicies.find(p => p.name === '<name>')`

Pass: entry found with expected `identityGraph.type` and `attributeMerge.type`

### Segmentation schedule (daily job)

```
GET /data/core/ups/config/schedules
```

Filter: `_embedded.schedules.find(s => s.name === '<name>')`

Pass: entry found AND `state === "active"`, verify `expression` matches expected cron

### Audience definition

```
GET /data/core/ups/segment/definitions
```

Filter: `segments.find(s => s.name === '<name>')`

Pass: entry found, check `evaluationInfo.continuous.enabled` (streaming), `evaluationInfo.synchronous.enabled` (edge), or `evaluationInfo.batch.enabled` (batch) matches expected mode

---

## Profile API — health check types

These map directly to the check types in `health.yaml`.

### profile-traits

One GET per profile identity. Counts top-level entity keys excluding `segmentMembership`.

```
GET /data/core/ups/access/entities?schema.name=_xdm.context.profile&entityId=<entityId>&entityIdNS=<ns>
```

Pass: top-level key count in `entity` === `expected` (from health.yaml)

### profile-events

One GET per identity in the `identities[]` list. Each identity validated independently against its own `identity.expected` count.

```
GET /data/core/ups/access/entities?schema.name=_xdm.context.experienceevent&entityId=<entityId>&entityIdNS=<ns>
```

Pass: every identity's `_page.count` === `identity.expected`
Fail: returns `children` with dataset-level diagnostics — events grouped by `_datasetId`, names resolved via Catalog API (`GET /data/foundation/catalog/dataSets/<id>?properties=name`)

### batch-profiles

Single POST with all entity IDs.

```
POST /data/core/ups/access/entities
Body: {
  "schema": { "name": "_xdm.context.profile" },
  "identities": [
    { "entityId": "<id>", "entityIdNS": { "code": "<ns>" } },
    ...
  ]
}
```

Pass: count of entries without errors in response === `expected`

### lookup-entity

One GET for a specific lookup record. Checks `sources.length` (not field count).

```
GET /data/core/ups/access/entities?schema.name=<schemaName>&entityId=<entityId>&entityIdNS=<ns>
```

When `schemaName` uses `schemaRef` (custom class, meta:altId unknown): first resolve the class `meta:altId` from Schema Registry using the schema key, then substitute into `schema.name`.

Pass: `entity.sources.length === expected` (1 = record exists with data, 0 = not found)

---

## Static / CLI verification

### YAML parse check

```bash
node -e "
  const yaml = require('js-yaml');
  const fs = require('fs');
  const doc = yaml.load(fs.readFileSync('<path>', 'utf-8'));
  console.log('keys:', Object.keys(doc));
  console.log('count:', doc.schemas ? doc.schemas.length : 'N/A');
"
```

Pass: no exception thrown, key counts match expected

### JSON body file check

```bash
node -e "
  const b = JSON.parse(require('fs').readFileSync('<path>', 'utf-8'));
  console.log('valid JSON, top-level keys:', Object.keys(b));
"
```

Pass: no exception, expected keys present

### Reference integrity check (schema key → file exists)

```bash
node -e "
  const yaml = require('js-yaml');
  const fs = require('fs');
  const schemas = yaml.load(fs.readFileSync('industry/telecom/standard/schemas.yaml', 'utf-8'));
  const missing = schemas.fieldGroups.filter(fg =>
    fg.file && !fs.existsSync('industry/telecom/standard/field-groups/' + fg.file)
  );
  console.log(missing.length === 0 ? 'OK' : 'MISSING: ' + missing.map(f => f.file).join(', '));
"
```

Pass: output is `OK`
