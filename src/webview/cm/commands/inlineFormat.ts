/**
 * Inline formatting commands (bold/italic/code/strikethrough/link) — the CM6
 * counterpart of the old `applyInlineFormat`/`findFormattingSpanAtCursor` in
 * `main.ts` (deleted along with the ~600-line toolbar/formatting layer, see
 * docs/plans/CODEMIRROR6_MIGRATION.md's "under-scoped" section 1).
 *
 * Reuses the pure toggle logic in `src/shared/inlineFormat.ts` unchanged —
 * this file's job is only to translate an `EditorState` selection into the
 * `{text, from, to}` that function expects (a single line's text plus
 * offsets into it) and dispatch the resulting change as a transaction.
 *
 * Selection behavior (old semantics recovered from `git show
 * main:src/webview/main.ts`, `applyInlineFormat` ~615-748):
 * - Collapsed cursor: old code looked up the enclosing `.md-*` span
 *   (`findFormattingSpanAtCursor`) and selected its full contents (markers
 *   included) before running the toggle, then always collapsed back to a
 *   cursor at the end of the result. `enclosingFormatRange` (./formattingAt)
 *   is the syntax-tree equivalent; that exact "collapse to end" behavior is
 *   preserved here for this case.
 * - Real selection: old code always collapsed to a cursor at the end too
 *   (a side effect of `main.ts`'s `innerHTML =` full-rerender model, not a
 *   deliberate UX choice). CM6 has no such constraint, so this layer instead
 *   keeps the selection covering the same logical text after the toggle
 *   (e.g. selecting "text" and toggling bold leaves "text" selected inside
 *   the new `**text**`) — a deliberate improvement, not a preserved quirk.
 *
 * Every range of a multi-cursor selection (`../multipleSelections.ts`) is
 * toggled, through `state.changeByRange`: it calls back once per range
 * against the ORIGINAL state and maps the results onto each other, so each
 * range's positions stay the plain original-document offsets the logic below
 * computes.
 */
import { EditorSelection, type EditorState, type SelectionRange, type StateCommand } from '@codemirror/state';
import { inlineFormatChange, type InlineFormat, type InlineFormatChange } from '../../../shared/inlineFormat';
import { enclosingFormatRange } from './formattingAt';

/** The selection to leave in place after a non-collapsed toggle: the same
 *  logical text the user had selected, wherever it ends up in `change.insert`.
 *
 *  Derived generically from the returned change rather than from per-format
 *  prefix/suffix knowledge: when the replacement grew (a wrap), the original
 *  selected text appears verbatim inside `change.insert` (bold/italic/code/
 *  strike wrap it in markers; link wraps it in `[...](url)`) — locate it
 *  there. When it did not grow (an unwrap, for any format), the entire
 *  `change.insert` *is* the remaining text — select all of it. */
function selectionCoveringSameText(
    lineFrom: number,
    originalFrom: number,
    originalTo: number,
    selectedText: string,
    change: InlineFormatChange,
): SelectionRange {
    const insertFromAbs = lineFrom + change.from;
    const grew = change.insert.length > originalTo - originalFrom;
    if (grew) {
        const idx = change.insert.indexOf(selectedText);
        if (idx !== -1) {
            return EditorSelection.range(insertFromAbs + idx, insertFromAbs + idx + selectedText.length);
        }
    }
    return EditorSelection.range(insertFromAbs, insertFromAbs + change.insert.length);
}

interface RangeToggle {
    changes: { from: number; to: number; insert: string };
    range: SelectionRange;
}

/** The toggle for one selection range, in original-document coordinates, or
 *  `null` when this range has nothing to toggle (no selection and no
 *  enclosing construct, or a selection spanning more than one line). */
function rangeToggle(state: EditorState, range: SelectionRange, format: InlineFormat): RangeToggle | null {
    const hadSelection = !range.empty;

    let from = range.from;
    let to = range.to;
    if (!hadSelection) {
        const enclosing = enclosingFormatRange(state, range.head, format);
        if (!enclosing) {
            return null;
        }
        from = enclosing.from;
        to = enclosing.to;
    }

    const line = state.doc.lineAt(from);
    if (state.doc.lineAt(to).number !== line.number) {
        return null;
    }

    const selectedText = state.doc.sliceString(from, to);
    const change = inlineFormatChange({
        text: line.text,
        from: from - line.from,
        to: to - line.from,
        format,
    });
    if (!change) {
        return null;
    }

    return {
        changes: { from: line.from + change.from, to: line.from + change.to, insert: change.insert },
        range: hadSelection
            ? selectionCoveringSameText(line.from, from, to, selectedText, change)
            : EditorSelection.cursor(line.from + change.selection),
    };
}

function overlaps(a: { from: number; to: number }, b: { from: number; to: number }): boolean {
    return a.from < b.to && b.from < a.to;
}

/** Toggle `format` over every selection range (or, for a collapsed cursor,
 *  over the construct enclosing it). A `StateCommand`: returns `false`
 *  (nothing dispatched) when no range had anything to toggle. */
export function toggleInlineFormat(format: InlineFormat): StateCommand {
    return ({ state, dispatch }) => {
        // Two cursors inside the SAME construct resolve to the same enclosing
        // range and would each rewrite it — doubling the markers. The first
        // one wins; the rest keep their (mapped) position.
        const applied: { from: number; to: number }[] = [];

        const transaction = state.changeByRange((range) => {
            const toggle = rangeToggle(state, range, format);
            if (!toggle || applied.some((span) => overlaps(span, toggle.changes))) {
                return { range };
            }
            applied.push(toggle.changes);
            return toggle;
        });

        if (applied.length === 0) {
            return false;
        }

        dispatch(state.update(transaction, { scrollIntoView: true }));
        return true;
    };
}
