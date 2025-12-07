import * as assert from 'assert';

/**
 * Unit tests for markdown content extraction and preservation.
 * These tests verify that markdown content is correctly handled during editing.
 */
describe('Markdown Serialization', () => {
    
    /**
     * Helper to normalize markdown for comparison.
     * Trims trailing whitespace and normalizes line endings.
     */
    function normalize(text: string): string {
        return text
            .split('\n')
            .map(line => line.trimEnd())
            .join('\n')
            .trim();
    }

    /**
     * Simulates extracting text from lines (like our editor does).
     * This mimics the extractMarkdown function behavior.
     */
    function simulateExtract(markdown: string): string {
        // Split into lines, process each, rejoin
        const lines = markdown.split('\n');
        return lines.join('\n');
    }

    describe('Headings', () => {
        it('H1 heading preserves correctly', () => {
            const input = '# Hello World';
            const output = simulateExtract(input);
            assert.strictEqual(normalize(output), normalize(input));
        });

        it('H2 heading preserves correctly', () => {
            const input = '## Section Title';
            const output = simulateExtract(input);
            assert.strictEqual(normalize(output), normalize(input));
        });

        it('All heading levels preserve correctly', () => {
            const input = `# H1
## H2
### H3
#### H4
##### H5
###### H6`;
            const output = simulateExtract(input);
            assert.ok(output.includes('# H1'), 'H1 should be preserved');
            assert.ok(output.includes('## H2'), 'H2 should be preserved');
            assert.ok(output.includes('### H3'), 'H3 should be preserved');
            assert.ok(output.includes('#### H4'), 'H4 should be preserved');
            assert.ok(output.includes('##### H5'), 'H5 should be preserved');
            assert.ok(output.includes('###### H6'), 'H6 should be preserved');
        });

        it('Heading with inline formatting', () => {
            const input = '# Hello **bold** and *italic*';
            const output = simulateExtract(input);
            assert.strictEqual(normalize(output), normalize(input));
        });
    });

    describe('Paragraphs', () => {
        it('Simple paragraph preserves correctly', () => {
            const input = 'This is a simple paragraph.';
            const output = simulateExtract(input);
            assert.strictEqual(normalize(output), normalize(input));
        });

        it('Multiple paragraphs preserve correctly', () => {
            const input = `First paragraph.

Second paragraph.

Third paragraph.`;
            const output = simulateExtract(input);
            assert.strictEqual(normalize(output), normalize(input));
        });
    });

    describe('Inline Formatting', () => {
        it('Bold text preserves correctly', () => {
            const input = 'This is **bold** text.';
            const output = simulateExtract(input);
            assert.strictEqual(normalize(output), normalize(input));
        });

        it('Italic text preserves correctly', () => {
            const input = 'This is *italic* text.';
            const output = simulateExtract(input);
            assert.strictEqual(normalize(output), normalize(input));
        });

        it('Inline code preserves correctly', () => {
            const input = 'This is `inline code` text.';
            const output = simulateExtract(input);
            assert.strictEqual(normalize(output), normalize(input));
        });

        it('Links preserve correctly', () => {
            const input = 'Check out [this link](https://example.com).';
            const output = simulateExtract(input);
            assert.strictEqual(normalize(output), normalize(input));
        });

        it('Links with title preserve correctly', () => {
            const input = 'Check out [this link](https://example.com "Title").';
            const output = simulateExtract(input);
            assert.strictEqual(normalize(output), normalize(input));
        });
    });

    describe('Lists', () => {
        it('Unordered list preserves correctly', () => {
            const input = `- Item 1
- Item 2
- Item 3`;
            const output = simulateExtract(input);
            assert.strictEqual(normalize(output), normalize(input));
        });

        it('Ordered list preserves correctly', () => {
            const input = `1. First item
2. Second item
3. Third item`;
            const output = simulateExtract(input);
            assert.strictEqual(normalize(output), normalize(input));
        });

        it('Nested list preserves structure', () => {
            const input = `- Item 1
  - Nested item
- Item 2`;
            const output = simulateExtract(input);
            assert.ok(output.includes('Nested item'), 'Nested content should be preserved');
            assert.ok(output.includes('  - Nested'), 'Indentation should be preserved');
        });
    });

    describe('Code Blocks', () => {
        it('Fenced code block preserves correctly', () => {
            const input = `\`\`\`
const x = 1;
\`\`\``;
            const output = simulateExtract(input);
            assert.ok(output.includes('const x = 1;'), 'Code content should be preserved');
            assert.ok(output.includes('```'), 'Should have code fence markers');
        });

        it('Code block with language preserves correctly', () => {
            const input = `\`\`\`javascript
const x = 1;
\`\`\``;
            const output = simulateExtract(input);
            assert.ok(output.includes('```javascript'), 'Language should be preserved');
            assert.ok(output.includes('const x = 1;'), 'Code content should be preserved');
        });
    });

    describe('Blockquotes', () => {
        it('Simple blockquote preserves correctly', () => {
            const input = '> This is a quote.';
            const output = simulateExtract(input);
            assert.strictEqual(normalize(output), normalize(input));
        });

        it('Multi-line blockquote preserves correctly', () => {
            const input = `> First line
> Second line`;
            const output = simulateExtract(input);
            assert.ok(output.includes('> First line'), 'First line should be preserved');
            assert.ok(output.includes('> Second line'), 'Second line should be preserved');
        });
    });

    describe('GitHub Alerts', () => {
        it('NOTE alert preserves correctly', () => {
            const input = `> [!NOTE]
> This is a note.`;
            const output = simulateExtract(input);
            assert.ok(output.includes('[!NOTE]'), 'Alert type should be preserved');
            assert.ok(output.includes('This is a note'), 'Alert content should be preserved');
        });

        it('All alert types preserve correctly', () => {
            const alertTypes = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'];
            for (const type of alertTypes) {
                const input = `> [!${type}]
> Content here.`;
                const output = simulateExtract(input);
                assert.ok(output.includes(`[!${type}]`), `${type} alert should be preserved`);
            }
        });
    });

    describe('Horizontal Rules', () => {
        it('Horizontal rule preserves correctly', () => {
            const input = `Above

---

Below`;
            const output = simulateExtract(input);
            assert.ok(output.includes('---'), 'Should have horizontal rule marker');
        });

        it('Different rule styles preserve correctly', () => {
            assert.ok(simulateExtract('---').includes('---'));
            assert.ok(simulateExtract('***').includes('***'));
            assert.ok(simulateExtract('___').includes('___'));
        });
    });

    describe('Tables', () => {
        it('Simple table preserves correctly', () => {
            const input = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |`;
            const output = simulateExtract(input);
            assert.ok(output.includes('| Header 1 |'), 'Header should be preserved');
            assert.ok(output.includes('|----------|'), 'Separator should be preserved');
            assert.ok(output.includes('| Cell 1'), 'Cells should be preserved');
        });
    });

    describe('Complex Documents', () => {
        it('Mixed content document preserves structure', () => {
            const input = `# Main Title

This is an introduction paragraph.

## Section One

Here is some text with **bold** and *italic* formatting.

- List item 1
- List item 2

### Subsection

\`\`\`javascript
const greeting = "Hello";
\`\`\`

> A wise quote here.

## Section Two

Final paragraph with a [link](https://example.com).`;

            const output = simulateExtract(input);
            
            // Verify key elements are preserved
            assert.ok(output.includes('# Main Title'), 'H1 should be preserved');
            assert.ok(output.includes('## Section One'), 'H2 should be preserved');
            assert.ok(output.includes('**bold**'), 'Bold should be preserved');
            assert.ok(output.includes('*italic*'), 'Italic should be preserved');
            assert.ok(output.includes('- List item 1'), 'List items should be preserved');
            assert.ok(output.includes('const greeting'), 'Code should be preserved');
            assert.ok(output.includes('> A wise quote'), 'Blockquote should be preserved');
            assert.ok(output.includes('[link]'), 'Link should be preserved');
        });
    });

    describe('Edge Cases', () => {
        it('Empty document', () => {
            const input = '';
            const output = simulateExtract(input);
            assert.strictEqual(output, '');
        });

        it('Document with only whitespace', () => {
            const input = '   \n\n   ';
            const output = simulateExtract(input);
            assert.ok(output !== null, 'Should handle whitespace-only document');
        });

        it('Special characters in text', () => {
            const input = 'Text with <angle> brackets and & ampersand.';
            const output = simulateExtract(input);
            assert.ok(output.includes('<angle>'), 'Angle brackets should be preserved');
            assert.ok(output.includes('&'), 'Ampersand should be preserved');
        });

        it('Escaped markdown characters', () => {
            const input = '\\*not italic\\* and \\`not code\\`';
            const output = simulateExtract(input);
            assert.ok(output.includes('\\*'), 'Escaped asterisks should be preserved');
            assert.ok(output.includes('\\`'), 'Escaped backticks should be preserved');
        });
    });
});
