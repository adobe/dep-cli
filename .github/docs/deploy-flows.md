# Deploy & Data Flow Reference

## Deploy Flow — Standard XDM (`_deployStandard`)

`actionConfig` only needs `schemas:` (list of keys). Field groups, classes, namespaces, and datasets are all **auto-derived**:

- Field groups — from each schema's `allOf[].fieldGroup` entries
- Classes — from each schema's `allOf[].class` entries + each field group's `classRef`
- Identity namespaces — from `identityDescriptors` and `referenceIdentityDescriptors` whose `schema` key is in the selected set
- Datasets — 1:1 with selected schemas (no separate `datasets:` key needed)

Deploy order: Namespaces → Classes → Field Groups → Schemas → Descriptors → Datasets

1. End-of-deploy prompt: "Enable for Real-time Customer Profile?"
   - Y: enable schemas (irreversible) → wait 60s → enable datasets (profile + identity tags)
   - N: skip silently
2. Pre-existence checks at every step — re-runs are always safe (idempotent)
3. On failure: logs guidance to fix and re-run (or clean sandbox); no rollback

## Deploy Flow — Relational (`_deployRelational`)

`actionConfig` only needs `schemas:` (list of keys). Namespaces come from `registry.identityNamespaces` (not actionConfig). Datasets = all selected schemas — no separate `datasets:` key needed.

Deploy order: Namespaces → Schemas → Descriptors → wait 60s → Datasets

1. End-of-deploy prompt: "Enable datasets for AJO relational store?"
   - Y (or `options.autoEnable = true`): enable all datasets
   - N: skip silently
2. Full Relational Deploy passes `{ autoEnable: true }` to skip the prompt

## Deploy Relational Full Flow

`menus/ajoArchFoundations/deployRelationalFull.js` — single action that covers all three phases. Requires `checkSandboxReady` with 120-min threshold (no user prompt for relational enablement — datasets are always enabled).

1. **Phase 1 — Schema deploy:** `deploySchemaModel(deployYamlPath, envMap, accessToken, { type: "relational" })` — creates relational namespaces, schemas, descriptors, and datasets
2. **Phase 2 — Relational dataset activation:** `buildDlzSourceMetadata` to look up datasets, then same polling loop as Load Relational Data (30s × 30 polls = 15 min max); auto-enables any not-yet-enabled datasets; aborts on FAILED status
3. **Phase 3 — Data load:** `uploadToDLZ` → `createDataFlows` (same as Load Relational Data flow)

Use this action when setting up a fresh relational environment end-to-end. Use the individual "Create relational base" and "Load relational data" actions when iterating on just one phase.

## Load Relational Data Flow

`menus/ajoArchFoundations/loadRelationalData.js`:

1. `checkRelationalDatasetStatus` (Catalog API) for each dataset
2. Auto-enables any not-yet-enabled datasets via `enableRelationalDataset`
3. Polls every 30s (max 30 polls = 15 min) until all show `enabled: true` + `status: "COMPLETED"`
4. Aborts entire load if any dataset `FAILED` or times out — no partial loads
5. On success: upload to DLZ → clear existing flows → create dataflows

Relational store enablement status lives in `extensions.adobe_journeyOptimizer` on the Catalog API dataset response.

## Sandbox Cleanup Flow

`lib/schemas/cleanSchemaModel.js` exports two functions:

1. **`inspectSchemaModel(configs, envMap, accessToken)`** — read-only; returns `{ totalFound, totalDeletable, toRemove, locked, deletable, sandbox }`.
2. **`cleanSchemaModel(inspection, envMap, accessToken)`** — executes deletions in order: datasets → descriptors → schemas → field groups → classes. Returns `{ stillPresent }` — an array of artifact titles still present after deletion (empty on full success). Callers are responsible for printing the verification result.

Lock detection: schemas are only truly locked if based on **XDM Individual Profile class** (`https://ns.adobe.com/xdm/context/profile`) AND have `meta:immutableTags: ["union"]`. Other profile-enabled schemas (ExperienceEvent, custom classes) can be deleted.

The `cleanSandbox` actions also delete artifacts that `cleanSchemaModel` does not handle:

- **Audiences** — all UPS segment definitions where `name.startsWith("dep:")`
- **Merge policies** — all non-default UPS merge policies where `name.startsWith("dep:")`

These are deleted at the action layer after `cleanSchemaModel` returns, using `deleteSegmentDefinition` and `deleteMergePolicy`. The final "All artifacts verified removed." message is printed by the action after all deletions complete.

## Flow Service — Enabled State Rule

**This rule applies to every source type, not just HTTP API.**

Before data can move through a flow, two conditions must both be true:

1. **Base connection (source account) must be `state: "enabled"`** — the DCS (Data Collection Server) does not register an inlet until the base connection is enabled. Any streaming or upload attempt before that point will fail with "Inlet does not exist" or similar.
2. **All flows must be `state: "enabled"`** — the DCS does not route data to a dataset until the flow that targets it is enabled.

These are asynchronous AEP provisioning steps that complete after the API returns 201. Code must poll until both conditions are met — do not assume the resource is usable immediately after creation.

**Reuse vs. creation:**

- If a base connection or flow already exists and is already `state: "enabled"` → proceed immediately, no polling needed.
- If newly created → poll. `createHttpBaseConn` polls up to 5 min (30s interval). `checkFlowStatus` polls up to 10 min (30s interval).
- If an existing artifact is found but is NOT enabled → fall through to create a new one (do not poll for a broken artifact to recover).

**Polling output pattern:**

- One-time header on first miss: describes what is being waited for and the maximum wait time.
- Each subsequent poll: attempt count or remaining time only — no repeated header.

## HTTP API Streaming Flow

`loadProfileData.js` actions after env/auth setup:

1. `buildHttpSourceMetadata(accessToken, envMap, registryPath, datasetKeys)` — schema keys → dataset records via Catalog API (one `lookupDatasetByName` call per dataset); records include `profileEnabledAt` parsed from `tags.unifiedProfile`
2. `checkDatasetsReady(datasets)` — pure check; blocks with a message if any dataset is missing the profile-enable tag or was enabled < 60 min ago; no-ops if all are ready
3. `createHttpBaseConn(accessToken, envMap, sourceConfigPath)` → `{ id: baseConnectionId, inletUrl }` — reuses existing by name if already enabled; creates and polls up to 5 min otherwise
4. `createDataFlows({ ..., options: { baseConnectionId, forceRecreate: true } })` — creates source/target/mapping/flow per dataset; deletes any existing flows by name before recreating
5. `checkFlowStatus(accessToken, envMap, flowIds)` — polls until all flows are `state: "enabled"` (up to 10 min); returns immediately if all already enabled
6. For each dataset: `streamRecord(inletUrl, data, flowId)` — single object posts to `/collection/{inletId}`; array posts to `/collection/batch/{inletId}` wrapped as `{ messages: data }`; `flowId` sent as `x-adobe-flow-id` header to route data to the correct dataset

The `mode` field in `data-load.yaml` controls single vs. batch: `single` = plain object, `multi` = array.

Wait 30–60 min after streaming before running a health check.
