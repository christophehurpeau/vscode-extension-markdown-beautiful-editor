import * as assert from 'assert';
import { EditorState } from '@codemirror/state';
import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { formattingAt, enclosingFormatRange } from '../../webview/cm/commands/formattingAt';

/**
 * Unit tests for the CM6 "what formatting applies here" query
 * (`src/webview/cm/commands/formattingAt.ts`) — the syntax-tree counterpart
 * of the deleted `getFormattingAtCursor`/`findFormattingSpanAtCursor` in
 * `main.ts`. Same shape as `decorations.test.ts` (CONVENTION (c)): a plain
 * `EditorState` with the markdown language installed, no `EditorView`/DOM.
 */
function stateFor(doc: string): EditorState {
    return EditorState.create({
        doc,
        extensions: [markdown({ base: commonmarkLanguage, extensions: [GFM], completeHTMLTags: false })],
    });
}

describe('cm/commands/formattingAt: formattingAt', () => {
    it('reports bold inside **bold**', () => {
        const doc = 'before **bold** after';
        const pos = doc.indexOf('bold') + 2;
        const result = formattingAt(stateFor(doc), pos);
        assert.deepStrictEqual(result, { bold: true, italic: false, code: false, strikethrough: false, link: false });
    });

    it('reports italic inside *italic*', () => {
        const doc = 'x *italic* y';
        const pos = doc.indexOf('italic') + 2;
        const result = formattingAt(stateFor(doc), pos);
        assert.deepStrictEqual(result, { bold: false, italic: true, code: false, strikethrough: false, link: false });
    });

    it('reports both bold and italic inside ***both***', () => {
        const doc = 'x ***both*** y';
        const pos = doc.indexOf('both') + 2;
        const result = formattingAt(stateFor(doc), pos);
        assert.strictEqual(result.bold, true);
        assert.strictEqual(result.italic, true);
    });

    it('reports code inside `code`', () => {
        const doc = 'x `code` y';
        const pos = doc.indexOf('code') + 2;
        const result = formattingAt(stateFor(doc), pos);
        assert.deepStrictEqual(result, { bold: false, italic: false, code: true, strikethrough: false, link: false });
    });

    it('reports strikethrough inside ~~struck~~', () => {
        const doc = 'x ~~struck~~ y';
        const pos = doc.indexOf('struck') + 2;
        const result = formattingAt(stateFor(doc), pos);
        assert.deepStrictEqual(result, { bold: false, italic: false, code: false, strikethrough: true, link: false });
    });

    it('reports link inside [label](url)', () => {
        const doc = 'x [label](https://example.com) y';
        const pos = doc.indexOf('label') + 2;
        const result = formattingAt(stateFor(doc), pos);
        assert.deepStrictEqual(result, { bold: false, italic: false, code: false, strikethrough: false, link: true });
    });

    it('reports nothing for plain text', () => {
        const doc = 'just plain text';
        const result = formattingAt(stateFor(doc), 5);
        assert.deepStrictEqual(result, { bold: false, italic: false, code: false, strikethrough: false, link: false });
    });
});

describe('cm/commands/formattingAt: enclosingFormatRange', () => {
    it('returns the full **bold** span, markers included, for a cursor inside it', () => {
        const doc = 'before **bold** after';
        const spanStart = doc.indexOf('**bold**');
        const spanEnd = spanStart + '**bold**'.length;
        const pos = doc.indexOf('bold') + 2;
        const range = enclosingFormatRange(stateFor(doc), pos, 'bold');
        assert.deepStrictEqual(range, { from: spanStart, to: spanEnd });
    });

    it('returns null when the cursor is not inside a matching construct', () => {
        const doc = 'before **bold** after';
        const pos = doc.indexOf('bold') + 2;
        assert.strictEqual(enclosingFormatRange(stateFor(doc), pos, 'italic'), null);
        assert.strictEqual(enclosingFormatRange(stateFor(doc), 1, 'bold'), null);
    });

    it('returns the full [label](url) span for a cursor inside a link', () => {
        const doc = 'x [label](https://example.com) y';
        const spanStart = doc.indexOf('[label]');
        const spanEnd = doc.indexOf(') y') + 1;
        const pos = doc.indexOf('label') + 2;
        const range = enclosingFormatRange(stateFor(doc), pos, 'link');
        assert.deepStrictEqual(range, { from: spanStart, to: spanEnd });
    });
});
