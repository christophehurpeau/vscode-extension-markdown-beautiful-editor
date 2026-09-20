/**
 * Custom line-number gutter — fixes gutter/content baseline misalignment.
 *
 * Replaces `@codemirror/view`'s `lineNumbers()`. CM6 forces each
 * `.cm-gutterElement`'s pixel HEIGHT to match its corresponding `.cm-line`'s
 * rendered height (see `GutterElement.update` in `@codemirror/view`, which
 * sets `style.height` directly) but does nothing about where the number's
 * text baseline sits *inside* that box. A block with one line of text and an
 * explicit height taller than that text's own line box does not centre the
 * text — it sits at the top, anchored by its own font metrics. So whenever
 * the gutter element's font-size/font-family differ from the content line's
 * (they always did: 0.85em mono vs 1em/2em/... proportional), the two
 * baselines land at different offsets from the row's top edge — worst on
 * headings, but present, if subtle, on every line.
 *
 * Fix: give the OUTER `.cm-gutterElement` the SAME line-affecting `md-*`
 * classes as its `.cm-line` (`lineStrutClass` below, reading the line
 * decorations `decorations.ts` actually builds, so this cannot silently
 * drift from what paints `.cm-line`). `src/styles/cm-shell.css`
 * then gives those classes the matching font-size/font-family, reproducing
 * the content line's own line-box metrics (its "strut"). The visible digits
 * live in a nested `.cm-lineNumberDigits` span with its own fixed small
 * mono size; by default CSS inline layout (`vertical-align: baseline`, the
 * initial value) aligns a nested inline box's baseline to its containing
 * line's baseline regardless of the box's own font-size, so the small
 * digits still land exactly on the strut's baseline.
 *
 * This covers the boundary classes too (`alert-first`, `blockquote-first`,
 * `md-code-block-first` and the alert family), which carry extra
 * `padding-top` and are synthesized inside `decorations.ts` rather than read
 * from `nodeClassMap.ts`'s flat table. An earlier version missed them.
 *
 * Scoped to the current viewport by construction: `lineMarker` below is
 * only called for `view.viewportLineBlocks` (see `@codemirror/view`'s
 * `syncGutters`), so this never builds decorations for more than the visible
 * lines — matching `decorations.ts`'s own viewport-scoped cost profile, not
 * the full-document work a `StateField` would reintroduce.
 */
import { StateEffect, StateField, type EditorState, type Extension, type Transaction } from '@codemirror/state';
import { EditorView, GutterMarker, gutter } from '@codemirror/view';
import { buildMarkdownDecorations } from './decorations';
import type { LineChangeKind } from '../editor/diff';

/** The `md-*` classes to mirror onto a line's `.cm-gutterElement`: exactly
 *  the line decorations `decorations.ts` paints on the corresponding
 *  `.cm-line`, which are the only ones that can affect its box metrics.
 *  Pure over a state + line range, so it is unit-testable without an
 *  `EditorView` (see `src/test/unit/lineNumberGutter.test.ts`). */
export function lineStrutClass(state: EditorState, from: number, to: number): string {
    const classes = new Set<string>();

    // Source of truth: the line decorations the content layer actually paints.
    // An earlier version walked the syntax tree here and consulted
    // `nodeClassMap.ts` directly, which silently missed every class that
    // `decorations.ts` *synthesizes* rather than reads from the flat table --
    // `alert-first`, `blockquote-first`, `md-code-block-first` and the alert
    // family. Those carry extra `padding-top`, so the gutter number drifted on
    // exactly the lines where alignment is most visible. Reading the built
    // decorations instead makes drift structurally impossible.
    const { lineDecorations } = buildMarkdownDecorations(state, [{ from, to }]);
    lineDecorations.between(from, to, (_from, _to, value) => {
        const cls = value.spec.class as string | undefined;
        for (const name of cls?.split(' ') ?? []) {
            if (name) {
                classes.add(name);
            }
        }
    });

    return [...classes].join(' ');
}

/**
 * Always-on git-change indicator (VS Code parity): sets a `StateEffect` of
 * the current document's line -> change-kind map (see `computeLineChangeMarkers`
 * in `../editor/diff.ts`). The heavy part -- diffing the whole document
 * against git HEAD -- is deliberately NOT done here or in this field's
 * `update`: `main.ts` debounces that off the hot path (measured: `diffLines`
 * over a several-thousand-line document with a large pending change can cost
 * hundreds of ms, unacceptable per keystroke) and dispatches only the
 * already-computed `Map` via this effect. This field just holds the latest
 * map so `lineMarker`/`lineMarkerChange` below can read and react to it
 * without threading extra state through `EditorView`.
 */
export const setLineChangeMarkers = StateEffect.define<Map<number, LineChangeKind>>();

const emptyLineChangeMarkers: Map<number, LineChangeKind> = new Map();

export const lineChangeMarkersField = StateField.define<Map<number, LineChangeKind>>({
    create: () => emptyLineChangeMarkers,
    update(value, tr: Transaction) {
        for (const effect of tr.effects) {
            if (effect.is(setLineChangeMarkers)) {
                return effect.value;
            }
        }
        return value;
    },
});

/** Dispatches a freshly computed change-marker map into `view`. The only
 *  intended caller is `main.ts`'s debounced recompute. */
export function dispatchLineChangeMarkers(view: EditorView, markers: Map<number, LineChangeKind>): void {
    view.dispatch({ effects: setLineChangeMarkers.of(markers) });
}

/** `LineChangeKind` -> the class painted on that line's `.cm-gutterElement`.
 *  Styled in `src/styles/cm-shell.css` as a narrow colour bar; deliberately
 *  never applied to `.cm-line` itself (unlike `lineStrutClass`'s `md-*`
 *  classes) -- this is a gutter-only indicator, the same way VS Code's own
 *  change gutter never paints the text line. */
const changeGutterClass: Record<LineChangeKind, string> = {
    added: 'cm-changed-added',
    modified: 'cm-changed-modified',
    removed: 'cm-changed-removed',
};

class LineNumberMarker extends GutterMarker {
    constructor(
        readonly number: number,
        readonly strutClass: string,
        readonly changeClass: string,
    ) {
        super();
        this.elementClass = [strutClass, changeClass].filter(Boolean).join(' ');
    }

    eq(other: LineNumberMarker): boolean {
        return (
            this.number === other.number &&
            this.strutClass === other.strutClass &&
            this.changeClass === other.changeClass
        );
    }

    toDOM(): HTMLElement {
        const digits = document.createElement('span');
        digits.className = 'cm-lineNumberDigits';
        digits.textContent = String(this.number);
        return digits;
    }
}

/** Same growth rule `@codemirror/view`'s `lineNumbers()` uses to size the
 *  gutter's reserved-width spacer: the largest number that fits in as many
 *  digits as the document's own last line number. */
function maxLineNumber(lines: number): number {
    let last = 9;
    while (last < lines) {
        last = last * 10 + 9;
    }
    return last;
}

/** Line-number gutter extension. See this file's header for why it exists
 *  instead of `@codemirror/view`'s `lineNumbers()`. Bundles
 *  `lineChangeMarkersField` alongside the gutter itself (rather than adding
 *  it separately in `extensions.ts`, which is frozen) so this file stays the
 *  single place that owns both the field and the marker it feeds. */
export function markdownLineNumbers(): Extension {
    return [
        lineChangeMarkersField,
        gutter({
            class: 'cm-lineNumbers',
            lineMarker(view, line) {
                const number = view.state.doc.lineAt(line.from).number;
                const changeKind = view.state.field(lineChangeMarkersField).get(number);
                const changeClass = changeKind ? changeGutterClass[changeKind] : '';
                return new LineNumberMarker(number, lineStrutClass(view.state, line.from, line.to), changeClass);
            },
            // The default recheck already covers doc/viewport changes;
            // this adds the one CM6 can't see on its own -- a fresh change
            // map arriving from the debounced recompute with the document
            // otherwise untouched (e.g. a new git HEAD after a commit).
            lineMarkerChange: (update) =>
                update.startState.field(lineChangeMarkersField) !== update.state.field(lineChangeMarkersField),
            initialSpacer(view) {
                return new LineNumberMarker(maxLineNumber(view.state.doc.lines), '', '');
            },
            updateSpacer(spacer, update) {
                const max = maxLineNumber(update.view.state.doc.lines);
                return (spacer as LineNumberMarker).number === max ? spacer : new LineNumberMarker(max, '', '');
            },
        }),
    ];
}
