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
| 2 | ✅ Moot | High | Unreachable initial-diff-mode code |
| 3 | Low | High | Dead `resolveImage` / `imageResolved` round-trip |
| 4 | ✅ Fixed | Medium | Tab uses deprecated `execCommand`, bypasses edit pipeline |
| 5 | ✅ Fixed | High | `isDiffAvailable` runs the git lookup twice |
| 6 | ✅ Fixed | Medium | TOC index vs editor heading count can diverge (wrong scroll target) |
| 7 | ✅ Moot | Medium | `isExternalUpdate` can stay stuck on a render throw (2 sites) |
| 8 | ✅ Fixed | Low | Edits within the debounce window can be lost on close |
| 9 | ✅ Moot | Medium | `update` while in init-diff-mode renders onto the diff DOM |
| 10 | ✅ Fixed | Low | Inline link toggle-off regex is greedy |
| 11 | ✅ Moot | Low | `extractMarkdown` fallback can capture line-number text |
| 12 | Medium | Med (repro pending) | Diffs don't render in this editor when it's the default for `*.md` |

**Status after the CodeMirror 6 migration.** Items marked *Moot* were not fixed individually —
the code they describe no longer exists. #7 and #9 depended on the `isExternalUpdate` re-entrancy
guard and the `innerHTML` re-render, both replaced by transactions (host-originated updates now
carry an annotation, which cannot get stuck the way a shared boolean could). #11 depended on the
DOM-to-markdown serializer, which is gone — `EditorState` is the document model. #2's dead
init-diff-mode branch went with the diff rewrite.

#5 was fixed while adding the always-on change gutter: git HEAD content is now cached per document
and refreshed only on git state change, rather than spawning git on every document change.

#3 and #12 are unchanged and remain open. #12 is an extension-API gap (see its entry) and is
unaffected by the editing surface.

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

**Severity: Medium · Confidence: High (repro confirmed) · Mitigated 2026-09-19**

[package.json](package.json) (`customEditors[].priority: "option"`)

The custom editor does not participate in VS Code's diff views. When it is the
default editor for `*.md`, opening a diff (Source Control, "Compare with…", gutter
diffs, multi-diff editor) does not render through this editor.

`priority: "option"` is currently set **as a workaround for this** — it keeps the
editor opt-in so VS Code routes diffs to the built-in text diff editor instead.
That workaround is incomplete: a user can set
`"workbench.editorAssociations": { "*.md": "markdown.beautifulEditor" }`, which
makes this the default for diffs too and re-exposes the bug in the shipped config.

**Repro (confirmed 2026-09-19, VS Code 1.137.0):** symptom **(c)** — click a changed `.md`
in Source Control, then **Open With… → Markdown Beautiful Editor** on the resulting diff.
Two non-diff-aware beautiful editors open side by side, with no comparison between them.
Not (a) blank and not (b) a text-diff fallback.

Each pane is resolved with a `git:` URI. Before the mitigation below, nothing in
`resolveCustomTextEditor` looked at `document.uri.scheme`, so on top of the missing diff
those panes computed image roots from a `git:` URI's meaningless `fsPath`, ran the HEAD
lookup against that same path, and would have answered an `edit` with a `WorkspaceEdit`
against a read-only document.

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
extension is published (`chrp`), so adopting it now would break the marketplace build.

**Still proposed as of 2026-09-19** — re-verified, because "PR #313814 merged into
milestone 1.120.0" reads like it shipped and it did not:

- `src/vscode-dts/vscode.proposed.customEditorDiffs.d.ts` is still present on
  `microsoft/vscode@main`. A finalized API leaves `vscode-dts/`.
- Stable `@types/vscode@1.137.0` (what `^1.105.1` resolves to here) declares
  `CustomTextEditorProvider` with exactly one method — no
  `resolveCustomTextEditorInlineDiff` / `resolveCustomTextEditorSideBySideDiff`.

**Revisit when** those two checks flip. Redo them rather than trusting a release note.

### Mitigation shipped (2026-09-19)

A dedicated read-only diff tab, driven by our own commands instead of by VS Code's diff
machinery, so it needs no proposed API:

- [src/editor/diffPanel.ts](src/editor/diffPanel.ts) — a plain `WebviewPanel` (not a second
  `customEditors` contribution: a panel can title the tab with the two versions being
  compared, needs no virtual filesystem, and stays out of the "Open With" picker) rendering
  the existing `@codemirror/merge` view via a new `initDiff` message.
- [src/shared/gitRefs.ts](src/shared/gitRefs.ts) — which versions each side reads, keyed on
  the file's git **status**, mirroring the git extension's own
  `getLeftResource`/`getRightResource`. Pure; unit-tested in
  [gitRefs.test.ts](src/test/unit/gitRefs.test.ts).

  The first cut keyed this on the SCM resource group instead (`workingTree` → index ↔ working
  tree, `index` → HEAD ↔ index), via one command per group because a menu's `scmResourceGroup`
  is not passed to the command it gates. Two things were wrong with that:

  1. The group is right only for a plain modify. A **staged add** has no HEAD version and a
     **delete** has no modified version, so the mapping asked for a side that cannot exist;
     the read throws `FileNotFound` and the panel reported an error instead of rendering.
  2. Four menu entries sharing one title, each gated on a different `scmResourceGroup`, put
     the correctness of the pairing in the `when` clauses — unverifiable from here and
     impossible to tell apart in the menu if the gating ever failed to narrow.

  Both are gone: the clicked `SourceControlResourceState` **is** the git extension's own
  `Resource` (it does `instanceof Uri` on these arguments itself), carrying `type` (the git
  `Status`) and `resourceGroupType`. The status is read off that object, so one command and
  one menu entry serve every group and no `when` clause can select the wrong pairing.
  `findChange` — public `git.d.ts` API — backs it up and supplies `originalUri` for renames.

  **Each entry point is resolved on its own terms and never falls back onto another's
  context.** A first cut chained them (`scmResource ?? activeDiffTab ?? fileStatus`), so a
  Source Control row whose resource object was not recognised silently answered with
  *whatever diff tab happened to be open* — clicking a file under *Changes* while that same
  file's staged diff was the active tab returned the staged pair. A Source Control click now
  never consults the editors at all, and the title-bar path accepts the active diff tab only
  when it is showing the same file.

  A third source is more exact still, and is what the **diff-editor title-bar button** now
  uses: an open text diff already holds the pair it is showing as two URIs
  (`TabInputTextDiff.original`/`.modified`), each a `git:` URI naming its ref, or a plain file
  URI for the working tree. Reading those cannot disagree with what the user is looking at.
  Inferring the pair from the file's status instead is what made the button answer
  "HEAD ↔ Working Tree" over a diff that was showing HEAD ↔ Index — the title-bar path has no
  resource object, so it fell through to the default. `git:`'s `~` ref maps onto the index:
  for an unstaged tracked file the index still holds the HEAD version, so they are the same
  bytes either way.
- [src/editor/gitContent.ts](src/editor/gitContent.ts) — reads through `git:` URIs (the same
  mechanism VS Code's diff uses, so the text matches exactly), falling back to
  `repository.show`. The `{path, ref}` query shape is verified against the shipped git
  extension bundle but is de-facto, not public API — hence the fallback.
- **`scm/resourceState/context` has no resource URI context.** Verified in the 1.137.0
  workbench: the SCM resource menu is created per *group* with an overlay of only
  `scmResourceGroup` + `multiDiffEditorEnableViewChanges`, and the per-resource overlay adds
  only `scmResourceState` (the git extension sets that to the repository *kind*). So
  `resourceExtname` / `resourceFilename` / `resourceScheme` / `resourceLangId` in a `when`
  there do **not** describe the clicked file — they fall through to the ambient context, i.e.
  whatever editor is active. A `resourceExtname == .md` clause made the menu entry appear or
  vanish depending on the active editor. The entry is now unfiltered (`scmProvider == git`,
  group `2_view@3`) and the command itself turns away non-markdown. `editor/title` is
  unaffected — an editor menu does get resource context, and the git extension's own
  `isInDiffEditor && resourceScheme == git` clauses confirm it.
- `resolveCustomTextEditor` now treats any non-`file:` document as read-only: no git lookup,
  no `edit`, and a banner offering the diff panel. This is what the Open With case degrades
  to instead of the broken state described above.
- The `editor/title` entry for "Open with Markdown Beautiful Editor" is now suppressed with
  `!isInDiffEditor`, so the path into that state is no longer offered from a diff.

`priority: "option"` stays, and remains the reason diffs default to the built-in text diff.

**The diff panel is deliberately not a registered editor**, so it does not appear in the
editor-association picker (the dropdown at the top-right of a diff tab, or **Open With…**).
VS Code resolves a custom editor once per diff *side*, so an entry in that picker yields two
independent panes.

That is a design constraint, **not** an impossibility — an earlier revision of this note
called it "only ever the bug", which overstated it. Each pane does resolve, does get its own
`TextDocument`, and can render whatever it likes; that is exactly how the read-only banner
gets there. A pane can also tell which side it is (an original-side URI carries ref `HEAD`,
`~` or `~N`; a modified side carries ref `''` or is a plain `file:` URI) and can fetch the
opposite side's content itself, since it knows the path and can derive the counterpart ref.

So a **paned diff** is buildable inside the finalized API: the left pane renders the original
with removals marked, the right the modified with additions marked, and the extension host —
which holds both webviews in `activeWebviewPanels` — relays scroll position between them.
What it cannot do is what `customEditorDiffs` does natively: the two panes are never told
they belong together, so they must be paired heuristically by path and ref, and the built-in
diff chrome cannot be hidden. See "Possible: paned diff rendering" below.

**User-side hazard — both association settings** (verified against VS Code 1.137.0):
`workbench.editorAssociations` and `workbench.diffEditorAssociations`, the latter described
as "Configure glob patterns to editors for diff views… These override
`workbench.editorAssociations` for diffs". The diff picker's **Set Default (Diff Only) for
'*.md'** submenu writes the second one. Pointing either at `markdown.beautifulEditor`
reproduces the two-pane state; the reset is that picker's **Text Diff Editor** entry.

**Still not covered** (only `customEditorDiffs` can): the multi-diff editor, "Compare with…",
gutter diffs, and merge conflicts, which get a HEAD ↔ working-tree approximation rather than
a three-way view.

### Possible: paned diff rendering (not built)

Render into VS Code's own diff layout by resolving both sides, as sketched above. Would give
a styled diff at every entry point the picker reaches, instead of only the ones our commands
reach. Costs: heuristic pairing of the two panes (fragile if one file is open in two diffs at
once), scroll sync round-tripping through the extension host, no control over the diff
chrome, and it re-enables a picker entry that degrades to two unsynced editors whenever the
pairing fails. `customEditorDiffs` replaces the whole thing when it finalizes.

### Editable modified pane — shipped 2026-09-19 (in-editor toggle only)

Both `MergeView` panes used to be forced read-only, overriding the library's editable `b`
side, because `b` was a *snapshot* not wired to `hostSync`: edits there would have been
silently lost. `revertControls` was unset for the same reason.

The in-editor diff toggle now hands document ownership to the `b` pane for the duration of
diff mode — [main.ts](src/webview/main.ts) binds a second `hostSync` to `mergeView.b`, and
`applyExternalUpdate` routes host `update`s there instead of to the hidden main view, so
exactly one surface syncs at a time. `exitDiffMode` reads the pane's final content, flushes,
then applies it to the main view through `hostSync` (host-echo annotated, since the host
already has it). `revertControls: 'a-to-b'` comes with it: "revert this chunk from HEAD" now
dispatches into a pane that can take it. `mergePaneOptions` keeps that coupling pure and
unit-tested ([diffMode.test.ts](src/test/unit/diffMode.test.ts)).

The revert buttons then rendered but could not be seen, which is worth recording as its own
trap: `diff.css` paints `.cm-mergeViewEditors` with the divider colour and relies on a 1px
`gap` to draw the line between the panes. `revertControls` inserts its column as a **third
flex child** of that element, and the library gives it only `width: 1.6em` — so it took the
divider background and read as a wide grey border, with the default `⇝` in a button the
library styles `background: none; border: none` and never gives a `color`. The buttons were
present and clickable the whole time. Anything the library adds as a flex child there has to
claim its own background.

`createRevertControl` ([mergeView.ts](src/webview/cm/diff/mergeView.ts)) now supplies the
element via `renderRevertControl`, so the control's appearance does not depend on the
library's default at all: a bordered `→` visible at rest rather than only on hover, in a
column widened to `2.2em`. `MergeView` only requires "one element" — it sets `style.top` and
`data-chunk` on whatever is returned and finds the chunk by walking to `.cm-merge-revert`'s
direct child — so it stays a `<button>` purely to keep the library's `position: absolute` rule
and to be focusable.

**Webview assets had no cache busting**, which made two separate CSS fixes look like they had
not taken. `webviewAssetUris` now appends a `reload=<timestamp>` query in
`ExtensionMode.Development` only; released builds keep the plain URI so caching works
normally.

`HostSync` gained `flush()` for the handover: `destroy()` *cancels* a debounced edit rather
than sending it, which would have lost the last keystrokes before the toggle closed — the
same loss #8 covers for disposal, reached by a different route.

**The toggle was unreachable, which is how this went unnoticed.** The toolbar's ⇄ button hid
itself whenever `diffAvailable` was false — and that flag is false for *every* way the HEAD
lookup can fail (not in a repository, untracked, git extension not yet activated, repository
list still empty right after activation), not just "the file matches HEAD". A control that
vanishes is indistinguishable from one that is broken, and it gave the user nothing to act
on. It is now always visible while diff mode is off, dimmed via `.toolbar-btn-inactive` with
a tooltip saying why it would do nothing, and a skipped toggle reports `diffSkipped` so the
host can say so out loud. A native title-bar button (`activeCustomEditorId ==
markdown.beautifulEditor`) now offers the same command independently of the webview.

**The diff panel got the same treatment where it can take it** — `isModifiedSideWritable`
gates on the modified side being the working tree, so *Unstaged* and *Untracked* views edit
and revert, while *Staged* (the index) and *Deleted* stay read-only. The panel is a plain
`WebviewPanel` with no `TextDocument` behind it, so `diffPanel.ts` applies the pane's `edit`
messages as a `WorkspaceEdit` against the file itself, mirroring `customEditorProvider.ts`
including its `isApplyingEdit` echo suppression. An external change to the file re-sends the
whole `initDiff` rather than patching: the webview rebuilds its `MergeView` on each one, and
editing a file elsewhere while looking at its diff is rare enough not to warrant a second
sync protocol.

Not covered, deliberately:

- **The index and commit sides.** Writing either needs `git apply --cached` or a commit,
  which a `WorkspaceEdit` cannot do.
- **The floating formatting toolbar, link clicks and cursor persistence** are bound to the
  main `EditorView` ([chrome.ts](src/webview/cm/ui/chrome.ts),
  [floatingToolbar.ts](src/webview/cm/ui/floatingToolbar.ts)), so they do not act on the
  merge pane. The pane gets the same `defaultKeymap`/`historyKeymap` as the main editor, so
  typing, motion and undo/redo behave identically; the toolbars do not follow it.

---

## 13. Thirteen source files cite a plan document that does not exist

**Severity: Low · Confidence: High**

`docs/plans/CODEMIRROR6_MIGRATION.md` is referenced from 13 file headers — `main.ts`,
`cm/extensions.ts`, `cm/decorations.ts`, `cm/diff/mergeView.ts`, `cm/decorations/alerts.ts`,
`cm/lang/{registry,math,footnotes,definitionList}.ts`, `cm/commands/{lineType,inlineFormat}.ts`,
`editor/diff.ts` and `shared/nodeClassMap.ts` — and `docs/` contains only `PUBLISHING.md` and
`TRIAGE.md`. Several of those headers defer a rationale to it ("see … for why"), so the
reasoning behind a load-bearing decision is cited but unreachable. `.claude/agents/cm6-migration.md`
is cited the same way from `mergeView.ts` and `extensions.ts` and is likewise absent.

**Suggested fix:** decide whether that document is recoverable. If it is, restore it under
`docs/plans/`; if not, inline the one or two sentences each header actually needs and drop
the link. Not done as part of #12's mitigation — a 13-file header sweep would have buried it.

---

## Not bugs (reviewed, working as intended)

- **`const` in `switch` cases without block braces** (`applyInlineFormat` link case):
  flagged in review as a latent TDZ risk, but every case `return`s before reaching
  the declarations, so there is no fallthrough. Cosmetic only.
- **Single-line copy returns `selection.toString()` including `md-syntax` markers**
  ([serializer.ts:46-50](src/webview/markdown/serializer.ts#L46-L50)): intended — the syntax characters live in the
  span `textContent`, so the copied text is correct markdown.
