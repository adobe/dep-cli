# telecom

Industry vertical for telecommunications labs. Models a wireless-carrier business — customer
accounts, lines, plans, orders, billing, and web events — across both **standard XDM** (streaming
profile + ExperienceEvent schemas) and **relational XDM** (AJO Relational Store tables).

This is the reference vertical for DEP CLI; it is consumed by both lab packs:

- `lab-packs/aep-foundations/` — AEP Foundations lab pack (standard XDM only).
- `lab-packs/ajo-foundations/` — AJO Arch Foundations lab pack (standard + relational).

For "how to add a vertical", "how to add a schema", or "how to add an audience", see the canonical
workflows in [`../README.md`](../README.md). This file documents what is **specific to telecom**.

## Directory Layout

```text
industry/telecom/
  standard/
    schemas.yaml         standard XDM classes, field groups, schemas, identity namespaces
    data-load.yaml       streaming sample data manifest (uses industry/sources/http-api.yaml)
    audiences.yaml       merge policies, daily evaluation job, audience definitions
    field-groups/        FG JSON bodies — definitions.customFields.properties contents only
    sample-data/         streaming JSON sample data (see "Sample data shapes" below)
    mapping-sets/        DataPrep mapping sets, one per stream
    audiences/           audience expression JSON bodies (and optional ansibleDataModel)
  relational/
    schemas.yaml         relational tables, primary keys, foreign keys, version fields
    data-load.yaml       DLZ batch upload manifest (uses industry/sources/dlz.yaml)
    schemas/             relational schema JSON bodies (adhoc-v2 record behavior)
    sample-data/         CSV sample data (one file per table)
    mapping-sets/        relational mapping sets (CSV → XDM)
  lab-packs/
    aep-foundations/     deploy.yaml + health.yaml for the AEP pack
    ajo-foundations/     deploy.yaml + health.yaml for the AJO pack
```

## Sample data shapes

`lib/ingestion/loadSampleData.js` accepts three shapes for files referenced from
`standard/data-load.yaml`. Telecom uses all three:

| Shape | Example file | When to use |
| --- | --- | --- |
| Single JSON object | `standard/sample-data/depeche-mode-profile/customer_account.json` | One record for one profile (`mode: single`). |
| Proper JSON array | `standard/sample-data/stranger-things-profiles/sample-profiles.json` | Multiple records pre-wrapped in `[...]` (`mode: multi`). |
| Comma-separated multi-record | `standard/sample-data/plan_lookup.json`, `decisioning-profiles/sample-profiles.json` | Multiple records without an array wrapper — the loader wraps them at runtime (`mode: multi`). Used for lookup tables and decisioning data. |

The `{{p1_date}}`, `{{order1}}`, `{{day1_event1}}`, ... placeholders are substituted with absolute
timestamps relative to deployment time. See `buildDateVars` in `lib/ingestion/loadSampleData.js`.

## Lookup data is duplicated by design

Lookup tables exist in two formats:

- `relational/sample-data/plan_lookup.csv`, `product_lookup.csv`, `product_type_lookup.csv`,
  `store_lookup.csv` — source of truth for relational deployments. Include the AEP-required
  `last_modified` and `_change_request_type` metadata columns.
- `standard/sample-data/plan_lookup.json`, `product_lookup.json`, `store_lookup.json` — the same
  lookup values reshaped for HTTP-streaming ingestion into standard XDM lookup schemas.

**If you change a lookup value, update both copies.** They are not auto-synced.

## Profile personas in `standard/sample-data/`

Telecom ships three families of sample profiles:

- `depeche-mode-profile/` — one rich customer profile with one file per XDM entity
  (`customer_account.json`, `customer_active_lines.json`, `billing.json`, `orders.json`,
  `ecommerce.json`, `web.json`, `customer_aggregates.json`). Use for end-to-end profile demos.
- `stranger-things-profiles/` — multi-profile sample for `customer-account` (Eleven, Mike, Will, ...).
  Use for audience-segmentation demos.
- `decisioning-profiles/` — minimal profiles used as AJO decisioning inputs.

`standard/data-load.yaml` is a **catalog** of every available sample-data file, keyed by
`<schema-key>` + a stable `id`. The three `customer-account` entries have ids `depeche-mode`,
`stranger-things`, and `decisioning`. Lab packs choose which entries to stream from their
`deploy.yaml` `dataLoad:` list — one line per entry:

```yaml
# aep-foundations/deploy.yaml — AEP streams only Depeche Mode
dataLoad:
  - customer-account:depeche-mode

# ajo-foundations/deploy.yaml — AJO streams all three personas
dataLoad:
  - customer-account:depeche-mode
  - customer-account:stranger-things
  - customer-account:decisioning
```

See [YAML formats](../../.github/docs/yaml-formats.md) for the full spec.

## Naming conventions used here

- Standard schemas, audiences, merge policies: prefixed `dep:` (via `{PREFIX_NAME}` substitution).
- Relational schemas: prefixed `dep-rel:` (via `{PREFIX_NAME}` in `relational/` YAMLs).
- Schema keys: kebab-case in `standard/`, snake_case in `relational/` (matches table-style naming).
- Mapping set filenames: always kebab-case, even when the schema key is snake_case
  (e.g. schema `customer_account` → `mapping-sets/customer-account.json`).
