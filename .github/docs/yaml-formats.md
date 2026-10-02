# YAML / JSON Asset Format Specs

## standard/schemas.yaml

Two-section file: custom components first (`identityNamespaces`, `classes`, `fieldGroups`), then `schemas`. See `industry/_templates/standard/schemas.yaml` for the full annotated template.

- **Classes**: no body file — payload fully hardcoded at runtime (all custom classes extend `xdm/data/record`). Entry has `key`, `name`, `description` only.
- **Field groups**: body file contains field definitions only (`definitions.customFields.properties` content — no structural wrapper). `intendedToExtend` is a scalar string (one class per FG). Presence of `extends` signals Pattern B (extended FG — two-entry `allOf` + `meta:extends`/`extensible`/`abstract`).
- **Schemas**: `name` and `description` are YAML fields (no JSON body file). `class` is a full URL for standard AEP classes or a registry key (no `://`) for custom classes. All descriptors (identity, relationship, reference identity, friendly name) are nested under each schema entry.
- **Datasets** are auto-derived 1:1 from schemas — dataset name = `schemaDef.name` with `{PREFIX_NAME}` substituted.

## relational/schemas.yaml

Two-section file: `identityNamespaces`, then `schemas`. See `industry/_templates/relational/schemas.yaml` for the annotated template.

- Each schema has `key`, `name`, `description`, `file` (field-definitions-only JSON), `primaryKey`, `versionField`.
- `foreignKeys` are nested under the source schema entry (the one holding the FK column). `sourceToDestinationTitle` and `destinationToSourceTitle` are NOT in YAML — derived at runtime from schema `name` fields.
- No primary key identity descriptor and no version descriptor for relational schemas — only FK (`xdm:descriptorRelationship`) descriptors.

## deploy.yaml (pack manifests)

Lives at `{vertical}/{pack}/deploy.yaml` alongside `health.yaml`. Menu actions read their relevant section by key. See `industry/_templates/` for annotated examples.

```yaml
standard:
  mergePolicies:  # keys from audiences.yaml mergePolicies ("default" patches the existing default)
  schemas:        # keys from standard/schemas.yaml
  audiences:      # keys from standard/audiences.yaml
  dataLoad:       # keys from standard/data-load.yaml
relational:       # omit entirely for AEP-only packs
  schemas:        # keys from relational/schemas.yaml
  dataLoad:       # keys from relational/data-load.yaml
```

## data-load.yaml (standard)

Lives at `{vertical}/standard/data-load.yaml`. Drives HTTP API streaming of sample data into standard (profile/event/lookup) datasets. See `industry/_templates/standard/data-load.yaml` for the annotated template.

**`data-load.yaml` is a catalog.** It lists every available entry, identified by `<schema-key>` + a stable `id`. `deploy.yaml` chooses which entries to stream by referencing them as `<schema-key>:<id>` in its `dataLoad:` list. Catalog entries carry no consumer knowledge — adding a new lab pack does not require touching this file.

```yaml
source: http-api             # REQUIRED — always http-api for standard loads; references industry/sources/http-api.yaml

schemas:                     # REQUIRED — one key per schema with data to load
  <schema-key>:              # REQUIRED — must match a key in standard/schemas.yaml; value is an array
    - id: <id>               # REQUIRED — stable name for THIS entry; referenced from deploy.yaml as
                             #   "<schema-key>:<id>". ids are unique per schema, not globally.
      mode: single           # REQUIRED — single (one JSON object) | multi (JSON array)
      file: industry/<vertical>/standard/sample-data/<file>.json       # REQUIRED — repo-root-relative path
      mappingSet: industry/<vertical>/standard/mapping-sets/<file>.json  # REQUIRED — repo-root-relative path
    # Additional entries stream more files to the same schema; each needs its own unique id.
    # - id: <other-id>
    #   mode: multi
    #   file: industry/<vertical>/standard/sample-data/<other-file>.json
    #   mappingSet: industry/<vertical>/standard/mapping-sets/<file>.json
```

**Dependency on `schemas.yaml`**: every key under `schemas` must also exist as a `key` in `standard/schemas.yaml`. The two files are maintained in sync — adding a schema to `schemas.yaml` should be paired with a corresponding entry in `data-load.yaml`, and removals go together too.

## data-load.yaml (relational)

Lives at `{vertical}/relational/data-load.yaml`. Drives DLZ batch uploads of CSV files into relational schemas. Same catalog/`<schema-key>:<id>` model as the standard form; entries are CSV-shaped instead of JSON-shaped. See `industry/_templates/relational/data-load.yaml` for the annotated template.

```yaml
source: dlz                  # REQUIRED — always dlz for relational batch loads

schemas:                     # REQUIRED — one key per schema table with data to upload
  <schema_key>:              # REQUIRED — must match a key in relational/schemas.yaml; value is an array
    - id: <id>               # REQUIRED — stable name for THIS entry (often just "default" since most
                             #   relational tables have one CSV). Referenced from deploy.yaml as
                             #   "<schema_key>:<id>".
      localPath: "industry/<vertical>/relational/sample-data/<file>.csv"  # REQUIRED — repo CSV path
      targetPath: "dlz-user-container/<prefix>/ajo-campaigns/<file>.csv"  # REQUIRED — DLZ destination
      type: "file"             # always "file"
      dataFormat: "delimited"  # always "delimited" for CSV
      columnDelimiter: ","     # always ","
      encoding: "utf-8"        # always "utf-8"
      compressionType: ""      # leave blank for uncompressed files
```

**Dependency on `schemas.yaml`**: every key under `schemas` must also exist as a `key` in `relational/schemas.yaml`. The relational schema must be created before the DLZ upload runs.

## health.yaml

Lives at `{vertical}/{pack}/health.yaml` alongside `deploy.yaml`. Drives the "Check profile health" action. All checks use exact match: `actual === expected`. Health checks cover standard/profile content only — never relational. See `industry/_templates/lab-packs/*/health.yaml` for annotated templates.

```yaml
checks:
  - label: "Depeche Mode profile traits"  # REQUIRED — shown in CLI output
    type: profile-traits                    # 1 GET; counts top-level entity fields (excl. segmentMembership)
    entityId: "<identity-value>"            # REQUIRED — identity value from sample data
    entityIdNS: customerID                  # REQUIRED — identity namespace code
    expected: 3                             # REQUIRED — expected count of top-level fields

  - label: "Depeche Mode profile events"
    type: profile-events                    # N GETs (one per identity); each compared to identity.expected
    identities:                             # REQUIRED — all linked identities for this profile
      - entityId: "<email>"
        entityIdNS: Email
        expected: 1                         # REQUIRED — expected event count for this identity
      - entityId: "<ecid>"
        entityIdNS: ECID
        expected: 6                         # REQUIRED — expected event count for this identity
      - entityId: "<customerID>"
        entityIdNS: customerID
        expected: 6                         # REQUIRED — expected event count for this identity
    # No top-level expected — each identity has its own expected count

  - label: "Plan lookup record exists"
    type: lookup-entity                     # 1 GET; checks sources.length (1 = record exists)
    schemaName: "_xdm.classes.plan"         # use when meta:altId is known (standard AEP classes)
    # schemaRef: <schema-key>              # use instead when meta:altId unknown (custom class —
    #                                        lib resolves meta:altId from schema registry at runtime)
    entityId: "1"                           # REQUIRED — lookup record identity value
    entityIdNS: planID                      # REQUIRED — lookup identity namespace code
    expected: 1                             # REQUIRED — sources.length expected (1 = record exists)

  - label: "Stranger Things batch profiles"
    type: batch-profiles                    # 1 POST batch lookup; counts profiles found without error
    entityIdNS: customerID                  # REQUIRED — namespace for all entityIds
    entityIds:                              # REQUIRED — identity values to check
      - "<id-1>"
      - "<id-2>"
    expected: 2                             # REQUIRED — must equal count of IDs expected to be found
```

## Cross-file key references

`deploy.yaml` is a **selection manifest** — it contains lists of keys that are subsets of their respective catalog files. A key in the catalog but absent from `deploy.yaml` is valid (just not deployed for that pack). A key in `deploy.yaml` with no matching catalog entry is an error.

| In `deploy.yaml` | Keys must match entries in |
| --- | --- |
| `standard.schemas[]` | `standard/schemas.yaml` → `schemas[].key` |
| `standard.audiences[]` | `standard/audiences.yaml` → `audiences` map keys |
| `standard.mergePolicies[]` | `standard/audiences.yaml` → `mergePolicies` map keys |
| `standard.dataLoad[]` | `standard/data-load.yaml` — each line is `<schema-key>:<id>` and must resolve to an entry with that `id` under that schema key |
| `relational.schemas[]` | `relational/schemas.yaml` → `schemas[].key` |
| `relational.dataLoad[]` | `relational/data-load.yaml` — each line is `<schema_key>:<id>`, same resolution rule as standard |

**`data-load.yaml` ↔ `schemas.yaml` sync rule**: every schema key in `data-load.yaml → schemas` must also exist in the corresponding `schemas.yaml`. The two files are maintained in sync — a schema added to one should be added to the other, and removals pair together. Never assume a key is "missing" from `data-load.yaml` without first confirming it exists in `schemas.yaml` (and vice-versa).

## audiences.yaml

Full catalog — merge policies, daily segment job, and audience definitions. See `industry/_templates/standard/audiences.yaml` for the annotated template.

```yaml
mergePolicies:
  default:                   # reserved key — patches the existing default merge policy
    isActiveOnEdge: true
  no-stitch:                 # any other key — creates a new named merge policy
    name: "{PREFIX_NAME}: No Stitch"
    identityGraph: none
    attributeMerge: timestampOrdered
    isActiveOnEdge: false

dailySegmentJob:
  name: "{PREFIX_NAME}: profile-default"
  type: batch_segmentation
  state: active
  cronExpression: "0 11 * * * ?"
  segments: "*"

audiences:
  any-event-streaming:
    name: "{PREFIX_NAME}: Any Event Streaming (within the hour)"
    evaluationMode: continuous
    file: "industry/{vertical}/standard/audiences/any-event.json"
    editableInUi: true
```

- `mergePolicies.default` — reserved key; action patches the existing default merge policy (never created).
- `dailySegmentJob` — runtime prompts for UTC run time, substitutes into cron before POST.
- `evaluationMode` — `continuous` (streaming), `synchronous` (edge), or `batch`.
- `editableInUi: true` — body file MUST include `ansibleDataModel`; triggers 32-bit signed int hash of `expression.value` at runtime.

## Audience Body Files (`standard/audiences/*.json`)

Contains `expression` always; `ansibleDataModel` only when `editableInUi: true`. All other fields (`name`, `description`, `evaluationInfo`, `schema`, `profileInstanceId`, `payloadSchema`, `ttlInDays`, `hash`) are assembled at runtime.

```json
{
  "expression": {
    "format": "pql/json",
    "value": "...(serialized JSON AST string)..."
  },
  "ansibleDataModel": { "dataModel": {}, "version": "1.0.0" }
}
```

Multiple catalog entries may share one body file when only `name`/`evaluationMode` differ.

## Placeholder Conventions

| Placeholder | Where used | Replaced with |
| --- | --- | --- |
| `{tenantId}` | `field-groups/`, `mapping-sets/`, `standard/audiences/` JSON files, descriptor `sourceProperty` paths | Org tenant namespace (e.g. `_myorg`) — fetched via Tenant API at runtime |
| `{PREFIX_NAME}` | `schemas.yaml` name fields, `audiences.yaml` names, merge policy names | `PREFIX_STANDARD` (`dep`) in standard YAMLs, `PREFIX_RELATIONAL` (`dep-rel`) in relational YAMLs — type-aware substitution; constants in `lib/constants/prefix.js` |
| `{CLASS_<key>}` | Runtime-internal only — not written in any file | `$id` of a custom class after creation; resolves `intendedToExtend` for FGs targeting a custom class |

All use single curly-brace syntax. `{PREFIX_NAME}` appears only in YAML `name` fields, never in JSON body files.

Audience loaders reuse the tenant ID returned by standard schema deployment and
replace `{tenantId}` throughout the body before JSON parsing and UI hash
calculation. Use it in both the PQL expression and matching `ansibleDataModel`
field paths; audience names and descriptions still use `{PREFIX_NAME}`.
