/**
 * Floating formatting toolbar (`#formatting-toolbar`, shown on text
 * selection) — CM6 port of the toolbar half of `initToolbar`/
 * `showFormattingToolbar`/`showFormattingToolbarAtCursor`/
 * `updateToolbarButtonStates`/`hideFormattingToolbar` removed from
 * `main.ts`, plus the global `selectionchange` listener that drove them.
 *
 * Under CM6 that listener becomes an `EditorView.updateListener`, installed
 * via `StateEffect.appendConfig` on the already-built view (same pattern as
 * `cm/sync/hostSync.ts` and `cm/ui/lineTypeToolbar.ts` — `editorView.ts` is
 * frozen). It only ever fires for this view, so the old checks for "is the
 * selection inside the editor" and "is it inside `.line-content`" (a DOM
 * walk distinguishing content from line numbers/buttons) have no CM6
 * equivalent to port — they existed only because the old listener was global
 * (`document.addEventListener('selectionchange', ...)`).
 *
 * `getBoundingClientRect()` on a DOM `Range` becomes `view.coordsAtPos()` on
 * the selection's `from`/`to`. The old `left < 250` clamp for the collapsed-
 * cursor case (main.ts:533) was meant to keep the toolbar off the TOC, but
 * the TOC is actually 200px wide and can be hidden entirely (`.toc-hidden`
 * on `<body>`) — 250 was a stale guess, not a real measurement, and it only
 * even applied to that one case. `minLeftForToc` below replaces it with the
 * TOC's real width (plus the same 8px gutter `floatingToolbarPosition` uses
 * elsewhere) when the TOC is showing, `edgeGap` otherwise, applied
 * uniformly to both the selection and collapsed-cursor cases.
 *
 * The toolbar's own width/height are measured off the live element
 * (`offsetWidth`/`offsetHeight`) rather than hardcoded (the old 160x36),
 * so the position math keeps tracking reality if the markup or CSS changes.
 */
import { StateEffect, type EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { formattingAt, type FormattingAtCursor } from '../commands/formattingAt';
import { toggleInlineFormat } from '../commands/inlineFormat';
import { floatingToolbarPosition, type ToolbarAnchorRect } from '../../../shared/floatingToolbarPosition';
import { isInlineFormat } from '../../../shared/inlineFormat';
import { performClickAction, resolveOpenAffordance, type OpenAffordance, type VscodeApi } from './chrome';

export interface FloatingToolbarController {
    destroy(): void;
}

export type FloatingToolbarAlign = 'center' | 'start';

export interface FloatingToolbarDecision {
    show: boolean;
    anchorFrom: number;
    anchorTo: number;
    align: FloatingToolbarAlign;
    formatting: FormattingAtCursor;
    openAffordance: OpenAffordance | null;
}

function hasAnyFormatting(formatting: FormattingAtCursor): boolean {
    return formatting.bold || formatting.italic || formatting.code || formatting.strikethrough || formatting.link;
}

/**
 * Pure "should the toolbar show, where should it anchor, which buttons are
 * active" decision for `state.selection.main` — no DOM, unit-testable
 * against a real `EditorState`. The DOM layer below only adds
 * `view.coordsAtPos()` (to turn `anchorFrom`/`anchorTo` into pixels) and
 * `document`/`window` (for viewport/TOC clamping) on top of this.
 *
 * A non-empty selection always shows, anchored to its full range and
 * centered — matching the old `showFormattingToolbar`. A collapsed cursor
 * shows only when it sits inside a formatted construct (`formattingAt`,
 * the syntax-tree counterpart of the old DOM `.md-*` class walk), anchored
 * to the cursor itself and left-aligned — matching the old
 * `showFormattingToolbarAtCursor`. Both cases read active-button state from
 * the selection's start, matching the old code's use of
 * `selection.getRangeAt(0).startContainer`.
 *
 * `openAffordance` (`cm/ui/chrome.ts`) drives the open button, read at the
 * same position as `formatting`. It also widens the collapsed-cursor `show`
 * condition: a bare GFM autolink and an `![image](...)` carry no
 * `formattingAt` format (neither `Autolink` nor `Image` is one), so without
 * this the toolbar would never appear on them — and the open button is
 * precisely what they need it for.
 */
export function decideFloatingToolbar(state: EditorState): FloatingToolbarDecision {
    const selection = state.selection.main;

    if (selection.empty) {
        const formatting = formattingAt(state, selection.head);
        const openAffordance = resolveOpenAffordance(state, selection.head);
        return {
            show: hasAnyFormatting(formatting) || openAffordance !== null,
            anchorFrom: selection.head,
            anchorTo: selection.head,
            align: 'start',
            formatting,
            openAffordance,
        };
    }

    return {
        show: true,
        anchorFrom: selection.from,
        anchorTo: selection.to,
        align: 'center',
        formatting: formattingAt(state, selection.from),
        openAffordance: resolveOpenAffordance(state, selection.from),
    };
}

const edgeGap = 8;
const tocWidth = 200;

function minLeftForToc(): number {
    return document.body.classList.contains('toc-hidden') ? edgeGap : tocWidth + edgeGap;
}

function anchorRect(view: EditorView, from: number, to: number): ToolbarAnchorRect | null {
    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);
    if (!start || !end) {
        return null;
    }
    const left = Math.min(start.left, end.left);
    const right = Math.max(start.right, end.right);
    return { left, top: Math.min(start.top, end.top), bottom: Math.max(start.bottom, end.bottom), width: right - left };
}

export function initFloatingToolbar(view: EditorView, toolbarEl: HTMLElement, vscodeApi?: VscodeApi): FloatingToolbarController {
    const buttons = Array.from(toolbarEl.querySelectorAll<HTMLButtonElement>('button[data-format]'));
    const openButton = toolbarEl.querySelector<HTMLButtonElement>('button[data-action="open-link"]');

    function setActiveStates(formatting: FormattingAtCursor): void {
        for (const button of buttons) {
            const format = button.dataset.format;
            button.classList.toggle('active', !!format && isInlineFormat(format) && formatting[format]);
        }
    }

    /** `style.display`, not the `hidden` attribute: `.formatting-toolbar button`
     *  sets `display: flex`, which would win over `[hidden]`. Runs before
     *  `positionAt`, whose `offsetWidth` measurement must see the final row. */
    function setOpenButtonState(openAffordance: OpenAffordance | null): void {
        if (!openButton) {
            return;
        }
        openButton.style.display = openAffordance ? '' : 'none';
        if (openAffordance) {
            openButton.title = `${openAffordance.label} (⌘Click)`;
        }
    }

    function hide(): void {
        toolbarEl.style.display = 'none';
    }

    function positionAt(rect: ToolbarAnchorRect, align: FloatingToolbarAlign): void {
        // Measure off-screen first: the toolbar starts at `display: none`,
        // and swapping straight to its final `left`/`top` would otherwise
        // flash at the layout's default (0, 0) for a frame.
        toolbarEl.style.visibility = 'hidden';
        toolbarEl.style.display = 'flex';
        const { offsetWidth: toolbarWidth, offsetHeight: toolbarHeight } = toolbarEl;

        const { left, top } = floatingToolbarPosition(rect, {
            toolbarWidth,
            toolbarHeight,
            viewportWidth: window.innerWidth,
            minLeft: minLeftForToc(),
            align,
        });

        toolbarEl.style.left = `${left}px`;
        toolbarEl.style.top = `${top}px`;
        toolbarEl.style.visibility = 'visible';
    }

    function refresh(): void {
        if (!view.hasFocus) {
            hide();
            return;
        }

        const decision = decideFloatingToolbar(view.state);
        if (!decision.show) {
            hide();
            return;
        }

        const rect = anchorRect(view, decision.anchorFrom, decision.anchorTo);
        if (!rect) {
            hide();
            return;
        }

        setActiveStates(decision.formatting);
        setOpenButtonState(decision.openAffordance);
        positionAt(rect, decision.align);
    }

    function onMouseDown(event: MouseEvent): void {
        // Without this, mousedown on a button fires (and steals focus/the
        // selection away from the editor) before its click does.
        event.preventDefault();
    }

    function onClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;

        if (target.closest('button[data-action="open-link"]')) {
            // Recomputed from the live state rather than reusing the last
            // decision: the document may have changed since `refresh`.
            const affordance = resolveOpenAffordance(view.state, view.state.selection.main.from);
            if (affordance) {
                performClickAction(view, vscodeApi ?? null, affordance.action);
            }
            view.focus();
            return;
        }

        const format = target.closest<HTMLButtonElement>('button[data-format]')?.dataset.format;
        if (!format || !isInlineFormat(format)) {
            return;
        }
        toggleInlineFormat(format)({ state: view.state, dispatch: view.dispatch });
        view.focus();
    }

    toolbarEl.addEventListener('mousedown', onMouseDown);
    toolbarEl.addEventListener('click', onClick);

    view.dispatch({
        effects: StateEffect.appendConfig.of(
            EditorView.updateListener.of((update) => {
                if (update.selectionSet || update.docChanged || update.focusChanged) {
                    refresh();
                }
            }),
        ),
    });

    hide();

    return {
        destroy(): void {
            toolbarEl.removeEventListener('mousedown', onMouseDown);
            toolbarEl.removeEventListener('click', onClick);
            hide();
        },
    };
}
