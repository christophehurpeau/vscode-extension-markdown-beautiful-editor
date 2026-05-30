import * as assert from 'assert';
import { deleteRange } from '../../webview/editor/operations';

/**
 * Unit tests for selection deletion functionality.
 * These tests verify that selected text is correctly deleted when using
 * Delete key, Backspace key, or Cut command.
 *
 * They exercise the real `deleteRange` operation; the thin wrapper below only
 * adapts its return shape to the assertions used throughout this file.
 */
describe('Selection Deletion', () => {

    function simulateDeleteSelection(
        markdown: string,
        startLineIndex: number,
        startOffset: number,
        endLineIndex: number,
        endOffset: number
    ): { newMarkdown: string; cursorLineIndex: number; cursorOffset: number } {
        const { lines, cursor } = deleteRange(markdown.split('\n'), {
            startLineIndex,
            startOffset,
            endLineIndex,
            endOffset
        });
        return { newMarkdown: lines.join('\n'), cursorLineIndex: cursor.lineIndex, cursorOffset: cursor.offset };
    }

    describe('Single-line deletions', () => {
        it('should delete selection in middle of plain text', () => {
            const markdown = 'Hello World';
            const result = simulateDeleteSelection(markdown, 0, 6, 0, 11); // Delete "World"
            assert.strictEqual(result.newMarkdown, 'Hello ');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 6);
        });

        it('should delete selection at start of line', () => {
            const markdown = 'Hello World';
            const result = simulateDeleteSelection(markdown, 0, 0, 0, 6); // Delete "Hello "
            assert.strictEqual(result.newMarkdown, 'World');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 0);
        });

        it('should delete selection at end of line', () => {
            const markdown = 'Hello World';
            const result = simulateDeleteSelection(markdown, 0, 6, 0, 11); // Delete "World"
            assert.strictEqual(result.newMarkdown, 'Hello ');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 6);
        });

        it('should delete entire line content', () => {
            const markdown = 'Hello World';
            const result = simulateDeleteSelection(markdown, 0, 0, 0, 11); // Delete all
            assert.strictEqual(result.newMarkdown, '');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 0);
        });

        it('should delete selection within bold text', () => {
            const markdown = '**Hello World**';
            const result = simulateDeleteSelection(markdown, 0, 2, 0, 7); // Delete "Hello"
            assert.strictEqual(result.newMarkdown, '** World**');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 2);
        });

        it('should delete selection across formatting boundary', () => {
            const markdown = '**Hello** World';
            const result = simulateDeleteSelection(markdown, 0, 4, 0, 12); // Delete "llo** Wo"
            assert.strictEqual(result.newMarkdown, '**Herld');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 4);
        });

        it('should delete selection in code inline', () => {
            const markdown = '`console.log("test")`';
            const result = simulateDeleteSelection(markdown, 0, 1, 0, 12); // Delete "console.log"
            assert.strictEqual(result.newMarkdown, '`("test")`');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 1);
        });
    });

    describe('Multi-line deletions', () => {
        it('should delete selection across 2 lines', () => {
            const markdown = 'Line 1\nLine 2';
            const result = simulateDeleteSelection(markdown, 0, 5, 1, 5); // Delete "1\nLine "
            assert.strictEqual(result.newMarkdown, 'Line 2');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 5);
        });

        it('should delete selection across 3 lines', () => {
            const markdown = 'Line 1\nLine 2\nLine 3';
            const result = simulateDeleteSelection(markdown, 0, 5, 2, 5); // Delete "1\nLine 2\nLine "
            assert.strictEqual(result.newMarkdown, 'Line 3');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 5);
        });

        it('should delete full lines in middle', () => {
            const markdown = 'Line 1\nLine 2\nLine 3\nLine 4';
            const result = simulateDeleteSelection(markdown, 1, 0, 2, 6); // Delete "Line 2\nLine 3"
            assert.strictEqual(result.newMarkdown, 'Line 1\n\nLine 4');
            assert.strictEqual(result.cursorLineIndex, 1);
            assert.strictEqual(result.cursorOffset, 0);
        });

        it('should delete from start of first line to middle of last line', () => {
            const markdown = 'Line 1\nLine 2\nLine 3';
            const result = simulateDeleteSelection(markdown, 0, 0, 2, 5); // Delete "Line 1\nLine 2\nLine "
            assert.strictEqual(result.newMarkdown, '3');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 0);
        });

        it('should delete from middle of first line to end of last line', () => {
            const markdown = 'Line 1\nLine 2\nLine 3';
            const result = simulateDeleteSelection(markdown, 0, 5, 2, 6); // Delete "1\nLine 2\nLine 3"
            assert.strictEqual(result.newMarkdown, 'Line ');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 5);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty selection (collapsed cursor)', () => {
            const markdown = 'Hello World';
            const result = simulateDeleteSelection(markdown, 0, 5, 0, 5); // Collapsed at position 5
            assert.strictEqual(result.newMarkdown, 'Hello World');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 5);
        });

        it('should delete entire document', () => {
            const markdown = 'Line 1\nLine 2\nLine 3';
            const result = simulateDeleteSelection(markdown, 0, 0, 2, 6); // Delete all
            assert.strictEqual(result.newMarkdown, '');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 0);
        });

        it('should handle deletion at document start', () => {
            const markdown = 'Line 1\nLine 2';
            const result = simulateDeleteSelection(markdown, 0, 0, 0, 3); // Delete "Lin"
            assert.strictEqual(result.newMarkdown, 'e 1\nLine 2');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 0);
        });

        it('should handle deletion at document end', () => {
            const markdown = 'Line 1\nLine 2';
            const result = simulateDeleteSelection(markdown, 1, 3, 1, 6); // Delete "e 2"
            assert.strictEqual(result.newMarkdown, 'Line 1\nLin');
            assert.strictEqual(result.cursorLineIndex, 1);
            assert.strictEqual(result.cursorOffset, 3);
        });

        it('should handle empty line deletion', () => {
            const markdown = 'Line 1\n\nLine 3';
            const result = simulateDeleteSelection(markdown, 1, 0, 1, 0); // Empty line
            assert.strictEqual(result.newMarkdown, 'Line 1\n\nLine 3');
            assert.strictEqual(result.cursorLineIndex, 1);
            assert.strictEqual(result.cursorOffset, 0);
        });

        it('should handle deletion spanning empty lines', () => {
            const markdown = 'Line 1\n\n\nLine 4';
            const result = simulateDeleteSelection(markdown, 0, 6, 3, 0); // Delete newlines
            assert.strictEqual(result.newMarkdown, 'Line 1Line 4');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 6);
        });
    });

    describe('Formatted content deletions', () => {
        it('should delete selection in heading', () => {
            const markdown = '# My Heading';
            const result = simulateDeleteSelection(markdown, 0, 2, 0, 5); // Delete "My "
            assert.strictEqual(result.newMarkdown, '# Heading');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 2);
        });

        it('should delete selection across headings', () => {
            const markdown = '# Heading 1\n## Heading 2';
            const result = simulateDeleteSelection(markdown, 0, 10, 1, 3); // Delete "1\n## "
            assert.strictEqual(result.newMarkdown, '# Heading Heading 2');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 10);
        });

        it('should delete selection in list item', () => {
            const markdown = '- List item';
            const result = simulateDeleteSelection(markdown, 0, 2, 0, 7); // Delete "List "
            assert.strictEqual(result.newMarkdown, '- item');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 2);
        });

        it('should delete multiple list items', () => {
            const markdown = '- Item 1\n- Item 2\n- Item 3';
            const result = simulateDeleteSelection(markdown, 0, 0, 2, 0); // Delete first 2 items
            assert.strictEqual(result.newMarkdown, '- Item 3');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 0);
        });

        it('should delete selection in blockquote', () => {
            const markdown = '> This is a quote';
            const result = simulateDeleteSelection(markdown, 0, 2, 0, 10); // Delete "This is "
            assert.strictEqual(result.newMarkdown, '> a quote');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 2);
        });

        it('should delete link text', () => {
            const markdown = '[Click here](https://example.com)';
            const result = simulateDeleteSelection(markdown, 0, 1, 0, 11); // Delete "Click here"
            assert.strictEqual(result.newMarkdown, '[](https://example.com)');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 1);
        });

        it('should delete link URL', () => {
            const markdown = '[Click here](https://example.com)';
            const result = simulateDeleteSelection(markdown, 0, 13, 0, 32); // Delete "https://example.com"
            assert.strictEqual(result.newMarkdown, '[Click here]()');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 13);
        });
    });

    describe('Code block deletions', () => {
        it('should delete within code fence', () => {
            const markdown = '```javascript\nconsole.log("test");\n```';
            const result = simulateDeleteSelection(markdown, 1, 7, 1, 11); // Delete ".log"
            assert.strictEqual(result.newMarkdown, '```javascript\nconsole("test");\n```');
            assert.strictEqual(result.cursorLineIndex, 1);
            assert.strictEqual(result.cursorOffset, 7);
        });

        it('should delete entire code block', () => {
            const markdown = 'Before\n```\ncode\n```\nAfter';
            const result = simulateDeleteSelection(markdown, 1, 0, 3, 3); // Delete code block
            assert.strictEqual(result.newMarkdown, 'Before\n\nAfter');
            assert.strictEqual(result.cursorLineIndex, 1);
            assert.strictEqual(result.cursorOffset, 0);
        });

        it('should delete partial code block', () => {
            const markdown = '```\nline1\nline2\nline3\n```';
            const result = simulateDeleteSelection(markdown, 1, 0, 2, 5); // Delete "line1\nline2"
            assert.strictEqual(result.newMarkdown, '```\n\nline3\n```');
            assert.strictEqual(result.cursorLineIndex, 1);
            assert.strictEqual(result.cursorOffset, 0);
        });
    });

    describe('GitHub alert deletions', () => {
        it('should delete within alert content', () => {
            const markdown = '> [!NOTE]\n> This is important';
            const result = simulateDeleteSelection(markdown, 1, 2, 1, 10); // Delete "This is "
            assert.strictEqual(result.newMarkdown, '> [!NOTE]\n> important');
            assert.strictEqual(result.cursorLineIndex, 1);
            assert.strictEqual(result.cursorOffset, 2);
        });

        it('should delete entire alert', () => {
            const markdown = 'Before\n> [!NOTE]\n> Content\nAfter';
            const result = simulateDeleteSelection(markdown, 1, 0, 2, 9); // Delete alert
            assert.strictEqual(result.newMarkdown, 'Before\n\nAfter');
            assert.strictEqual(result.cursorLineIndex, 1);
            assert.strictEqual(result.cursorOffset, 0);
        });
    });

    describe('Table deletions', () => {
        it('should delete cell content', () => {
            const markdown = '| Header 1 | Header 2 |';
            const result = simulateDeleteSelection(markdown, 0, 2, 0, 10); // Delete "Header 1"
            assert.strictEqual(result.newMarkdown, '|  | Header 2 |');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 2);
        });

        it('should delete table row', () => {
            const markdown = '| H1 | H2 |\n|----|----|\n| C1 | C2 |';
            const result = simulateDeleteSelection(markdown, 1, 1, 1, 10); // Delete "----|----"
            assert.strictEqual(result.newMarkdown, '| H1 | H2 |\n||\n| C1 | C2 |');
            assert.strictEqual(result.cursorLineIndex, 1);
            assert.strictEqual(result.cursorOffset, 1);
        });
    });

    describe('Cursor position after deletion', () => {
        it('should place cursor at start of deletion for single line', () => {
            const markdown = 'Hello World';
            const result = simulateDeleteSelection(markdown, 0, 3, 0, 8);
            assert.strictEqual(result.cursorOffset, 3, 'Cursor should be at position 3');
        });

        it('should place cursor at start line for multi-line', () => {
            const markdown = 'Line 1\nLine 2\nLine 3';
            const result = simulateDeleteSelection(markdown, 0, 5, 2, 3);
            assert.strictEqual(result.cursorLineIndex, 0, 'Cursor should be at line 0');
            assert.strictEqual(result.cursorOffset, 5, 'Cursor should be at offset 5');
        });

        it('should handle cursor at line boundary after deletion', () => {
            const markdown = 'Line 1\nLine 2';
            const result = simulateDeleteSelection(markdown, 0, 6, 1, 0); // Delete newline
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 6);
        });
    });
});
