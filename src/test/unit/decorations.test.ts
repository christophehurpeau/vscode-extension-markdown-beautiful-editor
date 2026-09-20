import * as assert from 'assert';
import { EditorState } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';
import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { buildMarkdownDecorations } from '../../webview/cm/decorations';
import { mathExtension } from '../../webview/cm/lang/math';
import { markdownExtensions } from '../../webview/cm/lang/registry';

/**
 * Decoration-test shape (CONVENTION (c), see the header comment in
 * `src/webview/cm/decorations.ts`): build a plain `EditorState` with the
 * markdown language installed, run the decoration provider directly (no
 * `EditorView`/DOM needed — `buildMarkdownDecorations` is a pure function
 * over a state and a set of ranges), and assert `{from, to, class}` tuples.
 *
 * Later work packages extending `src/shared/nodeClassMap.ts` should copy
 * this shape rather than reaching for an `EditorView`.
 */

interface DecorationTuple {
    from: number;
    to: number;
    class: string;
}

function stateFor(doc: string): EditorState {
    return EditorState.create({
        doc,
        extensions: [markdown({ base: commonmarkLanguage, extensions: [GFM], completeHTMLTags: false })],
    });
}

function tuples(set: DecorationSet): DecorationTuple[] {
    const out: DecorationTuple[] = [];
    set.between(0, Infinity, (from, to, value) => {
        out.push({ from, to, class: value.spec.class as string });
    });
    return out;
}

/** Order-independent comparison: `Decoration.set`'s internal ordering of
 *  same-position ranges is not part of the contract, so WP-H's tests (which
 *  often push several overlapping ranges at the same position) sort before
 *  comparing rather than asserting array order. */
function sortTuples(list: DecorationTuple[]): DecorationTuple[] {
    return [...list].sort(
        (a, b) => a.from - b.from || a.to - b.to || a.class.localeCompare(b.class),
    );
}

function assertTuples(actual: DecorationTuple[], expected: DecorationTuple[]): void {
    assert.deepStrictEqual(sortTuples(actual), sortTuples(expected));
}

/** A line decoration's `class` is a space-joined `Set`, so its word order
 *  follows tree-walk/insertion order, not anything meaningful — compare as
 *  a sorted set of class names instead. */
function classSet(tuple: DecorationTuple): string[] {
    return tuple.class.split(' ').sort();
}

function stateForMath(doc: string): EditorState {
    return EditorState.create({
        doc,
        extensions: [markdown({ base: commonmarkLanguage, extensions: [GFM, mathExtension], completeHTMLTags: false })],
    });
}

/** State with the FULL grammar registry — the configuration the webview
 * actually ships, so these tests catch a grammar landing without its
 * `nodeClassMap.ts` rows (which is exactly what happened with WP-G1). */
function stateForAll(doc: string): EditorState {
    return EditorState.create({
        doc,
        extensions: [markdown({ base: commonmarkLanguage, extensions: [GFM, ...markdownExtensions], completeHTMLTags: false })],
    });
}

describe('cm/decorations: parity grammar constructs are styled', () => {
    function classesIn(doc: string): string[] {
        const state = stateForAll(doc);
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);
        return [
            ...tuples(built.markDecorations),
            ...tuples(built.syntaxDecorations),
            ...tuples(built.lineDecorations),
        ].map((t) => t.class);
    }

    it('styles an inline math span', () => {
        assert.ok(classesIn('a $x$ b').includes('md-math'));
    });

    it('styles a footnote reference', () => {
        assert.ok(classesIn('text[^1] more').includes('md-footnote'));
    });

    it('styles a footnote definition', () => {
        assert.ok(classesIn('[^1]: the note').includes('md-footnote-def'));
    });

    it('styles a definition list entry under its term', () => {
        assert.ok(classesIn('Term\n: the definition').includes('md-definition'));
    });

    it('styles a GitHub alert', () => {
        assert.ok(classesIn('> [!NOTE]\n> body').some((c) => c.includes('md-alert')));
    });
});

describe('cm/decorations: buildMarkdownDecorations', () => {
    it('marks md-bold over the whole **bold** span and md-syntax over its delimiters', () => {
        const state = stateFor('**bold**');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assert.deepStrictEqual(tuples(built.markDecorations), [{ from: 0, to: 8, class: 'md-bold' }]);
        assert.deepStrictEqual(tuples(built.syntaxDecorations), [
            { from: 0, to: 2, class: 'md-syntax' },
            { from: 6, to: 8, class: 'md-syntax' },
        ]);
    });

    it('marks md-italic over the whole *italic* span', () => {
        const state = stateFor('*italic*');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assert.deepStrictEqual(tuples(built.markDecorations), [{ from: 0, to: 8, class: 'md-italic' }]);
    });

    it('marks md-code over an inline code span', () => {
        const state = stateFor('`code`');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assert.deepStrictEqual(tuples(built.markDecorations), [{ from: 0, to: 6, class: 'md-code' }]);
    });

    it('emits an md-heading md-h1 line decoration for a level-1 ATX heading line', () => {
        // WP-H activates per-level heading sizing deliberately (see
        // nodeClassMap.ts's ATXHeading1..6 entries) — md-h1..md-h6 accompany
        // the shared md-heading rather than replacing it.
        const state = stateFor('# Heading');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assert.deepStrictEqual(tuples(built.lineDecorations), [{ from: 0, to: 0, class: 'md-heading md-h1' }]);
    });

    it('accumulates classes on a line touched by more than one heading-level match (sanity: no duplicate line entries)', () => {
        const state = stateFor('# One\n\n## Two');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        const lines = tuples(built.lineDecorations);
        assert.strictEqual(lines.length, 2);
        assert.deepStrictEqual(
            lines.map((l) => l.class),
            ['md-heading md-h1', 'md-heading md-h2'],
        );
    });

    it('does not descend into a fenced code block\'s CodeText region', () => {
        const state = stateFor('```\n**not bold**\n```');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assert.deepStrictEqual(tuples(built.markDecorations), []);
    });
});

describe('cm/decorations: buildMarkdownDecorations (WP-H)', () => {
    it('marks md-strike over ~~text~~ and synthesizes md-strike-text over the inner range', () => {
        const state = stateFor('~~text~~');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assertTuples(tuples(built.markDecorations), [
            { from: 0, to: 8, class: 'md-strike' },
            { from: 2, to: 6, class: 'md-strike-text' },
        ]);
        assertTuples(tuples(built.syntaxDecorations), [
            { from: 0, to: 2, class: 'md-syntax' },
            { from: 6, to: 8, class: 'md-syntax' },
        ]);
    });

    it('marks md-escaped over an Escape and synthesizes md-syntax over just the backslash', () => {
        const state = stateFor('\\*');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assertTuples(tuples(built.markDecorations), [{ from: 0, to: 2, class: 'md-escaped' }]);
        assertTuples(tuples(built.syntaxDecorations), [{ from: 0, to: 1, class: 'md-syntax' }]);
    });

    it('marks a checked task item md-task md-task-checked, read off its TaskMarker text', () => {
        const state = stateFor('- [x] done');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assertTuples(tuples(built.markDecorations), [
            { from: 0, to: 10, class: 'md-list' },
            { from: 2, to: 10, class: 'md-task md-task-checked' },
        ]);
        assertTuples(tuples(built.syntaxDecorations), [
            { from: 0, to: 1, class: 'md-syntax' },
            { from: 2, to: 5, class: 'md-syntax' },
        ]);
    });

    it('marks an unchecked task item md-task md-task-unchecked', () => {
        const state = stateFor('- [ ] todo');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assert.ok(
            tuples(built.markDecorations).some(
                (t) => t.from === 2 && t.to === 10 && t.class === 'md-task md-task-unchecked',
            ),
        );
    });

    it('marks a plain list item md-list with md-syntax on its marker', () => {
        const state = stateFor('- item');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assertTuples(tuples(built.markDecorations), [{ from: 0, to: 6, class: 'md-list' }]);
        assertTuples(tuples(built.syntaxDecorations), [{ from: 0, to: 1, class: 'md-syntax' }]);
    });

    it('marks an ordered list item md-list with md-syntax on its "1." marker', () => {
        const state = stateFor('1. item');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assertTuples(tuples(built.markDecorations), [{ from: 0, to: 7, class: 'md-list' }]);
        assertTuples(tuples(built.syntaxDecorations), [{ from: 0, to: 2, class: 'md-syntax' }]);
    });

    it('marks an inline link md-link, synthesizes md-text over its text range, and md-url on its URL', () => {
        const state = stateFor('[text](url)');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assertTuples(tuples(built.markDecorations), [
            { from: 0, to: 11, class: 'md-link' },
            { from: 1, to: 5, class: 'md-text' },
        ]);
        assertTuples(tuples(built.syntaxDecorations), [
            { from: 0, to: 1, class: 'md-syntax' },
            { from: 5, to: 6, class: 'md-syntax' },
            { from: 6, to: 7, class: 'md-syntax' },
            { from: 10, to: 11, class: 'md-syntax' },
            { from: 7, to: 10, class: 'md-url' },
        ]);
    });

    it('adds md-ref-link and splits the LinkLabel brackets for a reference-style link', () => {
        const state = stateFor('[text][label]');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assertTuples(tuples(built.markDecorations), [
            { from: 0, to: 13, class: 'md-link' },
            { from: 0, to: 13, class: 'md-ref-link' },
            { from: 1, to: 5, class: 'md-text' },
            { from: 7, to: 12, class: 'md-ref' },
        ]);
        assertTuples(tuples(built.syntaxDecorations), [
            { from: 0, to: 1, class: 'md-syntax' },
            { from: 5, to: 6, class: 'md-syntax' },
            { from: 6, to: 7, class: 'md-syntax' },
            { from: 12, to: 13, class: 'md-syntax' },
        ]);
    });

    it('marks md-image and synthesizes md-alt (Prec.highest) over the alt-text range', () => {
        const state = stateFor('![alt](img.png)');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assertTuples(tuples(built.markDecorations), [{ from: 0, to: 15, class: 'md-image' }]);
        assertTuples(tuples(built.syntaxDecorations), [
            { from: 0, to: 2, class: 'md-syntax' },
            { from: 2, to: 5, class: 'md-alt' },
            { from: 5, to: 6, class: 'md-syntax' },
            { from: 6, to: 7, class: 'md-syntax' },
            { from: 14, to: 15, class: 'md-syntax' },
            { from: 7, to: 14, class: 'md-url' },
        ]);
    });

    it('marks a URI autolink md-autolink with md-url on the URL', () => {
        const state = stateFor('<http://example.com>');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assertTuples(tuples(built.markDecorations), [{ from: 0, to: 20, class: 'md-autolink' }]);
        assertTuples(tuples(built.syntaxDecorations), [
            { from: 0, to: 1, class: 'md-syntax' },
            { from: 19, to: 20, class: 'md-syntax' },
            { from: 1, to: 19, class: 'md-url' },
        ]);
    });

    it('marks a link reference definition md-link-def, with md-link-def-title (not md-link-title)', () => {
        const state = stateFor('[label]: http://example.com "Title"');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assertTuples(tuples(built.markDecorations), [
            { from: 0, to: 35, class: 'md-link-def' },
            { from: 1, to: 6, class: 'md-ref' },
            { from: 28, to: 35, class: 'md-link-def-title' },
        ]);
        assertTuples(tuples(built.syntaxDecorations), [
            { from: 0, to: 1, class: 'md-syntax' },
            { from: 6, to: 7, class: 'md-syntax' },
            { from: 7, to: 8, class: 'md-syntax' },
            { from: 9, to: 27, class: 'md-url' },
        ]);
    });

    it('marks md-hr as a line decoration and synthesizes md-hr-text as a mark over the same range', () => {
        const state = stateFor('---');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assertTuples(tuples(built.lineDecorations), [{ from: 0, to: 0, class: 'md-hr' }]);
        assertTuples(tuples(built.markDecorations), [{ from: 0, to: 3, class: 'md-hr-text' }]);
    });

    it('counts ancestor Blockquote depth (capped at 3) and marks the outermost block\'s first/last lines', () => {
        const state = stateFor('> quote\n>> nested\n>>> deep');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        const lines = tuples(built.lineDecorations);
        assert.strictEqual(lines.length, 3);
        assert.deepStrictEqual(classSet(lines[0]), ['blockquote-first', 'md-blockquote', 'md-quote-1'].sort());
        assert.deepStrictEqual(
            classSet(lines[1]),
            ['md-blockquote', 'md-quote-1', 'md-quote-2'].sort(),
        );
        assert.deepStrictEqual(
            classSet(lines[2]),
            ['blockquote-last', 'md-blockquote', 'md-quote-1', 'md-quote-2', 'md-quote-3'].sort(),
        );
    });

    it('marks md-code-block-first/md-code-block-last on a fenced code block\'s boundary lines', () => {
        const state = stateFor('```ts\nconst x = 1;\n```');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        const lines = tuples(built.lineDecorations);
        assert.strictEqual(lines.length, 3);
        assert.deepStrictEqual(classSet(lines[0]), ['md-code-block', 'md-code-block-first'].sort());
        assert.deepStrictEqual(classSet(lines[1]), ['md-code-block']);
        assert.deepStrictEqual(classSet(lines[2]), ['md-code-block', 'md-code-block-last'].sort());

        assert.ok(
            tuples(built.markDecorations).some((t) => t.from === 3 && t.to === 5 && t.class === 'md-code-info'),
        );
        assertTuples(tuples(built.syntaxDecorations), [
            { from: 0, to: 3, class: 'md-syntax' },
            { from: 19, to: 22, class: 'md-syntax' },
        ]);
    });

    it('recovers per-column table alignment by re-splitting the standalone TableDelimiter row', () => {
        const state = stateFor('| a | bb |\n|:--|:-:|\n| 1 | 22 |');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        const marks = tuples(built.markDecorations);
        assert.ok(marks.some((t) => t.from === 0 && t.to === 31 && t.class === 'md-table'));
        // Header cells
        assert.ok(marks.some((t) => t.from === 2 && t.to === 3 && t.class === 'md-table-cell md-col-left'));
        assert.ok(marks.some((t) => t.from === 6 && t.to === 8 && t.class === 'md-table-cell md-col-center'));
        // Body cells
        assert.ok(marks.some((t) => t.from === 23 && t.to === 24 && t.class === 'md-table-cell md-col-left'));
        assert.ok(marks.some((t) => t.from === 27 && t.to === 29 && t.class === 'md-table-cell md-col-center'));
        // The delimiter row's own two cells, re-split from its single node's text
        assert.ok(
            marks.some((t) => t.from === 12 && t.to === 15 && t.class === 'md-table-cell md-table-sep md-col-left'),
        );
        assert.ok(
            marks.some(
                (t) => t.from === 16 && t.to === 19 && t.class === 'md-table-cell md-table-sep md-col-center',
            ),
        );

        // Every pipe (header, body and the delimiter row's own) is md-syntax.
        const syntax = tuples(built.syntaxDecorations);
        for (const pos of [0, 4, 9, 11, 15, 19, 21, 25, 30]) {
            assert.ok(
                syntax.some((t) => t.from === pos && t.to === pos + 1 && t.class === 'md-syntax'),
                `expected a md-syntax pipe at ${pos}`,
            );
        }
    });

    it('still styles inline constructs nested inside a table cell (the walk does not skip Table\'s subtree)', () => {
        const state = stateFor('| a |\n|:--|\n| **x** |');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assert.ok(tuples(built.markDecorations).some((t) => t.class === 'md-bold'));
    });

    it('styles a setext heading, which the old regex parser rendered as md-hr', () => {
        const state = stateFor('Title\n---');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assert.ok(
            tuples(built.lineDecorations).some((t) => classSet(t).includes('md-h2')),
            'setext heading must carry heading classes, not render unstyled'
        );
    });

    it('keeps the setext heading class off the ===/--- line, which gets md-setext-underline', () => {
        // The node spans title + underline. Applying `md-hN` to both gave the
        // underline a heading-sized line box with heading padding, opening a
        // dead band between a title and the line that declares it one.
        const state = stateFor('Title\n---');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);
        const lines = sortTuples(tuples(built.lineDecorations));

        assert.deepStrictEqual(lines.map((t) => t.from), [0, 6]);
        assert.deepStrictEqual(classSet(lines[0]), ['md-h2', 'md-heading', 'md-setext-title']);
        assert.deepStrictEqual(classSet(lines[1]), ['md-setext-underline']);
    });

    it('keeps every line of a multi-line setext title on the heading class', () => {
        const state = stateFor('Two\nlines\n===');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);
        const lines = sortTuples(tuples(built.lineDecorations));

        assert.deepStrictEqual(lines.map((t) => t.from), [0, 4, 10]);
        assert.deepStrictEqual(classSet(lines[0]), ['md-h1', 'md-heading', 'md-setext-title']);
        assert.deepStrictEqual(classSet(lines[1]), ['md-h1', 'md-heading', 'md-setext-title']);
        assert.deepStrictEqual(classSet(lines[2]), ['md-setext-underline']);
    });

    it('still maps a standalone horizontal rule to md-hr', () => {
        const state = stateFor('para\n\n---');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assert.ok(tuples(built.lineDecorations).some((t) => t.class.includes('md-hr')));
    });

    // A zero-length `Decoration.mark` throws, and the throw escapes the
    // ViewPlugin: CodeMirror deactivates it and every `md-*` class in the
    // document disappears until reload. `![](x)` is ordinary markdown, so
    // scrolling one into the viewport unstyled the whole editor.
    it('emits no mark for an image with empty alt text instead of throwing', () => {
        const state = stateFor('![](img.png)');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assert.ok(!tuples(built.syntaxDecorations).some((t) => t.class === 'md-alt'));
        assert.ok(tuples(built.markDecorations).some((t) => t.class === 'md-image'));
    });

    it('emits no mark for a link with empty text instead of throwing', () => {
        const state = stateFor('[](https://example.com)');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assert.ok(!tuples(built.markDecorations).some((t) => t.class === 'md-text'));
        assert.ok(tuples(built.markDecorations).some((t) => t.class === 'md-link'));
    });

    it('survives an empty reference link and an empty inline link', () => {
        for (const doc of ['[][]', '[]()']) {
            const state = stateFor(doc);
            assert.doesNotThrow(() => buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]));
        }
    });

    it('maps InlineMath/MathContent/MathMark (WP-G1 grammar) to md-math/md-math-content/md-syntax', () => {
        const state = stateForMath('$x$');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assertTuples(tuples(built.markDecorations), [
            { from: 0, to: 3, class: 'md-math' },
            { from: 1, to: 2, class: 'md-math-content' },
        ]);
        assertTuples(tuples(built.syntaxDecorations), [
            { from: 0, to: 1, class: 'md-syntax' },
            { from: 2, to: 3, class: 'md-syntax' },
        ]);
    });
});
