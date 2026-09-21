import * as assert from 'assert';
import { parser, GFM } from '@lezer/markdown';
import { frontmatterExtension } from '../../webview/cm/lang/frontmatter';
import { markdownCorpus } from '../fixtures/markdown-corpus';

/**
 * Parse-tree tests for `cm/lang/frontmatter.ts`, in the shape established by
 * `./mathLang.test.ts`: configure the RAW `@lezer/markdown` parser with
 * `[GFM, <our extension>]` and assert `.parse(src).toString()`.
 *
 * The extension carries a `wrap` (`parseMixed` over `@lezer/yaml`), and a
 * mounted tree DOES show up in `Tree.toString()` — that is why the expected
 * trees below contain YAML node names (`Stream`, `BlockMapping`, `Pair`, …).
 * Asserting them is the point: it is the only place the suite can see that the
 * frontmatter body is parsed as YAML rather than as markdown.
 */
const testParser = parser.configure([GFM, frontmatterExtension]);

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

describe('cm/lang/frontmatter: frontmatterExtension', () => {
    it('parses a leading --- block as Frontmatter(Mark, yaml, Mark)', () => {
        assert.strictEqual(
            tree('---\ntitle: Hello\n---\n\nbody'),
            'Document(Frontmatter(FrontmatterMark,' +
                'Stream(Document(BlockMapping(Pair(Key(Literal),":",Literal)))),' +
                'FrontmatterMark),Paragraph)',
        );
    });

    it('leaves the markdown after the closing fence untouched', () => {
        assert.strictEqual(
            tree(corpusMarkdown('frontmatter-basic')),
            'Document(Frontmatter(FrontmatterMark,' +
                'Stream(Document(BlockMapping(Pair(Key(Literal),":",Literal),' +
                'Pair(Key(Literal),":",FlowSequence("[",Item(Literal),",",Item(Literal),"]"))))),' +
                'FrontmatterMark),ATXHeading1(HeaderMark),Paragraph)',
        );
    });

    // The whole reason this is worth having: without the extension, `---` is a
    // HorizontalRule and the YAML below it is the title of a SetextHeading2
    // (with `tags: [a, b]` parsed as a Link), so the block renders as a
    // document-wide H2.
    it('is what stops the block parsing as a horizontal rule + setext heading', () => {
        const withoutExtension = parser.configure(GFM).parse(corpusMarkdown('frontmatter-basic')).toString();

        assert.ok(withoutExtension.startsWith('Document(HorizontalRule,SetextHeading2('));
    });

    it('parses nested maps, sequences and block scalars through @lezer/yaml', () => {
        assert.strictEqual(
            tree(corpusMarkdown('frontmatter-nested')),
            'Document(Frontmatter(FrontmatterMark,' +
                'Stream(Document(BlockMapping(' +
                'Pair(Key(Literal),":",BlockMapping(Pair(Key(Literal),":",' +
                'BlockSequence("-",Item(BlockMapping(Pair(Key(Literal),":",Literal))))))),' +
                'Pair(Key(Literal),":",BlockLiteral(BlockLiteralHeader,BlockLiteralContent))))),' +
                'FrontmatterMark),Paragraph)',
        );
    });

    it('accepts an empty block, emitting no content node', () => {
        assert.strictEqual(
            tree('---\n---\n\nbody'),
            'Document(Frontmatter(FrontmatterMark,FrontmatterMark),Paragraph)',
        );
    });

    it('accepts trailing whitespace on either fence', () => {
        assert.strictEqual(
            tree('--- \ntitle: x\n--- \n\nbody'),
            'Document(Frontmatter(FrontmatterMark,' +
                'Stream(Document(BlockMapping(Pair(Key(Literal),":",Literal)))),' +
                'FrontmatterMark),Paragraph)',
        );
    });

    // Recognition guards — see the extension's header for why each exists.
    it('does not fire on a document that opens with a horizontal rule', () => {
        assert.strictEqual(tree('---\n\nnot frontmatter'), 'Document(HorizontalRule,Paragraph)');
    });

    it('does not fire below the first line', () => {
        assert.strictEqual(tree('\n---\ntitle: x\n---'), 'Document(HorizontalRule,SetextHeading2(HeaderMark))');
    });

    it('does not fire inside block markup', () => {
        assert.strictEqual(
            tree('> ---\n> a: 1\n> ---'),
            'Document(Blockquote(QuoteMark,HorizontalRule,QuoteMark,SetextHeading2(HeaderMark)))',
        );
    });

    // Documented limitation, asserted so it is a decision rather than a
    // surprise: `@lezer/markdown` offers a block parser no lookahead past
    // `cx.peekLine()` and no way to un-consume a line, so a block whose
    // closing fence is missing runs to the end of the document. Transient
    // while typing a new block into an existing document; it resolves as soon
    // as the closing `---` is typed.
    it('runs to the end of the document when the closing fence is missing', () => {
        assert.strictEqual(
            tree('---\ntitle: x\n\n# Heading'),
            'Document(Frontmatter(FrontmatterMark,' +
                'Stream(Document(BlockMapping(Pair(Key(Literal),":",Literal))),Comment)))',
        );
    });
});
