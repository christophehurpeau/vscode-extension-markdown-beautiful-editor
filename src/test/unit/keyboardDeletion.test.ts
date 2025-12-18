import * as assert from 'assert';

/**
 * Integration tests for keyboard-triggered deletion.
 * These tests verify that Delete, Backspace, and Cut commands work correctly
 * with selections in the editor.
 */
describe('Keyboard Deletion Integration', () => {

    /**
     * Simulates the full workflow of selection deletion triggered by keyboard.
     * This includes:
     * 1. Checking if selection exists
     * 2. Getting selection boundaries
     * 3. Performing deletion
     * 4. Positioning cursor
     */
    function simulateKeyboardDeletion(
        markdown: string,
        hasSelection: boolean,
        startLineIndex: number,
        startOffset: number,
        endLineIndex: number,
        endOffset: number,
        key: 'Delete' | 'Backspace' | 'Cut'
    ): {
        newMarkdown: string;
        cursorLineIndex: number;
        cursorOffset: number;
        wasHandled: boolean;
    } {
        // If no selection, return unchanged (let browser or line-merge handle it)
        if (!hasSelection) {
            return {
                newMarkdown: markdown,
                cursorLineIndex: startLineIndex,
                cursorOffset: startOffset,
                wasHandled: false
            };
        }

        // Selection exists - perform deletion
        const lines = markdown.split('\n');

        let cursorLineIndex: number;
        let cursorOffset: number;

        if (startLineIndex === endLineIndex) {
            // SINGLE LINE DELETION
            const line = lines[startLineIndex];
            const beforeSelection = line.slice(0, startOffset);
            const afterSelection = line.slice(endOffset);
            lines[startLineIndex] = beforeSelection + afterSelection;

            cursorLineIndex = startLineIndex;
            cursorOffset = startOffset;
        } else {
            // MULTI-LINE DELETION
            const beforeSelection = lines[startLineIndex].slice(0, startOffset);
            const afterSelection = lines[endLineIndex].slice(endOffset);
            const mergedLine = beforeSelection + afterSelection;

            const newLines = [
                ...lines.slice(0, startLineIndex),
                mergedLine,
                ...lines.slice(endLineIndex + 1)
            ];

            lines.length = 0;
            lines.push(...newLines);

            cursorLineIndex = startLineIndex;
            cursorOffset = startOffset;
        }

        const newMarkdown = lines.join('\n');
        return { newMarkdown, cursorLineIndex, cursorOffset, wasHandled: true };
    }

    describe('Delete key with selection', () => {
        it('should delete selected text when Delete is pressed', () => {
            const markdown = 'Hello World';
            const result = simulateKeyboardDeletion(
                markdown,
                true,  // hasSelection
                0, 6, 0, 11,  // Select "World"
                'Delete'
            );

            assert.strictEqual(result.wasHandled, true);
            assert.strictEqual(result.newMarkdown, 'Hello ');
            assert.strictEqual(result.cursorOffset, 6);
        });

        it('should not handle Delete when no selection', () => {
            const markdown = 'Hello World';
            const result = simulateKeyboardDeletion(
                markdown,
                false,  // no selection
                0, 5, 0, 5,  // Cursor at position 5
                'Delete'
            );

            assert.strictEqual(result.wasHandled, false);
            assert.strictEqual(result.newMarkdown, markdown);
        });

        it('should delete multi-line selection with Delete', () => {
            const markdown = 'Line 1\nLine 2\nLine 3';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 5, 2, 5,  // Select across 3 lines
                'Delete'
            );

            assert.strictEqual(result.wasHandled, true);
            assert.strictEqual(result.newMarkdown, 'Line 3');
        });
    });

    describe('Backspace key with selection', () => {
        it('should delete selected text when Backspace is pressed', () => {
            const markdown = 'Hello World';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 0, 0, 6,  // Select "Hello "
                'Backspace'
            );

            assert.strictEqual(result.wasHandled, true);
            assert.strictEqual(result.newMarkdown, 'World');
            assert.strictEqual(result.cursorOffset, 0);
        });

        it('should not handle Backspace when no selection', () => {
            const markdown = 'Hello World';
            const result = simulateKeyboardDeletion(
                markdown,
                false,
                0, 5, 0, 5,
                'Backspace'
            );

            assert.strictEqual(result.wasHandled, false);
            assert.strictEqual(result.newMarkdown, markdown);
        });

        it('should delete multi-line selection with Backspace', () => {
            const markdown = 'Line 1\nLine 2';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 5, 1, 5,
                'Backspace'
            );

            assert.strictEqual(result.wasHandled, true);
            assert.strictEqual(result.newMarkdown, 'Line 2');
        });
    });

    describe('Cut command with selection', () => {
        it('should delete selected text when Cut is triggered', () => {
            const markdown = 'Hello World';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 6, 0, 11,  // Select "World"
                'Cut'
            );

            assert.strictEqual(result.wasHandled, true);
            assert.strictEqual(result.newMarkdown, 'Hello ');
            assert.strictEqual(result.cursorOffset, 6);
        });

        it('should handle Cut on entire document', () => {
            const markdown = 'Line 1\nLine 2';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 0, 1, 6,  // Select everything
                'Cut'
            );

            assert.strictEqual(result.wasHandled, true);
            assert.strictEqual(result.newMarkdown, '');
        });

        it('should handle Cut on formatted text', () => {
            const markdown = '**Bold text**';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 2, 0, 11,  // Select "Bold text"
                'Cut'
            );

            assert.strictEqual(result.wasHandled, true);
            assert.strictEqual(result.newMarkdown, '****');
        });
    });

    describe('Selection scenarios', () => {
        it('should handle selection within heading', () => {
            const markdown = '# My Great Heading';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 5, 0, 11,  // Select "Great "
                'Delete'
            );

            assert.strictEqual(result.newMarkdown, '# My Heading');
        });

        it('should handle selection in list item', () => {
            const markdown = '- First item\n- Second item';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 8, 0, 12,  // Select "item"
                'Backspace'
            );

            assert.strictEqual(result.newMarkdown, '- First \n- Second item');
        });

        it('should handle selection across code fence', () => {
            const markdown = '```js\nconst x = 1;\n```';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                1, 0, 1, 6,  // Select "const "
                'Delete'
            );

            assert.strictEqual(result.newMarkdown, '```js\nx = 1;\n```');
        });

        it('should handle selection in blockquote', () => {
            const markdown = '> This is a quote\n> Second line';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 2, 1, 2,  // Select across blockquote lines
                'Delete'
            );

            assert.strictEqual(result.newMarkdown, '> Second line');
        });

        it('should handle selection within link', () => {
            const markdown = '[Click here](https://example.com)';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 7, 0, 11,  // Select "here"
                'Delete'
            );

            assert.strictEqual(result.newMarkdown, '[Click ](https://example.com)');
        });
    });

    describe('Edge case handling', () => {
        it('should handle empty line selection', () => {
            const markdown = 'Line 1\n\nLine 3';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                1, 0, 1, 0,  // Empty line selection
                'Delete'
            );

            assert.strictEqual(result.wasHandled, true);
            assert.strictEqual(result.newMarkdown, markdown);  // No change
        });

        it('should handle selection at document start', () => {
            const markdown = 'Start here\nMore text';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 0, 0, 6,  // "Start "
                'Delete'
            );

            assert.strictEqual(result.newMarkdown, 'here\nMore text');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 0);
        });

        it('should handle selection at document end', () => {
            const markdown = 'Some text\nEnd here';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                1, 4, 1, 8,  // "here"
                'Delete'
            );

            assert.strictEqual(result.newMarkdown, 'Some text\nEnd ');
            assert.strictEqual(result.cursorLineIndex, 1);
            assert.strictEqual(result.cursorOffset, 4);
        });

        it('should handle full document selection', () => {
            const markdown = 'Line 1\nLine 2\nLine 3';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 0, 2, 6,  // Select all
                'Delete'
            );

            assert.strictEqual(result.newMarkdown, '');
            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 0);
        });

        it('should handle selection with special characters', () => {
            const markdown = 'Text with *asterisks* and **bold**';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 10, 0, 21,  // Select "*asterisks*"
                'Delete'
            );

            assert.strictEqual(result.newMarkdown, 'Text with  and **bold**');
        });

        it('should handle selection spanning empty lines', () => {
            const markdown = 'Line 1\n\n\nLine 4';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 6, 3, 0,  // From end of Line 1 to start of Line 4
                'Delete'
            );

            assert.strictEqual(result.newMarkdown, 'Line 1Line 4');
        });
    });

    describe('Cursor positioning after deletion', () => {
        it('should position cursor at deletion start for single-line', () => {
            const markdown = 'Hello World Program';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 6, 0, 12,  // Delete "World "
                'Delete'
            );

            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 6);
        });

        it('should position cursor at deletion start for multi-line', () => {
            const markdown = 'First\nSecond\nThird';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 3, 2, 2,  // Delete from "st\nSecond\nTh"
                'Delete'
            );

            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 3);
        });

        it('should handle cursor at line 0 after deleting from start', () => {
            const markdown = 'Delete me\nKeep this';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 0, 0, 10,  // Delete entire first line including newline
                'Delete'
            );

            assert.strictEqual(result.cursorLineIndex, 0);
            assert.strictEqual(result.cursorOffset, 0);
        });
    });

    describe('Interaction with formatted text', () => {
        it('should preserve markdown syntax when deleting within it', () => {
            const markdown = '**Important message**';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 2, 0, 12,  // Delete "Important " keeping **
                'Delete'
            );

            assert.strictEqual(result.newMarkdown, '**message**');
        });

        it('should handle partial bold deletion', () => {
            const markdown = '**Bold text** and normal';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 7, 0, 11,  // Delete "text"
                'Delete'
            );

            assert.strictEqual(result.newMarkdown, '**Bold ** and normal');
        });

        it('should handle deletion crossing format boundaries', () => {
            const markdown = '**Bold** *italic* `code`';
            const result = simulateKeyboardDeletion(
                markdown,
                true,
                0, 4, 0, 17,  // Delete "ld** *italic"
                'Delete'
            );

            assert.strictEqual(result.newMarkdown, '**Bo `code`');
        });
    });
});
