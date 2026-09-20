# Screenshot harness

Regenerates the marketplace and README images in `images/`.

```bash
pnpm exec playwright install chromium   # once per machine
pnpm run screenshots
```

## How it works

The webview is a plain browser bundle, so no VS Code instance is launched.
`capture.ts` builds the bundles, then mounts the real `dist/webview.js` and
`dist/editor.css` in headless Chromium and stubs the only two things the
extension host provides — `acquireVsCodeApi` and the `init` message — so the
captured pixels are the editor's own.

The page chrome around the editor comes from `src/shared/webviewBody.ts`, the
same module the host uses to build the webview HTML, so a change to the toolbar
or the TOC reaches the screenshots without anyone remembering to mirror it here.

## Files

| File | Role |
|------|------|
| `capture.ts` | The harness, and the shot list: surface, output name, fixture, viewport |
| `fixtures/*.md` | One markdown document per output image (two for a diff) |
| `vscode-dark-modern.css` | The `--vscode-*` theme variables VS Code would inject |

Each shot is a row in `shots`, near the top of `capture.ts`. Its `surface` picks
which of the three things the bundle can be is captured:

```ts
{ surface: 'editor', output: 'alerts.png', fixture: 'alerts.md', toc: 'hidden', width: 620, height: 570 }
```

- `editor` — the custom editor. `stage` runs an interaction first (select text,
  open the find panel, Alt-drag a rectangle), and `caret: 'visible'` keeps the
  cursors for a shot that is about them.
- `editorDiff` — the same editor with diff mode open against `head`, driven by
  the `toggleDiff` message the host sends when the ⇄ button is clicked.
- `diffPanel` — the standalone Beautiful Diff tab, which has its own webview
  body and its own `initDiff` message, with `head` as the left side.

A staged interaction drives the real bundle through Playwright, so a shot fails
loudly when the gesture stops working — an Alt-drag that adds no cursor, a
search panel that never opens, a diff whose two sides render no difference.

The viewport is in CSS pixels and the capture is 2x, so the PNG is twice those
numbers. Height is how the image gets cropped — there is no automatic fit, so
after editing a fixture, re-run and look at the result to check it does not end
mid-block.

## What is not real

Two things are approximated, and both are worth knowing before trusting a
capture:

- **Theme colors.** `vscode-dark-modern.css` is hand-maintained. It was
  extracted from the VS Code build under `.vscode-test/` — the theme files
  (`extensions/theme-defaults/themes/dark_vs.json`, `dark_modern.json`) for the
  colors a theme sets, and the color registry defaults compiled into
  `workbench.desktop.main.js` for the rest. Nothing detects drift: if VS Code
  restyles its defaults, the screenshots quietly go stale until it is
  re-extracted. Variables whose registry default is `null` are deliberately
  absent, so the same CSS fallbacks fire as in the real webview.
- **Window chrome.** There is no VS Code tab bar or activity bar around the
  captures, unlike the hand-taken screenshots these replaced.

Fonts come from the machine running the capture, so a Linux run will not be
byte-identical to a macOS one.

## Failure modes

The run exits non-zero and writes nothing if the editor mounts no content or the
TOC is not in the state the shot asked for — a broken bundle cannot quietly
produce a blank PNG. Webview console errors are printed as `[webview] ...`.

This is not part of `pnpm test`: it needs a browser binary and its output is
images, which the suite cannot assert on anyway.
