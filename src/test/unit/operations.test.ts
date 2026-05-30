import * as assert from 'assert';
import { deleteRange, stripLinePrefix, applyLinePrefix } from '../../webview/editor/operations';

/**
 * Unit tests for the pure document operations.
 *
 * The detailed deletion / line-prefix cases live in selectionDeletion,
 * keyboardDeletion and lineTypes; this file pins down the contracts that are
 * specific to these helpers (purity, round-tripping).
 */
describe('Document Operations', () => {

    describe('deleteRange', () => {
        it('does not mutate the input array', () => {
            const lines = ['Hello World'];
            const snapshot = [...lines];
            deleteRange(lines, { startLineIndex: 0, startOffset: 0, endLineIndex: 0, endOffset: 5 });
            assert.deepStrictEqual(lines, snapshot);
        });

        it('returns the cursor at the start of the deleted range', () => {
            const { cursor } = deleteRange(
                ['Line 1', 'Line 2', 'Line 3'],
                { startLineIndex: 0, startOffset: 5, endLineIndex: 2, endOffset: 3 }
            );
            assert.deepStrictEqual(cursor, { lineIndex: 0, offset: 5 });
        });

        it('merges the surviving head and tail across a multi-line deletion', () => {
            const { lines } = deleteRange(
                ['Line 1', 'Line 2', 'Line 3'],
                { startLineIndex: 0, startOffset: 5, endLineIndex: 2, endOffset: 5 }
            );
            assert.deepStrictEqual(lines, ['Line 3']);
        });
    });

    describe('stripLinePrefix / applyLinePrefix round-trip', () => {
        const types = ['h1', 'h2', 'h3', 'ul', 'ol', 'task', 'quote'];

        for (const type of types) {
            it(`round-trips "${type}" back to a paragraph`, () => {
                const original = 'Some content';
                const withPrefix = applyLinePrefix(original, type);
                const stripped = stripLinePrefix(withPrefix);
                assert.strictEqual(applyLinePrefix(stripped, 'paragraph'), original);
            });
        }

        it('hr ignores the content', () => {
            assert.strictEqual(applyLinePrefix('whatever', 'hr'), '---');
        });

        it('an unknown type is a no-op', () => {
            assert.strictEqual(applyLinePrefix('text', 'does-not-exist'), 'text');
        });
    });
});
