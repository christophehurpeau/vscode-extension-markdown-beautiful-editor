/**
 * The decoration `ViewPlugin`: walks `syntaxTree(state)` over the view's
 * visible ranges and turns Lezer nodes into three Prec-layered decoration
 * sets, per the fixed architecture in `.claude/agents/cm6-migration.md`:
 *
 *   - line decorations   (Prec.lowest)  — one `Decoration.line` per line,
 *     classes accumulated from every node touching that line. Used for
 *     anything needing a block box (background/border/padding); a mark
 *     cannot carry one, it is split at line boundaries.
 *   - construct marks    (Prec.default) — `Decoration.mark` over a whole
 *     construct's range (e.g. the entire `**bold**` span).
 *   - leaf/syntax marks  (Prec.highest) — `Decoration.mark` over delimiter
 *     ranges only (e.g. the `**`/`*`/`` ` `` characters). Higher precedence
 *     creates the inner DOM node, which is what makes `md-syntax` render
 *     *inside* `md-bold` rather than beside it.
 *
 * `src/shared/nodeClassMap.ts` is the single source of truth for which
 * Lezer node name maps to which layer + class (CONVENTION (a)); this file is
 * the mechanical tree walk that applies it. Most constructs need nothing
 * more: look up `nodeClassEntry(node.name)` and push one decoration.
 *
 * A handful of node names need something the flat map cannot express by
 * itself, and get a small special-case function below (WP-H) in addition to
 * (not instead of) their map lookup:
 *   - `Blockquote`   ancestor-depth `md-quote-1/2/3` (capped) and
 *                    `blockquote-first`/`blockquote-last` boundary classes.
 *   - `FencedCode`   `md-code-block-first`/`md-code-block-last` boundaries.
 *   - `SetextHeading1/2` its mapped `md-heading md-hN` class stops at the
 *                    title line(s); the `===`/`---` line underneath gets
 *                    `md-setext-underline` instead (see
 *                    `setextUnderlineLine` below).
 *   - `HorizontalRule` an inner `md-hr-text` mark over the same range.
 *   - `Escape`       a synthesized `md-syntax` mark over just the backslash
 *                    (`Escape` has no child marks of its own).
 *   - `Strikethrough` a synthesized `md-strike-text` mark over the range
 *                    between its two `StrikethroughMark`s — `text-decoration`
 *                    propagates to descendants, so it cannot live on
 *                    `.md-strike` itself without also striking the `~~`.
 *   - `Link`         a synthesized `md-text` mark over the range between its
 *                    first two `LinkMark`s, and, when it has a `LinkLabel`
 *                    child (reference-style `[text][label]`), an additional
 *                    `md-ref-link` mark over the whole span.
 *   - `Image`        a synthesized `md-alt` mark (Prec.highest, like
 *                    `md-syntax`/`md-url`) over the range between its first
 *                    two `LinkMark`s.
 *   - `Table`        per-cell classes for its `TableCell`/`TableDelimiter`
 *                    children (see `handleTable` below for why those two
 *                    node names can't just be flat-map entries: the same
 *                    `TableDelimiter` node name means a single `|` inside a
 *                    header/body row, but the *entire* delimiter row
 *                    (`|:--|:-:|`) when it is `Table`'s own direct child —
 *                    one node, two different jobs, textually re-split per
 *                    `docs/plans/CODEMIRROR6_MIGRATION.md`'s note).
 *   - `Task`         its class is conditional (`md-task-checked` vs.
 *                    `md-task-unchecked`, read off its `TaskMarker`'s text),
 *                    so it has no entry in the flat map at all.
 *   - `LinkLabel`    always splits into `md-syntax` on its two bracket
 *                    characters plus `md-ref` on the inner text — its range
 *                    *includes* the brackets, unlike other bracketed nodes.
 *   - `LinkTitle`    the same node name renders as `md-link-title` inside a
 *                    `Link`/`Image` but `md-link-def-title` inside a
 *                    `LinkReference` — again no single flat-map class works.
 *
 * Only `Decoration.mark()` and `Decoration.line()` are used, never
 * `Decoration.replace()` or widgets — markdown syntax stays visible and
 * directly editable (see the non-negotiable rule in
 * `.claude/agents/cm6-migration.md`).
 *
 * Never descend into a fenced code block's own `CodeText` region: that is a
 * nested language's tokens (highlighted by `codeLanguages` in
 * `./extensions.ts`), not markdown, and must never receive an `md-*` class.
 * `buildMarkdownDecorations` is exported separately from the `ViewPlugin` so
 * it can be unit-tested directly against a plain `EditorState` — no `EditorView`
 * / DOM needed (CONVENTION (c), see `src/test/unit/decorations.test.ts`).
 */
import { syntaxTree } from '@codemirror/language';
import type { EditorState, Range } from '@codemirror/state';
import { Prec } from '@codemirror/state';
import {
    Decoration,
    EditorView,
    ViewPlugin,
    type DecorationSet,
    type PluginValue,
    type ViewUpdate,
} from '@codemirror/view';
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common';
import { nodeClassEntry } from '../../shared/nodeClassMap';
import { parseTableColumns, type TableColumn } from '../../shared/tableLayout';
import { alertHeaderMarks, alertLineClassesForBlockquote } from './decorations/alerts';

export interface MarkdownDecorationSets {
    lineDecorations: DecorationSet;
    markDecorations: DecorationSet;
    syntaxDecorations: DecorationSet;
}

/** Number of enclosing `Blockquote` nodes (including this one), uncapped. */
function blockquoteDepth(node: SyntaxNode): number {
    let depth = 0;
    for (let n: SyntaxNode | null = node; n; n = n.parent) {
        if (n.name === 'Blockquote') {
            depth++;
        }
    }
    return depth;
}

/** Split a `TableDelimiter` row's own text (`"|:--|:-:|"`) into its cells,
 *  dropping the empty edges produced by the leading/trailing pipe. */
function splitDelimiterRowCells(rowText: string): string[] {
    return rowText.split('|').slice(1, -1);
}

export function buildMarkdownDecorations(
    state: EditorState,
    ranges: readonly { from: number; to: number }[],
): MarkdownDecorationSets {
    const markRanges: Range<Decoration>[] = [];
    const syntaxRanges: Range<Decoration>[] = [];
    // Per-line accumulated classes, keyed by the line's `from` position so
    // lines touched by more than one node (e.g. a multi-line construct)
    // collect every class before a single `Decoration.line` is emitted.
    const lineClasses = new Map<number, Set<string>>();

    const addLineClasses = (from: number, to: number, cls: string): void => {
        let pos = from;
        while (pos <= to) {
            const line = state.doc.lineAt(pos);
            const classes = lineClasses.get(line.from) ?? new Set<string>();
            classes.add(cls);
            lineClasses.set(line.from, classes);
            pos = line.to + 1;
        }
    };
    const addLineClassAt = (pos: number, cls: string): void => addLineClasses(pos, pos, cls);

    /** `Blockquote`-only extras: ancestor-depth `md-quote-N` (capped at 3)
     *  and, for the outermost quote in a nesting, the first/last boundary
     *  lines of the whole block (used for corner rounding in CSS). Also the
     *  wiring point for WP-A's GitHub alerts (`./decorations/alerts.ts`) —
     *  it returns `[]` until that package implements it, at which point its
     *  line classes merge in here with no further changes needed. */
    const handleBlockquoteExtras = (node: SyntaxNode): void => {
        const depth = Math.min(blockquoteDepth(node), 3);
        addLineClasses(node.from, node.to, `md-quote-${depth}`);
        if (depth === 1) {
            const firstLine = state.doc.lineAt(node.from);
            const lastLine = state.doc.lineAt(Math.max(node.from, node.to - 1));
            addLineClassAt(firstLine.from, 'blockquote-first');
            addLineClassAt(lastLine.from, 'blockquote-last');
        }
        for (const { line, classes } of alertLineClassesForBlockquote(state, node)) {
            const lineFrom = state.doc.line(line).from;
            for (const cls of classes) {
                addLineClassAt(lineFrom, cls);
            }
        }
        // The `[!NOTE]` label itself: without these the per-type colour rules
        // in md-alerts.css have nothing to match.
        for (const mark of alertHeaderMarks(state, node)) {
            const target = mark.class === 'md-syntax' ? syntaxRanges : markRanges;
            target.push(Decoration.mark({ class: mark.class }).range(mark.from, mark.to));
        }
    };

    /** `FencedCode`-only extra: boundary classes for corner rounding on the
     *  fence's first/last line, matching the `md-code-block` background
     *  line class from the flat map. */
    const handleFencedCodeExtras = (node: SyntaxNode): void => {
        const firstLine = state.doc.lineAt(node.from);
        const lastLine = state.doc.lineAt(Math.max(node.from, node.to - 1));
        addLineClassAt(firstLine.from, 'md-code-block-first');
        addLineClassAt(lastLine.from, 'md-code-block-last');
    };

    /** The `===`/`---` line of a setext heading. A `SetextHeading1/2` node
     *  spans its title *and* that underline, so applying the mapped
     *  `md-heading md-hN` class over the whole node gave the underline a
     *  full heading line box — 2em metrics plus the heading's own vertical
     *  padding — which is what opened a dead band between a title and the
     *  line declaring it one. The underline is syntax, not a second heading
     *  line: it keeps normal metrics and `md-syntax`'s muted colour, the way
     *  a `#` marker sits on the title line itself for an ATX heading. */
    const setextUnderlineLine = (from: number, to: number): { from: number; to: number } =>
        state.doc.lineAt(Math.max(from, to - 1));

    const isSetextHeading = (nodeName: string): boolean =>
        nodeName === 'SetextHeading1' || nodeName === 'SetextHeading2';

    /** `Escape` has no child marks of its own (unlike e.g. `InlineCode`'s
     *  `CodeMark`) — synthesize `md-syntax` over just the backslash. */
    const handleEscapeExtras = (node: SyntaxNode): void => {
        syntaxRanges.push(Decoration.mark({ class: 'md-syntax' }).range(node.from, node.from + 1));
    };

    /** `text-decoration` propagates to descendants and cannot be undone on
     *  a child, so it cannot live on `.md-strike` (that would strike the
     *  `~~` too). Synthesize `md-strike-text` over the range between the
     *  two `StrikethroughMark`s instead. */
    const handleStrikethroughExtras = (node: SyntaxNode): void => {
        const marks = node.getChildren('StrikethroughMark');
        if (marks.length === 2) {
            markRanges.push(Decoration.mark({ class: 'md-strike-text' }).range(marks[0].to, marks[1].from));
        }
    };

    /** `Link` has no node for its visible text — synthesize `md-text` over
     *  the range between its first two `LinkMark`s (the `[`/`]` wrapping the
     *  text, present identically for both inline `[text](url)` and
     *  reference-style `[text][label]` links). A reference-style link is
     *  distinguished by having a `LinkLabel` child, which gets an additional
     *  `md-ref-link` mark over the whole span (alongside the flat map's
     *  unconditional `md-link`). */
    const handleLinkExtras = (node: SyntaxNode): void => {
        const marks = node.getChildren('LinkMark');
        if (marks.length >= 2) {
            markRanges.push(Decoration.mark({ class: 'md-text' }).range(marks[0].to, marks[1].from));
        }
        if (node.getChild('LinkLabel')) {
            markRanges.push(Decoration.mark({ class: 'md-ref-link' }).range(node.from, node.to));
        }
    };

    /** `Image` has no node for its alt text — synthesize `md-alt` over the
     *  range between its first two `LinkMark`s (`![`/`]`), at Prec.highest
     *  like the other leaf marks (`md-syntax`, `md-url`). */
    const handleImageExtras = (node: SyntaxNode): void => {
        const marks = node.getChildren('LinkMark');
        if (marks.length >= 2) {
            syntaxRanges.push(Decoration.mark({ class: 'md-alt' }).range(marks[0].to, marks[1].from));
        }
    };

    /** `LinkLabel`'s range *includes* its brackets (unlike other bracketed
     *  constructs, where the brackets are separate `LinkMark` nodes) — split
     *  it into `md-syntax` on the two bracket characters and `md-ref` on the
     *  inner text. Used identically for a reference link's `[label]` and a
     *  link reference definition's `[label]:`. */
    const handleLinkLabel = (node: SyntaxNodeRef): void => {
        syntaxRanges.push(Decoration.mark({ class: 'md-syntax' }).range(node.from, node.from + 1));
        syntaxRanges.push(Decoration.mark({ class: 'md-syntax' }).range(node.to - 1, node.to));
        if (node.to - 1 > node.from + 1) {
            markRanges.push(Decoration.mark({ class: 'md-ref' }).range(node.from + 1, node.to - 1));
        }
    };

    /** Same node name, two different classes depending on parent: a title
     *  inside `Link`/`Image` vs. inside a `LinkReference` (a link reference
     *  definition, `[label]: url "title"`). */
    const handleLinkTitle = (node: SyntaxNode): void => {
        const cls = node.parent?.name === 'LinkReference' ? 'md-link-def-title' : 'md-link-title';
        markRanges.push(Decoration.mark({ class: cls }).range(node.from, node.to));
    };

    /** `Task`'s class is conditional on its `TaskMarker`'s text (`[x]`/`[X]`
     *  vs. `[ ]`), so — unlike every other construct here — it has no entry
     *  in the flat map at all; this function is its *entire* handling. */
    const handleTask = (node: SyntaxNode): void => {
        const marker = node.getChild('TaskMarker');
        const checked = marker ? /[xX]/.test(state.doc.sliceString(marker.from, marker.to)) : false;
        const cls = checked ? 'md-task md-task-checked' : 'md-task md-task-unchecked';
        markRanges.push(Decoration.mark({ class: cls }).range(node.from, node.to));
    };

    /** `Table`'s per-cell alignment. `TableCell`/`TableDelimiter` are
     *  deliberately absent from the flat map (see this file's header) — a
     *  `TableCell`'s class needs its column index, and a `TableDelimiter`
     *  means either a single `|` (inside `TableHeader`/`TableRow`) or, once
     *  per table, the *entire* delimiter row (`Table`'s own direct child) —
     *  the same node name doing two different jobs. Per-column alignment
     *  is not exposed as nodes at all; it is recovered by re-splitting that
     *  standalone delimiter row's own text on `|` and reusing
     *  `parseTableColumns` (`src/shared/tableLayout.ts`) — do not
     *  reimplement its alignment logic here.
     *
     *  This does not `return false` from the walk: `TableCell` content is
     *  itself inline-parsed (`**bold**`, links, etc. all work inside a
     *  cell), so the generic per-node walk must still descend into it. */
    const handleTable = (node: SyntaxNode): void => {
        const delimiterRow = node.getChild('TableDelimiter');
        const columns: TableColumn[] = delimiterRow
            ? parseTableColumns([splitDelimiterRowCells(state.doc.sliceString(delimiterRow.from, delimiterRow.to))])
            : [];

        const emitRowCells = (row: SyntaxNode): void => {
            let colIndex = 0;
            for (let child = row.firstChild; child; child = child.nextSibling) {
                if (child.name === 'TableDelimiter') {
                    syntaxRanges.push(Decoration.mark({ class: 'md-syntax' }).range(child.from, child.to));
                } else if (child.name === 'TableCell') {
                    const align = columns[colIndex]?.align ?? 'none';
                    markRanges.push(
                        Decoration.mark({ class: `md-table-cell md-col-${align}` }).range(child.from, child.to),
                    );
                    colIndex++;
                }
            }
        };

        const header = node.getChild('TableHeader');
        if (header) {
            emitRowCells(header);
        }
        for (let row = header?.nextSibling ?? node.firstChild; row; row = row.nextSibling) {
            if (row.name === 'TableRow') {
                emitRowCells(row);
            }
        }

        if (delimiterRow) {
            const text = state.doc.sliceString(delimiterRow.from, delimiterRow.to);
            let cellStart = -1;
            let colIndex = 0;
            for (let i = 0; i < text.length; i++) {
                if (text[i] !== '|') {
                    continue;
                }
                syntaxRanges.push(
                    Decoration.mark({ class: 'md-syntax' }).range(delimiterRow.from + i, delimiterRow.from + i + 1),
                );
                if (cellStart >= 0) {
                    const align = columns[colIndex]?.align ?? 'none';
                    markRanges.push(
                        Decoration.mark({ class: `md-table-cell md-table-sep md-col-${align}` }).range(
                            delimiterRow.from + cellStart,
                            delimiterRow.from + i,
                        ),
                    );
                    colIndex++;
                }
                cellStart = i + 1;
            }
        }
    };

    for (const { from, to } of ranges) {
        syntaxTree(state).iterate({
            from,
            to,
            enter(node) {
                // A nested language's own tokens (inside a fenced code
                // block) are never markdown constructs — do not descend.
                if (node.name === 'CodeText') {
                    return false;
                }

                const entry = nodeClassEntry(node.name);
                if (entry) {
                    switch (entry.layer) {
                        case 'mark':
                            markRanges.push(Decoration.mark({ class: entry.class }).range(node.from, node.to));
                            break;
                        case 'syntax':
                            syntaxRanges.push(Decoration.mark({ class: entry.class }).range(node.from, node.to));
                            break;
                        case 'line': {
                            const lineTo = isSetextHeading(node.name)
                                ? setextUnderlineLine(node.from, node.to).from - 1
                                : node.to;
                            addLineClasses(node.from, Math.max(node.from, lineTo), entry.class);
                            break;
                        }
                    }
                }

                switch (node.name) {
                    case 'Blockquote':
                        handleBlockquoteExtras(node.node);
                        break;
                    case 'FencedCode':
                        handleFencedCodeExtras(node.node);
                        break;
                    case 'SetextHeading1':
                    case 'SetextHeading2': {
                        const underline = setextUnderlineLine(node.from, node.to);
                        addLineClasses(node.from, Math.max(node.from, underline.from - 1), 'md-setext-title');
                        addLineClassAt(underline.from, 'md-setext-underline');
                        break;
                    }
                    case 'HorizontalRule':
                        markRanges.push(Decoration.mark({ class: 'md-hr-text' }).range(node.from, node.to));
                        break;
                    case 'Escape':
                        handleEscapeExtras(node.node);
                        break;
                    case 'Strikethrough':
                        handleStrikethroughExtras(node.node);
                        break;
                    case 'Link':
                        handleLinkExtras(node.node);
                        break;
                    case 'Image':
                        handleImageExtras(node.node);
                        break;
                    case 'LinkLabel':
                        handleLinkLabel(node);
                        break;
                    case 'LinkTitle':
                        handleLinkTitle(node.node);
                        break;
                    case 'Task':
                        handleTask(node.node);
                        break;
                    case 'Table':
                        handleTable(node.node);
                        break;
                }
            },
        });
    }

    const lineRanges: Range<Decoration>[] = [...lineClasses.entries()].map(([from, classes]) =>
        Decoration.line({ class: [...classes].join(' ') }).range(from),
    );

    return {
        lineDecorations: Decoration.set(lineRanges, true),
        markDecorations: Decoration.set(markRanges, true),
        syntaxDecorations: Decoration.set(syntaxRanges, true),
    };
}

class MarkdownDecorationsPlugin implements PluginValue, MarkdownDecorationSets {
    lineDecorations: DecorationSet;
    markDecorations: DecorationSet;
    syntaxDecorations: DecorationSet;

    constructor(view: EditorView) {
        const built = buildMarkdownDecorations(view.state, view.visibleRanges);
        this.lineDecorations = built.lineDecorations;
        this.markDecorations = built.markDecorations;
        this.syntaxDecorations = built.syntaxDecorations;
    }

    update(update: ViewUpdate): void {
        if (!update.docChanged && !update.viewportChanged) {
            return;
        }
        const built = buildMarkdownDecorations(update.state, update.view.visibleRanges);
        this.lineDecorations = built.lineDecorations;
        this.markDecorations = built.markDecorations;
        this.syntaxDecorations = built.syntaxDecorations;
    }
}

const markdownDecorationsPlugin = ViewPlugin.fromClass(MarkdownDecorationsPlugin);

const markdownLineDecorations = Prec.lowest(
    EditorView.decorations.of((view) => view.plugin(markdownDecorationsPlugin)?.lineDecorations ?? Decoration.none),
);
const markdownMarkDecorations = EditorView.decorations.of(
    (view) => view.plugin(markdownDecorationsPlugin)?.markDecorations ?? Decoration.none,
);
const markdownSyntaxDecorations = Prec.highest(
    EditorView.decorations.of((view) => view.plugin(markdownDecorationsPlugin)?.syntaxDecorations ?? Decoration.none),
);

/** The full decoration extension: add this once to `./extensions.ts`. */
export const markdownDecorations = [
    markdownDecorationsPlugin,
    markdownLineDecorations,
    markdownMarkDecorations,
    markdownSyntaxDecorations,
];
