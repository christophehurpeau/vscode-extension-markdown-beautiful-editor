import * as assert from 'assert';
import { parser, GFM } from '@lezer/markdown';
import { definitionListExtension } from '../../webview/cm/lang/definitionList';
import { markdownCorpus } from '../fixtures/markdown-corpus';

/**
 * Parse-tree test harness, copied from `mathLang.test.ts` (see that file and
 * `../../webview/cm/lang/math.ts` for the trap this avoids): configure the
 * RAW `@lezer/markdown` parser with `[GFM, <our extension>]` — NOT
 * `parser.configure({extensions: [GFM]})`, which is a silent no-op — and
 * assert `.parse(src).toString()` against an exact tree shape.
 */
const testParser = parser.configure([GFM, definitionListExtension]);

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

describe('cm/lang/definitionList: definitionListExtension', () => {
    it('parses a definition line directly under a term line (the endLeaf case)', () => {
        // This is the case that matters: by construction a definition line
        // follows a term line, which is a Paragraph, so absent `endLeaf` this
        // would be silently absorbed as lazy continuation text and never
        // reach our block parser. See definitionList.ts's header.
        assert.strictEqual(
            tree('Term 1\n: Definition for term 1'),
            'Document(Paragraph,Definition(DefinitionMark))'
        );
    });

    it('parses multiple consecutive definitions under one term as sibling Definition nodes', () => {
        // Parity with the old regex parser, which styled each `: text` line
        // independently with no grouping — see the "single-line leaf block,
        // not composite" note in definitionList.ts.
        assert.strictEqual(
            tree('Term 1\n: First definition\n: Second definition'),
            'Document(Paragraph,Definition(DefinitionMark),Definition(DefinitionMark))'
        );
    });

    it('parses a `:` line not preceded by a term (old parser had no lookback)', () => {
        // The deleted regex parser matched `^:\s` per line with no check on
        // the previous line at all — a bare `: text` as the first line of a
        // document matches exactly as readily as one under a paragraph.
        assert.strictEqual(tree(': orphan definition'), 'Document(Definition(DefinitionMark))');
    });

    it('does not trigger on a colon mid-sentence', () => {
        assert.strictEqual(tree('Note: this is not a definition'), 'Document(Paragraph)');
    });

    it('does not trigger on a colon with no following space', () => {
        assert.strictEqual(tree(':nope'), 'Document(Paragraph)');
    });

    it('parses inline formatting inside a definition', () => {
        assert.strictEqual(
            tree('Term\n: some **bold**'),
            'Document(Paragraph,Definition(DefinitionMark,StrongEmphasis(EmphasisMark,EmphasisMark)))'
        );
    });

    describe('parity with the deleted regex parser (fixtures from markdown-corpus.ts)', () => {
        it('definition-list', () => {
            assert.strictEqual(
                tree(corpusMarkdown('definition-list')),
                'Document(Paragraph,Definition(DefinitionMark))'
            );
        });

        it('accepts a tab after the colon, as the old `^:\\s` regex did', () => {
            assert.strictEqual(
                tree('Term\n:\tthe definition'),
                'Document(Paragraph,Definition(DefinitionMark))'
            );
        });
    });
});
