import * as assert from 'assert';
import { parseTableColumns, isDelimiterRowCells } from '../../shared/tableLayout';

describe('isDelimiterRowCells', () => {
    it('accepts plain dashes', () => {
        assert.ok(isDelimiterRowCells(['---', '---', '---']));
    });

    it('accepts colons for alignment', () => {
        assert.ok(isDelimiterRowCells([':---', ':--:', '--:']));
    });

    it('accepts a single dash per cell', () => {
        assert.ok(isDelimiterRowCells(['-', ':-:', '-:']));
    });

    it('rejects an empty cell array', () => {
        assert.ok(!isDelimiterRowCells([]));
    });

    it('rejects a row with a non-dash cell', () => {
        assert.ok(!isDelimiterRowCells(['---', 'text', '---']));
    });
});

describe('parseTableColumns', () => {
    it('derives alignment from the delimiter row', () => {
        const rows = [
            ['Tables', 'Are', 'Cool'],
            ['-------------', ':-------------:', '-----:'],
            ['col 3 is', 'right-aligned', '$1600'],
        ];
        assert.deepStrictEqual(parseTableColumns(rows).map(c => c.align), ['none', 'center', 'right']);
    });

    it('sizes each column to its widest trimmed cell, including the delimiter', () => {
        const rows = [
            ['Tables', 'Are', 'Cool'],
            ['-------------', ':-------------:', '-----:'],
            ['col 3 is', 'right-aligned', '$1600'],
        ];
        assert.deepStrictEqual(parseTableColumns(rows).map(c => c.width), [13, 15, 6]);
    });

    it('defaults to "none" alignment with no delimiter row', () => {
        const rows = [
            ['a', 'b'],
            ['1', '2'],
        ];
        assert.deepStrictEqual(parseTableColumns(rows).map(c => c.align), ['none', 'none']);
    });

    it('handles a ragged block (rows with different cell counts) via the widest row', () => {
        const rows = [
            ['a', 'b', 'c'],
            ['-', '-'],
        ];
        assert.strictEqual(parseTableColumns(rows).length, 3);
    });

    it('trims cell whitespace before measuring width', () => {
        const rows = [
            [' padded  ', 'x'],
            ['-', '-'],
        ];
        assert.strictEqual(parseTableColumns(rows)[0].width, 'padded'.length);
    });
});
