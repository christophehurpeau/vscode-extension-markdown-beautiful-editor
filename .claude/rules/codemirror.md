---
description: CodeMirror 6 invariants for the webview editing surface
paths:
  - src/webview/**
  - src/shared/**
---

# CodeMirror 6 editing surface

## The product requirement that shapes everything

Markdown syntax characters stay **visible and editable** — `**bold**` renders bold with the
asterisks still on screen as ordinary text the user can select and delete. Hiding or substituting
syntax (Obsidian-style live preview) is a rejected design, not a missing feature.

So: `Decoration.mark()` and `Decoration.line()` only. `Decoration.replace()` and widgets are never
the answer here.

## Decoration layer

Decorations come from a `ViewPlugin` walking `syntaxTree(state)` over `view.visibleRanges` — not a
`StateField`, which has no viewport and would reintroduce the full-document work per keystroke that
the migration away from the old regex parser existed to remove.

Three layers at explicit `Prec`: line decorations lowest, construct marks default, leaf marks
(`md-syntax`, `md-url`, `md-alt`) highest. Higher precedence creates the inner DOM node, which is
what makes `md-syntax` render *inside* `md-bold` rather than beside it. Decorations nest in the DOM,
so descendant CSS selectors like `.md-link .md-url` work.

A mark spanning several lines is split at line boundaries and cannot carry a block box. Anything
with a background, left border or vertical padding must be a `Decoration.line`.

`src/shared/nodeClassMap.ts` maps Lezer node names to `md-*` classes. **A grammar extension that
lands without its rows there parses correctly and renders nothing** — this happened three times
during the migration. `decorations.test.ts` runs the full grammar registry to catch it.

## Grammar

`markdown({ base: commonmarkLanguage, extensions: [GFM, ...ours] })`. **GFM is not the default** —
without it there are no tables, task markers or strikethrough. (`<https://x>` autolinks are core
CommonMark and work regardless.)

On the raw grammar in tests the call is `parser.configure(GFM)`. `parser.configure({extensions: [...]})`
is a **silent no-op** — `MarkdownConfig` has no `extensions` key — and yields a plausible-looking
default tree. Only `markdown()` takes an `extensions` option.

Math, footnotes, definition lists and YAML frontmatter are hand-written `MarkdownExtension`s in
`cm/lang/`; `math.ts` is the reference implementation to copy. Their ordering directives
(`before: 'Link'`, `before: 'LinkReference'`, `before: 'HorizontalRule'`, `endLeaf`) are
load-bearing: get one wrong and the construct silently never fires. GitHub alerts are deliberately
*not* a grammar extension — a `> [!NOTE]` block already parses as a `Blockquote`, read the type off
that node in the decoration layer.

`MarkdownConfig.wrap`s compose (`configure` concatenates them), so an extension may mount another
grammar with `parseMixed` alongside the `parseCode` wrapper `markdown()` installs — that is how
`frontmatter.ts` parses its body as YAML. A mounted region is another language's tokens: give it no
`md-*` class, `return false` on it in the decoration walk (as with `CodeText`), and colour it by
adding its `Language` to `codeHighlight.ts`'s scoped list.

A block parser has no lookahead past `cx.peekLine()` and cannot un-consume a line, so a block whose
closing delimiter is missing runs to the end of the document. Decide before consuming, and keep the
opening test strict.

`NodeSpec.composite` is self-registering; `parser.configure()` wires continuation automatically.

## Cost

Whole-document work on the keystroke path is the recurring performance trap. `diff.diffChars` over a
document froze the webview for minutes and had to go; `diffLines` is cheaper but still hundreds of ms
on a large document with a large change, so the change gutter debounces it. Measure before putting
anything document-sized in an update listener.

## Verification

`pnpm compile && pnpm lint && pnpm test`. The unit suite is DOM-free by design — test decision logic
as pure functions over a real `EditorState`, not by instantiating an `EditorView`.
