import * as assert from 'assert';
import {
    styleInline,
    styleLine,
    markdownToStyledHtml,
    escapeHtml,
    generateLinePrefix,
} from '../../webview/markdown/parser';

/**
 * Unit tests for the markdown parser — the module that turns markdown text into
 * the styled HTML rendered in the editor. These call the real functions.
 */
describe('Markdown Parser', () => {

    describe('escapeHtml', () => {
        it('escapes all five special characters', () => {
            assert.strictEqual(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
        });

        it('leaves plain text untouched', () => {
            assert.strictEqual(escapeHtml('plain text'), 'plain text');
        });
    });

    describe('generateLinePrefix', () => {
        it('produces a non-editable line-number span', () => {
            assert.strictEqual(
                generateLinePrefix(3),
                '<span class="line-prefix" contenteditable="false"><span class="line-number">3</span></span>'
            );
        });
    });

    describe('styleInline', () => {
        it('returns empty string for empty input', () => {
            assert.strictEqual(styleInline(''), '');
        });

        it('escapes HTML in the content', () => {
            assert.ok(styleInline('a <b> c').includes('&lt;b&gt;'));
        });

        it('styles bold and keeps the literal markers', () => {
            const html = styleInline('**bold**');
            assert.ok(html.includes('md-bold'));
            assert.ok(html.includes('<strong>bold</strong>'));
            assert.ok(html.includes('**'));
        });

        it('styles italic', () => {
            const html = styleInline('*it*');
            assert.ok(html.includes('md-italic'));
            assert.ok(html.includes('<em>it</em>'));
        });

        it('styles inline code', () => {
            const html = styleInline('`x`');
            assert.ok(html.includes('md-code'));
            assert.ok(html.includes('<code>x</code>'));
        });

        it('styles strikethrough', () => {
            const html = styleInline('~~gone~~');
            assert.ok(html.includes('md-strike'));
            assert.ok(html.includes('<del>gone</del>'));
        });

        it('styles links with text and url parts', () => {
            const html = styleInline('[text](http://example.com)');
            assert.ok(html.includes('md-link'));
            assert.ok(html.includes('>text<'));
            assert.ok(html.includes('http://example.com'));
        });

        it('styles a full reference-style link', () => {
            const html = styleInline("[I'm a reference link][some ref]");
            assert.ok(html.includes('md-ref-link'));
            assert.ok(html.includes('data-ref="some ref"'));
            assert.ok(html.includes('md-ref'));
            assert.ok(html.includes("I'm a reference link") || html.includes('I&#39;m a reference link'));
        });

        it('uses numbers as reference labels', () => {
            const html = styleInline('[a link][1]');
            assert.ok(html.includes('md-ref-link'));
            assert.ok(html.includes('data-ref="1"'));
        });

        it('defaults a collapsed reference label to the text', () => {
            const html = styleInline('[shortcut][]');
            assert.ok(html.includes('md-ref-link'));
            assert.ok(html.includes('data-ref="shortcut"'));
        });

        it('still prefers inline links over reference links', () => {
            const html = styleInline('[text](http://example.com)');
            assert.ok(html.includes('md-link'));
            assert.ok(!html.includes('md-ref-link'));
        });

        it('styles images before links', () => {
            const html = styleInline('![alt](img.png)');
            assert.ok(html.includes('md-image'));
            assert.ok(html.includes('md-alt'));
            assert.ok(html.includes('img.png'));
        });

        it('styles a URI autolink as a clickable link', () => {
            const html = styleInline('<http://www.example.com>');
            assert.ok(html.includes('md-autolink'));
            assert.ok(html.includes('md-link'));
            assert.ok(html.includes('<span class="md-url">http://www.example.com</span>'));
            // Angle brackets are kept as syntax so the raw text round-trips.
            assert.ok(html.includes('<span class="md-syntax">&lt;</span>'));
            assert.ok(html.includes('<span class="md-syntax">&gt;</span>'));
        });

        it('round-trips the raw <url> as text content', () => {
            const html = styleInline('see <https://example.com/a?x=1&y=2> here');
            // Strip tags and decode entities — should equal the original line.
            const text = html
                .replace(/<[^>]+>/g, '')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&');
            assert.strictEqual(text, 'see <https://example.com/a?x=1&y=2> here');
        });

        it('styles a mailto autolink', () => {
            const html = styleInline('<mailto:hi@example.com>');
            assert.ok(html.includes('md-autolink'));
            assert.ok(html.includes('<span class="md-url">mailto:hi@example.com</span>'));
        });

        it('does not treat schemeless angle text as an autolink', () => {
            const html = styleInline('<not a link>');
            assert.ok(!html.includes('md-autolink'));
        });

        it('treats escaped markers as literal, not formatting', () => {
            const html = styleInline('\\*not bold\\*');
            assert.ok(html.includes('md-escaped'));
            assert.ok(!html.includes('md-bold'));
            assert.ok(!html.includes('<strong>'));
        });
    });

    describe('styleLine', () => {
        it('styles a heading with its level class', () => {
            const html = styleLine('# Title');
            assert.ok(html.includes('md-heading md-h1'));
            assert.ok(html.includes('Title'));
        });

        it('styles an unordered list item', () => {
            assert.ok(styleLine('- item').includes('md-list'));
        });

        it('styles an ordered list item', () => {
            assert.ok(styleLine('1. item').includes('md-list'));
        });

        it('styles a blockquote', () => {
            assert.ok(styleLine('> quote').includes('md-blockquote'));
        });

        it('distinguishes checked and unchecked tasks', () => {
            assert.ok(styleLine('- [ ] todo').includes('md-task-unchecked'));
            assert.ok(styleLine('- [x] done').includes('md-task-checked'));
        });

        it('styles a GitHub alert header', () => {
            assert.ok(styleLine('> [!NOTE]').includes('md-alert-note'));
        });

        it('styles a link reference definition', () => {
            const html = styleLine('[some ref]: https://example.com');
            assert.ok(html.includes('md-link-def'));
            assert.ok(html.includes('data-ref="some ref"'));
            assert.ok(html.includes('md-url'));
            assert.ok(html.includes('https://example.com'));
        });

        it('styles a numeric link reference definition', () => {
            const html = styleLine('[1]: http://slashdot.org');
            assert.ok(html.includes('md-link-def'));
            assert.ok(html.includes('data-ref="1"'));
            assert.ok(html.includes('http://slashdot.org'));
        });

        it('styles the optional title of a link reference definition', () => {
            const html = styleLine('[1]: http://slashdot.org "Slashdot"');
            assert.ok(html.includes('md-link-def-title'));
            assert.ok(html.includes('Slashdot'));
        });

        it('does not treat footnote definitions as link definitions', () => {
            const html = styleLine('[^note]: a footnote');
            assert.ok(html.includes('md-footnote-def'));
            assert.ok(!html.includes('md-link-def'));
        });
    });

    describe('markdownToStyledHtml', () => {
        it('wraps each line in a .line with a .line-content', () => {
            const html = markdownToStyledHtml('# Title\nText');
            assert.ok(html.includes('class="line'));
            assert.ok(html.includes('line-content'));
            assert.ok(html.includes('md-heading md-h1'));
        });

        it('marks empty lines and gives them a <br>', () => {
            const html = markdownToStyledHtml('a\n\nb');
            assert.ok(html.includes('empty-line'));
            assert.ok(html.includes('<br>'));
        });

        it('renders fenced code content verbatim (no inline styling)', () => {
            const html = markdownToStyledHtml('```\n**not bold**\n```');
            assert.ok(html.includes('code-content'));
            assert.ok(!html.includes('md-bold'));
        });

        it('emits one line block per input line', () => {
            const html = markdownToStyledHtml('one\ntwo\nthree');
            assert.strictEqual((html.match(/<div class="line/g) || []).length, 3);
        });
    });
});
