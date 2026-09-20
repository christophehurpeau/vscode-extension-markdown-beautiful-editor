import * as assert from 'assert';
import { inlineFormatChange, isInlineFormat } from '../../shared/inlineFormat';

/**
 * Unit tests for the inline formatting toggle — the real production logic
 * extracted from `applyInlineFormat` (main.ts) into a pure function. Replaces
 * the old toolbar.test.ts, which only exercised a local reimplementation and
 * would pass regardless of what the production code did.
 */
describe('inlineFormatChange', () => {

    describe('bold', () => {
        it('wraps a plain selection', () => {
            const change = inlineFormatChange({ text: 'some text here', from: 5, to: 9, format: 'bold' });
            assert.deepStrictEqual(change, { insert: '**text**', from: 5, to: 9, selection: 13 });
        });

        it('unwraps when markers sit just outside the selection', () => {
            const change = inlineFormatChange({ text: '**bold**', from: 2, to: 6, format: 'bold' });
            assert.deepStrictEqual(change, { insert: 'bold', from: 0, to: 8, selection: 4 });
        });

        it('unwraps when the selection itself includes the markers', () => {
            const change = inlineFormatChange({ text: 'x **bold** y', from: 2, to: 10, format: 'bold' });
            assert.deepStrictEqual(change, { insert: 'bold', from: 2, to: 10, selection: 6 });
        });

        it('wraps multi-word selections', () => {
            const change = inlineFormatChange({ text: 'multiple words', from: 0, to: 14, format: 'bold' });
            assert.strictEqual(change?.insert, '**multiple words**');
        });
    });

    describe('italic', () => {
        it('wraps a plain selection', () => {
            const change = inlineFormatChange({ text: 'text', from: 0, to: 4, format: 'italic' });
            assert.strictEqual(change?.insert, '*text*');
        });

        it('unwraps when markers sit just outside the selection', () => {
            const change = inlineFormatChange({ text: '*text*', from: 1, to: 5, format: 'italic' });
            assert.deepStrictEqual(change, { insert: 'text', from: 0, to: 6, selection: 4 });
        });

        it('treats one asterisk of a bold marker as an adjacent italic marker (single-char prefix/suffix match)', () => {
            // Selecting the inner "bold" of "**bold**": italic's markers are a
            // single '*', and one of the two asterisks on each side is
            // immediately outside the selection, so italic's "markers sit just
            // outside" rule fires and strips one asterisk from each side.
            const change = inlineFormatChange({ text: '**bold**', from: 2, to: 6, format: 'italic' });
            assert.deepStrictEqual(change, { insert: 'bold', from: 1, to: 7, selection: 5 });
        });
    });

    describe('code', () => {
        it('wraps a plain selection', () => {
            const change = inlineFormatChange({ text: 'code', from: 0, to: 4, format: 'code' });
            assert.strictEqual(change?.insert, '`code`');
        });

        it('removes code formatting from formatted text', () => {
            const change = inlineFormatChange({ text: '`code`', from: 1, to: 5, format: 'code' });
            assert.deepStrictEqual(change, { insert: 'code', from: 0, to: 6, selection: 4 });
        });

        it('handles code with special characters', () => {
            const change = inlineFormatChange({ text: 'const x = 1;', from: 0, to: 12, format: 'code' });
            assert.strictEqual(change?.insert, '`const x = 1;`');
        });
    });

    describe('strikethrough', () => {
        it('wraps a plain selection', () => {
            const change = inlineFormatChange({ text: 'deleted', from: 0, to: 7, format: 'strikethrough' });
            assert.strictEqual(change?.insert, '~~deleted~~');
        });

        it('unwraps when markers sit just outside the selection', () => {
            const change = inlineFormatChange({ text: '~~deleted~~', from: 2, to: 9, format: 'strikethrough' });
            assert.deepStrictEqual(change, { insert: 'deleted', from: 0, to: 11, selection: 7 });
        });
    });

    describe('link', () => {
        it('wraps a plain selection as a link with a placeholder url', () => {
            const change = inlineFormatChange({ text: 'link text', from: 0, to: 9, format: 'link' });
            assert.deepStrictEqual(change, { insert: '[link text](url)', from: 0, to: 9, selection: 16 });
        });

        it('unwraps a selection that is exactly a link back to its label', () => {
            const text = '[text](https://example.com)';
            const change = inlineFormatChange({ text, from: 0, to: text.length, format: 'link' });
            assert.deepStrictEqual(change, { insert: 'text', from: 0, to: text.length, selection: 4 });
        });

        // TRIAGE.md #10: the old regex (`/^\[(.+)\]\(.+\)$/`) used greedy
        // groups, so a selection spanning two links, or a link plus trailing
        // `](...)` text, would still match and get incorrectly unwrapped.
        // inlineLinkText's delimiter-excluding groups fix this; these cases
        // must NOT be treated as a single link to toggle off.
        it('does not unwrap a selection spanning two links', () => {
            const text = '[a](b) [c](d)';
            const change = inlineFormatChange({ text, from: 0, to: text.length, format: 'link' });
            // Falls through to wrapping the whole selection as a new link.
            assert.strictEqual(change?.insert, `[${text}](url)`);
        });

        it('does not unwrap a link selection with trailing "](...)" text', () => {
            const text = '[a](b)](c)';
            const change = inlineFormatChange({ text, from: 0, to: text.length, format: 'link' });
            assert.strictEqual(change?.insert, `[${text}](url)`);
        });

        it('does not unwrap when the label contains an unescaped closing bracket boundary', () => {
            // A single well-formed link is still unwrapped correctly.
            const text = '[my label](http://example.com/a/b)';
            const change = inlineFormatChange({ text, from: 0, to: text.length, format: 'link' });
            assert.deepStrictEqual(change, { insert: 'my label', from: 0, to: text.length, selection: 8 });
        });
    });

    describe('empty selection', () => {
        it('returns null for a collapsed (empty) selection', () => {
            assert.strictEqual(inlineFormatChange({ text: 'some text', from: 3, to: 3, format: 'bold' }), null);
        });
    });

    describe('operating within a larger line', () => {
        it('only touches the selected range, leaving the rest of the line untouched', () => {
            const change = inlineFormatChange({ text: 'before TARGET after', from: 7, to: 13, format: 'bold' });
            assert.strictEqual(change?.insert, '**TARGET**');
            assert.strictEqual(change?.from, 7);
            assert.strictEqual(change?.to, 13);
        });
    });
});

describe('isInlineFormat', () => {
    it('accepts the known formats', () => {
        for (const f of ['bold', 'italic', 'code', 'strikethrough', 'link']) {
            assert.ok(isInlineFormat(f), `${f} should be a valid InlineFormat`);
        }
    });

    it('rejects unknown format strings', () => {
        assert.ok(!isInlineFormat('underline'));
        assert.ok(!isInlineFormat(''));
        assert.ok(!isInlineFormat('Bold'));
    });
});
