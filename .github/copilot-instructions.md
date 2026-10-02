# DEP CLI Copilot Instructions

This repository is a menu-driven Node.js CLI for deploying Adobe Experience
Platform (AEP) and Adobe Journey Optimizer (AJO) lab environments.

## Commands

- `npm start`: run the CLI.
- `npm run dev`: run with nodemon hot reload.
- No build, test, or lint scripts exist. Use focused syntax checks and the
  verification skills appropriate to the changed behavior.

## Architecture

- `index.js`: top-level menu loop.
- `menus/{module}/`: menus and thin action orchestrators.
- `lib/`: business logic and API integrations; no prompts.
- `industry/telecom/`: YAML-driven schemas, datasets, and lab-pack manifests.
- `envFiles/`: environment credentials; never print or commit secrets.

## Required Conventions

Read and follow the relevant canonical instructions before editing:

- [Code conventions](instructions/code-conventions.instructions.md): architecture,
  retry behavior, timing, polling, prompts, encoding, and output.
- [Menu conventions](instructions/menu-conventions.instructions.md): menu naming,
  canonical verbs, pinned choices, and modern Inquirer APIs.
- [Module registry](instructions/module-registry.instructions.md): module names,
  manifest paths, sandbox reset safety, and schema lock detection.

Actions must have an outer `try/catch` and guard falsy results. Never use
`process.exit()` for errors. Keep libraries prompt-free and actions free of direct
API calls. Wrap POST/DELETE calls in `withRetry()` and keep orchestrators idempotent.

After sandbox creation or reset, wait for ready state, then at least 60 minutes
before general AEP/profile use or 120 minutes before AJO relational use. After
profile object creation, wait at least 60 minutes before loading profile data.
Never reset a sandbox without explicit confirmation of its name from the user.

Use Copilot's file-editing tools for manual edits. Do not write source files with
PowerShell. All source files must be UTF-8 without BOM.

## Reference Documentation

Read the relevant reference before working in its area:

- [Vertical structure](docs/vertical-structure.md)
- [YAML formats](docs/yaml-formats.md)
- [Deployment flows](docs/deploy-flows.md)
- [Library reference](docs/lib-reference.md)
- [Menu architecture](docs/menu-architecture.md)
- [Verification catalog](docs/verification-catalog.md)

## Workflow Skills

Project skills live in `.github/skills/`, each with a `SKILL.md`:
`cli-menu`, `cli-verify`, `cli-create-profile-verify`, `cli-data-load-verify`,
`cli-review-cycle`, and `cli-github`. Load the relevant skill when its description
matches the request. Do not claim sandbox verification unless its checks ran.

## Versioning Before PRs

For every request to open or update a PR or push release changes, load
[CLI versioning](instructions/versioning.instructions.md) and run the versioning
gate in `cli-github` before committing, pushing, or creating the PR. Check the
refreshed target base version, release impact, package/lockfile consistency, and
changelog entry. Report the proposed version or an explicit, justified no-release
exception. Stop when a required release update is missing. Never tag or publish
a release without explicit user approval.

## Copilot Execution

- Use available file-editing tools for manual edits and the terminal tool for
  focused checks. Load deferred tools through tool search before calling them.
- When a skill requires parallel subagents, use the available subagent tool with
  one independent context per module. Pass workspace-relative file paths and
  sandbox names, not credentials or tokens. If delegation is unavailable, report
  the blocked gate rather than claiming it ran.
- Verification snippets are templates. Load credentials from the selected env
  file inside the Node process; do not substitute secret values into command text,
  subagent prompts, or output. Keep tokens in process memory and redact sensitive
  fields before reporting API responses.
- In PowerShell, run multiline Node scripts through a single-quoted here-string
  piped to `node --input-type=module`. This avoids inline `--eval` quoting problems.
  Use ESM imports and explicit `.js` extensions for repository modules.
- `.github/validate-config.json` is local configuration containing only env file
  paths and sandbox names. Ask for missing targets; never guess or prepopulate them.
- This repository does not bundle `simplify`, `review`, or `security-review`
  skills. The review-cycle skill defines those procedures directly.

The `.github/` instructions, skills, and reference docs are the canonical
project guidance. Keep them aligned when changing shared rules or workflows.