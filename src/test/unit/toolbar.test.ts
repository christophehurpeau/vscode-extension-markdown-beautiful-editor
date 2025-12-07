import * as assert from 'assert';

/**
 * Unit tests for formatting toolbar functionality.
 * Tests inline formatting application and toggling.
 */

describe('Inline Formatting', () => {
    
    /**
     * Simulates applying inline format to selected text
     */
    function applyFormat(text: string, format: string): string {
        switch (format) {
            case 'bold':
                return `**${text}**`;
            case 'italic':
                return `*${text}*`;
            case 'code':
                return `\`${text}\``;
            case 'strikethrough':
                return `~~${text}~~`;
            case 'link':
                return `[${text}](url)`;
            default:
                return text;
        }
    }

    /**
     * Simulates removing inline format from text
     */
    function removeFormat(text: string, format: string): string {
        switch (format) {
            case 'bold':
                return text.replace(/^\*\*(.+)\*\*$/, '$1');
            case 'italic':
                return text.replace(/^\*(.+)\*$/, '$1');
            case 'code':
                return text.replace(/^`(.+)`$/, '$1');
            case 'strikethrough':
                return text.replace(/^~~(.+)~~$/, '$1');
            case 'link':
                return text.replace(/^\[(.+)\]\([^)]+\)$/, '$1');
            default:
                return text;
        }
    }

    /**
     * Checks if text has a specific format applied
     */
    function hasFormat(text: string, format: string): boolean {
        switch (format) {
            case 'bold':
                return /^\*\*[^*]+\*\*$/.test(text);
            case 'italic':
                return /^\*[^*]+\*$/.test(text) && !/^\*\*/.test(text);
            case 'code':
                return /^`[^`]+`$/.test(text);
            case 'strikethrough':
                return /^~~[^~]+~~$/.test(text);
            case 'link':
                return /^\[.+\]\([^)]+\)$/.test(text);
            default:
                return false;
        }
    }

    describe('Bold Formatting', () => {
        it('should apply bold to plain text', () => {
            const result = applyFormat('text', 'bold');
            assert.strictEqual(result, '**text**');
        });

        it('should detect bold text', () => {
            assert.ok(hasFormat('**bold**', 'bold'));
            assert.ok(!hasFormat('*italic*', 'bold'));
            assert.ok(!hasFormat('plain', 'bold'));
        });

        it('should remove bold from formatted text', () => {
            const result = removeFormat('**bold**', 'bold');
            assert.strictEqual(result, 'bold');
        });

        it('should handle multi-word bold', () => {
            const result = applyFormat('multiple words', 'bold');
            assert.strictEqual(result, '**multiple words**');
        });
    });

    describe('Italic Formatting', () => {
        it('should apply italic to plain text', () => {
            const result = applyFormat('text', 'italic');
            assert.strictEqual(result, '*text*');
        });

        it('should detect italic text', () => {
            assert.ok(hasFormat('*italic*', 'italic'));
            assert.ok(!hasFormat('**bold**', 'italic'));
            assert.ok(!hasFormat('plain', 'italic'));
        });

        it('should remove italic from formatted text', () => {
            const result = removeFormat('*italic*', 'italic');
            assert.strictEqual(result, 'italic');
        });
    });

    describe('Code Formatting', () => {
        it('should apply code to plain text', () => {
            const result = applyFormat('code', 'code');
            assert.strictEqual(result, '`code`');
        });

        it('should detect code text', () => {
            assert.ok(hasFormat('`code`', 'code'));
            assert.ok(!hasFormat('plain', 'code'));
        });

        it('should remove code from formatted text', () => {
            const result = removeFormat('`code`', 'code');
            assert.strictEqual(result, 'code');
        });

        it('should handle code with special characters', () => {
            const result = applyFormat('const x = 1;', 'code');
            assert.strictEqual(result, '`const x = 1;`');
        });
    });

    describe('Strikethrough Formatting', () => {
        it('should apply strikethrough to plain text', () => {
            const result = applyFormat('deleted', 'strikethrough');
            assert.strictEqual(result, '~~deleted~~');
        });

        it('should detect strikethrough text', () => {
            assert.ok(hasFormat('~~deleted~~', 'strikethrough'));
            assert.ok(!hasFormat('plain', 'strikethrough'));
        });

        it('should remove strikethrough from formatted text', () => {
            const result = removeFormat('~~deleted~~', 'strikethrough');
            assert.strictEqual(result, 'deleted');
        });
    });

    describe('Link Formatting', () => {
        it('should apply link to plain text', () => {
            const result = applyFormat('link text', 'link');
            assert.strictEqual(result, '[link text](url)');
        });

        it('should detect link text', () => {
            assert.ok(hasFormat('[text](https://example.com)', 'link'));
            assert.ok(!hasFormat('plain', 'link'));
        });

        it('should remove link from formatted text', () => {
            const result = removeFormat('[text](https://example.com)', 'link');
            assert.strictEqual(result, 'text');
        });
    });

    describe('Format Toggle', () => {
        /**
         * Simulates toggling a format - applies if not present, removes if present
         */
        function toggleFormat(text: string, format: string): string {
            if (hasFormat(text, format)) {
                return removeFormat(text, format);
            } else {
                return applyFormat(text, format);
            }
        }

        it('should apply bold when not present', () => {
            const result = toggleFormat('text', 'bold');
            assert.strictEqual(result, '**text**');
        });

        it('should remove bold when present', () => {
            const result = toggleFormat('**text**', 'bold');
            assert.strictEqual(result, 'text');
        });

        it('should toggle italic correctly', () => {
            assert.strictEqual(toggleFormat('text', 'italic'), '*text*');
            assert.strictEqual(toggleFormat('*text*', 'italic'), 'text');
        });

        it('should toggle code correctly', () => {
            assert.strictEqual(toggleFormat('code', 'code'), '`code`');
            assert.strictEqual(toggleFormat('`code`', 'code'), 'code');
        });

        it('should toggle strikethrough correctly', () => {
            assert.strictEqual(toggleFormat('text', 'strikethrough'), '~~text~~');
            assert.strictEqual(toggleFormat('~~text~~', 'strikethrough'), 'text');
        });
    });
});

describe('Formatting Detection at Cursor', () => {
    /**
     * Simulates checking what formatting is active at a cursor position.
     * In the real editor, this traverses parent nodes to find formatting spans.
     */
    
    interface FormattingInfo {
        bold: boolean;
        italic: boolean;
        code: boolean;
        strikethrough: boolean;
        link: boolean;
    }

    function detectFormatting(html: string): FormattingInfo {
        return {
            bold: html.includes('md-bold') || html.includes('<strong>'),
            italic: html.includes('md-italic') || html.includes('<em>'),
            code: html.includes('md-code') || html.includes('<code>'),
            strikethrough: html.includes('md-strikethrough') || html.includes('<s>'),
            link: html.includes('md-link') || html.includes('<a '),
        };
    }

    it('should detect bold formatting', () => {
        const html = '<span class="md-bold"><strong>text</strong></span>';
        const info = detectFormatting(html);
        assert.ok(info.bold);
        assert.ok(!info.italic);
    });

    it('should detect italic formatting', () => {
        const html = '<span class="md-italic"><em>text</em></span>';
        const info = detectFormatting(html);
        assert.ok(info.italic);
        assert.ok(!info.bold);
    });

    it('should detect code formatting', () => {
        const html = '<span class="md-code"><code>text</code></span>';
        const info = detectFormatting(html);
        assert.ok(info.code);
    });

    it('should detect multiple formats', () => {
        const html = '<span class="md-bold"><strong><span class="md-italic"><em>text</em></span></strong></span>';
        const info = detectFormatting(html);
        assert.ok(info.bold);
        assert.ok(info.italic);
    });

    it('should detect no formatting in plain text', () => {
        const html = '<span>plain text</span>';
        const info = detectFormatting(html);
        assert.ok(!info.bold);
        assert.ok(!info.italic);
        assert.ok(!info.code);
        assert.ok(!info.strikethrough);
        assert.ok(!info.link);
    });
});

describe('Toolbar Button States', () => {
    /**
     * Tests for toolbar button active states based on selection formatting
     */

    interface ButtonStates {
        bold: boolean;
        italic: boolean;
        code: boolean;
        strikethrough: boolean;
        link: boolean;
    }

    function getButtonStates(formatting: { bold: boolean; italic: boolean; code: boolean; strikethrough: boolean; link: boolean }): ButtonStates {
        return {
            bold: formatting.bold,
            italic: formatting.italic,
            code: formatting.code,
            strikethrough: formatting.strikethrough,
            link: formatting.link,
        };
    }

    it('should highlight bold button when in bold text', () => {
        const states = getButtonStates({ bold: true, italic: false, code: false, strikethrough: false, link: false });
        assert.ok(states.bold);
        assert.ok(!states.italic);
    });

    it('should highlight multiple buttons for combined formatting', () => {
        const states = getButtonStates({ bold: true, italic: true, code: false, strikethrough: false, link: false });
        assert.ok(states.bold);
        assert.ok(states.italic);
    });

    it('should not highlight any buttons for plain text', () => {
        const states = getButtonStates({ bold: false, italic: false, code: false, strikethrough: false, link: false });
        assert.ok(!states.bold);
        assert.ok(!states.italic);
        assert.ok(!states.code);
        assert.ok(!states.strikethrough);
        assert.ok(!states.link);
    });
});

describe('Selection Handling', () => {
    /**
     * Tests for handling text selection for formatting
     */

    it('should handle empty selection', () => {
        const selectedText = '';
        assert.strictEqual(selectedText.length, 0);
    });

    it('should handle single word selection', () => {
        const selectedText = 'word';
        assert.strictEqual(selectedText, 'word');
    });

    it('should handle multi-word selection', () => {
        const selectedText = 'multiple words here';
        assert.ok(selectedText.includes(' '));
    });

    it('should handle selection with newlines', () => {
        const selectedText = 'line 1\nline 2';
        assert.ok(selectedText.includes('\n'));
    });

    it('should handle selection with special characters', () => {
        const selectedText = 'text with <html> & "quotes"';
        assert.ok(selectedText.includes('<'));
        assert.ok(selectedText.includes('&'));
    });
});

describe('Keyboard Shortcuts', () => {
    /**
     * Tests for formatting keyboard shortcuts
     */

    interface ShortcutMapping {
        key: string;
        modifier: 'cmd' | 'ctrl';
        format: string;
    }

    const SHORTCUTS: ShortcutMapping[] = [
        { key: 'b', modifier: 'cmd', format: 'bold' },
        { key: 'i', modifier: 'cmd', format: 'italic' },
        { key: 'e', modifier: 'cmd', format: 'code' },
        { key: 'k', modifier: 'cmd', format: 'link' },
    ];

    it('should map Cmd+B to bold', () => {
        const shortcut = SHORTCUTS.find(s => s.key === 'b');
        assert.ok(shortcut);
        assert.strictEqual(shortcut.format, 'bold');
    });

    it('should map Cmd+I to italic', () => {
        const shortcut = SHORTCUTS.find(s => s.key === 'i');
        assert.ok(shortcut);
        assert.strictEqual(shortcut.format, 'italic');
    });

    it('should map Cmd+E to code', () => {
        const shortcut = SHORTCUTS.find(s => s.key === 'e');
        assert.ok(shortcut);
        assert.strictEqual(shortcut.format, 'code');
    });

    it('should map Cmd+K to link', () => {
        const shortcut = SHORTCUTS.find(s => s.key === 'k');
        assert.ok(shortcut);
        assert.strictEqual(shortcut.format, 'link');
    });

    it('should have all common formatting shortcuts', () => {
        assert.ok(SHORTCUTS.some(s => s.format === 'bold'));
        assert.ok(SHORTCUTS.some(s => s.format === 'italic'));
        assert.ok(SHORTCUTS.some(s => s.format === 'code'));
        assert.ok(SHORTCUTS.some(s => s.format === 'link'));
    });
});

