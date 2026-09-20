import * as assert from 'assert';
import { EditorSelection, EditorState, type SelectionRange } from '@codemirror/state';
import { selectionWithAddedCursor } from '../../webview/cm/multipleSelections';

/**
 * Unit tests for the "add cursor above/below" decision
 * (`src/webview/cm/multipleSelections.ts`). No `EditorView`/DOM: the real
 * command feeds it `view.moveVertically`, which is visual (line wrapping) and
 * needs geometry; here that seam takes a stub moving by whole document lines,
 * clamped at both ends the way CM6's own implementation clamps — returning
 * the range unmoved.
 */
const doc = 'aaaa\nbbbb\ncccc';

function moveByDocLine(state: EditorState, forward: boolean): (range: SelectionRange) => SelectionRange {
    return (range) => {
        const line = state.doc.lineAt(range.head);
        const column = range.goalColumn ?? range.head - line.from;
        const targetNumber = line.number + (forward ? 1 : -1);
        if (targetNumber < 1 || targetNumber > state.doc.lines) {
            return range;
        }
        const target = state.doc.line(targetNumber);
        return EditorSelection.cursor(target.from + Math.min(column, target.length), 0, undefined, column);
    };
}

function stateFor(selection: EditorSelection): EditorState {
    return EditorState.create({
        doc,
        selection,
        extensions: [EditorState.allowMultipleSelections.of(true)],
    });
}

function addCursor(selection: EditorSelection, forward: boolean): EditorSelection | null {
    const state = stateFor(selection);
    return selectionWithAddedCursor({ selection: state.selection, forward, moveVertically: moveByDocLine(state, forward) });
}

describe('cm/multipleSelections: selectionWithAddedCursor', () => {
    it('adds a cursor on the line below, keeping the column', () => {
        const result = addCursor(EditorSelection.single(2), true);
        assert.deepStrictEqual(result?.ranges.map((r) => r.head), [2, 7]);
    });

    it('adds a cursor on the line above', () => {
        const result = addCursor(EditorSelection.single(7), false);
        assert.deepStrictEqual(result?.ranges.map((r) => r.head), [2, 7]);
    });

    it('makes the added cursor the main range', () => {
        const result = addCursor(EditorSelection.single(2), true);
        assert.strictEqual(result?.main.head, 7);
    });

    it('extends downward from the last range, not the main one', () => {
        const selection = EditorSelection.create([EditorSelection.cursor(2), EditorSelection.cursor(7)], 0);
        const result = addCursor(selection, true);
        assert.deepStrictEqual(result?.ranges.map((r) => r.head), [2, 7, 12]);
    });

    it('extends upward from the first range', () => {
        const selection = EditorSelection.create([EditorSelection.cursor(7), EditorSelection.cursor(12)], 1);
        const result = addCursor(selection, false);
        assert.deepStrictEqual(result?.ranges.map((r) => r.head), [2, 7, 12]);
    });

    it('returns null at the last line', () => {
        assert.strictEqual(addCursor(EditorSelection.single(12), true), null);
    });

    it('returns null at the first line', () => {
        assert.strictEqual(addCursor(EditorSelection.single(2), false), null);
    });

    it('keeps the goal column across a shorter line', () => {
        const shortMiddle = EditorState.create({
            doc: 'aaaaaa\nbb\ncccccc',
            selection: EditorSelection.single(5),
            extensions: [EditorState.allowMultipleSelections.of(true)],
        });
        const first = selectionWithAddedCursor({
            selection: shortMiddle.selection,
            forward: true,
            moveVertically: moveByDocLine(shortMiddle, true),
        });
        // Clamped to the end of 'bb' (position 9), but still carrying column 5.
        assert.strictEqual(first?.main.head, 9);

        const second = selectionWithAddedCursor({
            selection: first as EditorSelection,
            forward: true,
            moveVertically: moveByDocLine(shortMiddle, true),
        });
        assert.strictEqual(second?.main.head, 15);
    });

    it('collapses a non-empty range to its head before moving', () => {
        const result = addCursor(EditorSelection.single(0, 2), true);
        assert.deepStrictEqual(result?.ranges.map((r) => [r.from, r.to]), [[0, 2], [7, 7]]);
    });
});
