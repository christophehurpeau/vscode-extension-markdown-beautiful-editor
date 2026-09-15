# Markdown Beautiful Editor — VS Code Extension

WYSIWYG-style markdown custom editor with visual syntax styling, GitHub alerts, and table of contents. Registered as an optional `customEditor` for `*.md` files.

- Use pnpm, not npx.

## Commands

```bash
pnpm compile          # type-check + lint + build (dev)
pnpm watch            # watch mode (esbuild + tsc in parallel)
pnpm package          # production build
pnpm test             # full test suite (compile + lint + unit + integration)
pnpm test:unit        # mocha unit tests only (fast, no VS Code needed)
pnpm test:integration # vscode-test integration tests
pnpm lint             # eslint src/
pnpm check-types      # tsc type check only
```

## Architecture

Two separate bundles compiled by esbuild:
- **Extension host** (`src/extension.ts`, `src/editor/`) — runs in Node.js, registers the custom editor
- **Webview** (`src/webview/`) — runs in the browser inside the VS Code webview panel

Entry points: `src/extension.ts` (host), `src/webview/main.ts` (webview)

## Testing

Unit tests in `src/test/unit/` cover parser, serializer, cursor, diff, and toolbar logic — no VS Code needed.
Integration test in `src/test/integration/` requires a VS Code instance via `vscode-test`.
Compiled test output goes to `out/`.

Always add unit tests for new or changed logic. Keep logic that can be tested without the DOM in pure functions (e.g. `src/shared/`) so it stays unit-testable; have the thin DOM/webview layer delegate to it.

`pnpm test:unit` runs the compiled `out/` and does NOT recompile first — run `pnpm compile-tests` (or `pnpm test`, which compiles) before it, or stale results will pass silently.

There are two separate build paths: `compile-tests`/unit tests use tsc → `out/`, while the running webview loads the esbuild bundle at `dist/webview.js`. Passing unit tests does NOT mean the live webview is updated. After changing `src/webview/` code, run `pnpm compile` (or keep `pnpm watch` running) and reload the Extension Development Host (Cmd+R) before testing manually. Verify the bundle picked up a change with `grep -o "<symbol>" dist/webview.js`.

## Publishing

See [PUBLISHING.md](PUBLISHING.md). Uses `vsce` (pinned to 2.15.0 in devDeps).
