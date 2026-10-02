# Vertical Directory Structure

Each industry vertical lives under `industry/{vertical}/`. Source connector configs in `industry/sources/` are shared. See `industry/README.md` for the full onboarding guide.

```text
industry/
  sources/
    _template.yaml         ← template for a new source connector
    http-api.yaml          ← HTTP API connectionSpec, flowSpec IDs, payload templates
    dlz.yaml               ← DLZ connection config
  _templates/              ← annotated templates for new verticals
  {vertical}/
    standard/
      schemas.yaml         ← schema/class/field-group/descriptor/namespace catalog
      data-load.yaml       ← source ref (http-api) + schema→sampleData + mapping-set refs
      audiences.yaml       ← merge policies, segment schedule, audience definitions
      field-groups/        ← XDM field group JSON bodies (field definitions only)
      mapping-sets/        ← per-schema mapping set JSON files
      sample-data/         ← sample data JSON files
      audiences/           ← audience body JSON files (expression + ansibleDataModel only)
    relational/
      schemas.yaml         ← schema/namespace/primaryKey/foreignKey catalog
      data-load.yaml       ← source ref (dlz) + per-schema file load entries
      schemas/             ← relational schema JSON bodies (field definitions only)
      mapping-sets/        ← relational mapping set JSON files
      sample-data/         ← relational sample data CSV files
    lab-packs/
      aep-foundations/
        deploy.yaml        ← AEP pack manifest: standard schemas/audiences/dataLoad keys
        health.yaml        ← AEP profile health check definitions
      ajo-foundations/
        deploy.yaml        ← AJO pack manifest: standard + relational schemas/audiences/dataLoad keys
        health.yaml        ← AJO profile health check definitions
```

## Config Files Reference

| File | Purpose |
| --- | --- |
| `industry/sources/http-api.yaml` | Flow Service specs for HTTP API source; shared across all verticals |
| `industry/sources/dlz.yaml` | DLZ connection config for relational batch loads; shared across all verticals |
| `industry/telecom/standard/schemas.yaml` | Schema/class/field-group/descriptor/namespace catalog (telecom) |
| `industry/telecom/standard/data-load.yaml` | Sample data file refs and mapping-set paths for streaming |
| `industry/telecom/standard/audiences.yaml` | Audiences catalog: defaultMergePolicy, mergePolicies, dailySegmentJob, audiences |
| `industry/telecom/standard/field-groups/*.json` | Field group bodies (`definitions.customFields.properties` content only) |
| `industry/telecom/standard/mapping-sets/*.json` | Per-schema mapping sets; `{tenantId}` substituted at runtime |
| `industry/telecom/standard/audiences/*.json` | Audience body files (expression + ansibleDataModel only) |
| `industry/telecom/relational/schemas.yaml` | Relational schema catalog: namespaces, tables, PKs, FKs |
| `industry/telecom/relational/data-load.yaml` | DLZ upload manifest: localPath, targetPath, format per CSV |
| `industry/telecom/relational/schemas/*.json` | Relational schema bodies (`properties` content only) |
| `industry/telecom/lab-packs/aep-foundations/deploy.yaml` | AEP pack manifest |
| `industry/telecom/lab-packs/aep-foundations/health.yaml` | AEP health check definitions |
| `industry/telecom/lab-packs/ajo-foundations/deploy.yaml` | AJO pack manifest |
| `industry/telecom/lab-packs/ajo-foundations/health.yaml` | AJO health check definitions |
