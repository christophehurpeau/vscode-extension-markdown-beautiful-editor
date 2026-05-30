# Bug Triage

Bugs and potential bugs identified by **code inspection** during the May 2026
consolidation pass. None have been reproduced at runtime — each entry is a
hypothesis with the supporting code cited. Confidence is noted per item.

Scope note: the consolidation refactor deliberately did **not** fix these
(refactor/tests only). Items 1–5 were surfaced in the consolidation plan;
6–11 are additional findings.

| # | Severity | Confidence | Summary |
|---|----------|-----------|---------|
| 1 | High | High | Image title dropped on rewrite → data loss on save |
| 2 | Low | High | Unreachable initial-diff-mode code |
| 3 | Low | High | Dead `resolveImage` / `imageResolved` round-trip |
| 4 | Medium | Medium | Tab uses deprecated `execCommand`, bypasses edit pipeline |
| 5 | Low (perf) | High | `isDiffAvailable` runs the git lookup twice |
| 6 | Medium | Medium | TOC index vs editor heading count can diverge (wrong scroll target) |
| 7 | Medium | Medium | `isExternalUpdate` can stay stuck on a render throw (2 sites) |
| 8 | Medium | Low | Edits within the debounce window can be lost on close |
| 9 | Low | Medium | `update` while in init-diff-mode renders onto the diff DOM |
| 10 | Low | Low | Inline link toggle-off regex is greedy |
| 11 | Low | Low | `extractMarkdown` fallback can capture line-number text |

---

## 1. Image title dropped on rewrite → data loss

**Severity: High · Confidence: High**

[customEditorProvider.ts:196-228](src/editor/customEditorProvider.ts#L196-L228)

`processImagePaths` matches `![alt](path "title")` but the replacement emits only
`![${alt}](${webviewUri})` — the title group is matched and discarded. The webview
then serializes from what it was given, so editing a file that contained
`![a](img.png "Title")` and saving writes back `![a](img.png)`. Silent data loss.

The regex also strips the title even for remote/`data:` URLs and already-converted
URIs (it returns `match` for those, so they're safe), but the local-path branch
rebuilds the string without the title.

**Suggested fix:** capture the optional title group and re-append it in the
replacement.

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

## 4. Tab uses deprecated `execCommand` and bypasses the edit pipeline

**Severity: Medium · Confidence: Medium**

[main.ts:830](src/webview/main.ts#L830)

`document.execCommand('insertText', false, '    ')` is the only edit operation that
does not go through the markdown-splice + `rerender` path; every other key handler
builds the new markdown string explicitly. `execCommand` is deprecated and its
behavior is inconsistent across environments. It happens to fire an `input` event
(so `handleInput` re-syncs), but if `execCommand` is ever a no-op the Tab silently
does nothing, and the inserted spaces land in the contenteditable DOM before the
re-render rather than as a controlled markdown edit.

**Suggested fix:** insert the four spaces by splicing the markdown at the cursor
and calling `rerender`, like the Enter handler does.

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

## 6. TOC index vs editor heading count can diverge

**Severity: Medium · Confidence: Medium**

[toc.ts:14-22](src/webview/toc.ts#L14-L22) vs [toc.ts:78](src/webview/toc.ts#L78) and [toc.ts:130](src/webview/toc.ts#L130)

`extractHeadingsFromMarkdown` includes a heading only when `match[2].trim()` is
non-empty, so a TOC entry's `data-heading-index` is its position **among non-empty
headings**. But `scrollToHeading` and `updateActiveHeading` locate the target by
counting **every** editor line matching `/^#{1,6}\s/` — which includes empty-text
heading lines (e.g. a bare `# `). When such a line exists above a TOC entry, the
indices drift and clicking the entry scrolls to the wrong heading (and scroll-spy
highlights the wrong item).

This predates the consolidation refactor; the old mock-doc path had the same
mismatch.

**Suggested fix:** make both sides agree — either include empty headings in the TOC
list, or have the scroll/spy logic skip heading lines with empty text.

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

## 10. Inline link toggle-off regex is greedy

**Severity: Low · Confidence: Low**

[main.ts](src/webview/main.ts) — `applyInlineFormat`, link case: `selectedText.match(/^\[(.+)\]\(.+\)$/)`.

The greedy `.+` groups mean a selection spanning two links or a link plus trailing
`](...)` text could match and be unwrapped incorrectly. Narrow edge case; needs a
crafted selection to trigger.

**Suggested fix:** make the groups non-greedy / anchor more tightly, and add a unit
test once the inline-format logic is extracted from the DOM handler.

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

## Not bugs (reviewed, working as intended)

- **`const` in `switch` cases without block braces** (`applyInlineFormat` link case):
  flagged in review as a latent TDZ risk, but every case `return`s before reaching
  the declarations, so there is no fallthrough. Cosmetic only.
- **Single-line copy returns `selection.toString()` including `md-syntax` markers**
  ([serializer.ts:46-50](src/webview/markdown/serializer.ts#L46-L50)): intended — the syntax characters live in the
  span `textContent`, so the copied text is correct markdown.
