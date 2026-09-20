/**
 * GitHub alert decorations (`> [!NOTE]` / `[!TIP]` / `[!IMPORTANT]` /
 * `[!WARNING]` / `[!CAUTION]`) — line decorations derived from `Blockquote`
 * nodes, not a custom block parser: a `> [!NOTE]` block already parses as an
 * ordinary `Blockquote` under CommonMark, and a parser registered
 * `before: 'Blockquote'` would have to reimplement blockquote continuation
 * and nesting for no reason (see the "corrections" section in
 * docs/plans/CODEMIRROR6_MIGRATION.md).
 *
 * `src/shared/alerts.ts` has the pure `parseAlertHeader` / `alertLineClasses`
 * logic the old regex parser used; this module only recovers the group
 * extents (first/last line, total) from the `Blockquote` node's own
 * `from`/`to` and delegates the per-line class decision to it.
 */
import type { SyntaxNodeRef } from '@lezer/common';
import type { EditorState } from '@codemirror/state';
import { alertHeaderRanges, alertLineClasses, parseAlertHeader } from '../../../shared/alerts';

export interface AlertLineClasses {
    /** 1-based line number, matching `@codemirror/state`'s `Line.number`. */
    line: number;
    classes: readonly string[];
}

export function alertLineClassesForBlockquote(
    state: EditorState,
    blockquote: SyntaxNodeRef,
): AlertLineClasses[] {
    const firstLine = state.doc.lineAt(blockquote.from);
    const type = parseAlertHeader(firstLine.text);
    if (!type) {
        return [];
    }

    const lastLine = state.doc.lineAt(Math.max(blockquote.from, blockquote.to - 1));
    const total = lastLine.number - firstLine.number + 1;

    const result: AlertLineClasses[] = [];
    for (let lineNumber = firstLine.number; lineNumber <= lastLine.number; lineNumber++) {
        result.push({
            line: lineNumber,
            classes: alertLineClasses({ index: lineNumber - firstLine.number, total, type }).split(' '),
        });
    }
    return result;
}

export interface AlertHeaderMark {
    from: number;
    to: number;
    /** `md-alert-type` for the label, `md-syntax` for the `[!` / `]`. */
    class: string;
}

/**
 * Mark ranges inside an alert's header line, in absolute document positions.
 * Without these the `[!NOTE]` label renders unstyled and the per-type colour
 * rules in `md-alerts.css` never match anything.
 */
export function alertHeaderMarks(state: EditorState, blockquote: SyntaxNodeRef): AlertHeaderMark[] {
    const firstLine = state.doc.lineAt(blockquote.from);
    const ranges = alertHeaderRanges(firstLine.text);
    if (!ranges) {
        return [];
    }
    return [
        { from: firstLine.from + ranges.type.from, to: firstLine.from + ranges.type.to, class: 'md-alert-type' },
        ...ranges.syntax.map((r) => ({
            from: firstLine.from + r.from,
            to: firstLine.from + r.to,
            class: 'md-syntax',
        })),
    ];
}
