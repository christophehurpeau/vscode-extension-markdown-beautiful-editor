/**
 * Editor "chrome" not owned by a more specific file: Cmd/Ctrl-held link,
 * image and footnote click/hover affordances, the `.cmd-held` cursor hint,
 * and cursor/scroll persistence across the panel being hidden and re-shown.
 * All of this used to live inline in `main.ts`'s `initEditor` (see `git show
 * main:src/webview/main.ts` around lines 1078-1180 for click handling, the
 * `mouseover` tooltip and the `cmd-held` toggle, and lines 258-282 for
 * `scrollToFootnote`/`resolveLinkReference`) and was dropped entirely by
 * WP-1's rewrite.
 *
 * Ported to CM6, not copied verbatim:
 *   - Position resolution is `view.posAtCoords()` + `syntaxTree(state)
 *     .resolveInner(pos)`, walking the ancestor chain for a `Link` / `Image`
 *     / `URL` (a bare GFM autolink parses as a standalone `URL` node, no
 *     `Autolink` wrapper) / `Autolink` / `Footnote` / `FootnoteDef` node --
 *     never DOM attribute reads. The decorations these nodes produce
 *     (`decorations.ts`) carry only classes, not the old `data-ref`/
 *     `data-footnote-id` attributes, so the semantic id/label has to come
 *     from the syntax tree's own sliceable sub-ranges (`FootnoteLabel`,
 *     `FootnoteDefLabel`, `LinkLabel`) instead.
 *   - `resolveLinkReference` used to scrape `.md-link-def` elements out of
 *     the live DOM -- wrong under viewport virtualization, since an
 *     off-screen definition simply isn't there. `collectLinkReferenceDefinitions`
 *     below iterates `LinkReference` nodes over the *whole* `syntaxTree`
 *     instead, independent of what is currently rendered. This is a
 *     correctness fix over the old behavior, not just a port.
 *   - `.cmd-held` toggles on `view.contentDOM` (see `src/styles/md-inline.css`),
 *     not `#editor` -- `#editor` is CM6's mount point and carries no box
 *     model of its own any more (`src/styles/cm-shell.css`'s header).
 *
 * Cursor/scroll persistence reuses `src/webview/editor/state.ts`'s
 * `saveState`/`getStoredState` unchanged: an absolute doc position converts
 * to/from that module's `{lineIndex, offset}` shape via `cursorPositionFromHead`/
 * `headFromCursorPosition` below, so no change to that module's tested
 * contract is needed.
 *
 * The `vscodeApi` parameter is passed in by `main.ts` rather than acquired
 * here: `acquireVsCodeApi()` throws if called twice in a webview session, and
 * `main.ts` already holds the one instance. Persistence and cross-file link
 * opening both need it; without it they degrade to inert rather than throwing.
 */
import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { linkDisplayUrl, parseLinkTarget, resolveReferenceUrl, type LinkDefinition } from '../../../shared/links';
import type { WebviewToHostMessage } from '../../../shared/messages';
import { getStoredState, saveState, type CursorPosition } from '../../editor/state';
import { extractHeadingsFromMarkdown, findHeadingIndexBySlug, findHeadingLineIndex } from '../../toc';

/** The subset of `acquireVsCodeApi()`'s return value this file needs --
 *  matches `main.ts`'s own inline declaration of the same global. */
export interface VscodeApi {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

export type InteractiveTarget =
    | { kind: 'link'; url: string }
    | { kind: 'image'; url: string }
    | { kind: 'footnoteRef'; id: string }
    | { kind: 'footnoteDef'; id: string };

/** The visible text between a `Link`'s first two `LinkMark`s (its `[`/`]`
 *  wrapping) -- the implicit reference label of a shortcut reference link
 *  (`[label]` with no following `(url)` or `[label]`), which has no `URL` or
 *  `LinkLabel` child of its own. Same range `decorations.ts`'s
 *  `handleLinkExtras` synthesizes `md-text` over. */
function linkVisibleText(state: EditorState, link: SyntaxNode): string {
    const marks = link.getChildren('LinkMark');
    if (marks.length < 2) {
        return '';
    }
    return state.doc.sliceString(marks[0].to, marks[1].from);
}

/** Every `[label]: url "title"` reference definition in the document,
 *  regardless of the current viewport -- an off-screen definition must still
 *  resolve a reference. Walks the whole `syntaxTree`, not `view.visibleRanges`. */
export function collectLinkReferenceDefinitions(state: EditorState): LinkDefinition[] {
    const defs: LinkDefinition[] = [];
    syntaxTree(state).iterate({
        enter(node) {
            if (node.name !== 'LinkReference') {
                return;
            }
            const label = node.node.getChild('LinkLabel');
            const url = node.node.getChild('URL');
            if (label && url) {
                defs.push({
                    label: state.doc.sliceString(label.from + 1, label.to - 1),
                    url: state.doc.sliceString(url.from, url.to),
                });
            }
        },
    });
    return defs;
}

/** Resolve the interactive (link/image/footnote) construct at a document
 *  position, walking `resolveInner(pos)`'s ancestor chain outward -- a
 *  click/hover position typically lands on a leaf (`LinkMark`, `FootnoteLabel`,
 *  the destination text itself) nested inside the construct that actually
 *  carries the meaning. Pure: no DOM, testable against a real `EditorState`. */
export function resolveInteractiveTargetAt(state: EditorState, pos: number): InteractiveTarget | null {
    for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
        switch (node.name) {
            case 'Autolink': {
                const url = node.getChild('URL');
                return url ? { kind: 'link', url: state.doc.sliceString(url.from, url.to) } : null;
            }
            case 'URL': {
                // Reached directly (not via the `Link`/`Image`/`Autolink`
                // cases below) either for a bare GFM autolink -- which parses
                // as a standalone `URL` node with no wrapping `Autolink` --
                // or when the position is over the destination text itself,
                // inside a `Link`/`Image`/`LinkReference`.
                if (node.parent?.name === 'LinkReference') {
                    // The definition line itself (`[label]: url`) was never
                    // click/hover-interactive in the old parser either --
                    // it rendered `md-link-def`, a different class the old
                    // handlers never matched.
                    return null;
                }
                const kind = node.parent?.name === 'Image' ? 'image' : 'link';
                return { kind, url: state.doc.sliceString(node.from, node.to) };
            }
            case 'Link': {
                const url = node.getChild('URL');
                if (url) {
                    return { kind: 'link', url: state.doc.sliceString(url.from, url.to) };
                }
                const label = node.getChild('LinkLabel');
                const ref = label ? state.doc.sliceString(label.from + 1, label.to - 1) : linkVisibleText(state, node);
                const resolved = resolveReferenceUrl(ref, collectLinkReferenceDefinitions(state));
                return resolved ? { kind: 'link', url: resolved } : null;
            }
            case 'Image': {
                const url = node.getChild('URL');
                return url ? { kind: 'image', url: state.doc.sliceString(url.from, url.to) } : null;
            }
            case 'Footnote': {
                const label = node.getChild('FootnoteLabel');
                return label ? { kind: 'footnoteRef', id: state.doc.sliceString(label.from, label.to) } : null;
            }
            case 'FootnoteDef': {
                const label = node.getChild('FootnoteDefLabel');
                return label ? { kind: 'footnoteDef', id: state.doc.sliceString(label.from, label.to) } : null;
            }
        }
    }
    return null;
}

/** The hover tooltip text for a link/image at `pos`, or `null` when there is
 *  none (including over a footnote, which never had a hover tooltip). */
export function resolveHoverTitle(state: EditorState, pos: number): string | null {
    const target = resolveInteractiveTargetAt(state, pos);
    if (!target || (target.kind !== 'link' && target.kind !== 'image')) {
        return null;
    }
    return linkDisplayUrl(target.url) || null;
}

/** Resolve a `#fragment` (same-document heading) to the doc position of its
 *  target line -- same lookup `main.ts`'s `scrollToAnchorInEditor` performs
 *  for a cross-file link landing back in this document. */
function resolveFragmentScrollPos(state: EditorState, fragment: string): number | null {
    const docText = state.doc.toString();
    const headingIndex = findHeadingIndexBySlug(extractHeadingsFromMarkdown(docText), fragment);
    if (headingIndex === null) {
        return null;
    }
    const lineIndex = findHeadingLineIndex(docText.split('\n'), headingIndex);
    return lineIndex === null ? null : state.doc.line(lineIndex + 1).from;
}

/** First `Footnote`/`FootnoteDef` node (by document order) whose label
 *  matches `id`, searched over the whole tree for the same virtualization
 *  reason `collectLinkReferenceDefinitions` does. */
function findFootnotePos(
    state: EditorState,
    nodeName: 'Footnote' | 'FootnoteDef',
    labelNodeName: 'FootnoteLabel' | 'FootnoteDefLabel',
    id: string,
): number | null {
    let found: number | null = null;
    syntaxTree(state).iterate({
        enter(node) {
            if (found !== null || node.name !== nodeName) {
                return;
            }
            const label = node.node.getChild(labelNodeName);
            if (label && state.doc.sliceString(label.from, label.to) === id) {
                found = node.from;
            }
        },
    });
    return found;
}

export type ChromeClickAction = { kind: 'scrollTo'; pos: number } | { kind: 'openLink'; url: string } | { kind: 'none' };

/** What a Cmd/Ctrl-click at `pos` should do: jump within the document
 *  (a `#fragment` link or a footnote ref/def crossing to its other side),
 *  ask the host to open something (a path, possibly with a `#fragment`, or
 *  an image), or nothing. Pure decision logic -- the DOM/host side effects
 *  live in `initChrome` below. */
export function resolveClickAction(state: EditorState, pos: number): ChromeClickAction {
    const target = resolveInteractiveTargetAt(state, pos);
    if (!target) {
        return { kind: 'none' };
    }
    if (target.kind === 'link' || target.kind === 'image') {
        const { path, fragment } = parseLinkTarget(target.url);
        if (target.kind === 'link' && path === '' && fragment) {
            const scrollPos = resolveFragmentScrollPos(state, fragment);
            return scrollPos === null ? { kind: 'none' } : { kind: 'scrollTo', pos: scrollPos };
        }
        return { kind: 'openLink', url: target.url };
    }
    const footnotePos =
        target.kind === 'footnoteRef'
            ? findFootnotePos(state, 'FootnoteDef', 'FootnoteDefLabel', target.id)
            : findFootnotePos(state, 'Footnote', 'FootnoteLabel', target.id);
    return footnotePos === null ? { kind: 'none' } : { kind: 'scrollTo', pos: footnotePos };
}

/** Absolute doc position -> `editor/state.ts`'s `{lineIndex, offset}` shape
 *  (0-based line index, offset within it) -- that module's contract predates
 *  CM6 but maps onto it exactly, so it stays unchanged. */
export interface OpenAffordance {
    action: ChromeClickAction;
    label: string;
}

/** The floating toolbar's open button for the link/image at `pos`, or `null`
 *  when there is nothing to open there. Footnote ref <-> def jumps are
 *  deliberately excluded -- they stay a Cmd/Ctrl-click affordance, since a
 *  button labelled "open" reads wrong for a jump within the document. Same
 *  pure `resolveClickAction` decision the Cmd/Ctrl-click path uses, so the two
 *  entry points cannot drift apart. */
export function resolveOpenAffordance(state: EditorState, pos: number): OpenAffordance | null {
    const target = resolveInteractiveTargetAt(state, pos);
    if (!target || (target.kind !== 'link' && target.kind !== 'image')) {
        return null;
    }
    const action = resolveClickAction(state, pos);
    switch (action.kind) {
        case 'scrollTo':
            return { action, label: 'Go to section' };
        case 'openLink':
            return { action, label: target.kind === 'image' ? 'Open image' : 'Open link' };
        default:
            // A `#fragment` pointing at no heading in this document.
            return null;
    }
}

export function cursorPositionFromHead(state: EditorState, head: number): CursorPosition {
    const line = state.doc.lineAt(head);
    return { lineIndex: line.number - 1, offset: head - line.from };
}

/** Inverse of `cursorPositionFromHead`, clamped to the current document in
 *  case it changed shape since the position was stored. */
export function headFromCursorPosition(state: EditorState, cursor: CursorPosition): number {
    const lineNumber = Math.min(Math.max(cursor.lineIndex + 1, 1), state.doc.lines);
    const line = state.doc.line(lineNumber);
    return line.from + Math.min(Math.max(cursor.offset, 0), line.length);
}

function scrollViewToPos(view: EditorView, pos: number): void {
    // Double rAF: same reasoning as `main.ts`'s `scrollToAnchorInEditor` --
    // a just-revealed background tab may not be laid out yet.
    requestAnimationFrame(() =>
        requestAnimationFrame(() => {
            view.dispatch({
                selection: { anchor: pos },
                effects: EditorView.scrollIntoView(pos, { y: 'start' }),
            });
            view.focus();
        }),
    );
}

/** Carry out a {@link ChromeClickAction} -- the effect half of
 *  `resolveClickAction`, shared by the Cmd/Ctrl-click handler below and the
 *  floating toolbar's open button (`./floatingToolbar.ts`). Inert without an
 *  `api` for the host-side half, matching this file's header. */
export function performClickAction(view: EditorView, api: VscodeApi | null, action: ChromeClickAction): void {
    if (action.kind === 'scrollTo') {
        scrollViewToPos(view, action.pos);
    } else if (action.kind === 'openLink') {
        const message: WebviewToHostMessage = { type: 'openLink', url: action.url };
        api?.postMessage(message);
    }
}

function resolveVscodeApi(injected?: VscodeApi): VscodeApi | null {
    if (injected) {
        return injected;
    }
    const globalAcquire = (globalThis as { acquireVsCodeApi?: () => VscodeApi }).acquireVsCodeApi;
    if (!globalAcquire) {
        return null;
    }
    try {
        return globalAcquire();
    } catch {
        // `main.ts` has already acquired the one instance the webview host
        // allows per session; see this file's header.
        return null;
    }
}

/** Find the closest ancestor (inclusive) of a `view.domAtPos()` result that
 *  carries the hover-tooltip classes, so the native tooltip attaches to the
 *  actual rendered link/image span (correct hover positioning) rather than
 *  the whole content area. Always on-screen by construction: `pos` came from
 *  a real mouse coordinate, so whatever renders there is currently visible,
 *  the one guarantee virtualization always keeps. */
function linkElementAt(view: EditorView, pos: number): HTMLElement | null {
    const { node } = view.domAtPos(pos);
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
    return el?.closest<HTMLElement>('.md-link, .md-image') ?? null;
}

export function initChrome(view: EditorView, root: HTMLElement, vscodeApi?: VscodeApi): void {
    const api = resolveVscodeApi(vscodeApi);

    // --- Cmd/Ctrl-click: links (inline, reference and bare autolinks),
    // images, and footnote reference <-> definition jumps. ---
    root.addEventListener('click', (event: MouseEvent) => {
        if (!(event.metaKey || event.ctrlKey)) {
            return;
        }
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) {
            return;
        }
        const action = resolveClickAction(view.state, pos);
        if (action.kind !== 'none') {
            event.preventDefault();
            performClickAction(view, api, action);
        }
    });

    // --- Hover tooltip: the resolved (and, for a reference link, looked-up)
    // URL as a native `title` on the specific hovered `.md-link`/`.md-image`
    // span, resolved lazily from the syntax tree rather than a `data-ref`
    // attribute (removed, see this file's header). ---
    let hoveredEl: HTMLElement | null = null;
    const clearHoverTitle = (): void => {
        hoveredEl?.removeAttribute('title');
        hoveredEl = null;
    };
    view.contentDOM.addEventListener('mousemove', (event: MouseEvent) => {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        const title = pos === null ? null : resolveHoverTitle(view.state, pos);
        if (!title) {
            clearHoverTitle();
            return;
        }
        const el = linkElementAt(view, pos as number);
        if (el !== hoveredEl) {
            clearHoverTitle();
            hoveredEl = el;
        }
        hoveredEl?.setAttribute('title', title);
    });
    view.contentDOM.addEventListener('mouseleave', clearHoverTitle);

    // --- `.cmd-held`: on `view.contentDOM`, matching `src/styles/md-inline.css`'s
    // `#editor.cmd-held` -> `.cm-content.cmd-held` rules. ---
    document.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.metaKey || event.ctrlKey) {
            view.contentDOM.classList.add('cmd-held');
        }
    });
    document.addEventListener('keyup', (event: KeyboardEvent) => {
        if (!event.metaKey && !event.ctrlKey) {
            view.contentDOM.classList.remove('cmd-held');
        }
    });

    // --- Cursor/scroll persistence across the panel being hidden and
    // re-shown. Inert without `api`; see this file's header. ---
    if (!api) {
        return;
    }

    const stored = getStoredState(api);
    if (stored?.cursorPosition) {
        const pos = headFromCursorPosition(view.state, stored.cursorPosition);
        const scrollTop = stored.scrollTop;
        requestAnimationFrame(() =>
            requestAnimationFrame(() => {
                view.dispatch({
                    selection: { anchor: pos },
                    effects: EditorView.scrollIntoView(pos, { y: 'start' }),
                });
                if (scrollTop) {
                    view.scrollDOM.scrollTop = scrollTop;
                }
            }),
        );
    }

    const persistViewState = (): void => {
        saveState(api, cursorPositionFromHead(view.state, view.state.selection.main.head), view.scrollDOM.scrollTop);
    };
    // Separate listeners from hostSync.ts's own blur/visibilitychange pair
    // (which flush the pending edit send) -- both are safe to register.
    window.addEventListener('blur', persistViewState);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            persistViewState();
        }
    });
}
