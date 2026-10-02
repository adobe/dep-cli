import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { PREFIX_STANDARD } from "../lib/constants/prefix.js";

// Run with: node --experimental-vm-modules --test tests/createProfileBase.test.js
// Every action dependency is mocked; no credentials or network calls are used.
const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = yaml.load(fs.readFileSync(
  path.join(root, "industry/telecom/standard/audiences.yaml"), "utf8",
));
const schemas = yaml.load(fs.readFileSync(
  path.join(root, "industry/telecom/standard/schemas.yaml"), "utf8",
));
const resolveName = (name) => name.replace(/\{PREFIX_NAME\}/g, PREFIX_STANDARD);
const audienceKeys = ["basic-plan-members", "any-event-batch"];

function _expectedHash(expression) {
  // Independent implementation of the signed 32-bit Java-style string hash.
  let hash = 0;
  for (let i = 0; i < expression.length; i++) {
    hash = (Math.imul(hash, 31) + expression.charCodeAt(i)) | 0;
  }
  return String(hash);
}

async function _runAction(moduleName, options = {}) {
  const payloads = [];
  const logs = [];
  const reads = [];
  const deployments = [];
  const envMap = { SANDBOX_NAME: "offline-test" };
  const context = vm.createContext({
    console: { log: (...args) => logs.push(args.join(" ")) },
    process: { cwd: () => root },
    setTimeout: () => { throw new Error("Unexpected polling in offline test"); },
  });
  const mocks = {
    path: { default: path },
    fs: { default: {
      readFileSync(file, encoding) {
        reads.push(file);
        const raw = fs.readFileSync(file, encoding);
        if (path.basename(file) === "deploy.yaml") {
          const manifest = yaml.load(raw);
          manifest.standard.audiences = audienceKeys;
          return yaml.dump(manifest);
        }
        if (options.malformedBody && path.basename(file) === "basic-plan-members.json") {
          return "invalid JSON";
        }
        return raw;
      },
    } },
    "js-yaml": { default: yaml },
    chalk: { default: { green: (s) => s, red: (s) => s, yellow: (s) => s } },
    "logDone.js": { logDone: () => {} },
    "getAccessToken.js": { getAccessToken: async () => "offline-token" },
    "envContext.js": { getValidEnvContext: async () => ({ envMap }) },
    "getIndustry.js": { getSelectedIndustry: async () => "telecom" },
    "checkSandboxReady.js": { checkSandboxReady: async () => true },
    "deploySchemaModel.js": { deploySchemaModel: async (...args) => {
      deployments.push(args);
      if (options.deploymentError) throw new Error("Deployment failed");
      return Object.hasOwn(options, "deployment")
        ? options.deployment
        : { tenantId: options.tenantId ?? "_myorg" };
    } },
    "listSchemas.js": { listSchemas: async () => schemas.schemas.map(
      (schema) => ({ title: resolveName(schema.name) }),
    ) },
    "getMergePolicies.js": { getMergePolicies: async () => [
      { id: "default-policy", default: true },
    ] },
    "patchMergePolicy.js": { patchMergePolicy: async () => true },
    "createMergePolicy.js": { createMergePolicy: async () => "policy-id" },
    "listSegmentDefinitions.js": { listSegmentDefinitions: async () => options.existing ?? [] },
    "createSegmentDefinition.js": { createSegmentDefinition: async (token, env, payload) => {
      assert.equal(token, "offline-token");
      assert.equal(env, envMap);
      payloads.push(JSON.parse(JSON.stringify(payload)));
      if (options.failFirst && payloads.length === 1) throw new Error("Segment creation failed");
      return `segment-${payloads.length}`;
    } },
    "prefix.js": { PREFIX_STANDARD },
  };
  const actionPath = path.join(root, "menus", moduleName, "createProfileBase.js");
  const action = new vm.SourceTextModule(fs.readFileSync(actionPath, "utf8"), {
    context, identifier: actionPath,
  });
  await action.link((specifier) => {
    const exports = mocks[path.basename(specifier)];
    assert.ok(exports, `Unmocked dependency: ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await action.evaluate();
  await action.namespace.createProfileBase();
  return { payloads, logs, reads, deployments };
}

for (const moduleName of ["aepFoundations", "ajoArchFoundations"]) {
  for (const tenantId of ["_dep", "_myorg", "_anotherorg123"]) {
    test(`${moduleName}: submits resolved PQL, UI path, and hash for ${tenantId}`, async () => {
      const { payloads, deployments } = await _runAction(moduleName, { tenantId });
      assert.equal(deployments.length, 1);
      assert.deepEqual(JSON.parse(JSON.stringify(deployments[0][3])), {
        type: "standard", enableProfile: true,
      });
      assert.equal(payloads.length, 2);
      const payload = payloads[0];
      const expression = JSON.parse(payload.expression.value);
      assert.equal(expression.params[0].object.object.fieldName, tenantId);
      assert.equal(payload.ansibleDataModel.dataModel.expression
        .profileAttributesContainer.items[0].component.id, `profile.${tenantId}.plan.name`);
      assert.equal(payload.ansibleDataModel.hash, _expectedHash(payload.expression.value));
      assert.equal(payload.name, resolveName(catalog.audiences["basic-plan-members"].name));
      assert.equal(payload.description, resolveName(catalog.audiences["basic-plan-members"].description));
      assert.deepEqual(payload.evaluationInfo, {
        continuous: { enabled: false }, synchronous: { enabled: false }, batch: { enabled: true },
      });
      assert.deepEqual(payload.schema, { name: "_xdm.context.profile" });
      assert.equal(payload.ttlInDays, 60);
      assert.ok(!JSON.stringify(payloads).includes("{tenantId}"));
      if (tenantId !== "_dep") assert.ok(!JSON.stringify(payload).includes("_dep"));

      // Templates without tenant placeholders keep their expression and UI model.
      const unchanged = JSON.parse(fs.readFileSync(
        path.join(root, catalog.audiences["any-event-batch"].file), "utf8",
      ));
      assert.deepEqual(payloads[1].expression, unchanged.expression);
      if (unchanged.ansibleDataModel) {
        unchanged.ansibleDataModel.hash = _expectedHash(unchanged.expression.value);
        assert.deepEqual(payloads[1].ansibleDataModel, unchanged.ansibleDataModel);
      }
    });
  }

  for (const deployment of [null, {}, { tenantId: "" }, { tenantId: "_" }, { tenantId: "myorg" }]) {
    test(`${moduleName}: missing or invalid deployment tenant ${JSON.stringify(deployment)} prevents POST`, async () => {
      const { payloads, reads, logs } = await _runAction(moduleName, { deployment });
      assert.equal(payloads.length, 0);
      assert.ok(!reads.some((file) => file.endsWith("basic-plan-members.json")));
      if (deployment) assert.ok(logs.some((line) => line.includes("invalid tenant ID")));
    });
  }

  test(`${moduleName}: skips an existing audience without loading its body`, async () => {
    const name = resolveName(catalog.audiences["basic-plan-members"].name);
    const { payloads, reads } = await _runAction(moduleName, { existing: [{ name }] });
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].name, resolveName(catalog.audiences["any-event-batch"].name));
    assert.ok(!reads.some((file) => file.endsWith("basic-plan-members.json")));
  });

  test(`${moduleName}: a failed POST does not abort subsequent audiences`, async () => {
    const { payloads, logs } = await _runAction(moduleName, { failFirst: true });
    assert.equal(payloads.length, 2);
    assert.ok(logs.some((line) => line.includes('Audience "basic-plan-members": Segment creation failed')));
    assert.ok(logs.some((line) => line.includes(`Created: ${payloads[1].name}`)));
  });

  test(`${moduleName}: a malformed body does not abort subsequent audiences`, async () => {
    const { payloads, logs } = await _runAction(moduleName, { malformedBody: true });
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].name, resolveName(catalog.audiences["any-event-batch"].name));
    assert.ok(logs.some((line) => line.includes('Audience "basic-plan-members":')));
  });

  test(`${moduleName}: deployment exceptions are caught without creating audiences`, async () => {
    const { payloads, logs } = await _runAction(moduleName, { deploymentError: true });
    assert.equal(payloads.length, 0);
    assert.ok(logs.some((line) => line.includes("Deployment failed")));
  });
}
