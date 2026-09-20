/**
 * `@codemirror/merge` wiring for diff mode (decided 2026-09-17/18: adopt
 * `@codemirror/merge`, replacing the deleted custom side-by-side DOM panes —
 * see `src/webview/editor/diff.ts` and
 * docs/plans/CODEMIRROR6_MIGRATION.md's "Diff mode does not survive
 * untouched" section for why the old `highlightDifferences` couldn't just be
 * ported: it indexed into a `.line` NodeList by line number, which CM6's
 * viewport virtualization invalidates).
 *
 * Two independent pieces live here:
 *
 * - `createMergeView` builds the actual `MergeView` — DOM/EditorView, not
 *   unit-testable, only exercised via `pnpm compile`/manual verification.
 * - `planToggleDiff` decides WHETHER to open/close it, given the current
 *   diff-mode state and the live document — pure, DOM-free, and what
 *   `src/test/unit/diffMode.test.ts` actually drives. Keeping this decision
 *   out of `main.ts` and out of `createMergeView` is what makes "does a
 *   toggle lose edits or open an empty diff" testable without a browser.
 *
 * The original (`a`) pane is always read-only — it is a git revision, and
 * there is nowhere to write it back to. The modified (`b`) pane depends on
 * `editableModified`:
 *
 * - The in-editor diff toggle passes `true`. There `b` holds the live
 *   working-tree text, so it becomes the document's editing surface for the
 *   duration of diff mode: `main.ts` binds a `hostSync` to it and hands the
 *   content back to the main view on exit. Revert controls are enabled with
 *   it, and only with it — "revert this chunk" dispatches into `b`, so it is
 *   a real action exactly when `b` can take one and a dead affordance
 *   otherwise.
 * - The standalone diff panel (`src/editor/diffPanel.ts`) passes `false`:
 *   its modified side may be the git index or a commit, which cannot be
 *   written back through a `WorkspaceEdit`.
 */
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { MergeView } from '@codemirror/merge';
import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { markdownExtensions as ourGrammarExtensions } from '../lang/registry';
import { markdownDecorations } from '../decorations';
import { markdownLineNumbers } from '../lineNumberGutter';
import { hasChanges } from '../../editor/diff';

export interface CreateMergeViewOptions {
    parent: HTMLElement;
    /** HEAD content — the `a` (left) pane. */
    original: string;
    /** Live document content at the moment diff mode was entered — the `b`
     * (right) pane. */
    modified: string;
    /**
     * Make the `b` pane a real editing surface (and enable revert controls).
     * Only pass `true` when the caller wires its changes back to the host —
     * an editable pane nothing syncs would silently drop the user's typing.
     * Defaults to `false`.
     */
    editableModified?: boolean;
}

/**
 * Presentation-only slice of `../extensions.ts`'s markdown setup: the
 * markdown language with this project's grammar registry, and the
 * decoration + gutter layers that make a heading look like a heading and a
 * line show its number. Rebuilt here rather than imported because
 * `extensions.ts` is frozen and its single `markdownExtensions` array
 * bundles editing concerns (`history()`, `keymap.of([...defaultKeymap,
 * ...historyKeymap])`) together with presentation — a read-only merge pane
 * must not carry those (see the file header on why nothing here may edit or
 * sync), and that file's own convention is "say what you need, don't edit
 * it".
 *
 * Deliberately narrower than `../extensions.ts`'s `markdown()` call in one
 * respect: it omits the fenced-code `codeLanguages` (javascript/json/html/
 * css), which are assembled from a local, unexported const in that file.
 * Re-declaring those four language imports here to match would duplicate
 * config that is supposed to stay authored once in one place. The visible
 * cost is that a fenced code block's contents render as plain text in the
 * diff panes, with no per-language syntax highlighting — they still get
 * this project's own code-block border/background/padding, which comes
 * from `markdownDecorations` walking `FencedCode`/`CodeMark`/`CodeInfo`
 * nodes, independent of `codeLanguages`.
 */
const diffPresentationExtensions: Extension[] = [
    markdown({
        base: commonmarkLanguage,
        // Same trap noted in `.claude/agents/cm6-migration.md`: GFM must go
        // through `markdown()`'s `extensions` option, not
        // `parser.configure({extensions:[GFM]})`, which is a silent no-op.
        extensions: [GFM, ...ourGrammarExtensions],
        completeHTMLTags: false,
    }),
    markdownLineNumbers(),
    markdownDecorations,
];

// A git revision has nowhere to be written back to, so `a` always uses this;
// `b` does too whenever its side is not the working tree.
const readOnlyPaneExtensions: Extension[] = [
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    EditorView.lineWrapping,
    ...diffPresentationExtensions,
];

/**
 * The editing half of what `../extensions.ts` bundles, for a `b` pane that is
 * the live document. Same keymap set as the main editor, so undo/redo and
 * cursor motion behave identically across the toggle; `markdownExtensions`
 * itself still cannot be reused here, for the reason the header of
 * `diffPresentationExtensions` gives.
 */
const editablePaneExtensions: Extension[] = [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    ...diffPresentationExtensions,
];

export interface MergePaneOptions {
    /** The original (`a`) pane. Never editable — it is a git revision. */
    originalEditable: false;
    modifiedEditable: boolean;
    revertControls: 'a-to-b' | undefined;
}

/**
 * The two decisions `createMergeView` makes from `editableModified`, split out
 * because the view itself needs a DOM and this does not (see the file header
 * on what the unit suite can reach). The invariant worth holding: revert
 * controls exist exactly when a pane can accept what they dispatch — a revert
 * copies the original's text into `b`, so offering one against a read-only `b`
 * ships a button that silently does nothing.
 */
export function mergePaneOptions(editableModified: boolean): MergePaneOptions {
    return {
        originalEditable: false,
        modifiedEditable: editableModified,
        revertControls: editableModified ? 'a-to-b' : undefined,
    };
}

/**
 * The per-chunk revert control. Rendered here rather than left to the
 * library's default, which is a bare `⇝` in a button with `background: none;
 * border: none` — in a 1.6em column between two panes that reads as a stray
 * glyph rather than a control, and is easy to miss entirely.
 *
 * `MergeView` sets `style.top` and `data-chunk` on whatever this returns and
 * finds the chunk again by walking up to `.cm-merge-revert`'s direct child, so
 * the only contract is "one element". It stays a `<button>` so the library's
 * own `position: absolute` rule still places it, and so it is focusable and
 * announced as a control.
 *
 * The arrow points right because `revertControls` is `a-to-b`: the click
 * copies the original (left) chunk into the modified (right) pane.
 */
function createRevertControl(): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-merge-revert-btn';
    button.textContent = '→';
    button.title = 'Revert this chunk to the original';
    button.setAttribute('aria-label', 'Revert this chunk to the original');
    return button;
}

export function createMergeView({ parent, original, modified, editableModified = false }: CreateMergeViewOptions): MergeView {
    const panes = mergePaneOptions(editableModified);

    return new MergeView({
        parent,
        a: { doc: original, extensions: readOnlyPaneExtensions },
        b: { doc: modified, extensions: panes.modifiedEditable ? editablePaneExtensions : readOnlyPaneExtensions },
        gutter: true,
        highlightChanges: true,
        revertControls: panes.revertControls,
        renderRevertControl: panes.revertControls ? createRevertControl : undefined,
        // Long unchanged stretches fold behind a "$N unchanged lines"
        // widget (default margin/minSize). The old diff view always
        // rendered every line; this is a genuine new capability, not lost
        // parity, and matters here because `MergeView` disables CM6's
        // viewport virtualization for its panes (verified in
        // node_modules/@codemirror/merge/dist/index.js's `baseTheme`:
        // `.cm-scroller` is forced `height: auto`), so without it a large
        // document renders its full line count as real DOM on every open.
        collapseUnchanged: {},
    });
}

export type DiffModeTransition =
    | { action: 'open'; original: string; modified: string }
    | { action: 'close' }
    | { action: 'skip'; reason: 'no-changes' };

export interface PlanToggleDiffOptions {
    /** Whether diff mode is currently showing. */
    active: boolean;
    /** HEAD content carried by the host's `toggleDiff` message. */
    originalVersionContent: string;
    /** The live document's current text (`view.state.doc.toString()`),
     * read fresh at toggle time — never a value cached from an earlier
     * message, so a toggle can't act on stale content. */
    currentContent: string;
}

/**
 * Decides what a `toggleDiff` message should do. Pure and DOM-free so it's
 * unit-testable without an `EditorView`/`MergeView` (see
 * `src/test/unit/diffMode.test.ts`): close if diff mode is already active
 * (the host sends the same `toggleDiff` message for both directions — it
 * does not itself track diff-mode state, see `customEditorProvider.ts`'s
 * `toggleDiffMode`), otherwise open unless `hasChanges` (from
 * `../../editor/diff.ts`) finds nothing to show.
 *
 * `currentContent` passes straight through to the `open` result unmodified
 * — this function never rewrites or truncates document text, which is the
 * property `src/test/unit/diffMode.test.ts`'s content-preservation cases
 * check for.
 */
export function planToggleDiff({ active, originalVersionContent, currentContent }: PlanToggleDiffOptions): DiffModeTransition {
    if (active) {
        return { action: 'close' };
    }
    if (!hasChanges(originalVersionContent, currentContent)) {
        return { action: 'skip', reason: 'no-changes' };
    }
    return { action: 'open', original: originalVersionContent, modified: currentContent };
}
