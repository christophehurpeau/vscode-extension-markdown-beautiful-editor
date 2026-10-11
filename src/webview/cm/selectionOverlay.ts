/**
 * Repaints the selection over surfaces that hide it.
 *
 * `drawSelection()` (`./multipleSelections.ts`) draws its layer *behind*
 * `.cm-content`, so any construct with its own background — inline code,
 * fenced code, blockquotes, frontmatter — paints over it, completely when the
 * theme resolves that background to an opaque colour (Dark Modern does).
 * Nothing can sit between an element's background and its own text, so the
 * selection is re-expressed as decorations inside those surfaces: a mark on
 * the selected text, a line class on fully selected lines.
 * `cm-shell.css` styles them only within the occluding constructs; elsewhere
 * the layer already shows and a second fill would double a translucent
 * selection colour.
 */
import type { EditorState } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

export interface SelectionOverlayRanges {
    /** Start offsets of lines selected end to end, line break included. */
    lines: number[];
    marks: { from: number; to: number }[];
}

interface VisibleRange {
    from: number;
    to: number;
}

/** A line counts as fully selected the way `drawSelection()` draws it full
 *  width: the range starts at or before it and runs past its line break.
 *  Marks cover every selected character, fully selected lines included, since
 *  an inline code chip paints over its line as well as over the layer. */
export function selectionOverlayRanges(state: EditorState, visibleRanges: readonly VisibleRange[]): SelectionOverlayRanges {
    const lines = new Set<number>();
    const marks: SelectionOverlayRanges['marks'] = [];

    for (const range of state.selection.ranges) {
        if (range.empty) {
            continue;
        }
        for (const visible of visibleRanges) {
            const from = Math.max(range.from, visible.from);
            const to = Math.min(range.to, visible.to);
            if (from > to) {
                continue;
            }
            if (from < to) {
                marks.push({ from, to });
            }
            for (let pos = from; pos <= to;) {
                const line = state.doc.lineAt(pos);
                if (range.from <= line.from && range.to > line.to) {
                    lines.add(line.from);
                }
                pos = line.to + 1;
            }
        }
    }

    return { lines: [...lines], marks };
}

const selectedLine = Decoration.line({ class: 'mbe-selection-line' });
const selectedText = Decoration.mark({ class: 'mbe-selection' });

function buildSelectionOverlay(view: EditorView): DecorationSet {
    const { lines, marks } = selectionOverlayRanges(view.state, view.visibleRanges);
    return Decoration.set(
        [
            ...lines.map((from) => selectedLine.range(from)),
            ...marks.map(({ from, to }) => selectedText.range(from, to)),
        ],
        true,
    );
}

export const selectionOverlay = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = buildSelectionOverlay(view);
        }

        update(update: ViewUpdate): void {
            if (update.selectionSet || update.docChanged || update.viewportChanged) {
                this.decorations = buildSelectionOverlay(update.view);
            }
        }
    },
    { decorations: (plugin) => plugin.decorations },
);
