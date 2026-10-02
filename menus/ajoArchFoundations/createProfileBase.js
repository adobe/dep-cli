import path from "path";
import fs from "fs";
import yaml from "js-yaml";
import chalk from "chalk";

import { logDone } from "../../lib/utils/logDone.js";
import { getAccessToken } from "../../lib/env/getAccessToken.js";
import { getValidEnvContext } from "../../lib/env/envContext.js";
import { getSelectedIndustry } from "../../lib/env/getIndustry.js";
import { checkSandboxReady } from "../../lib/env/checkSandboxReady.js";
import { deploySchemaModel } from "../../lib/schemas/deploySchemaModel.js";
import { listSchemas } from "../../lib/schemas/listSchemas.js";
import { getMergePolicies } from "../../lib/profileService/mergePolicies/getMergePolicies.js";
import { patchMergePolicy } from "../../lib/profileService/mergePolicies/patchMergePolicy.js";
import { createMergePolicy } from "../../lib/profileService/mergePolicies/createMergePolicy.js";
import { listSegmentDefinitions } from "../../lib/profileService/segments/listSegmentDefinitions.js";
import { createSegmentDefinition } from "../../lib/profileService/segments/createSegmentDefinition.js";
import { PREFIX_STANDARD } from "../../lib/constants/prefix.js";

function _createSegmentHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

function _buildEvaluationInfo(mode) {
  return {
    continuous: { enabled: mode === "continuous" },
    synchronous: { enabled: mode === "synchronous" },
    batch: { enabled: mode === "batch" },
  };
}

// UPS provisions the default profile merge policy asynchronously after the
// first profile schema is enabled — the schema-registry propagation pause
// inside deploySchemaModel does not cover it. Poll on a 30s interval up to
// ~5 min before giving up.
async function _waitForDefaultMergePolicy(accessToken, envMap) {
  const MAX_ATTEMPTS = 10;
  const INTERVAL_MS = 30_000;

  let policies = await getMergePolicies(accessToken, envMap, "_xdm.context.profile");
  let defaultPolicy = policies.find((p) => p.default === true);
  if (defaultPolicy) return { policies, defaultPolicy };

  console.log(
    chalk.yellow("  !") +
      " Waiting for UPS to provision the default merge policy (up to 5 min)..."
  );

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
    const elapsedSec = attempt * (INTERVAL_MS / 1000);
    console.log(`    Attempt ${attempt}/${MAX_ATTEMPTS} (${elapsedSec}s elapsed)`);
    policies = await getMergePolicies(accessToken, envMap, "_xdm.context.profile");
    defaultPolicy = policies.find((p) => p.default === true);
    if (defaultPolicy) return { policies, defaultPolicy };
  }

  return { policies, defaultPolicy: null };
}

export async function createProfileBase() {
  try {
    const context = await getValidEnvContext();
    if (!context) return;

    const { envMap } = context;
    const accessToken = await getAccessToken(envMap);
    if (!accessToken) {
      console.log(chalk.red("  ✗") + " No access token provided.");
      return;
    }

    const ready = await checkSandboxReady(envMap, accessToken);
    if (!ready) return;

    const startTime = Date.now();
    const industry = await getSelectedIndustry();
    const deployYamlPath = path.resolve(
      process.cwd(),
      "industry",
      industry,
      "lab-packs",
      "ajo-foundations",
      "deploy.yaml"
    );

    const packDir = path.dirname(deployYamlPath);
    const catalogPath = path.resolve(packDir, "..", "..", "standard", "audiences.yaml");
    const schemasCatalogPath = path.resolve(packDir, "..", "..", "standard", "schemas.yaml");

    const deployYaml = yaml.load(fs.readFileSync(deployYamlPath, "utf8"));
    const catalog = yaml.load(fs.readFileSync(catalogPath, "utf8"));
    const schemasCatalog = yaml.load(fs.readFileSync(schemasCatalogPath, "utf8"));

    const deployment = await deploySchemaModel(deployYamlPath, envMap, accessToken, {
      type: "standard",
      enableProfile: true,
    });
    if (!deployment) return;
    const { tenantId } = deployment;
    if (typeof tenantId !== "string" || !tenantId.startsWith("_") || tenantId.length < 2) {
      console.log(chalk.red("  ✗") + " Cannot create audiences: missing or invalid tenant ID.");
      return;
    }

    const existingSchemas = await listSchemas(accessToken, envMap);
    const expectedNames = deployYaml.standard.schemas
      .map((key) => {
        const def = schemasCatalog.schemas.find((s) => s.key === key);
        return def ? def.name.replace(/\{PREFIX_NAME\}/g, PREFIX_STANDARD) : null;
      })
      .filter(Boolean);

    const missing = expectedNames.filter(
      (name) => !existingSchemas.find((s) => s.title === name)
    );

    if (missing.length > 0) {
      console.log(
        "\n" +
          chalk.yellow("  !") +
          " Standard schemas not yet deployed. Run the standard schema step first.\n"
      );
      return;
    }

    console.log(`\n  Processing merge policies (${deployYaml.standard.mergePolicies.length})...`);
    const { policies, defaultPolicy } = await _waitForDefaultMergePolicy(accessToken, envMap);

    if (!defaultPolicy && deployYaml.standard.mergePolicies.includes("default")) {
      console.log(chalk.red("  ✗") + " Default merge policy not found in this sandbox after 5 min.");
      console.log("    Verify it exists in the AEP UI (Profiles → Merge policies) and re-run.");
      return;
    }

    for (const key of deployYaml.standard.mergePolicies) {
      const def = catalog.mergePolicies[key];

      try {
        if (key === "default") {
          await patchMergePolicy(
            accessToken,
            envMap,
            defaultPolicy.id,
            [{ op: "add", path: "/isActiveOnEdge", value: def.isActiveOnEdge }]
          );

          console.log(chalk.green("  ✓") + " Default merge policy (isActiveOnEdge: true)");
        } else {
          const resolvedName = def.name.replace(/\{PREFIX_NAME\}/g, PREFIX_STANDARD);
          const existing = policies.find((p) => p.name === resolvedName);

          if (existing) {
            console.log(chalk.green("  ✓") + ` Already exists: ${resolvedName}`);
            continue;
          }

          const id = await createMergePolicy(accessToken, envMap, {
            ...def,
            name: resolvedName,
          });

          if (id) console.log(chalk.green("  ✓") + ` Created: ${resolvedName}`);
          else console.log(chalk.red("  ✗") + ` Failed: ${resolvedName}`);
        }
      } catch (policyErr) {
        console.log(chalk.red("  ✗") + ` Merge policy "${key}": ${policyErr.message}`);
      }
    }

    const entries = deployYaml.standard.audiences.map((key) => ({
      key,
      ...catalog.audiences[key],
    }));

    console.log(`\n  Creating audiences (${entries.length})...`);
    const existingSegments = await listSegmentDefinitions(accessToken, envMap);

    for (const entry of entries) {
      try {
        const resolvedName = entry.name.replace(/\{PREFIX_NAME\}/g, PREFIX_STANDARD);

        if (existingSegments.find((s) => s.name === resolvedName)) {
          console.log(chalk.green("  ✓") + ` Already exists: ${resolvedName}`);
          continue;
        }

        const raw = fs.readFileSync(path.resolve(process.cwd(), entry.file), "utf8");
        const body = JSON.parse(raw.replace(/\{tenantId\}/g, () => tenantId));

        if (entry.editableInUi && body.ansibleDataModel) {
          body.ansibleDataModel.hash = String(_createSegmentHash(body.expression.value));
        }

        const payload = {
          name: resolvedName,
          description: (entry.description || entry.name).replace(/\{PREFIX_NAME\}/g, PREFIX_STANDARD),
          expression: body.expression,
          ...(body.ansibleDataModel ? { ansibleDataModel: body.ansibleDataModel } : {}),
          evaluationInfo: _buildEvaluationInfo(entry.evaluationMode),
          schema: { name: "_xdm.context.profile" },
          ttlInDays: 60,
        };

        const id = await createSegmentDefinition(accessToken, envMap, payload);
        if (id) console.log(chalk.green("  ✓") + ` Created: ${resolvedName}`);
        else console.log(chalk.red("  ✗") + ` Failed: ${resolvedName}`);
      } catch (audienceErr) {
        console.log(chalk.red("  ✗") + ` Audience "${entry.key}": ${audienceErr.message}`);
      }
    }

    console.log("\nStandard schemas, datasets, merge policies, and audiences setup complete.",);
    logDone(startTime);
  } catch (err) {
    console.log(chalk.red("  ✗") + ` ${err.message}`);
  }
}