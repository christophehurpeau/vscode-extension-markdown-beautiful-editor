// CommonJS: package.json has no "type": "module", and pob-claude-run-lint-staged
// only looks for lint-staged.config.js.
module.exports = require('@pob/root/createLintStagedConfig').default();
