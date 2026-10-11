import * as assert from 'assert';
import { EditorSelection, EditorState } from '@codemirror/state';
import { selectionOverlayRanges } from '../../webview/cm/selectionOverlay';

const doc = 'aaaa\nbbbb\n\ncccc';
const lineStarts = [0, 5, 10, 11];

function overlayFor(selection: EditorSelection, visibleRanges = [{ from: 0, to: doc.length }]) {
    const state = EditorState.create({
        doc,
        selection,
        extensions: [EditorState.allowMultipleSelections.of(true)],
    });
    return selectionOverlayRanges(state, visibleRanges);
}

describe('cm/selectionOverlay: selectionOverlayRanges', () => {
    it('emits nothing for a bare cursor', () => {
        assert.deepStrictEqual(overlayFor(EditorSelection.single(2)), { lines: [], marks: [] });
    });

    it('marks a selection inside one line without claiming the line', () => {
        assert.deepStrictEqual(overlayFor(EditorSelection.single(1, 3)), { lines: [], marks: [{ from: 1, to: 3 }] });
    });

    it('claims only the lines selected past their line break', () => {
        const { lines, marks } = overlayFor(EditorSelection.single(2, 13));
        assert.deepStrictEqual(lines, [lineStarts[1], lineStarts[2]]);
        assert.deepStrictEqual(marks, [{ from: 2, to: 13 }]);
    });

    it('does not claim a line whose selection stops at its end', () => {
        assert.deepStrictEqual(overlayFor(EditorSelection.single(5, 9)).lines, []);
    });

    it('claims an empty line inside the selection', () => {
        assert.ok(overlayFor(EditorSelection.single(9, 12)).lines.includes(lineStarts[2]));
    });

    it('leaves the last line unclaimed on select-all: it has no line break', () => {
        assert.deepStrictEqual(overlayFor(EditorSelection.single(0, doc.length)).lines, lineStarts.slice(0, 3));
    });

    it('handles every range of a multiple selection', () => {
        const selection = EditorSelection.create([EditorSelection.range(0, 2), EditorSelection.range(11, 13)]);
        assert.deepStrictEqual(overlayFor(selection).marks, [{ from: 0, to: 2 }, { from: 11, to: 13 }]);
    });

    it('clips to the visible ranges', () => {
        const { lines, marks } = overlayFor(EditorSelection.single(0, doc.length), [{ from: 5, to: 9 }]);
        assert.deepStrictEqual(lines, [lineStarts[1]]);
        assert.deepStrictEqual(marks, [{ from: 5, to: 9 }]);
    });
});
