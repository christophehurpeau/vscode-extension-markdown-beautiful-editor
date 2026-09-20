import * as assert from 'assert';
import { EditorState } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';
import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { buildMarkdownDecorations } from '../../webview/cm/decorations';

/**
 * Integration coverage for WP-A's GitHub alert line decorations: a
 * `> [!NOTE]` block is an ordinary `Blockquote` node under CommonMark, and
 * `alertLineClassesForBlockquote` (src/webview/cm/decorations/alerts.ts)
 * reads the alert type off its first line and derives the group's
 * first/last/single boundary classes from the node's own `from`/`to`. This
 * follows the same shape as `src/test/unit/decorations.test.ts`
 * (CONVENTION (c)): a plain `EditorState`, `buildMarkdownDecorations` called
 * directly, `{from, to, class}` tuples asserted — no `EditorView`/DOM.
 *
 * `src/test/unit/alerts.test.ts` already covers `parseAlertHeader` /
 * `alertLineClasses` (the pure `src/shared/alerts.ts` logic) in isolation;
 * this file only checks that the tree-walk wiring in `decorations.ts`
 * produces the right line decorations end to end.
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

/** A line decoration's `class` is a space-joined `Set`, so word order
 *  follows tree-walk/insertion order, not anything meaningful — compare as
 *  a sorted set of class names instead (matches decorations.test.ts). */
function classSet(tuple: DecorationTuple): string[] {
    return tuple.class.split(' ').sort();
}

function lineClasses(state: EditorState, lineNumber: number): string[] {
    const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);
    const line = state.doc.line(lineNumber);
    const tuple = tuples(built.lineDecorations).find((t) => t.from === line.from);
    assert.ok(tuple, `expected a line decoration on line ${lineNumber}`);
    return classSet(tuple);
}

describe('cm/decorations: GitHub alerts (WP-A)', () => {
    for (const type of ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'] as const) {
        it(`marks a single-line ${type} alert md-alert md-alert-${type.toLowerCase()} alert-first alert-last alert-single`, () => {
            const state = stateFor(`> [!${type}]`);
            assert.deepStrictEqual(
                lineClasses(state, 1),
                [
                    'alert-first',
                    'alert-last',
                    'alert-single',
                    'blockquote-first',
                    'blockquote-last',
                    'md-alert',
                    `md-alert-${type.toLowerCase()}`,
                    'md-blockquote',
                    'md-quote-1',
                ].sort(),
            );
        });
    }

    it('marks a multi-line alert first/content/last across its lines', () => {
        const state = stateFor('> [!WARNING]\n> first line\n> second line');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);
        const lines = tuples(built.lineDecorations);
        assert.strictEqual(lines.length, 3);

        assert.deepStrictEqual(
            classSet(lines[0]),
            ['blockquote-first', 'md-alert', 'md-alert-warning', 'md-blockquote', 'md-quote-1', 'alert-first'].sort(),
        );
        assert.deepStrictEqual(
            classSet(lines[1]),
            ['md-alert-content', 'md-alert-warning', 'md-blockquote', 'md-quote-1'].sort(),
        );
        assert.deepStrictEqual(
            classSet(lines[2]),
            [
                'alert-last',
                'blockquote-last',
                'md-alert-content',
                'md-alert-warning',
                'md-blockquote',
                'md-quote-1',
            ].sort(),
        );
    });

    it('does not treat an ordinary blockquote as an alert', () => {
        const state = stateFor('> just a quote\n> more text');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);
        const lines = tuples(built.lineDecorations);

        assert.strictEqual(lines.length, 2);
        for (const line of lines) {
            assert.ok(!line.class.includes('md-alert'), `unexpected alert class on: ${line.class}`);
        }
        assert.deepStrictEqual(classSet(lines[0]), ['blockquote-first', 'md-blockquote', 'md-quote-1'].sort());
        assert.deepStrictEqual(classSet(lines[1]), ['blockquote-last', 'md-blockquote', 'md-quote-1'].sort());
    });

    it('leaves a malformed alert header (unrecognized type) as an ordinary blockquote', () => {
        const state = stateFor('> [!NOPE]\n> body');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);
        const lines = tuples(built.lineDecorations);

        assert.strictEqual(lines.length, 2);
        for (const line of lines) {
            assert.ok(!line.class.includes('md-alert'), `unexpected alert class on: ${line.class}`);
        }
    });

    it('still styles inline formatting inside an alert body', () => {
        const state = stateFor('> [!TIP]\n> some **bold** text');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        assert.ok(tuples(built.markDecorations).some((t) => t.class === 'md-bold'));
        assert.deepStrictEqual(
            lineClasses(state, 2),
            ['alert-last', 'blockquote-last', 'md-alert-content', 'md-alert-tip', 'md-blockquote', 'md-quote-1'].sort(),
        );
    });

    it('styles the [!NOTE] label so the per-type colour rules have something to match', () => {
        const state = stateFor('> [!WARNING]\n> body');
        const built = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }]);

        const marks = tuples(built.markDecorations);
        const typeMark = marks.find((t) => t.class === 'md-alert-type');
        assert.ok(typeMark, 'the alert type label must carry md-alert-type');
        assert.strictEqual(state.doc.sliceString(typeMark!.from, typeMark!.to), 'WARNING');
    });
});
