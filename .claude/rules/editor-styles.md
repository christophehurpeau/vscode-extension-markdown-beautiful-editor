---
description: CSS invariants for the CodeMirror editing surface
paths:
  - src/styles/**
---

# Editor stylesheet

`editor.css` is a root that `@import`s per-concern partials (shell, inline, block, alerts, toolbar,
toc, diff). The esbuild `copy-css` plugin copies every `src/styles/*.css` flat into `dist/`, so
relative `@import` resolves at runtime.

Three rules below are enforced by `src/test/unit/lineDecorationCss.test.ts`. They exist because each
one shipped as a visible bug that no other test could see — the suite asserts document positions and
class names, never geometry.

## Never use `margin` on a `.cm-line` class

Margin sits outside the border box, but CM6 sizes each `.cm-gutterElement` from its line's block
height and maps click coordinates to line blocks. A margin therefore pushes the line's text down
while the gutter number stays put, *and* leaves vertical gaps belonging to no line where a click
resolves to the wrong line. Use padding.

## Scope line-decoration rules to `.cm-line`

The line-number gutter mirrors line-decoration class names onto its own elements so the two share
font metrics (see `cm/lineNumberGutter.ts`). An unscoped `.md-*` rule therefore also paints the line
*number* — that is how heading numbers ended up bold and the code block's background got drawn around
them. Only `cm-shell.css` styles the gutter, and only font-size and padding.

## Mirror vertical padding onto the gutter

CM6 already compensates for `.cm-content`'s own padding (it builds gutters with
`-documentPadding.top`), so do not add a base offset on top of that. But any *per-line* vertical
padding — headings, alerts, code fences — must be repeated on the matching `.cm-gutterElement` rule
or that line's number drifts off its text baseline.

## Theming

Prefer `--vscode-*` variables with a literal fallback. `@codemirror/merge` ships its own theme that
assumes light mode and compiles to generated class names that cannot be targeted from here, so
`diff.css` overrides it with `!important`, scoped to the properties the library itself sets.
