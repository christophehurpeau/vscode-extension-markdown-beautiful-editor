import * as assert from 'assert';
import { parser, GFM } from '@lezer/markdown';
import { mathExtension } from '../../webview/cm/lang/math';
import { markdownCorpus } from '../fixtures/markdown-corpus';

/**
 * Parse-tree test harness — REFERENCE for WP-G2/WP-G3 (see the header of
 * `../../webview/cm/lang/math.ts`): configure the RAW `@lezer/markdown`
 * parser with `[GFM, <our extension>]` and assert `.parse(src).toString()`
 * against an exact tree shape.
 *
 * `@lezer/markdown` and `@codemirror/state` are CommonJS and DOM-free, so
 * this runs in the plain mocha suite with no VS Code / webview needed.
 *
 * Trap to avoid (see `.claude/agents/cm6-migration.md`): on this raw parser,
 * `parser.configure({ extensions: [GFM] })` is a silent no-op — `GFM` is
 * itself an array of `MarkdownConfig`s, and `MarkdownConfig` has no
 * `extensions` key, so GFM constructs would look "off" without error. The
 * correct call passes an array whose elements are `GFM` and our own
 * extension directly, as below. (Only `markdown()` from `@codemirror/
 * lang-markdown` — used by the real editor, see `../../webview/cm/
 * extensions.ts` — takes an `extensions` option.)
 */
const testParser = parser.configure([GFM, mathExtension]);

function tree(src: string): string {
    return testParser.parse(src).toString();
}

function corpusMarkdown(name: string): string {
    const entry = markdownCorpus.find((e) => e.name === name);
    if (!entry) {
        throw new Error(`missing corpus entry: ${name}`);
    }
    return entry.markdown;
}

describe('cm/lang/math: mathExtension', () => {
    it('parses $x$ as InlineMath(MathMark, MathContent, MathMark)', () => {
        assert.strictEqual(tree('$x$'), 'Document(Paragraph(InlineMath(MathMark,MathContent,MathMark)))');
    });

    it('keeps `$x$` as InlineCode, not math (registered after: InlineCode)', () => {
        assert.strictEqual(tree('`$x$`'), 'Document(Paragraph(InlineCode(CodeMark,CodeMark)))');
    });

    it('parses math inside link text', () => {
        assert.strictEqual(
            tree('[$x$](u)'),
            'Document(Paragraph(Link(LinkMark,InlineMath(MathMark,MathContent,MathMark),LinkMark,LinkMark,URL,LinkMark)))'
        );
    });

    it('parses math adjacent to emphasis', () => {
        assert.strictEqual(
            tree('*$x$*'),
            'Document(Paragraph(Emphasis(EmphasisMark,InlineMath(MathMark,MathContent,MathMark),EmphasisMark)))'
        );
    });

    it('does not cross a line break inside a paragraph', () => {
        // Parity with the old parser, which ran its regex per rendered line
        // (see the header of ../../webview/cm/lang/math.ts). A Lezer inline
        // section can span a paragraph's soft-wrapped lines, so this would
        // otherwise match across the `\n` where the old regex never could.
        assert.strictEqual(tree('$x\ny$'), 'Document(Paragraph)');
    });

    it('preserves the degenerate empty-content match for "$$", ported as-is from the old regex', () => {
        // /\$(?=\S)([^$]*?)(?<=\S)\$(?!\d)/ matches "$$": the first `$` is
        // simultaneously "non-space after open" and "non-space before
        // close" for empty content. Not block-math syntax — see the header
        // comment in math.ts for why this is intentional, not a bug.
        assert.strictEqual(tree('$$'), 'Document(Paragraph(InlineMath(MathMark,MathContent,MathMark)))');
    });

    describe('parity with the deleted regex parser (fixtures from markdown-corpus.ts)', () => {
        it('inline-math', () => {
            assert.strictEqual(
                tree(corpusMarkdown('inline-math')),
                'Document(Paragraph(InlineMath(MathMark,MathContent,MathMark)))'
            );
        });

        it('math-not-triggered-by-leading-space: opening $ must be followed by a non-space char', () => {
            assert.strictEqual(tree(corpusMarkdown('math-not-triggered-by-leading-space')), 'Document(Paragraph)');
        });

        it('currency-not-math-single: an unmatched $ stays plain text', () => {
            assert.strictEqual(tree(corpusMarkdown('currency-not-math-single')), 'Document(Paragraph)');
        });

        it('currency-not-math-pair: "$20 ... $40" stays plain text (space before closing $)', () => {
            assert.strictEqual(tree(corpusMarkdown('currency-not-math-pair')), 'Document(Paragraph)');
        });

        it('currency-not-math-thousands: "$20,000 and $30,000" stays plain text', () => {
            assert.strictEqual(tree(corpusMarkdown('currency-not-math-thousands')), 'Document(Paragraph)');
        });

        it('escaped-dollar: \\$...\\$ is Escape, not math', () => {
            assert.strictEqual(tree(corpusMarkdown('escaped-dollar')), 'Document(Paragraph(Escape,Escape))');
        });

        it('escaped-mixed: \\$5 among other escapes stays Escape, not math', () => {
            assert.strictEqual(
                tree(corpusMarkdown('escaped-mixed')),
                'Document(Paragraph(Escape,Escape,Escape))'
            );
        });

        it('table cells with a lone $amount do not trigger math', () => {
            assert.ok(!tree(corpusMarkdown('table-alignment')).includes('InlineMath'));
            assert.ok(!tree(corpusMarkdown('table-unpadded')).includes('InlineMath'));
        });
    });
});
