import * as assert from 'assert';
import { EditorState } from '@codemirror/state';
import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { lineStrutClass } from '../../webview/cm/lineNumberGutter';

/**
 * `lineStrutClass` is the pure function `src/webview/cm/lineNumberGutter.ts`
 * uses to decide which `md-*` classes to mirror onto a line's
 * `.cm-gutterElement` so its font-size/font-family strut matches the
 * content line's — see that file's header for the mechanism. Same shape as
 * `src/test/unit/decorations.test.ts`: a plain `EditorState`, no
 * `EditorView`/DOM needed.
 */

function stateFor(doc: string): EditorState {
    return EditorState.create({
        doc,
        extensions: [markdown({ base: commonmarkLanguage, extensions: [GFM], completeHTMLTags: false })],
    });
}

/** Class order follows tree-walk/insertion order, not anything meaningful —
 *  compare as a sorted set, matching `decorations.test.ts`'s convention. */
function classes(state: EditorState, from: number, to: number): string[] {
    return lineStrutClass(state, from, to).split(' ').filter(Boolean).sort();
}

describe('cm/lineNumberGutter: lineStrutClass', () => {
    it('plain paragraph line has no strut class', () => {
        const state = stateFor('Just a paragraph.');
        assert.deepStrictEqual(classes(state, 0, state.doc.length), []);
    });

    it('ATX heading levels map to md-heading + md-hN', () => {
        for (let level = 1; level <= 6; level++) {
            const doc = `${'#'.repeat(level)} Heading`;
            const state = stateFor(doc);
            assert.deepStrictEqual(
                classes(state, 0, state.doc.length),
                ['md-h' + level, 'md-heading'].sort(),
                `level ${level}`,
            );
        }
    });

    it('setext heading levels map to md-heading + md-hN on the title line only', () => {
        // The underline is the heading's syntax, not a second heading line:
        // it must NOT inherit the heading strut, or the gutter reserves a
        // 2em line box for a row whose content line is normal-sized.
        for (const [level, underline] of [[1, '====='], [2, '-----']] as const) {
            const state = stateFor(`Title\n${underline}`);
            const title = state.doc.line(1);
            const rule = state.doc.line(2);
            assert.deepStrictEqual(
                classes(state, title.from, title.to),
                ['md-h' + level, 'md-heading', 'md-setext-title'].sort(),
                `level ${level} title`,
            );
            assert.deepStrictEqual(
                classes(state, rule.from, rule.to),
                ['md-setext-underline'],
                `level ${level} underline`,
            );
        }
    });

    it('fenced code block lines carry md-code-block, and the boundary lines their first/last class', () => {
        // The boundary classes matter: they carry the extra padding-top that
        // made the gutter number drift before lineStrutClass read the real
        // line decorations.
        const doc = '```ts\nconst x = 1;\n```';
        const state = stateFor(doc);
        const firstLine = state.doc.line(1);
        const middleLine = state.doc.line(2);
        const lastLine = state.doc.line(3);
        assert.ok(classes(state, firstLine.from, firstLine.to).includes('md-code-block-first'));
        assert.deepStrictEqual(classes(state, middleLine.from, middleLine.to), ['md-code-block']);
        assert.ok(classes(state, lastLine.from, lastLine.to).includes('md-code-block'));
    });

    it('blockquote lines get md-blockquote and its boundary classes, not a font-size class', () => {
        const state = stateFor('> quoted text');
        assert.deepStrictEqual(
            classes(state, 0, state.doc.length),
            ['blockquote-first', 'blockquote-last', 'md-blockquote', 'md-quote-1'].sort(),
        );
    });

    it('a heading inside a blockquote carries both classes', () => {
        const state = stateFor('> # Heading');
        const got = classes(state, 0, state.doc.length);
        for (const expected of ['md-blockquote', 'md-h1', 'md-heading']) {
            assert.ok(got.includes(expected), `expected ${expected} in ${got.join(' ')}`);
        }
    });

    it('mark- and syntax-layer classes (e.g. bold, inline code) are not mirrored', () => {
        const state = stateFor('A **bold** and `code` line.');
        assert.deepStrictEqual(classes(state, 0, state.doc.length), []);
    });
});
