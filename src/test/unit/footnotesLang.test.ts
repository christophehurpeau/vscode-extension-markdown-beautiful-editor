import * as assert from 'assert';
import { parser, GFM } from '@lezer/markdown';
import { footnotesExtension } from '../../webview/cm/lang/footnotes';
import { markdownCorpus } from '../fixtures/markdown-corpus';

/**
 * Parse-tree test harness, copied from `mathLang.test.ts` /
 * `definitionListLang.test.ts` (see those files and `../../webview/cm/lang/
 * footnotes.ts` for the trap this avoids): configure the RAW `@lezer/
 * markdown` parser with `[GFM, <our extension>]` — NOT
 * `parser.configure({extensions: [GFM]})`, which is a silent no-op — and
 * assert `.parse(src).toString()` against an exact tree shape.
 */
const testParser = parser.configure([GFM, footnotesExtension]);

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

describe('cm/lang/footnotes: footnotesExtension', () => {
    describe('inline reference [^id]', () => {
        it('parses [^1] as Footnote(FootnoteMark,FootnoteLabel,FootnoteMark), not a Link', () => {
            assert.strictEqual(
                tree('See[^1] here.'),
                'Document(Paragraph(Footnote(FootnoteMark,FootnoteLabel,FootnoteMark)))'
            );
        });

        it('registers before: Link, so a bare shortcut reference is not confused with it', () => {
            // Per finishLink, a bare [t] with nothing following would otherwise
            // resolve as a shortcut Link(LinkMark,LinkMark) — see footnotes.ts's
            // header. Confirms the ordering directive actually holds.
            assert.ok(!tree('[^1]').includes('Link('));
        });

        it('does not cross a line break inside a paragraph', () => {
            // Our parser correctly declines (id would cross the \n). What
            // claims it instead is @lezer/markdown's own Link shortcut
            // fallback (see the "before: Link" header note) — not a footnote
            // either way, which is what this asserts.
            assert.strictEqual(tree('[^1\n2]'), 'Document(Paragraph(Link(LinkMark,LinkMark)))');
        });

        it('requires a non-empty id', () => {
            // Declined by us (empty id); Link's shortcut fallback claims the
            // bracket pair instead (label "^"), same reasoning as above.
            assert.strictEqual(tree('[^]'), 'Document(Paragraph(Link(LinkMark,LinkMark)))');
        });

        it('parses a footnote ref inside emphasis', () => {
            assert.strictEqual(
                tree('*[^1]*'),
                'Document(Paragraph(Emphasis(EmphasisMark,Footnote(FootnoteMark,FootnoteLabel,FootnoteMark),EmphasisMark)))'
            );
        });

        it('an ordinary [text](url) link still parses as Link', () => {
            assert.strictEqual(
                tree('[text](url)'),
                'Document(Paragraph(Link(LinkMark,LinkMark,LinkMark,URL,LinkMark)))'
            );
        });
    });

    describe('block definition [^id]: text', () => {
        it('parses [^1]: text as FootnoteDef(FootnoteDefMark,FootnoteDefLabel,FootnoteDefMark), not a LinkReference', () => {
            assert.strictEqual(
                tree('[^1]: text'),
                'Document(FootnoteDef(FootnoteDefMark,FootnoteDefLabel,FootnoteDefMark))'
            );
        });

        it('registers before: LinkReference, so a single-word body is not parsed as a link reference definition', () => {
            // "text" alone is a syntactically valid bare URL token, so
            // [^1]: text would otherwise satisfy LinkReference for the label
            // "^1" — see footnotes.ts's header on why this directive matters.
            assert.ok(!tree('[^1]: text').includes('LinkReference'));
        });

        it('an ordinary [label]: url still parses as LinkReference', () => {
            assert.strictEqual(tree('[label]: url'), 'Document(LinkReference(LinkLabel,LinkMark,URL))');
        });

        it('parses inline formatting in the body', () => {
            assert.strictEqual(
                tree('[^1]: some **bold**'),
                'Document(FootnoteDef(FootnoteDefMark,FootnoteDefLabel,FootnoteDefMark,StrongEmphasis(EmphasisMark,EmphasisMark)))'
            );
        });

        it('a [^1]: line immediately after a paragraph line is still recognized (the endLeaf case)', () => {
            // Absent endLeaf, this line is silently absorbed as lazy paragraph
            // continuation text and parseFootnoteDef never runs — the single
            // most important failure mode this package guards against.
            assert.strictEqual(
                tree('Footnote 1 link[^1].\n[^1]: Footnote text.'),
                'Document(Paragraph(Footnote(FootnoteMark,FootnoteLabel,FootnoteMark)),' +
                    'FootnoteDef(FootnoteDefMark,FootnoteDefLabel,FootnoteDefMark))'
            );
        });

        it('does not trigger without the required space after the colon', () => {
            // Declined by us (missing the required space). The old parser's
            // link-ref-definition fallback also excluded labels starting
            // with "^" (/^(\s*)\[([^\]^][^\]]*)\]:.../), so this fell through
            // to plain text there. @lezer/markdown's built-in LinkReference
            // has no such restriction, so this raw-grammar edge case (no
            // space at all after the colon) claims it as a link reference
            // instead — a minor, deliberately accepted parity difference for
            // a malformed input the old parser also didn't treat as a
            // footnote definition.
            assert.strictEqual(tree('[^1]:text'), 'Document(LinkReference(LinkLabel,LinkMark,URL))');
        });

        it('allows an empty body after the required space', () => {
            assert.strictEqual(
                tree('[^1]: '),
                'Document(FootnoteDef(FootnoteDefMark,FootnoteDefLabel,FootnoteDefMark))'
            );
        });
    });

    describe('parity with the deleted regex parser (fixtures from markdown-corpus.ts)', () => {
        it('footnote-reference', () => {
            assert.strictEqual(
                tree(corpusMarkdown('footnote-reference')),
                'Document(Paragraph(Footnote(FootnoteMark,FootnoteLabel,FootnoteMark)))'
            );
        });

        it('footnote-definition', () => {
            assert.strictEqual(
                tree(corpusMarkdown('footnote-definition')),
                'Document(FootnoteDef(FootnoteDefMark,FootnoteDefLabel,FootnoteDefMark,' +
                    'StrongEmphasis(EmphasisMark,EmphasisMark)))'
            );
        });

        it('footnote-definition-plain', () => {
            assert.strictEqual(
                tree(corpusMarkdown('footnote-definition-plain')),
                'Document(FootnoteDef(FootnoteDefMark,FootnoteDefLabel,FootnoteDefMark))'
            );
        });

        it('full-md-footnotes-excerpt', () => {
            const result = tree(corpusMarkdown('full-md-footnotes-excerpt'));
            assert.ok(result.includes('FootnoteDef('), 'expected at least one FootnoteDef');
            assert.ok(result.includes('Footnote(FootnoteMark'), 'expected at least one Footnote reference');
            assert.ok(!result.includes('LinkReference'), 'body text must not be mistaken for a LinkReference');
        });
    });
});
