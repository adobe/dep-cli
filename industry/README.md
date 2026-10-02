# Industry Verticals

Lab pack configurations for AEP/AJO training environments, organized by industry.
Each vertical contains schema catalogs, data load configs, audience definitions, and pack manifests.
Source connector configs in `sources/` are shared across all verticals.

## Directory Layout

```
industry/
  sources/             <- shared source connector configs (HTTP API, DLZ)
  _templates/          <- annotated templates for new verticals
  <vertical>/
    standard/          <- standard XDM schemas, sample data, audiences
    relational/        <- relational schemas and batch data
    lab-packs/
      aep-foundations/ <- AEP pack manifest + health checks
      ajo-foundations/ <- AJO pack manifest + health checks
```

## Creating a New Industry Vertical

1. Copy `_templates/` to `industry/<vertical>/`
2. Fill in `standard/schemas.yaml` -- namespaces, classes, field groups, schemas, descriptors
3. Fill in `standard/data-load.yaml` -- sample data files and mapping set paths
4. Fill in `standard/audiences.yaml` -- merge policies, daily job, audience definitions
5. Fill in `relational/schemas.yaml` -- relational tables, primary keys, foreign keys
6. Fill in `relational/data-load.yaml` -- CSV file paths for DLZ upload
7. Fill in `lab-packs/aep-foundations/deploy.yaml` -- standard schemas/audiences to deploy for AEP
8. Fill in `lab-packs/ajo-foundations/deploy.yaml` -- standard + relational content to deploy for AJO
9. Create all JSON body files referenced in each YAML:
   - Field group bodies: field definitions only (`definitions.customFields.properties` content, no wrapper)
   - Audience bodies: `expression` always; `ansibleDataModel` only when `editableInUi: true`
   - No class body files -- class payload is fully hardcoded at runtime
10. Create sample data files and mapping sets per the data-load.yaml entries

## Adding a New Schema to an Existing Vertical

1. Create the field group JSON body in `standard/field-groups/<key>.json`
   - Pattern A (simple): just the `{tenantId}` wrapper and its properties
   - Pattern B (extended): just the top-level field paths that extend an OOTB FG
2. Add the field group entry to `standard/schemas.yaml` under `fieldGroups:` with `intendedToExtend`
   (and `extends` if Pattern B)
3. Add a schema entry to `standard/schemas.yaml` under `schemas:` with class, fieldGroups, descriptors
4. Add sample data to `standard/sample-data/` and a mapping set to `standard/mapping-sets/`
5. Add the schema key to `standard/data-load.yaml` under `schemas:`
6. Add the schema key to the relevant pack's `deploy.yaml` under `standard.schemas:` and `standard.dataLoad:`

## Adding a New Audience

1. Create `standard/audiences/<key>.json` with only `expression` (and `ansibleDataModel` when
   `editableInUi: true` -- obtain by creating the segment in the AEP UI and copying `ansibleDataModel`
   from the response)
2. Add an entry to `standard/audiences.yaml` under `audiences:` with `name`, `description`,
   `evaluationMode`, `file`, and `editableInUi`
3. Add the audience key to the relevant pack's `deploy.yaml` under `standard.audiences:`

## Adding a New Pack Manifest

1. Create `lab-packs/<pack-name>/deploy.yaml` using
   `_templates/lab-packs/aep-foundations/deploy.yaml` or
   `_templates/lab-packs/ajo-foundations/deploy.yaml` as a guide
2. Create `lab-packs/<pack-name>/health.yaml` with the profile health check definitions for this pack
3. Wire the pack into the CLI menus:
   - Create the sub-menu file `menus/<packName>/menu.js` listing each action as a numbered choice,
     plus pinned `Clean sandbox` (`c`) and `Go back` (`b`) entries
   - Create one action file per menu item at `menus/<packName>/<actionName>.js`
   - Add the sub-menu to the main menu in `index.js`

   The `cli-menu` skill (`.github/skills/cli-menu/`) scaffolds the three files needed for a new
   menu action: the menu entry, the action file, and the lib stub.

## Placeholder Conventions

The following placeholders are substituted at runtime and may appear in YAML config files
and JSON body files within a vertical:

| Placeholder | Where used | Replaced with |
|---|---|---|
| `{tenantId}` | JSON body files, descriptor `sourceProperty` paths | Org tenant namespace (e.g., `_myorg`) -- fetched via Tenant API at runtime |
| `{PREFIX_NAME}` | `schemas.yaml` name fields, `audiences.yaml` names, merge policy names | `dep:` in standard YAMLs, `dep-rel:` in relational YAMLs -- the `:` is part of the substituted value, so authors write `{PREFIX_NAME}` (no trailing colon) in both kinds of file. See `lib/constants/prefix.js`. |

Standard AEP field group and class URLs are hardcoded -- they do not use placeholders.
Only tenant-specific and user-visible strings use placeholders.

## Source Connectors

Shared source configs live in `industry/sources/`. Each source YAML documents the exact
entry format expected in `data-load.yaml` files that reference it. To add a new source type,
copy `sources/_template.yaml` and fill in the connectionSpec, flowSpec, and data load entry format.
