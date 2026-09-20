/**
 * TOC sidebar (`#toc`) wired to the CM6 view: scroll-spy and click-to-scroll
 * need `view.scrollDOM`/`view.lineBlockAtHeight()`/`EditorView.scrollIntoView`,
 * not `.line`/`.line-content` `querySelectorAll` -- those DOM classes don't
 * exist under CM6 (it renders `.cm-line`, virtualized: only the lines
 * currently on screen are real DOM nodes). The old `scrollToHeading`/
 * `setupScrollSpy`/`updateActiveHeading` in `src/webview/toc.ts` still
 * compile (their DOM queries just find nothing under CM6, a safe no-op) and
 * are intentionally left as-is there -- dead, superseded by this file, kept
 * only because `toc.test.ts` still exercises them directly with injected
 * stub dependencies. Heading extraction/slugging in `toc.ts` (pure, no DOM)
 * *is* this file's dependency, reused below rather than reimplemented.
 *
 * `main.ts` already calls `initTocPanel(view, tocEl)` once the editor is
 * constructed, passing the CM6 view and the `#toc` element; this file's body
 * is the whole implementation, no `main.ts` change needed. Click-to-scroll
 * follows the same shape as `main.ts`'s own `scrollToAnchorInEditor`
 * (dispatch a selection + `EditorView.scrollIntoView`).
 */
import { EditorView } from '@codemirror/view';
import { extractHeadingsFromMarkdown, findHeadingLineIndex } from '../../toc';

export interface TocPanelController {
    destroy(): void;
}

/** Matches the old rect-based scroll spy's 100px tolerance: a heading is
 *  considered "reached" once it scrolls to within this many pixels of the
 *  viewport top, not only once it is exactly at the top. */
const SCROLL_SPY_OFFSET_PX = 100;

/**
 * Given the 1-based line numbers where each TOC heading lives (in document
 * order) and the document line number currently judged "at the top" of the
 * viewport (see `topLineNumber` below), return the index of the heading that
 * should be marked active in the TOC sidebar: the last heading at or above
 * that line, or -1 before the first heading.
 *
 * Pure -- testable with plain arrays, no view/DOM needed. The old
 * `updateActiveHeading` computed the same thing via `getBoundingClientRect()`
 * over `.line` elements, which cannot work under CM6's viewport
 * virtualization (only visible lines exist in the DOM); this expresses the
 * *decision* purely over line numbers instead, leaving the height/DOM lookup
 * to `topLineNumber`.
 */
export function findActiveHeadingIndex(headingLineNumbers: readonly number[], topLineNumber: number): number {
    let active = -1;
    for (let i = 0; i < headingLineNumbers.length; i++) {
        if (headingLineNumbers[i] <= topLineNumber) {
            active = i;
        } else {
            break;
        }
    }
    return active;
}

/** 1-based line number of each TOC heading, in document order. A thin
 *  composition of `toc.ts`'s already-tested heading lookup rather than a
 *  second heading-detection implementation. */
function headingLineNumbers(docText: string): number[] {
    const headings = extractHeadingsFromMarkdown(docText);
    const lineTexts = docText.split('\n');
    const lines: number[] = [];
    for (let i = 0; i < headings.length; i++) {
        const lineIndex = findHeadingLineIndex(lineTexts, i);
        if (lineIndex !== null) {
            lines.push(lineIndex + 1);
        }
    }
    return lines;
}

/** The document line number CM6 considers "at the top" of the viewport, a
 *  fixed pixel offset down (see `SCROLL_SPY_OFFSET_PX`). `lineBlockAtHeight`/
 *  `scrollDOM.scrollTop` replace the deleted `getBoundingClientRect()` walk --
 *  they work in the same document-relative coordinate space, but ask CM6
 *  directly instead of measuring real DOM nodes that may not exist for an
 *  off-screen line. */
function topLineNumber(view: EditorView): number {
    const height = Math.min(
        Math.max(0, view.scrollDOM.scrollTop + SCROLL_SPY_OFFSET_PX),
        Math.max(0, view.contentHeight - 1),
    );
    return view.state.doc.lineAt(view.lineBlockAtHeight(height).from).number;
}

function setActiveTocLink(tocEl: HTMLElement, activeIndex: number): void {
    tocEl.querySelectorAll<HTMLElement>('.toc-link').forEach((link, i) => {
        const isActive = i === activeIndex;
        const wasActive = link.classList.contains('active');
        link.classList.toggle('active', isActive);
        if (isActive && !wasActive) {
            link.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
}

function scrollToHeadingIndex(view: EditorView, index: number): void {
    const lineIndex = findHeadingLineIndex(view.state.doc.toString().split('\n'), index);
    if (lineIndex === null) {
        return;
    }
    const line = view.state.doc.line(lineIndex + 1);
    // Double rAF: same reasoning as `main.ts`'s `scrollToAnchorInEditor` --
    // the panel may not be laid out yet if this editor was just revealed.
    requestAnimationFrame(() =>
        requestAnimationFrame(() => {
            view.dispatch({
                selection: { anchor: line.from },
                effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
            });
            view.focus();
        }),
    );
}

export function initTocPanel(view: EditorView, tocEl: HTMLElement): TocPanelController {
    // Delegated on the container rather than the individual `.toc-link`
    // elements: `toc.ts`'s `updateToc()` rebuilds `tocEl`'s entire innerHTML
    // (including a fresh set of the dead click handlers described in this
    // file's header) on every doc change, which would tear down per-element
    // listeners attached directly to them.
    const onClick = (event: MouseEvent): void => {
        const link = (event.target as HTMLElement).closest('.toc-link') as HTMLElement | null;
        if (!link) {
            return;
        }
        event.preventDefault();
        const index = Number.parseInt(link.dataset.headingIndex ?? '', 10);
        if (!Number.isNaN(index)) {
            scrollToHeadingIndex(view, index);
        }
    };
    tocEl.addEventListener('click', onClick);

    let ticking = false;
    const onScroll = (): void => {
        if (ticking) {
            return;
        }
        ticking = true;
        requestAnimationFrame(() => {
            const active = findActiveHeadingIndex(headingLineNumbers(view.state.doc.toString()), topLineNumber(view));
            setActiveTocLink(tocEl, active);
            ticking = false;
        });
    };
    view.scrollDOM.addEventListener('scroll', onScroll);

    return {
        destroy() {
            tocEl.removeEventListener('click', onClick);
            view.scrollDOM.removeEventListener('scroll', onScroll);
        },
    };
}
