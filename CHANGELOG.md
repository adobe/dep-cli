# Changelog

## 1.0.1 (Pending release)

### Fixed

- Resolve the Basic Plan Members audience's tenant namespace in both AEP and
  AJO profile creation, including the PQL expression, UI field path, and hash.
  Fixes [#7](https://github.com/adobe/dep-cli/issues/7).
- Continue creating remaining audiences when an individual audience fails.

### Changed

- Migrate project guidance, reference docs, and skills to GitHub Copilot and
  remove the legacy Claude configuration.
- Add offline audience-creation regression tests and Copilot PR versioning rules.
- Update locked dependencies with `npm audit fix`.