/**
 * Parity corpus: markdown INPUTS, not expected output.
 *
 * This is a corpus of markdown snippets that exercise every construct the
 * current regex-based parser (`src/webview/markdown/parser.ts`) handles. It
 * exists so the CodeMirror 6 port has a fixed, comprehensive set of inputs to
 * render and eyeball/diff against — it is deliberately NOT paired with
 * expected HTML.
 *
 * Do not add assertions against `markdownToStyledHtml`'s current output for
 * these cases. The CM6 port turns nested spans into flat, overlapping marks
 * (`Decoration.mark()` ranges rather than a DOM tree), so which class lands on
 * which character changes by design — a heading's `md-heading` and a link's
 * `md-link` inside it become sibling marks over overlapping ranges instead of
 * nested spans, for example. Asserting today's exact HTML would fail on every
 * single case once CM6 lands, and none of those failures would mean anything:
 * it would just be re-describing the port everyone already knows is
 * happening, not catching a regression.
 *
 * What this corpus is for instead: feed each entry through both renderers
 * during the migration and compare rendered *text content* (round-trip
 * fidelity — see `parser.test.ts`'s "round-trip fidelity" suite for the
 * pattern) and a human/visual diff of the styling, not a class-by-class HTML
 * comparison.
 *
 * Sourced from the markdown embedded in parser.test.ts, lineTypes.test.ts and
 * toc.test.ts, plus samples/sample.md and samples/full.md.
 */

export interface MarkdownCorpusEntry {
    name: string;
    markdown: string;
}

export const markdownCorpus: MarkdownCorpusEntry[] = [
    // --- Headings -----------------------------------------------------
    { name: 'heading-h1', markdown: '# Heading 1' },
    { name: 'heading-h2', markdown: '## Heading 2' },
    { name: 'heading-h3', markdown: '### Heading 3' },
    { name: 'heading-h4', markdown: '#### Heading 4' },
    { name: 'heading-h5', markdown: '##### Heading 5' },
    { name: 'heading-h6', markdown: '###### Heading 6' },
    { name: 'heading-with-bold', markdown: '## H2 with **bold**' },
    { name: 'heading-not-7-hashes', markdown: '####### Not a heading' },
    { name: 'heading-no-space-not-heading', markdown: '#NoSpace' },

    // --- Emphasis / inline styling -------------------------------------
    { name: 'bold-asterisks', markdown: 'This is **bold text**.' },
    { name: 'bold-underscores', markdown: 'This is __also bold__.' },
    { name: 'italic-asterisk', markdown: 'This is *italic text*.' },
    { name: 'italic-underscore', markdown: 'This is _also italic_.' },
    { name: 'bold-italic', markdown: 'This is ***bold and italic*** text.' },
    { name: 'strikethrough', markdown: 'This is ~~strikethrough~~ text.' },
    { name: 'inline-code', markdown: 'This is `inline code` in a sentence.' },
    { name: 'multiple-bold-spans', markdown: '**a** and **b**' },
    { name: 'multiple-strike-spans', markdown: '~~a~~ and ~~b~~' },
    { name: 'emphasis-inside-link-text', markdown: '[**b**](u)' },
    { name: 'combined-bold-with-nested-italic', markdown: 'Combined emphasis with **asterisks and _underscores_**.' },
    { name: 'intraword-double-underscore-not-bold', markdown: 'snake__case__word' },
    { name: 'link-with-balanced-parens-url', markdown: '[w](http://e/a_(b))' },

    // --- Currency / math edge cases -------------------------------------
    { name: 'inline-math', markdown: 'Inline math: $E = mc^2$' },
    { name: 'currency-not-math-pair', markdown: 'the cost will start at $20 and may get up to $40 depending on the usage' },
    { name: 'currency-not-math-single', markdown: 'it costs $5 today' },
    { name: 'currency-not-math-thousands', markdown: '$20,000 and $30,000' },
    { name: 'math-not-triggered-by-leading-space', markdown: 'a $ x + y$ b' },

    // --- Links -----------------------------------------------------------
    { name: 'link-basic', markdown: 'Here is a [link to Google](https://www.google.com).' },
    { name: 'link-with-title-double-quote', markdown: 'Here is a [link with title](https://www.example.com "Example Site").' },
    { name: 'link-with-title-single-quote', markdown: "[text](https://example.com 'Some title')" },
    { name: 'link-relative', markdown: '[Link to full](./full.md)' },
    { name: 'link-relative-with-fragment', markdown: '[Link to full, on links header](./full.md#links)' },
    { name: 'reference-link-full', markdown: "[I'm a reference link][some ref]" },
    { name: 'reference-link-numeric', markdown: '[a link][1]' },
    { name: 'reference-link-collapsed', markdown: '[shortcut][]' },
    { name: 'link-reference-definition', markdown: '[arbitrary case-insensitive reference text]: https://www.mozilla.org' },
    { name: 'link-reference-definition-numeric', markdown: '[1]: http://slashdot.org' },
    { name: 'link-reference-definition-titled', markdown: '[logo]: https://github.com/adam-p/markdown-here/raw/master/src/common/images/icon48.png "Logo Title Text 2"' },
    { name: 'autolink-http', markdown: '<http://www.example.com>' },
    { name: 'autolink-mailto', markdown: '<mailto:hi@example.com>' },
    { name: 'autolink-round-trips-raw-url', markdown: 'see <https://example.com/a?x=1&y=2> here' },
    { name: 'not-an-autolink-schemeless', markdown: '<not a link>' },
    { name: 'linked-image', markdown: '[![IMAGE ALT TEXT HERE](http://img.youtube.com/vi/ciawICBvQoE/0.jpg)](http://www.youtube.com/watch?v=ciawICBvQoE)' },
    { name: 'footnote-reference', markdown: 'Footnote 1 link[^first].' },
    { name: 'footnote-definition', markdown: '[^first]: Footnote **can have markup**' },
    { name: 'footnote-definition-plain', markdown: '[^note]: a footnote' },

    // --- Images ------------------------------------------------------------
    { name: 'image-basic', markdown: 'Here is an image: ![Alt text](./images/logo.png)' },
    { name: 'image-empty-alt', markdown: '![](./image.png)' },
    { name: 'image-title-double-quote', markdown: '![alt text](https://example.com/icon.png "Logo Title Text 1")' },
    { name: 'image-title-single-quote', markdown: "Here is an image with title: ![Logo](../images/springbok-logo.png 'Springbok Logo')" },
    { name: 'image-relative-parent-path', markdown: '![logo](../images/logo.png)' },

    // --- Lists ---------------------------------------------------------
    { name: 'unordered-list-dash', markdown: '- First item\n- Second item\n- Third item' },
    { name: 'unordered-list-asterisk', markdown: '* Alternative bullet style\n* Another item' },
    { name: 'unordered-list-plus', markdown: '+ Create a list by starting a line with `+`, `-`, or `*`' },
    { name: 'unordered-list-nested', markdown: '- First item\n- Second item\n- Third item\n  - Nested item 1\n  - Nested item 2\n    - Deep nested item' },
    { name: 'ordered-list', markdown: '1. First ordered item\n2. Second ordered item\n3. Third ordered item' },
    { name: 'ordered-list-nested', markdown: '1. First ordered item\n2. Second ordered item\n   1. Nested ordered item\n   2. Another nested item' },
    { name: 'task-list', markdown: '- [ ] Unchecked task\n- [x] Checked task\n- [ ] Another task' },
    { name: 'task-list-uppercase-x', markdown: '- [X] Done' },
    { name: 'mixed-lists-and-tasks', markdown: '- a\n- b\n1. one\n2. two\n- [ ] todo\n- [x] done' },

    // --- Blockquotes -----------------------------------------------------
    { name: 'blockquote-single-line', markdown: '> This is a blockquote.' },
    { name: 'blockquote-multiline', markdown: '> This is a blockquote.\n> It can span multiple lines.' },
    { name: 'blockquote-nested-2', markdown: '> Nested blockquotes:\n>> This is nested inside.' },
    { name: 'blockquote-nested-3-plus', markdown: '> a\n>> b\n>>> c\n>>>> d (capped at 3 visually)' },
    { name: 'blockquote-no-space', markdown: '>NoSpace' },
    { name: 'blockquote-with-inline-styling', markdown: '> Quote with **bold** and [a link](http://example.com).' },

    // --- GitHub alerts -----------------------------------------------------
    { name: 'alert-note', markdown: '> [!NOTE]\n> Useful information that users should know, even when skimming content.' },
    { name: 'alert-tip', markdown: '> [!TIP]\n> Helpful advice for doing things better or more easily.' },
    { name: 'alert-important', markdown: '> [!IMPORTANT]\n> Key information users need to know to achieve their goal.' },
    { name: 'alert-warning', markdown: '> [!WARNING]\n> Urgent info that needs immediate user attention to avoid problems.' },
    { name: 'alert-caution', markdown: '> [!CAUTION]\n> Advises about risks or negative outcomes of certain actions.' },
    { name: 'alert-header-only-no-content', markdown: '> [!NOTE]' },
    { name: 'alert-multiline-content', markdown: '> [!WARNING]\n> Line one.\n> Line two.\n> Line three.' },
    { name: 'alert-lowercase-header', markdown: '> [!note]\n> still an alert' },
    { name: 'consecutive-different-alerts', markdown: '> [!NOTE]\n> First.\n\n> [!TIP]\n> Second.' },

    // --- Code blocks -----------------------------------------------------
    { name: 'fenced-code-with-lang', markdown: '```javascript\nfunction greet(name) {\n    console.log(`Hello, ${name}!`);\n    return true;\n}\n```' },
    { name: 'fenced-code-python', markdown: '```python\ndef hello_world():\n    print("Hello, World!")\n```' },
    { name: 'fenced-code-no-lang', markdown: '```\nPlain code block without language\nJust some text here\n```' },
    { name: 'fenced-code-markdown-syntax-not-styled', markdown: '```\n**not bold** and # not a heading\n```' },

    // --- Horizontal rules --------------------------------------------------
    { name: 'hr-dashes', markdown: '---' },
    { name: 'hr-asterisks', markdown: '***' },
    { name: 'hr-underscores', markdown: '___' },
    { name: 'hr-long', markdown: '----------' },
    { name: 'hr-trailing-spaces', markdown: '---   ' },

    // --- Tables --------------------------------------------------------
    { name: 'table-basic', markdown: '| Header 1 | Header 2 | Header 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n| Cell 4   | Cell 5   | Cell 6   |' },
    { name: 'table-alignment', markdown: '| Tables        | Are           | Cool  |\n| ------------- |:-------------:| -----:|\n| col 3 is      | right-aligned | $1600 |' },
    { name: 'table-alignment-explicit-left', markdown: '| Left | Center | Right |\n|:-----|:------:|------:|\n| L1   |   C1   |    R1 |\n| L2   |   C2   |    R2 |' },
    { name: 'table-unpadded', markdown: '|Tables|Are|Cool|\n|-|:-:|-:|\n|col 3 is|right-aligned|$1600|' },
    { name: 'table-without-delimiter-not-a-table', markdown: '| a | b |\n| c | d |' },

    // --- Definition lists --------------------------------------------------
    { name: 'definition-list', markdown: 'Term 1\n: Definition for term 1' },

    // --- Escapes -------------------------------------------------------
    { name: 'escaped-asterisks', markdown: '\\*not bold\\*' },
    { name: 'escaped-dollar', markdown: '\\$x + y\\$' },
    { name: 'escaped-mixed', markdown: 'Escape special characters: \\*not italic\\* and \\$5' },

    // --- Special characters / HTML escaping --------------------------------
    { name: 'html-special-chars', markdown: 'a <b> c & "quoted" \'text\'' },
    { name: 'html-entities-as-text', markdown: 'HTML entities: &copy; &reg; &trade;' },
    { name: 'emoji', markdown: 'Emojis: 🎉 🚀 ✨ 👍' },

    // --- Blank lines / paragraphs -------------------------------------
    { name: 'blank-lines', markdown: 'a\n\n\nb' },
    { name: 'two-paragraphs', markdown: 'First paragraph.\n\nSecond paragraph after blank line.' },
    { name: 'trailing-hard-break-spaces', markdown: 'First line with two spaces at end  \nSecond line after soft break' },

    // --- Larger composite documents (from samples/) -------------------
    {
        name: 'sample-full-document-excerpt',
        markdown: [
            '# Sample Markdown Document',
            '',
            'This is a comprehensive sample to test all markdown features.',
            '',
            '## Text Formatting',
            '',
            'This is **bold text** and this is __also bold__.',
            '',
            'This is *italic text* and this is _also italic_.',
            '',
            '## Links and Images',
            '',
            'Here is a [link to Google](https://www.google.com).',
            '',
            'Here is an image: ![Alt text](./images/logo.png)',
            '',
            '## Lists',
            '',
            '- First item',
            '- Second item',
            '  - Nested item 1',
            '',
            '1. First ordered item',
            '2. Second ordered item',
            '',
            '- [ ] Unchecked task',
            '- [x] Checked task',
            '',
            '## Blockquotes',
            '',
            '> This is a blockquote.',
            '> It can span multiple lines.',
            '',
            '## GitHub Alerts',
            '',
            '> [!NOTE]',
            '> Useful information that users should know, even when skimming content.',
            '',
            '## Tables',
            '',
            '| Header 1 | Header 2 |',
            '|----------|----------|',
            '| Cell 1   | Cell 2   |',
        ].join('\n'),
    },
    {
        name: 'full-md-links-and-references-excerpt',
        markdown: [
            '# Links',
            '',
            '[I\'m an inline-style link](https://www.google.com)',
            '',
            '[I\'m an inline-style link with title](https://www.google.com "Google\'s Homepage")',
            '',
            '[I\'m a reference-style link][Arbitrary case-insensitive reference text]',
            '',
            '[You can use numbers for reference-style link definitions][1]',
            '',
            'Or leave it empty and use the [link text itself].',
            '',
            'http://www.example.com or <http://www.example.com> and sometimes',
            'example.com (but not on Github, for example).',
            '',
            '[arbitrary case-insensitive reference text]: https://www.mozilla.org',
            '[1]: http://slashdot.org',
            '[link text itself]: http://www.reddit.com',
        ].join('\n'),
    },
    {
        name: 'full-md-footnotes-excerpt',
        markdown: [
            '# Footnotes',
            '',
            'Footnote 1 link[^first].',
            '',
            'Footnote 2 link[^second].',
            '',
            'Duplicated footnote reference[^second].',
            '',
            '[^first]: Footnote **can have markup**',
            '',
            '[^second]: Footnote text.',
        ].join('\n'),
    },
    {
        name: 'full-md-blockquotes-excerpt',
        markdown: [
            '# Blockquotes',
            '',
            '> Blockquotes can also be nested...',
            '>> ...by using additional greater-than signs right next to each other...',
            '>>> ...or with spaces between arrows.',
        ].join('\n'),
    },
];
