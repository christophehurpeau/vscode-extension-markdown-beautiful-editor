/**
 * Find/replace (Cmd+F) for the editing surface.
 *
 * `@codemirror/search`'s own panel is used rather than VS Code's webview find
 * widget (`webviewOptions.enableFindWidget`): that widget searches the
 * webview's DOM, and CM6 only renders the lines inside the viewport, so it
 * would silently find nothing outside the visible window of a long document.
 *
 * VS Code's webview preload calls `preventDefault()` on Cmd/Ctrl+F before
 * forwarding it to the host (`isFindEvent` in the webview `pre/index.html`),
 * which stops the browser's native find but does NOT stop the event reaching
 * this keymap — and with no find widget enabled the host has no Cmd+F
 * keybinding that matches while a webview holds focus.
 *
 * The panel drops its replace row by itself when `state.readOnly` is set, so
 * the read-only surfaces (a diff pane, a non-`file:` document) get find-only
 * without any extra wiring here.
 */
import { Prec, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, keymap, type ViewUpdate } from '@codemirror/view';
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap, searchPanelOpen } from '@codemirror/search';

/**
 * Titles for the panel's controls, keyed by the `name` the library gives each
 * one. The three option toggles need them most: `src/styles/search.css`
 * replaces their text with VS Code's own icons, and an icon with no tooltip
 * is a guess. The shortcuts are named here rather than in the CSS because
 * they come from `searchKeymap` above.
 */
const panelControlTitles: Record<string, string> = {
    case: 'Match case',
    re: 'Use regular expression',
    word: 'Match whole word',
    next: 'Next match (Enter)',
    prev: 'Previous match (Shift+Enter)',
    select: 'Select all matches',
    replace: 'Replace',
    replaceAll: 'Replace all',
    close: 'Close (Escape)',
};

function annotateSearchPanel(view: EditorView): void {
    const panel = view.dom.querySelector('.cm-panel.cm-search');
    if (!panel) {
        return;
    }
    for (const [name, title] of Object.entries(panelControlTitles)) {
        const control = panel.querySelector(`[name="${name}"]`);
        // The option toggles are the checkbox's `<label>` once the CSS has
        // turned it into a box; a plain button is its own target.
        const target = control?.closest('label') ?? control;
        target?.setAttribute('title', title);
    }
}

/**
 * The panel is the library's, so its titles have to be set on the DOM it
 * builds. Only a transition from "no panel" to "panel" does any work — the
 * keystroke path must not carry a DOM query — and the `requestAnimationFrame`
 * is there because the panel element is created by CM's own panel plugin
 * during the same update cycle this sees.
 */
const searchPanelTitles = ViewPlugin.fromClass(class {
    private open: boolean;

    constructor(view: EditorView) {
        this.open = searchPanelOpen(view.state);
    }

    update(update: ViewUpdate): void {
        const open = searchPanelOpen(update.state);
        if (open === this.open) {
            return;
        }
        this.open = open;
        if (open) {
            requestAnimationFrame(() => annotateSearchPanel(update.view));
        }
    }
});

export const markdownSearch: Extension = [
    search({ top: true }),
    highlightSelectionMatches(),
    searchPanelTitles,
    // Above `defaultKeymap`, which binds Escape (simplifySelection) and, on
    // mac, Ctrl-f (cursorCharRight). `closeSearchPanel` returns false with no
    // panel open, so Escape still falls through to the default binding.
    Prec.high(keymap.of(searchKeymap)),
];

export interface FindShortcutEvent {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
}

export function isFindShortcut(event: FindShortcutEvent): boolean {
    return event.key.toLowerCase() === 'f'
        && (event.metaKey || event.ctrlKey)
        && !event.altKey
        && !event.shiftKey;
}

export interface GlobalFindShortcutOptions {
    /**
     * The surface that currently owns the document — the merge view's
     * modified pane while diff mode is on, the main view otherwise. Resolved
     * per keystroke, not captured, so it follows the diff toggle.
     */
    resolveView: () => EditorView | null;
}

/**
 * Cmd+F while focus sits outside the editor — in the TOC panel, on a toolbar
 * button — would otherwise do nothing at all, since the keymap above only
 * fires for a focused view. Routes those to the document's current surface.
 */
export function initGlobalFindShortcut({ resolveView }: GlobalFindShortcutOptions): void {
    document.addEventListener('keydown', (event: KeyboardEvent) => {
        if (!isFindShortcut(event)) {
            return;
        }
        const view = resolveView();
        // Focus inside the view (content or search panel) means the keymap
        // above already handled it; handling it here too would re-open the
        // panel on top of itself.
        if (!view || view.hasFocus || view.dom.contains(document.activeElement)) {
            return;
        }
        event.preventDefault();
        view.focus();
        openSearchPanel(view);
    });
}
