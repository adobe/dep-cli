# Lib Module Reference

## Environment Setup

Create a JSON file in `envFiles/` with these fields:

```json
{
  "CLIENT_SECRET": "",
  "API_KEY": "",
  "IMS": "https://ims-na1.adobelogin.com",
  "IMS_ORG": "",
  "SANDBOX_NAME": "",
  "SCOPES": "",
  "PREFIX_NAME": ""
}
```

Active session (env file path + parsed envMap) is cached in `lib/env/session.json` (gitignored). CLI prompts to reuse it on subsequent runs.

## Prompt System

Uses `@inquirer/prompts` (modern API — not legacy `inquirer.prompt([...])` array form).

- `lib/prompts/promptSafe.js`: `safeConfirm(message, defaultValue)` and `safeInput(message)` — wrap confirm/input with Ctrl+C (ExitPromptError) handling.
- `lib/prompts/continuePrompt.js`: `askConfirm`, `askConfirmDestructive`, `askConfirmGeneric` — action-layer helpers that call `safeConfirm` and emit `console.log()` before the prompt for spacing.
- `lib/prompts/numberedMenuPrompt.js`: `numberedMenuPrompt(choices, title, pinnedChoices = [], disabledChoices = [])` — renders a numbered menu. `choices` entries with `{ separator: true, name }` render as a dim section header (not numbered, not selectable). `disabledChoices` entries render dim with an optional reason string from the `disabled` field. See `.github/docs/menu-architecture.md` for full usage.

## Lib Modules

One-line index of every module. See source files for full signatures.

**`lib/schemas/`** — Schema Registry operations

- `deploySchemaModel.js` — top-level orchestrator: `deploySchemaModel(deployYamlPath, envMap, accessToken, { type: "standard" | "relational", enableProfile: true | false })`. Omitting the options object throws `options.type is required`.
- `cleanSchemaModel.js` — exports `inspectSchemaModel` (read-only audit) and `cleanSchemaModel` (executes deletions: datasets → descriptors → schemas → field groups → classes; returns `{ stillPresent }` — callers print the verification result)
- `listSchemas.js` — GET all tenant schemas in xed-id format (`Accept: application/vnd.adobe.xed-id+json`); returns `results[]` with `title`, `$id`, `meta:altId`
- `createClass.js` / `deleteClass.js` — POST/DELETE custom class
- `createFieldGroup.js` / `deleteFieldGroup.js` — POST/DELETE field group
- `createSchema.js` / `deleteSchema.js` — POST/DELETE schema
- `enableProfileSchema.js` — PATCH schema to add `meta:immutableTags: ["union"]`
- `getTenantId.js` — GET tenant namespace string (e.g. `_myorg`) via Tenant API
- `descriptors/createDescriptor.js` — generic POST for any descriptor type; payload construction for each type (identity, reference, relational keys, relationship, version, friendly name) is handled by the caller (`deploySchemaModel.js`)
- `descriptors/deleteDescriptor.js` — DELETE descriptor by `@id`

**`lib/flows/`** — Flow Service operations

- `createHttpBaseConn.js` — POST base connection for HTTP API source (reuses existing by name)
- `createSourceConn.js` / `createTargetConn.js` — POST source/target connections
- `createMappingSet.js` — POST mapping set with substituted `{tenantId}` placeholders
- `createFlow.js` — POST dataflow linking source → mapping → target
- `bulkCreateDataFlows.js` — orchestrates createSourceConn + createTargetConn + createMappingSet + createFlow per dataset
- `checkFlowStatus.js` — polls flows until `state === "enabled"`
- `cleanup.js` — DELETE existing flows by name before re-creating
- `listConnections.js` — GET `dep:`-prefixed base connections in the sandbox
- `listFlows.js` — GET `dep:`-prefixed flows in the sandbox; returned items include `state` (used to determine `enabled` status)
- `deleteConnection.js` — DELETE a base connection by id
- `deleteMappingSet.js` — DELETE a mapping set via the Conversion API
- `buildDlzSourceMetadata.js` — `buildDlzSourceMetadata(accessToken, envMap, dataLoadYamlPath, datasetKeys)`: assembles per-dataset DLZ source metadata for `bulkCreateDataFlows` from `relational/data-load.yaml`. Calls `lookupDatasetByName` once per dataset.
- `buildHttpSourceMetadata.js` — `buildHttpSourceMetadata(accessToken, envMap, registryPath, datasetKeys)`: assembles per-dataset HTTP-streaming source metadata for `bulkCreateDataFlows` from a `standard/schemas.yaml` registry + caller-supplied `datasetKeys[]`. Returns `Map<datasetName, { name, datasetId, schemaId, schemaKey, profileEnabledAt }>`. Dataset name = `schemaDef.name` with `{PREFIX_NAME}` substituted. Calls `lookupDatasetByName` once per dataset.
- `uploadToDLZ.js` — PUT CSV files to Data Landing Zone for relational batch loads

**`lib/datasets/`** — Catalog API dataset operations

- `createDataset.js` — POST dataset linked to a schema
- `deleteDataset.js` — DELETE dataset by ID
- `enableProfileDataset.js` — PATCH dataset tags for `unifiedProfile` + `unifiedIdentity`
- `enableRelationalDataset.js` — PATCH dataset for AJO relational store
- `checkRelationalDatasetStatus.js` — GET dataset and inspect `extensions.adobe_journeyOptimizer` status
- `lookupDatasetByName.js` — GET dataset by exact name via Catalog API; returns `{ datasetId, schemaId, profileEnabledAt }` — `profileEnabledAt` is Unix ms parsed from `tags.unifiedProfile[].enabledAt:*` (null if absent)
- `checkDatasetsReady.js` — pure utility (no API calls); takes a datasets Map, checks all `profileEnabledAt` values are > 60 min ago; returns `{ ready, notEnabled[], tooRecent[{ name, remainingMinutes }], maxRemainingMinutes }`

**`lib/identity/`**

- `createNamespace.js` — POST custom identity namespace

**`lib/ingestion/`**

- `loadSampleData.js` — orchestrates DLZ-based relational data load (upload CSV → create dataflow)
- `streamRecord.js` — POST records to an HTTP API inlet URL; single mode posts raw data, batch mode (array input) swaps URL to `/collection/batch/` and wraps payload as `{ messages: data }`; `flowId` sent as `x-adobe-flow-id` header

**`lib/profileService/`** — Unified Profile / Segmentation Service

- `checkProfileHealth.js` — runs health check types from `health.yaml` (profile-traits, profile-events, batch-profiles, lookup-entity); `profile-events` validates each identity independently against `identity.expected`; on failure returns `children` with dataset-level diagnostics (name + event count, resolved via Catalog API)
- `mergePolicies/getMergePolicies.js` — GET all merge policies for a schema class
- `mergePolicies/createMergePolicy.js` — POST new named merge policy; returns `r.data.id` on 200 or 201
- `mergePolicies/patchMergePolicy.js` — PATCH merge policy using JSON Patch array: `[{ op: "add", path: "/fieldName", value }]` with `Content-Type: application/json`; only the policy ID is needed (no prior GET required)
- `mergePolicies/deleteMergePolicy.js` — DELETE merge policy by ID
- `segments/createSegmentDefinition.js` — POST audience segment definition
- `segments/listSegmentDefinitions.js` — GET all segment definitions; response shape is `r.data.segments`
- `segments/deleteSegmentDefinition.js` — DELETE segment definition by ID

**`lib/sandbox/`**

- `resetSandbox.js` — DELETE + recreate sandbox (destructive)

**`lib/utils/`**

- `withRetry.js` — wraps any async fn with 3-attempt retry + 2 s delay; optional `label` arg enables per-retry logging. All `create*` and `delete*` lib calls use this.
- `logDone.js` — `logDone(startTime)`: calculates elapsed time from `startTime` (ms epoch) and prints `"Completed in Xm Ys — <ISO timestamp>\n"`. Call at the end of every long-running action.

## API Headers

All Adobe API calls require headers: `Authorization: Bearer {token}`, `x-api-key` (from `envMap.API_KEY`), `x-gw-ims-org-id`, `x-sandbox-name`.
