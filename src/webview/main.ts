/**
 * Webview bootstrap. Thin by design (CM6 migration WP-1): owns the host <->
 * webview protocol and constructs the single `EditorView` (`./cm/editorView.ts`).
 * `initEditor`'s `init*` calls are seams into `src/webview/cm/ui/` — no-op
 * stubs until their owning WP fills them in; see `.claude/agents/cm6-migration.md`.
 */
import { EditorView } from '@codemirror/view';
import type { MergeView } from '@codemirror/merge';
import { createEditorView } from './cm/editorView';
import { createHostSync, createDebouncedTask, type HostSync, type DebounceClock } from './cm/sync/hostSync';
import { createMergeView, planToggleDiff } from './cm/diff/mergeView';
import { computeLineChangeMarkers, type LineChangeKind } from './editor/diff';
import { dispatchLineChangeMarkers } from './cm/lineNumberGutter';
import { initFloatingToolbar } from './cm/ui/floatingToolbar';
import { initLineTypeToolbar } from './cm/ui/lineTypeToolbar';
import { initTocPanel } from './cm/ui/tocPanel';
import { initChrome } from './cm/ui/chrome';
import { updateToc, extractHeadingsFromMarkdown, findHeadingIndexBySlug, findHeadingLineIndex, setTocVisible } from './toc';
import { resolveTocVisibility, toggledTocPreference, type TocVisibilityPreference } from '../shared/tocVisibility';
import {
    defaultEditorFontFamily,
    monoFontBodyClass,
    resolveEditorFontFamily,
    toggledEditorFontFamily,
    type EditorFontFamily} from '../shared/fontFamily';
import { getStoredState, saveTocPreference } from './editor/state';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../shared/messages';

// Cold-start marker (logged on first 'init'): the still-unmeasured decision
// gate docs/plans/CODEMIRROR6_MIGRATION.md names.
const scriptEvalStart = performance.now();

declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

function postToHost(message: WebviewToHostMessage): void {
    vscode.postMessage(message);
}

let view: EditorView | null = null;
let hostSync: HostSync | null = null;

// --- Diff mode (WP-D) ---
// `diffModeActive` mirrors `document.body`'s `diff-mode` class rather than
// being derived from `mergeView`'s presence, so `updateDiffToggleVisibility`
// stays a plain read with no ordering dependency on when `mergeView` is
// nulled out during teardown.
let diffModeActive = false;
let diffAvailable = false;
let mergeView: MergeView | null = null;
// Binds the merge view's modified pane to the host while diff mode is on, so
// that pane -- not the hidden main view -- is the document's editing surface.
// See `enterDiffMode`.
let diffSync: HostSync | null = null;

// --- Always-on change gutter (added/modified/deleted vs. git HEAD) ---
// `headContent` mirrors the host's cached git HEAD text (see
// `customEditorProvider.ts`), refreshed from every `init`/`update` message.
// `null` means "not in git / no HEAD" -- the gutter then shows no markers,
// same as a brand-new untracked file in VS Code's own editor.
let headContent: string | null = null;

const realClock: DebounceClock = {
    setTimeout: (handler, timeoutMs) => setTimeout(handler, timeoutMs),
    clearTimeout: (id) => clearTimeout(id),
};

// Recomputing the gutter markers means diffing the WHOLE document against
// HEAD (`computeLineChangeMarkers` wraps `Diff.diffLines`, same as
// `computeDiff`). Measured: cheap for a normal-sized document and a small
// pending change (low single-digit ms for a few thousand lines), but a
// large document with a large pending change block can cost hundreds of ms
// (diffLines is roughly O(lines * distinct-change-size)). Doing that inside
// the update listener below -- which fires on every keystroke -- would
// reintroduce exactly the per-keystroke freeze this migration removed
// `diffChars` for (see hostSync.ts). Debounced -- with `createDebouncedTask`,
// NOT the `createEditQueue` used for outgoing edits: that one suppresses a
// send whose content matches the previous one, which would make this fire
// exactly once and never again.
const lineChangeTask = createDebouncedTask({
    delayMs: 300,
    clock: realClock,
    run: () => recomputeLineChanges(),
});

function recomputeLineChanges(): void {
    if (!view) {
        return;
    }
    const markers = headContent === null
        ? new Map<number, LineChangeKind>()
        : computeLineChangeMarkers(headContent, view.state.doc.toString());
    dispatchLineChangeMarkers(view, markers);
}

function scheduleLineChangeRecompute(): void {
    lineChangeTask.schedule();
}

function updateTocFromMarkdown(markdown: string): void {
    updateToc(extractHeadingsFromMarkdown(markdown));
}

// --- TOC visibility (preference + width-based default) ---
let tocPreference: TocVisibilityPreference = null;

function isTocVisible(): boolean {
    return resolveTocVisibility({ preference: tocPreference, viewportWidth: window.innerWidth });
}

function applyTocVisibility(): void {
    setTocVisible(isTocVisible());
}

function toggleToc(): void {
    tocPreference = toggledTocPreference(isTocVisible());
    saveTocPreference(vscode, tocPreference);
    applyTocVisibility();
}

function initTocToggle(): void {
    tocPreference = getStoredState(vscode)?.tocPreference ?? null;
    applyTocVisibility();
    document.getElementById('toc-toggle-btn')?.addEventListener('click', toggleToc);
    window.addEventListener('resize', applyTocVisibility);
}

// --- Content font (setting + temporary toolbar toggle) ---
let fontFamilySetting: EditorFontFamily = defaultEditorFontFamily;
let fontFamilyOverride: EditorFontFamily | null = null;

function currentFontFamily(): EditorFontFamily {
    return resolveEditorFontFamily({ setting: fontFamilySetting, override: fontFamilyOverride });
}

function applyFontFamily(): void {
    const isMono = currentFontFamily() === 'mono';
    document.body.classList.toggle(monoFontBodyClass, isMono);
    const button = document.getElementById('font-toggle-btn');
    button?.classList.toggle('active', isMono);
    button?.setAttribute('aria-pressed', String(isMono));
}

function toggleFontFamily(): void {
    fontFamilyOverride = toggledEditorFontFamily(currentFontFamily());
    applyFontFamily();
}

function setFontFamilySetting(fontFamily: EditorFontFamily): void {
    fontFamilySetting = fontFamily;
    fontFamilyOverride = null;
    applyFontFamily();
}

function initFontToggle(): void {
    document.getElementById('font-toggle-btn')?.addEventListener('click', toggleFontFamily);
    applyFontFamily();
}

// Cross-file links and same-document TOC clicks both resolve here.
function scrollToAnchorInEditor(editor: EditorView, slug: string): void {
    const doc = editor.state.doc.toString();
    const headingIndex = findHeadingIndexBySlug(extractHeadingsFromMarkdown(doc), slug);
    if (headingIndex === null) {
        return;
    }
    const lineIndex = findHeadingLineIndex(doc.split('\n'), headingIndex);
    if (lineIndex === null) {
        return;
    }
    const line = editor.state.doc.line(lineIndex + 1);
    // Double rAF: a just-revealed background tab may not be laid out yet.
    requestAnimationFrame(() => requestAnimationFrame(() => {
        editor.dispatch({
            selection: { anchor: line.from },
            effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
        });
        editor.focus();
    }));
}

function initEditor(container: HTMLElement, markdown: string, readOnly: boolean): void {
    view = createEditorView({
        doc: markdown,
        parent: container,
        readOnly,
        // The `edit` send lives in hostSync's own updateListener (attached
        // below), not here -- this callback only drives UI that must track
        // every doc change, host-originated ones included. Same for the
        // change-gutter recompute: it must react to a host-applied external
        // update (e.g. a branch switch) exactly like a local edit.
        onDocChanged: (doc) => {
            updateTocFromMarkdown(doc);
            scheduleLineChangeRecompute();
        },
    });
    // No `hostSync` for a read-only document: it exists to push `edit`
    // messages the host would refuse anyway, and wiring it would leave an
    // update listener diffing a document that can never change locally.
    hostSync = readOnly ? null : createHostSync({ view, postToHost });

    updateTocFromMarkdown(markdown);
    scheduleLineChangeRecompute();

    // Seams into src/webview/cm/ui/ — no-op stubs; owning WP fills its file.
    const uiInits: [string, (v: EditorView, el: HTMLElement) => void][] = [
        ['toc', initTocPanel],
        // `vscode` is threaded in for the same reason as `initChrome` below:
        // the toolbar's open button posts `openLink` to the host.
        ['formatting-toolbar', (v, el) => initFloatingToolbar(v, el, vscode)],
        ['line-type-toolbar', initLineTypeToolbar],
    ];
    for (const [id, initFn] of uiInits) {
        const el = document.getElementById(id);
        if (el) {
            initFn(view, el);
        }
    }
    // `vscode` is passed through because `acquireVsCodeApi()` throws if called
    // twice in a session, and chrome.ts needs it for cross-file link opening
    // and cursor/scroll persistence.
    initChrome(view, container, vscode);

    view.focus();
}

// Diffed and applied as a minimal `ChangeSpec` by hostSync, annotated so its
// own updateListener doesn't echo it back as an `edit`; see hostSync.ts.
// `updateTocFromMarkdown` runs via `onDocChanged` above once the change
// lands, so it doesn't need to be called here too.
//
// Routed to whichever surface currently owns the document: in diff mode that
// is the merge view's modified pane, and the main view is deliberately left
// stale until `exitDiffMode` hands the content back. Applying to both would
// mean two editors racing to send `edit`s for the same change.
function applyExternalUpdate(markdown: string): void {
    (diffSync ?? hostSync)?.applyExternalUpdate(markdown);
}

// --- Diff mode (WP-D) ---
// Shows/hides the toggle button per the latest `diffAvailable` (from
// `init`/`update`) and the current diff-mode state; the close button's
// visibility is owned by enter/exitDiffMode instead, since it only ever
// depends on diff-mode state, never on `diffAvailable`.
function updateDiffToggleVisibility(): void {
    const diffToggleBtn = document.getElementById('diff-toggle-btn');
    if (!diffToggleBtn) {
        return;
    }
    // Visible whenever diff mode is off, regardless of `diffAvailable`. It
    // used to hide itself when git had nothing to compare, which is
    // indistinguishable from the feature being broken -- and it hides for
    // every reason the HEAD lookup can fail, not just "no changes". It now
    // stays put and says why it would do nothing.
    diffToggleBtn.style.display = diffModeActive ? 'none' : 'flex';
    diffToggleBtn.classList.toggle('toolbar-btn-inactive', !diffAvailable);
    diffToggleBtn.title = diffAvailable ? 'Toggle Diff Mode' : 'No changes since git HEAD';
}

// `view` (the single main EditorView, see initEditor) is hidden, not
// destroyed, for the duration of diff mode.
//
// The modified pane is a live editing surface, so ownership of the document
// moves to it: its own `hostSync` sends the `edit`s and receives the host's
// `update`s (see `applyExternalUpdate`), while the main view sits frozen at
// whatever it held on entry. `exitDiffMode` reconciles it. Both surfaces
// syncing at once is what must not happen -- two editors would send
// conflicting `edit`s for the same document.
function enterDiffMode(container: HTMLElement, original: string, modified: string): void {
    const mergeContainer = document.createElement('div');
    mergeContainer.className = 'cm-merge-container';
    container.insertAdjacentElement('afterend', mergeContainer);
    container.style.display = 'none';

    mergeView = createMergeView({ parent: mergeContainer, original, modified, editableModified: true });
    diffSync = createHostSync({ view: mergeView.b, postToHost });
    mergeView.b.focus();

    diffModeActive = true;
    document.body.classList.add('diff-mode');
    updateDiffToggleVisibility();

    const diffCloseBtn = document.getElementById('diff-close-btn');
    if (diffCloseBtn) {
        diffCloseBtn.style.display = 'flex';
    }
    const lineTypeToolbar = document.getElementById('line-type-toolbar');
    if (lineTypeToolbar) {
        lineTypeToolbar.style.display = 'none';
    }
    const toc = document.getElementById('toc');
    if (toc) {
        toc.style.display = 'none';
    }
}

function exitDiffMode(container: HTMLElement): void {
    // Read before teardown, and flushed before destroy: `destroy` drops a
    // debounced edit rather than sending it (hostSync.ts), which would lose
    // whatever was typed in the last fraction of a second.
    const editedContent = mergeView?.b.state.doc.toString() ?? null;
    diffSync?.flush();
    diffSync?.destroy();
    diffSync = null;

    mergeView?.destroy();
    mergeView?.dom.remove();
    mergeView = null;

    // Hand the document back to the main view. Applied through `hostSync` so
    // it carries the host-echo annotation: the host already has this content
    // from the pane's own `edit`s, and re-sending it would be a redundant
    // round trip. This is also what refreshes the TOC and the change gutter,
    // via the main view's `onDocChanged`.
    if (editedContent !== null) {
        hostSync?.applyExternalUpdate(editedContent);
    }

    container.style.display = '';

    diffModeActive = false;
    document.body.classList.remove('diff-mode');
    updateDiffToggleVisibility();

    const diffCloseBtn = document.getElementById('diff-close-btn');
    if (diffCloseBtn) {
        diffCloseBtn.style.display = 'none';
    }
    const lineTypeToolbar = document.getElementById('line-type-toolbar');
    if (lineTypeToolbar) {
        lineTypeToolbar.style.display = 'flex';
    }
    const toc = document.getElementById('toc');
    if (toc) {
        toc.style.display = '';
    }
    view?.focus();
}

// --- Read-only document (one side of a VS Code diff; see docs/TRIAGE.md #12) ---
// The host already refuses `edit` messages and the view is built
// non-editable; this only makes that state legible and offers the way out.
function applyReadOnlyChrome(): void {
    document.body.classList.add('read-only');
    const banner = document.getElementById('readonly-banner');
    if (banner) {
        banner.style.display = 'flex';
    }
    const lineTypeToolbar = document.getElementById('line-type-toolbar');
    if (lineTypeToolbar) {
        lineTypeToolbar.style.display = 'none';
    }
}

// --- Standalone diff panel (src/editor/diffPanel.ts) ---
// Reuses `createMergeView`, but replaces the whole surface rather than
// overlaying it: this bundle instance never built a main `EditorView`.
function showDiffPanel(container: HTMLElement, message: Extract<HostToWebviewMessage, { type: 'initDiff' }>): void {
    // Flushed before teardown for the same reason as `exitDiffMode`: `destroy`
    // drops a debounced edit instead of sending it. Reached here when the host
    // re-sends `initDiff` after an external change to the file.
    diffSync?.flush();
    diffSync?.destroy();
    diffSync = null;

    mergeView?.destroy();
    mergeView?.dom.remove();
    container.replaceChildren();

    // Absent when comparing against a commit: the badge is dropped entirely
    // rather than shown empty, leaving the two ref labels to speak.
    setScopeBadge(message.scopeLabel);
    setTextContent('diff-label-original', message.originalLabel);
    setTextContent('diff-label-modified', message.modifiedLabel);

    // Borrows `.cm-merge-container`'s height rule (src/styles/diff.css) so
    // the MergeView -- not `.editor-main` -- owns the scrollbar.
    container.classList.add('cm-merge-container');
    document.body.classList.add('diff-mode');

    // Editable only when the modified side is the working tree -- the index
    // and a commit cannot be written through a `WorkspaceEdit`, so the host
    // decides and says so here (see `isModifiedSideWritable`).
    mergeView = createMergeView({
        parent: container,
        original: message.original,
        modified: message.modified,
        editableModified: message.editable,
    });
    if (message.editable) {
        diffSync = createHostSync({ view: mergeView.b, postToHost });
    }
    diffModeActive = true;
}

function setTextContent(id: string, text: string): void {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = text;
    }
}

function setScopeBadge(scopeLabel: string | null): void {
    const element = document.getElementById('diff-label-scope');
    if (!element) {
        return;
    }
    element.textContent = scopeLabel ?? '';
    element.hidden = scopeLabel === null;
}

function init(): void {
    const container = document.getElementById('editor');
    if (!container) {
        console.error('Editor container not found');
        return;
    }

    const isDiffPanel = document.body.classList.contains('diff-panel');

    initFontToggle();
    if (!isDiffPanel) {
        initTocToggle();
    }

    // Both buttons default to `display: none` in the HTML
    // (src/editor/webviewContent.ts); updateDiffToggleVisibility and
    // enter/exitDiffMode take it from there once `diffAvailable` and
    // `toggleDiff` messages start arriving.
    document.getElementById('diff-toggle-btn')?.addEventListener('click', () => postToHost({ type: 'requestDiffToggle' }));
    document.getElementById('diff-close-btn')?.addEventListener('click', () => postToHost({ type: 'requestDiffToggle' }));
    document.getElementById('readonly-banner-btn')?.addEventListener('click', () => postToHost({ type: 'openBeautifulDiff' }));

    window.addEventListener('message', (event: MessageEvent) => {
        const message = event.data as HostToWebviewMessage;

        switch (message.type) {
            case 'init': {
                // `originalContent` is raw text; `content` has image paths
                // rewritten for display and must not be fed back in.
                const content = message.originalContent || message.content || '';
                setFontFamilySetting(message.fontFamily);
                // Set before initEditor() so its own initial recompute (see
                // initEditor) already sees the right HEAD content.
                headContent = message.headContent;
                initEditor(container, content, message.readOnly);
                if (message.readOnly) {
                    applyReadOnlyChrome();
                }
                // `message.diffMode`/`originalVersionContent` (start already
                // in diff mode) are not handled: `customEditorProvider.ts`
                // hardcodes `isDiffMode = false` for every `init` send, so
                // the host never actually sets them today.
                diffAvailable = message.diffAvailable;
                updateDiffToggleVisibility();
                console.log(`[markdown-beautiful-editor] webview cold start: ${(performance.now() - scriptEvalStart).toFixed(1)}ms`);
                break;
            }
            case 'initDiff': {
                setFontFamilySetting(message.fontFamily);
                // Stashed for `registerDiffPanelSerializer`, which gets this
                // back verbatim when the window is reloaded.
                vscode.setState(message.restoreState);
                showDiffPanel(container, message);
                break;
            }
            case 'update': {
                applyExternalUpdate(message.originalContent || message.content || '');
                diffAvailable = message.diffAvailable;
                // `applyExternalUpdate` only dispatches (and so only
                // triggers the onDocChanged-driven recompute) when the text
                // actually changed. A HEAD-only refresh (git commit, no
                // local edit) needs its own trigger.
                headContent = message.headContent;
                scheduleLineChangeRecompute();
                updateDiffToggleVisibility();
                break;
            }
            case 'focus': {
                view?.focus();
                break;
            }
            case 'toggleDiff': {
                // The host does not track diff-mode state itself -- it
                // sends this same message for both directions (see
                // `customEditorProvider.ts`'s `toggleDiffMode`) -- so
                // `planToggleDiff` (mergeView.ts) decides open vs. close
                // from `diffModeActive`, and gates "open" on there actually
                // being something to show.
                if (view) {
                    const transition = planToggleDiff({
                        active: diffModeActive,
                        originalVersionContent: message.originalVersionContent,
                        currentContent: view.state.doc.toString(),
                    });
                    if (transition.action === 'open') {
                        enterDiffMode(container, transition.original, transition.modified);
                    } else if (transition.action === 'close') {
                        exitDiffMode(container);
                    } else {
                        // Otherwise the click does nothing visible and reads
                        // as a broken button; the host owns user-facing
                        // messages, so it says so.
                        postToHost({ type: 'diffSkipped', reason: transition.reason });
                    }
                }
                break;
            }
            case 'fontFamily': {
                setFontFamilySetting(message.fontFamily);
                break;
            }
            case 'scrollToAnchor': {
                if (view) {
                    scrollToAnchorInEditor(view, message.slug);
                }
                break;
            }
        }
    });

    postToHost({ type: 'ready' });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
