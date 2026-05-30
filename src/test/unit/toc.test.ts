import * as assert from 'assert';
import { extractHeadingsFromMarkdown, findHeadingLineIndex, scrollToHeading } from '../../webview/toc';
import { escapeHtml } from '../../webview/markdown/parser';

/**
 * Unit tests for Table of Contents functionality.
 * These exercise the real heading-extraction and HTML-escaping production code.
 */
describe('Table of Contents', () => {

    describe('Heading Extraction from Markdown', () => {
        it('should extract H1 heading', () => {
            const headings = extractHeadingsFromMarkdown('# Main Title');
            assert.strictEqual(headings.length, 1);
            assert.strictEqual(headings[0].level, 1);
            assert.strictEqual(headings[0].text, 'Main Title');
        });

        it('should extract multiple heading levels', () => {
            const markdown = `# H1
## H2
### H3
#### H4
##### H5
###### H6`;
            const headings = extractHeadingsFromMarkdown(markdown);
            assert.strictEqual(headings.length, 6);
            for (let i = 0; i < 6; i++) {
                assert.strictEqual(headings[i].level, i + 1);
            }
        });

        it('should extract headings from complex document', () => {
            const markdown = `# Introduction

Some text here.

## Getting Started

More content.

### Installation

Install instructions.

### Configuration

Config details.

## Usage

How to use.

## Conclusion

Final thoughts.`;
            const headings = extractHeadingsFromMarkdown(markdown);
            assert.strictEqual(headings.length, 6);
            assert.deepStrictEqual(
                headings.map(h => h.text),
                ['Introduction', 'Getting Started', 'Installation', 'Configuration', 'Usage', 'Conclusion']
            );
        });

        it('should keep inline formatting in heading text', () => {
            const headings = extractHeadingsFromMarkdown('# Hello **bold** and *italic*');
            assert.strictEqual(headings.length, 1);
            assert.strictEqual(headings[0].text, 'Hello **bold** and *italic*');
        });

        it('should skip empty headings (e.g. a bare "# ")', () => {
            const headings = extractHeadingsFromMarkdown('# \n# Real');
            assert.strictEqual(headings.length, 1);
            assert.strictEqual(headings[0].text, 'Real');
        });

        it('should require a space after the hashes', () => {
            assert.strictEqual(extractHeadingsFromMarkdown('#NoSpace').length, 0);
        });

        it('should not match 7+ hashes', () => {
            assert.strictEqual(extractHeadingsFromMarkdown('####### Not a heading').length, 0);
        });

        it('should handle empty document', () => {
            assert.strictEqual(extractHeadingsFromMarkdown('').length, 0);
        });

        it('should handle document with no headings', () => {
            const markdown = `Just some text.

More paragraphs here.

No headings at all.`;
            assert.strictEqual(extractHeadingsFromMarkdown(markdown).length, 0);
        });
    });

    describe('Heading line lookup', () => {
        it('maps heading index to absolute editor line index', () => {
            const lineTexts = ['# A', '', 'text', '## B', 'more', '### C'];
            assert.strictEqual(findHeadingLineIndex(lineTexts, 0), 0);
            assert.strictEqual(findHeadingLineIndex(lineTexts, 1), 3);
            assert.strictEqual(findHeadingLineIndex(lineTexts, 2), 5);
        });

        it('returns null when the heading index is out of range', () => {
            assert.strictEqual(findHeadingLineIndex(['# A', 'text'], 1), null);
        });
    });

    describe('Clicking a TOC entry', () => {
        // Minimal editor stub: .line elements whose .line-content holds the text.
        function makeEditorStub(lineTexts: string[], scrolled: boolean[]): HTMLElement {
            const lines = lineTexts.map((text, i) => ({
                querySelector: (sel: string) => (sel === '.line-content' ? { textContent: text } : null),
                scrollIntoView: () => { scrolled[i] = true; },
            }));
            return {
                querySelectorAll: (sel: string) => (sel === '.line' ? lines : []),
            } as unknown as HTMLElement;
        }

        it('moves focus and cursor to the clicked heading line', () => {
            const lineTexts = ['# A', 'paragraph', '## B'];
            const scrolled = lineTexts.map(() => false);
            const editor = makeEditorStub(lineTexts, scrolled);

            let focusedLineIndex = -1;
            scrollToHeading(1, {
                getEditor: () => editor,
                focusLine: (_editor, lineIndex) => { focusedLineIndex = lineIndex; },
            });

            assert.strictEqual(scrolled[2], true, 'should scroll to the heading line');
            assert.strictEqual(focusedLineIndex, 2, 'should move focus/cursor to the heading line');
        });
    });

    describe('HTML Escaping for TOC', () => {
        it('should escape angle brackets', () => {
            const escaped = escapeHtml('<script>alert("xss")</script>');
            assert.ok(!escaped.includes('<script>'));
            assert.ok(escaped.includes('&lt;script&gt;'));
        });

        it('should escape ampersands', () => {
            assert.ok(escapeHtml('Tom & Jerry').includes('&amp;'));
        });

        it('should escape quotes', () => {
            assert.ok(escapeHtml('Say "hello"').includes('&quot;'));
        });

        it('should handle heading with special characters', () => {
            const escaped = escapeHtml('Using <T> & "quotes"');
            assert.ok(escaped.includes('&lt;T&gt;'));
            assert.ok(escaped.includes('&amp;'));
            assert.ok(escaped.includes('&quot;'));
        });
    });
});
