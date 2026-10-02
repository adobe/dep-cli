---
description: "Use before opening or updating a PR, committing or pushing release changes, or choosing a CLI version. Covers SemVer, package and lockfile consistency, changelogs, and no-release exceptions."
applyTo: "package.json,package-lock.json,CHANGELOG.md,.github/skills/cli-github/SKILL.md"
---

# CLI Versioning

## Required Pre-PR Gate

Run this gate for every PR request, including updates to an existing PR. Do not
assume a previous check is still valid. Complete it before committing, pushing,
or creating the PR; recheck the baseline before pushing additional changes.

1. Resolve the actual repository and target base branch. For an existing PR, use
   its `baseRefName`; for a new PR, use the requested base or repository default.
   Refresh that branch from its remote and inspect its package version. Do not
   compare only with the feature branch or a potentially stale local tag.
2. Inspect the entire PR change set: branch commits relative to the base, staged
   and unstaged changes, and untracked project files. Exclude ignored local
   configuration and credentials. Classify the release impact of all changes.
3. For release-bearing changes, require a SemVer increase over the refreshed base:
   - Patch: backward-compatible bug fixes, with no new public functionality.
   - Minor: backward-compatible new CLI functionality.
   - Major: breaking changes to commands, configuration, or supported behavior.
   Use the highest impact in a combined PR. Ask when compatibility is ambiguous;
   do not silently choose a breaking release or a prerelease.
4. Require matching versions in `package.json`, `package-lock.json` at the top
   level, and `package-lock.json` under `packages[""]`. Do not change dependency
   versions or rewrite unrelated lockfile entries as part of a version bump.
5. Require a `CHANGELOG.md` entry for the proposed version describing the
   user-visible changes and linking the GitHub issue when applicable. If the
   changelog does not exist, create it as part of the authorized release change.
   Do not claim a proposed release has already been published.
6. Report the base version, proposed version, release impact, package/lockfile
   consistency, and changelog status in the conversation. Add the release impact
   and proposed version to the PR summary; do not add unwanted verification or
   limitations sections to a user-approved PR body.

Documentation-only, instruction-only, or test-only PRs with no shipped CLI
behavior changes may keep the version unchanged. State and justify the
`no release` classification in the conversation and PR summary. This exception
does not apply to a combined PR containing a CLI bug fix or feature.

If any required step is missing, stop before pushing or opening the PR. Make the
smallest correction when already authorized by the user; otherwise report the
blocker and request approval. Never claim this gate passed without checking.

## Release Boundary

Version bumps do not authorize publishing. Do not create or push a release tag,
publish to npm, or create a GitHub release without explicit user approval. A
release tag belongs on the merged release commit, not on the feature branch.

These instructions guide Copilot; they do not install or replace GitHub Actions
or branch protection. Check the repository's required gates when available and
report unavailable enforcement rather than claiming it exists.