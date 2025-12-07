import * as assert from 'assert';

/**
 * Unit tests for markdown styling functions.
 * These tests verify that markdown syntax is correctly identified and styled.
 */

// Helper function to extract text content from HTML (strips tags)
function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '');
}

// Helper to check if a class is present in the HTML
function hasClass(html: string, className: string): boolean {
    return html.includes(`class="${className}"`) || html.includes(`class="` + className);
}

// Simulate the escapeHtml function
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

describe('Markdown Styling', () => {

    describe('Headings', () => {
        it('should identify H1 heading', () => {
            const line = '# Hello World';
            const match = line.match(/^(#{1,6})\s(.*)$/);
            assert.ok(match, 'Should match heading pattern');
            assert.strictEqual(match![1], '#', 'Should capture hash');
            assert.strictEqual(match![2], 'Hello World', 'Should capture text');
        });

        it('should identify H2 heading', () => {
            const line = '## Section Title';
            const match = line.match(/^(#{1,6})\s(.*)$/);
            assert.ok(match, 'Should match heading pattern');
            assert.strictEqual(match![1], '##', 'Should capture hashes');
            assert.strictEqual(match![2], 'Section Title', 'Should capture text');
        });

        it('should identify all heading levels', () => {
            for (let level = 1; level <= 6; level++) {
                const hashes = '#'.repeat(level);
                const line = `${hashes} Heading ${level}`;
                const match = line.match(/^(#{1,6})\s(.*)$/);
                assert.ok(match, `Should match H${level} pattern`);
                assert.strictEqual(match![1].length, level, `Should have ${level} hashes`);
            }
        });

        it('should not match 7+ hashes as heading', () => {
            const line = '####### Not a heading';
            const match = line.match(/^(#{1,6})\s(.*)$/);
            assert.ok(!match, 'Should not match 7+ hashes');
        });
    });

    describe('Bold Text', () => {
        it('should identify **bold** text', () => {
            const text = 'This is **bold** text';
            const match = text.match(/\*\*([^*]+)\*\*/);
            assert.ok(match, 'Should match bold pattern');
            assert.strictEqual(match![1], 'bold', 'Should capture bold text');
        });

        it('should identify __bold__ text', () => {
            const text = 'This is __bold__ text';
            const match = text.match(/(?<![a-zA-Z0-9])__([^_]+)__(?![a-zA-Z0-9])/);
            assert.ok(match, 'Should match underscore bold pattern');
            assert.strictEqual(match![1], 'bold', 'Should capture bold text');
        });

        it('should handle multiple bold sections', () => {
            const text = '**first** and **second**';
            const matches = [...text.matchAll(/\*\*([^*]+)\*\*/g)];
            assert.strictEqual(matches.length, 2, 'Should find two bold sections');
            assert.strictEqual(matches[0][1], 'first');
            assert.strictEqual(matches[1][1], 'second');
        });
    });

    describe('Italic Text', () => {
        it('should identify *italic* text', () => {
            const text = 'This is *italic* text';
            const match = text.match(/(?<!\*)\*([^*]+)\*(?!\*)/);
            assert.ok(match, 'Should match italic pattern');
            assert.strictEqual(match![1], 'italic', 'Should capture italic text');
        });

        it('should identify _italic_ text', () => {
            const text = 'This is _italic_ text';
            const match = text.match(/(?<!_)_([^_]+)_(?!_)/);
            assert.ok(match, 'Should match underscore italic pattern');
            assert.strictEqual(match![1], 'italic', 'Should capture italic text');
        });

        it('should not match ** as italic', () => {
            const text = 'This is **bold** not italic';
            // After bold is processed, there should be no stray * for italic
            const afterBold = text.replace(/\*\*([^*]+)\*\*/g, 'BOLD');
            const italicMatch = afterBold.match(/(?<!\*)\*([^*]+)\*(?!\*)/);
            assert.ok(!italicMatch, 'Should not match bold markers as italic');
        });
    });

    describe('Bold and Italic Combined', () => {
        it('should identify ***bold and italic*** text', () => {
            const text = 'This is ***bold and italic*** text';
            const match = text.match(/\*\*\*([^*]+)\*\*\*/);
            assert.ok(match, 'Should match bold+italic pattern');
            assert.strictEqual(match![1], 'bold and italic', 'Should capture text');
        });

        it('should match bold+italic before bold or italic', () => {
            const text = '***combined***';
            // Bold+italic regex should match first (has priority)
            const boldItalicMatch = text.match(/\*\*\*([^*]+)\*\*\*/);
            assert.ok(boldItalicMatch, 'Should match bold+italic');
            
            // After removing bold+italic, bold regex should not match
            const afterBoldItalic = text.replace(/\*\*\*([^*]+)\*\*\*/g, 'REPLACED');
            const boldMatch = afterBoldItalic.match(/\*\*([^*]+)\*\*/);
            assert.ok(!boldMatch, 'Bold should not match after bold+italic is processed');
        });

        it('should handle bold+italic in a sentence', () => {
            const text = 'This is ***really important*** stuff';
            const match = text.match(/\*\*\*([^*]+)\*\*\*/);
            assert.ok(match, 'Should match bold+italic in sentence');
            assert.strictEqual(match![1], 'really important');
        });

        it('should handle multiple bold+italic sections', () => {
            const text = '***first*** and ***second***';
            const matches = [...text.matchAll(/\*\*\*([^*]+)\*\*\*/g)];
            assert.strictEqual(matches.length, 2, 'Should find two bold+italic sections');
            assert.strictEqual(matches[0][1], 'first');
            assert.strictEqual(matches[1][1], 'second');
        });

        it('should not confuse ** and * separately with ***', () => {
            const text = '**bold** and *italic* but not ***combined***';
            // First process bold+italic
            let result = text.replace(/\*\*\*([^*]+)\*\*\*/g, '[BI:$1]');
            assert.ok(result.includes('[BI:combined]'), 'Should process bold+italic');
            
            // Then process bold
            result = result.replace(/\*\*([^*]+)\*\*/g, '[B:$1]');
            assert.ok(result.includes('[B:bold]'), 'Should process bold');
            
            // Then process italic
            result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '[I:$1]');
            assert.ok(result.includes('[I:italic]'), 'Should process italic');
        });
    });

    describe('Inline Code', () => {
        it('should identify `code` text', () => {
            const text = 'This is `inline code` text';
            const match = text.match(/`([^`]+)`/);
            assert.ok(match, 'Should match code pattern');
            assert.strictEqual(match![1], 'inline code', 'Should capture code text');
        });

        it('should handle code with special characters', () => {
            const text = 'Use `const x = 1;` here';
            const match = text.match(/`([^`]+)`/);
            assert.ok(match, 'Should match code with special chars');
            assert.strictEqual(match![1], 'const x = 1;');
        });
    });

    describe('Strikethrough', () => {
        it('should identify ~~strikethrough~~ text', () => {
            const text = 'This is ~~deleted~~ text';
            const match = text.match(/~~([^~]+)~~/);
            assert.ok(match, 'Should match strikethrough pattern');
            assert.strictEqual(match![1], 'deleted', 'Should capture text');
        });
    });

    describe('Links', () => {
        it('should identify [text](url) links', () => {
            const text = 'Check [this link](https://example.com) out';
            const match = text.match(/\[([^\]]+)\]\(([^)]+)\)/);
            assert.ok(match, 'Should match link pattern');
            assert.strictEqual(match![1], 'this link', 'Should capture link text');
            assert.strictEqual(match![2], 'https://example.com', 'Should capture URL');
        });

        it('should handle links with titles', () => {
            const text = '[link](https://example.com "Title")';
            const match = text.match(/\[([^\]]+)\]\(([^)]+)\)/);
            assert.ok(match, 'Should match link with title');
            assert.strictEqual(match![1], 'link');
        });
    });

    describe('Images', () => {
        it('should identify ![alt](url) images', () => {
            const text = 'See ![my image](./image.png) here';
            const match = text.match(/!\[([^\]]*)\]\(([^)]+)\)/);
            assert.ok(match, 'Should match image pattern');
            assert.strictEqual(match![1], 'my image', 'Should capture alt text');
            assert.strictEqual(match![2], './image.png', 'Should capture path');
        });

        it('should handle images with empty alt text', () => {
            const text = '![](./image.png)';
            const match = text.match(/!\[([^\]]*)\]\(([^)]+)\)/);
            assert.ok(match, 'Should match image with empty alt');
            assert.strictEqual(match![1], '', 'Alt should be empty');
        });

        it('should handle relative paths with ../', () => {
            const text = '![logo](../images/logo.png)';
            const match = text.match(/!\[([^\]]*)\]\(([^)]+)\)/);
            assert.ok(match, 'Should match relative path');
            assert.strictEqual(match![2], '../images/logo.png');
        });
    });

    describe('Lists', () => {
        it('should identify unordered list with -', () => {
            const line = '- List item';
            const match = line.match(/^(\s*)([-*+])\s(.*)$/);
            assert.ok(match, 'Should match unordered list');
            assert.strictEqual(match![2], '-', 'Should capture marker');
            assert.strictEqual(match![3], 'List item', 'Should capture content');
        });

        it('should identify unordered list with *', () => {
            const line = '* List item';
            const match = line.match(/^(\s*)([-*+])\s(.*)$/);
            assert.ok(match, 'Should match asterisk list');
            assert.strictEqual(match![2], '*');
        });

        it('should identify ordered list', () => {
            const line = '1. First item';
            const match = line.match(/^(\s*)(\d+\.)\s(.*)$/);
            assert.ok(match, 'Should match ordered list');
            assert.strictEqual(match![2], '1.', 'Should capture number');
            assert.strictEqual(match![3], 'First item', 'Should capture content');
        });

        it('should identify nested list with indentation', () => {
            const line = '  - Nested item';
            const match = line.match(/^(\s*)([-*+])\s(.*)$/);
            assert.ok(match, 'Should match nested list');
            assert.strictEqual(match![1], '  ', 'Should capture indentation');
        });

        it('should identify task list unchecked', () => {
            const line = '- [ ] Todo item';
            const match = line.match(/^(\s*)([-*+])\s\[([ xX])\]\s(.*)$/);
            assert.ok(match, 'Should match task list');
            assert.strictEqual(match![3], ' ', 'Should be unchecked');
            assert.strictEqual(match![4], 'Todo item');
        });

        it('should identify task list checked', () => {
            const line = '- [x] Done item';
            const match = line.match(/^(\s*)([-*+])\s\[([ xX])\]\s(.*)$/);
            assert.ok(match, 'Should match checked task');
            assert.strictEqual(match![3], 'x', 'Should be checked');
        });
    });

    describe('Blockquotes', () => {
        it('should identify single > blockquote', () => {
            const line = '> Quote text';
            const match = line.match(/^(>+)\s?(.*)$/);
            assert.ok(match, 'Should match blockquote');
            assert.strictEqual(match![1], '>', 'Should capture marker');
            assert.strictEqual(match![2], 'Quote text', 'Should capture content');
        });

        it('should identify nested >> blockquote', () => {
            const line = '>> Nested quote';
            const match = line.match(/^(>+)\s?(.*)$/);
            assert.ok(match, 'Should match nested blockquote');
            assert.strictEqual(match![1], '>>', 'Should capture both markers');
        });

        it('should identify triple >>> blockquote', () => {
            const line = '>>> Deep nested';
            const match = line.match(/^(>+)\s?(.*)$/);
            assert.ok(match, 'Should match deep nested');
            assert.strictEqual(match![1].length, 3);
        });
    });

    describe('GitHub Alerts', () => {
        it('should identify [!NOTE] alert', () => {
            const line = '> [!NOTE]';
            const match = line.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
            assert.ok(match, 'Should match NOTE alert');
            assert.strictEqual(match![1].toUpperCase(), 'NOTE');
        });

        it('should identify [!TIP] alert', () => {
            const line = '> [!TIP]';
            const match = line.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
            assert.ok(match, 'Should match TIP alert');
            assert.strictEqual(match![1].toUpperCase(), 'TIP');
        });

        it('should identify [!IMPORTANT] alert', () => {
            const line = '> [!IMPORTANT]';
            const match = line.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
            assert.ok(match, 'Should match IMPORTANT alert');
        });

        it('should identify [!WARNING] alert', () => {
            const line = '> [!WARNING]';
            const match = line.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
            assert.ok(match, 'Should match WARNING alert');
        });

        it('should identify [!CAUTION] alert', () => {
            const line = '> [!CAUTION]';
            const match = line.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
            assert.ok(match, 'Should match CAUTION alert');
        });

        it('should be case insensitive', () => {
            const line = '> [!note]';
            const match = line.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
            assert.ok(match, 'Should match lowercase');
        });
    });

    describe('Code Blocks', () => {
        it('should identify code fence start', () => {
            const line = '```javascript';
            assert.ok(line.startsWith('```'), 'Should identify code fence');
            const lang = line.slice(3).trim();
            assert.strictEqual(lang, 'javascript', 'Should extract language');
        });

        it('should identify code fence end', () => {
            const line = '```';
            assert.ok(line === '```', 'Should identify closing fence');
        });

        it('should handle code fence without language', () => {
            const line = '```';
            const lang = line.slice(3).trim();
            assert.strictEqual(lang, '', 'Language should be empty');
        });
    });

    describe('Horizontal Rules', () => {
        it('should identify --- horizontal rule', () => {
            const line = '---';
            const match = /^(-{3,}|_{3,}|\*{3,})$/.test(line.trim());
            assert.ok(match, 'Should match dashes');
        });

        it('should identify *** horizontal rule', () => {
            const line = '***';
            const match = /^(-{3,}|_{3,}|\*{3,})$/.test(line.trim());
            assert.ok(match, 'Should match asterisks');
        });

        it('should identify ___ horizontal rule', () => {
            const line = '___';
            const match = /^(-{3,}|_{3,}|\*{3,})$/.test(line.trim());
            assert.ok(match, 'Should match underscores');
        });

        it('should match longer rules', () => {
            const line = '----------';
            const match = /^(-{3,}|_{3,}|\*{3,})$/.test(line.trim());
            assert.ok(match, 'Should match longer rule');
        });
    });

    describe('Tables', () => {
        it('should identify table row', () => {
            const line = '| Cell 1 | Cell 2 | Cell 3 |';
            const match = line.match(/^\|(.+)\|$/);
            assert.ok(match, 'Should match table row');
        });

        it('should identify table separator', () => {
            const line = '|--------|--------|--------|';
            const match = line.match(/^\|(.+)\|$/);
            assert.ok(match, 'Should match separator row');
            const cells = line.split('|').slice(1, -1);
            assert.ok(cells.every(cell => /^[\s:-]+$/.test(cell)), 'All cells should be separators');
        });

        it('should identify aligned table separator', () => {
            const line = '|:-------|:------:|-------:|';
            const cells = line.split('|').slice(1, -1);
            assert.ok(cells.every(cell => /^[\s:-]+$/.test(cell)), 'Should match aligned separators');
        });
    });

    describe('Escaped Characters', () => {
        it('should identify escaped asterisk', () => {
            const text = '\\*not italic\\*';
            const matches = [...text.matchAll(/\\([*_`\[\]()#+-\.!\\])/g)];
            assert.strictEqual(matches.length, 2, 'Should find two escaped chars');
            assert.strictEqual(matches[0][1], '*');
            assert.strictEqual(matches[1][1], '*');
        });

        it('should identify escaped backtick', () => {
            const text = '\\`not code\\`';
            const matches = [...text.matchAll(/\\([*_`\[\]()#+-\.!\\])/g)];
            assert.strictEqual(matches.length, 2, 'Should find escaped backticks');
        });

        it('should identify escaped backslash', () => {
            const text = '\\\\';
            const match = text.match(/\\([*_`\[\]()#+-\.!\\])/);
            assert.ok(match, 'Should match escaped backslash');
            assert.strictEqual(match![1], '\\');
        });
    });

    describe('Math (LaTeX)', () => {
        it('should identify inline math $formula$', () => {
            const text = 'The formula $E = mc^2$ is famous';
            const match = text.match(/\$([^$]+)\$/);
            assert.ok(match, 'Should match inline math');
            assert.strictEqual(match![1], 'E = mc^2');
        });
    });

    describe('Footnotes', () => {
        it('should identify footnote reference [^1]', () => {
            const text = 'Some text[^1] here';
            const match = text.match(/\[\^([^\]]+)\]/);
            assert.ok(match, 'Should match footnote reference');
            assert.strictEqual(match![1], '1');
        });

        it('should identify footnote definition', () => {
            const line = '[^1]: This is the footnote';
            const match = line.match(/^\[\^([^\]]+)\]:\s(.*)$/);
            assert.ok(match, 'Should match footnote definition');
            assert.strictEqual(match![1], '1');
            assert.strictEqual(match![2], 'This is the footnote');
        });
    });

    describe('Definition Lists', () => {
        it('should identify definition with : prefix', () => {
            const line = ': This is the definition';
            const match = line.match(/^:\s(.*)$/);
            assert.ok(match, 'Should match definition');
            assert.strictEqual(match![1], 'This is the definition');
        });
    });

    describe('HTML Escaping', () => {
        it('should escape < and >', () => {
            const text = '<script>alert("xss")</script>';
            const escaped = escapeHtml(text);
            assert.ok(!escaped.includes('<script>'), 'Should escape script tags');
            assert.ok(escaped.includes('&lt;'), 'Should have escaped <');
            assert.ok(escaped.includes('&gt;'), 'Should have escaped >');
        });

        it('should escape &', () => {
            const text = 'Tom & Jerry';
            const escaped = escapeHtml(text);
            assert.ok(escaped.includes('&amp;'), 'Should escape ampersand');
        });

        it('should escape quotes', () => {
            const text = 'Say "hello"';
            const escaped = escapeHtml(text);
            assert.ok(escaped.includes('&quot;'), 'Should escape double quotes');
        });
    });

    describe('Styling HTML Output', () => {
        // Simulate the styleInline function output
        function simulateStyleInline(text: string): string {
            let result = escapeHtml(text);
            
            // Bold + Italic: ***text*** (must come before bold and italic)
            result = result.replace(
                /\*\*\*([^*]+)\*\*\*/g,
                '<span class="md-bold-italic"><span class="md-syntax">***</span><strong><em>$1</em></strong><span class="md-syntax">***</span></span>'
            );
            
            // Bold: **text**
            result = result.replace(
                /\*\*([^*]+)\*\*/g,
                '<span class="md-bold"><span class="md-syntax">**</span><strong>$1</strong><span class="md-syntax">**</span></span>'
            );
            
            // Italic: *text*
            result = result.replace(
                /(?<!\*)\*([^*]+)\*(?!\*)/g,
                '<span class="md-italic"><span class="md-syntax">*</span><em>$1</em><span class="md-syntax">*</span></span>'
            );
            
            return result;
        }

        it('should generate correct HTML for bold text', () => {
            const html = simulateStyleInline('**bold**');
            assert.ok(html.includes('class="md-bold"'), 'Should have md-bold class');
            assert.ok(html.includes('<strong>bold</strong>'), 'Should have strong tag with content');
            assert.ok(html.includes('class="md-syntax"'), 'Should have syntax markers');
        });

        it('should generate correct HTML for italic text', () => {
            const html = simulateStyleInline('*italic*');
            assert.ok(html.includes('class="md-italic"'), 'Should have md-italic class');
            assert.ok(html.includes('<em>italic</em>'), 'Should have em tag with content');
        });

        it('should generate correct HTML for bold+italic text', () => {
            const html = simulateStyleInline('***bold and italic***');
            assert.ok(html.includes('class="md-bold-italic"'), 'Should have md-bold-italic class');
            assert.ok(html.includes('<strong><em>bold and italic</em></strong>'), 'Should have nested strong and em tags');
        });

        it('should process bold+italic before bold', () => {
            const html = simulateStyleInline('***combined*** and **bold**');
            assert.ok(html.includes('md-bold-italic'), 'Should have bold+italic class');
            assert.ok(html.includes('md-bold'), 'Should have bold class');
            // Verify bold+italic was processed correctly (not as **bold** + *italic*)
            assert.ok(html.includes('<strong><em>combined</em></strong>'), 'Bold+italic should have correct structure');
        });

        it('should process bold+italic before italic', () => {
            const html = simulateStyleInline('***combined*** and *italic*');
            assert.ok(html.includes('md-bold-italic'), 'Should have bold+italic class');
            assert.ok(html.includes('md-italic'), 'Should have italic class');
        });

        it('should handle mixed formatting in one line', () => {
            const html = simulateStyleInline('***all*** and **bold** and *italic*');
            assert.ok(html.includes('md-bold-italic'), 'Should have bold+italic');
            assert.ok(html.includes('md-bold'), 'Should have bold');
            assert.ok(html.includes('md-italic'), 'Should have italic');
        });

        it('should preserve text between formatted sections', () => {
            const html = simulateStyleInline('before ***middle*** after');
            assert.ok(html.includes('before'), 'Should preserve text before');
            assert.ok(html.includes('after'), 'Should preserve text after');
            assert.ok(html.includes('<strong><em>middle</em></strong>'), 'Should format middle');
        });
    });
});

