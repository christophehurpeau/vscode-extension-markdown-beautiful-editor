# Bug Triage

Bugs and potential bugs identified by **code inspection** during the May 2026
consolidation pass. None have been reproduced at runtime — each entry is a
hypothesis with the supporting code cited. Confidence is noted per item.

Scope note: the consolidation refactor deliberately did **not** fix these
(refactor/tests only). Items 1–5 were surfaced in the consolidation plan;
6–11 are additional findings.

| # | Severity | Confidence | Summary |
|---|----------|-----------|---------|
| 1 | ✅ Fixed | High | Image title dropped on rewrite → data loss on save |
| 2 | Low | High | Unreachable initial-diff-mode code |
| 3 | Low | High | Dead `resolveImage` / `imageResolved` round-trip |
| 4 | ✅ Fixed | Medium | Tab uses deprecated `execCommand`, bypasses edit pipeline |
| 5 | Low (perf) | High | `isDiffAvailable` runs the git lookup twice |
| 6 | ✅ Fixed | Medium | TOC index vs editor heading count can diverge (wrong scroll target) |
| 7 | Medium | Medium | `isExternalUpdate` can stay stuck on a render throw (2 sites) |
| 8 | Medium | Low | Edits within the debounce window can be lost on close |
| 9 | Low | Medium | `update` while in init-diff-mode renders onto the diff DOM |
| 10 | ✅ Fixed | Low | Inline link toggle-off regex is greedy |
| 11 | Low | Low | `extractMarkdown` fallback can capture line-number text |
| 12 | Medium | Med (repro pending) | Diffs don't render in this editor when it's the default for `*.md` |

---

## 1. Image title dropped on rewrite → data loss ✅ Fixed

**Severity: High · Confidence: High**

[customEditorProvider.ts:206-241](src/editor/customEditorProvider.ts#L206-L241)

`processImagePaths` matched `![alt](path "title")` but the replacement emitted only
`![${alt}](${webviewUri})` — the title group was matched and discarded. The webview
then serializes from what it was given, so editing a file that contained
`![a](img.png "Title")` and saving wrote back `![a](img.png)`. Silent data loss.

The regex also stripped the title even for remote/`data:` URLs and already-converted
URIs (it returns `match` for those, so they were safe), but the local-path branch
rebuilt the string without the title.

**Fix applied:** the optional title group (including its leading whitespace) is now
captured and re-appended in the replacement. Regression tests added in
[imagePathProcessing.test.ts](src/test/unit/imagePathProcessing.test.ts) under
`Image Path Output`, asserting the title survives for double/single-quoted titles
and that title-less and remote images are unaffected.

---

## 2. Unreachable initial-diff-mode code

**Severity: Low · Confidence: High**

[customEditorProvider.ts:155](src/editor/customEditorProvider.ts#L155), [customEditorProvider.ts:251](src/editor/customEditorProvider.ts#L251)

`isDiffMode` is hardcoded `false` (with a comment that custom editors can't detect
git diff context). The `if (isDiffMode && originalContent)` branch in `sendDocument`
is therefore dead, as is the `originalContent` local. Diff mode is reached only via
the `toggleDiff` flow now. The dead branch also sends `diffMode: true` / an
`init`-with-diff message shape that the webview's init handler still has code for
(see #9).

**Suggested fix:** remove the dead branch and the two unused locals, or wire up the
feature intentionally.

---

## 3. Dead `resolveImage` / `imageResolved` round-trip

**Severity: Low · Confidence: High**

Host: [customEditorProvider.ts:309-328](src/editor/customEditorProvider.ts#L309-L328) handles `resolveImage` and replies
`imageResolved`. Webview ([main.ts](src/webview/main.ts)) never sends `resolveImage` and has no
`case 'imageResolved'`. Both message types are kept in the typed protocol
([messages.ts](src/shared/messages.ts)) only so the dead handler still compiles, with a `NOTE`
comment. Either an abandoned feature or a half-removed one.

**Suggested fix:** delete both sides, or finish wiring the webview end.

---

## 4. Tab uses deprecated `execCommand` and bypasses the edit pipeline ✅ Fixed

**Severity: Medium · Confidence: Medium**

[main.ts](src/webview/main.ts) — Tab key handler

`document.execCommand('insertText', false, '    ')` was the only edit operation that
did not go through the markdown-splice + `rerender` path; every other key handler
builds the new markdown string explicitly. `execCommand` is deprecated and its
behavior is inconsistent across environments. It happened to fire an `input` event
(so `handleInput` re-synced), but if `execCommand` was ever a no-op the Tab silently
did nothing, and the inserted spaces landed in the contenteditable DOM before the
re-render rather than as a controlled markdown edit.

**Fix applied:** the Tab handler now reads the selection in markdown coordinates
(`getSelectionMarkdownPosition`), splices four spaces in via a new pure
`insertText` helper in [operations.ts](src/webview/editor/operations.ts), and calls
`rerender` — the same pipeline as Enter/Backspace. `insertText` collapses any
selected range first (so Tab-over-selection replaces it) and returns the post-insert
cursor; it shares `deleteRange`'s purity contract. Unit tests added in
[operations.test.ts](src/test/unit/operations.test.ts) under `insertText`
(cursor insert, mid-line insert, single- and multi-line selection replacement,
newline-containing text).

---

## 5. `isDiffAvailable` runs the git lookup twice

**Severity: Low (performance) · Confidence: High**

[customEditorProvider.ts:57-106](src/editor/customEditorProvider.ts#L57-L106)

`isDiffAvailable` re-implements the full git-extension lookup that
`getOriginalContent` already does, then calls `getOriginalContent` (which does it a
third time) plus a separate `openTextDocument`/`getText`. The repository lookup and
`vscode.git` `getAPI(1)` boilerplate is duplicated across `getOriginalContent`,
`isDiffAvailable`, and `setupGitListeners`. Runs on every document change.

**Suggested fix:** extract a `getGitRepository(uri)` helper and have
`isDiffAvailable` reuse `getOriginalContent`'s result instead of recomputing.

---

## 6. TOC index vs editor heading count can diverge ✅ Fixed

**Severity: Medium · Confidence: Medium**

[toc.ts:14-22](src/webview/toc.ts#L14-L22) vs [toc.ts:78](src/webview/toc.ts#L78) and [toc.ts:130](src/webview/toc.ts#L130)

`extractHeadingsFromMarkdown` includes a heading only when `match[2].trim()` is
non-empty, so a TOC entry's `data-heading-index` is its position **among non-empty
headings**. But `scrollToHeading` and `updateActiveHeading` located the target by
counting **every** editor line matching `/^#{1,6}\s/` — which includes empty-text
heading lines (e.g. a bare `# `). When such a line existed above a TOC entry, the
indices drifted and clicking the entry scrolled to the wrong heading (and scroll-spy
highlighted the wrong item).

This predates the consolidation refactor; the old mock-doc path had the same
mismatch.

**Fix applied:** introduced a single `isTocHeadingLine(text)` predicate (heading with
non-empty text) and routed all three sites through it — `extractHeadingsFromMarkdown`,
`findHeadingLineIndex`, and `updateActiveHeading` — so the TOC entry order can no
longer diverge from the line-counting walk. While there, `updateActiveHeading` now
reads `.line-content` instead of the full `.line` `textContent`: the `.line-prefix`
holds the rendered line number, so the old read started with a digit and never matched
the heading regex (a latent scroll-spy bug). Regression tests added in
[toc.test.ts](src/test/unit/toc.test.ts) under `Heading line lookup`, asserting a bare
`# ` is skipped and indices stay aligned with TOC extraction.

---

## 7. `isExternalUpdate` can stay stuck on a render throw

**Severity: Medium · Confidence: Medium**

The shared `rerender` helper ([main.ts:62-78](src/webview/main.ts#L62-L78)) and `updateEditorContent`
now wrap `innerHTML = markdownToStyledHtml(...)` in `try/finally`, so a throw can't
strand the guard. **Two** sites still set `isExternalUpdate = true` → render →
`isExternalUpdate = false` without that protection:

- `applyLineType` render tail — [main.ts:637](src/webview/main.ts#L637) (kept custom because of its
  scroll/focus handling).
- paste-with-no-cursor branch — [main.ts:692](src/webview/main.ts#L692).

If `markdownToStyledHtml` throws there, `isExternalUpdate` stays `true` and
`handleInput` silently ignores all subsequent typing until reload.

**Suggested fix:** route both through `rerender`, or wrap their `innerHTML`
assignment in `try/finally`.

---

## 8. Edits within the debounce window can be lost on close

**Severity: Medium · Confidence: Low**

[main.ts:43](src/webview/main.ts#L43), [main.ts:107-119](src/webview/main.ts#L107-L119)

Edits are posted to the host on a 300 ms trailing debounce. If the webview/tab is
disposed (or the window closed) within 300 ms of the last keystroke, the pending
`edit` message never fires and that edit is not applied to the `TextDocument`.
Unverified — depends on VS Code's dispose timing and whether a flush occurs.

**Suggested fix:** flush the pending debounced edit on `blur`/`visibilitychange`/
panel dispose, or send the final content synchronously on those events.

---

## 9. `update` while in init-diff-mode renders onto the diff DOM

**Severity: Low · Confidence: Medium**

[main.ts:1185-1193](src/webview/main.ts#L1185-L1193)

The `update` handler enters the diff re-render branch only when
`isDiffModeActive && storedOriginalContent`. `storedOriginalContent` is set only by
the `toggleDiff` flow, never by an init-in-diff-mode path. So if the editor ever
started in diff mode (the `init` handler still supports `diffMode: true`), an
external `update` would fall through to `updateEditorContent`, which writes editor
HTML onto the non-editable diff DOM and desyncs the view.

Currently unreachable because the host hardcodes `diffMode: false` (see #2), so this
is latent, coupled to #2.

**Suggested fix:** resolve together with #2 — either remove init-diff-mode entirely,
or set `storedOriginalContent` on that path too.

---

## 10. Inline link toggle-off regex is greedy ✅ Fixed

**Severity: Low · Confidence: Low**

[main.ts](src/webview/main.ts) — `applyInlineFormat`, link case: `selectedText.match(/^\[(.+)\]\(.+\)$/)`.

The greedy `.+` groups mean a selection spanning two links or a link plus trailing
`](...)` text could match and be unwrapped incorrectly. Narrow edge case; needs a
crafted selection to trigger.

**Fix applied:** extracted the match into a pure `inlineLinkText` helper in
[links.ts](src/shared/links.ts) using delimiter-excluding groups
(`/^\[([^\]]+)\]\(([^)]+)\)$/`) so a selection spanning two links or with trailing
`](…)` text no longer unwraps. Covered by unit tests in
[links.test.ts](src/test/unit/links.test.ts).

---

## 11. `extractMarkdown` fallback can capture line-number text

**Severity: Low · Confidence: Low**

[serializer.ts:20-26](src/webview/markdown/serializer.ts#L20-L26)

For each child it reads `.line-content` text, but falls back to `child.textContent`
when no `.line-content` is found. `contenteditable` can produce stray child nodes on
some edits (e.g. a bare `<div>` from the browser); if such a node also contained a
`.line-prefix`/`.line-number`, the fallback would fold the rendered line number into
the markdown. Requires an unusual DOM mutation to hit.

**Suggested fix:** in the fallback, still exclude `.line-prefix` content, or skip
children that aren't `.line`.

---

## 12. Diffs don't render in this editor when it's the default for `*.md`

**Severity: Medium · Confidence: Medium (exact symptom repro-pending)**

[package.json](package.json) (`customEditors[].priority: "option"`)

The custom editor does not participate in VS Code's diff views. When it is the
default editor for `*.md`, opening a diff (Source Control, "Compare with…", gutter
diffs, multi-diff editor) does not render through this editor.

`priority: "option"` is currently set **as a workaround for this** — it keeps the
editor opt-in so VS Code routes diffs to the built-in text diff editor instead.
That workaround is incomplete: a user can set
`"workbench.editorAssociations": { "*.md": "markdown.beautifulEditor" }`, which
makes this the default for diffs too and re-exposes the bug in the shipped config.

**Reported symptom:** diff not rendered. **Repro pending** — needs to be pinned to
one of: (a) blank / nothing rendered, (b) fallback to plain text diff, or (c) two
non-diff-aware beautiful editors side by side. The observed result is VS Code-version
dependent (the upstream basic-API path may give (c) on recent builds), so the repro
should record the VS Code version.

**Root cause:** custom editors can't detect diff context with the finalized API —
the gap described in [microsoft/vscode#138525](https://github.com/microsoft/vscode/issues/138525).

**Fix — native diff integration via the `customEditorDiffs` API.** VS Code PR
[microsoft/vscode#313814](https://github.com/microsoft/vscode/pull/313814) adds the
`customEditorDiffs` API, which lets this editor render VS Code's native diffs instead of
falling back. For `CustomTextEditorProvider` it adds two optional methods:

- `resolveCustomTextEditorInlineDiff(documents, webviewPanel, token)` — single webview,
  inline diff of `documents.original` vs `documents.modified`.
- `resolveCustomTextEditorSideBySideDiff(documents, webviewPanels, token)` — two linked
  webviews (`webviewPanels.original` / `.modified`) for synced scroll, hidden chrome, etc.

This hooks into *all* of VS Code's diff entry points, unlike the current manual git-HEAD
toggle in [customEditorProvider.ts:125](src/editor/customEditorProvider.ts#L125). Related:
a proposed API for computing text diffs with VS Code's own algorithm
([microsoft/vscode#314939](https://github.com/microsoft/vscode/pull/314939)). Reference
implementation: the built-in markdown preview
([previewManager.ts](https://github.com/microsoft/vscode/blob/main/extensions/markdown-language-features/src/preview/previewManager.ts)).
When implementing, reuse the existing `computeDiff` highlighting from
[diff.ts](src/webview/editor/diff.ts) and consider retiring the manual toggle.

**Blocked on:** `customEditorDiffs` is a *proposed* API. It requires
`"enabledApiProposals": ["customEditorDiffs"]` + a vendored `.d.ts`, and **an extension
using proposed APIs cannot be published to the Marketplace** — it only runs in the
Extension Development Host or VS Code Insiders with the proposal manually enabled
([docs](https://code.visualstudio.com/api/advanced-topics/using-proposed-api)). This
extension is published (`chrp`, currently v0.2.3), so adopting it now would break the
marketplace build. No finalization date is known as of 2026-05-31; the PR author flags it
as unstable. **Revisit when** the proposal is finalized (appears in stable `@types/vscode`
without `enabledApiProposals`). Until then the only mitigations are keeping
`priority: "option"` and documenting `workbench.diffEditorAssociations` as the user-side
escape hatch.

---

## Not bugs (reviewed, working as intended)

- **`const` in `switch` cases without block braces** (`applyInlineFormat` link case):
  flagged in review as a latent TDZ risk, but every case `return`s before reaching
  the declarations, so there is no fallthrough. Cosmetic only.
- **Single-line copy returns `selection.toString()` including `md-syntax` markers**
  ([serializer.ts:46-50](src/webview/markdown/serializer.ts#L46-L50)): intended — the syntax characters live in the
  span `textContent`, so the copied text is correct markdown.
