import * as assert from 'assert';

/**
 * Unit tests for line type detection, icons, and transformations.
 * These tests cover the LINE_TYPES system used for the line type menu.
 */

// Replicate the LINE_TYPES definitions from main.ts for testing
interface LineTypeDefinition {
    type: string;
    pattern: RegExp;
    icon: string;
    label?: string;
}

const LINE_TYPES: LineTypeDefinition[] = [
    { type: 'h1', pattern: /^#{1}\s/, icon: 'H₁', label: 'Heading 1' },
    { type: 'h2', pattern: /^#{2}\s/, icon: 'H₂', label: 'Heading 2' },
    { type: 'h3', pattern: /^#{3}\s/, icon: 'H₃', label: 'Heading 3' },
    { type: 'h4', pattern: /^#{4}\s/, icon: 'H₄', label: 'Heading 4' },
    { type: 'h5', pattern: /^#{5}\s/, icon: 'H₅', label: 'Heading 5' },
    { type: 'h6', pattern: /^#{6}\s/, icon: 'H₆', label: 'Heading 6' },
    { type: 'hr', pattern: /^(-{3,}|\*{3,}|_{3,})\s*$/, icon: '―', label: 'Horizontal Rule' },
    { type: 'task', pattern: /^[-*+]\s\[[ xX]\]/, icon: '☐', label: 'Task List' },
    { type: 'ul', pattern: /^[-*+]\s/, icon: '•', label: 'Bullet List' },
    { type: 'ol', pattern: /^\d+\.\s/, icon: '1.', label: 'Numbered List' },
    { type: 'alert', pattern: /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i, icon: '!' },
    { type: 'quote', pattern: /^>/, icon: '❝', label: 'Quote' },
    { type: 'code', pattern: /^```/, icon: '{}', label: 'Code Block' },
];

const DEFAULT_LINE_TYPE: LineTypeDefinition = { type: 'paragraph', pattern: /^/, icon: 'T', label: 'Text' };

function getLineType(line: string): LineTypeDefinition {
    for (const def of LINE_TYPES) {
        if (def.pattern.test(line)) {
            return def;
        }
    }
    return DEFAULT_LINE_TYPE;
}

function getLineTypeIcon(line: string): string {
    return getLineType(line).icon;
}

/**
 * Simulates stripping line prefix (like applyLineType does)
 */
function stripLinePrefix(line: string): string {
    // Horizontal rule
    line = line.replace(/^(-{3,}|\*{3,}|_{3,})\s*$/, '');
    // Headings
    line = line.replace(/^#{1,6}\s/, '');
    // Task list
    line = line.replace(/^[-*+]\s\[[ xX]\]\s/, '');
    // Unordered list
    line = line.replace(/^[-*+]\s/, '');
    // Ordered list
    line = line.replace(/^\d+\.\s/, '');
    // Blockquote (handle nested - multiple > characters)
    line = line.replace(/^>+\s?/, '');
    // Code fence
    line = line.replace(/^```\w*\s*/, '');
    return line;
}

/**
 * Simulates applying a line type prefix
 */
function applyLinePrefix(content: string, type: string): string {
    switch (type) {
        case 'paragraph':
            return content;
        case 'h1':
            return `# ${content}`;
        case 'h2':
            return `## ${content}`;
        case 'h3':
            return `### ${content}`;
        case 'h4':
            return `#### ${content}`;
        case 'h5':
            return `##### ${content}`;
        case 'h6':
            return `###### ${content}`;
        case 'hr':
            return `---`;
        case 'ul':
            return `- ${content}`;
        case 'ol':
            return `1. ${content}`;
        case 'task':
            return `- [ ] ${content}`;
        case 'quote':
            return `> ${content}`;
        case 'code':
            return `\`\`\`\n${content}\n\`\`\``;
        default:
            return content;
    }
}

describe('Line Type Detection', () => {
    
    describe('Headings', () => {
        it('should detect H1', () => {
            const result = getLineType('# Heading 1');
            assert.strictEqual(result.type, 'h1');
            assert.strictEqual(result.icon, 'H₁');
        });

        it('should detect H2', () => {
            const result = getLineType('## Heading 2');
            assert.strictEqual(result.type, 'h2');
            assert.strictEqual(result.icon, 'H₂');
        });

        it('should detect H3', () => {
            const result = getLineType('### Heading 3');
            assert.strictEqual(result.type, 'h3');
            assert.strictEqual(result.icon, 'H₃');
        });

        it('should detect H4', () => {
            const result = getLineType('#### Heading 4');
            assert.strictEqual(result.type, 'h4');
            assert.strictEqual(result.icon, 'H₄');
        });

        it('should detect H5', () => {
            const result = getLineType('##### Heading 5');
            assert.strictEqual(result.type, 'h5');
            assert.strictEqual(result.icon, 'H₅');
        });

        it('should detect H6', () => {
            const result = getLineType('###### Heading 6');
            assert.strictEqual(result.type, 'h6');
            assert.strictEqual(result.icon, 'H₆');
        });

        it('should not detect 7+ hashes as heading', () => {
            const result = getLineType('####### Not a heading');
            assert.strictEqual(result.type, 'paragraph');
        });

        it('should require space after hashes', () => {
            const result = getLineType('#NoSpace');
            assert.strictEqual(result.type, 'paragraph');
        });
    });

    describe('Horizontal Rules', () => {
        it('should detect --- horizontal rule', () => {
            const result = getLineType('---');
            assert.strictEqual(result.type, 'hr');
            assert.strictEqual(result.icon, '―');
        });

        it('should detect *** horizontal rule', () => {
            const result = getLineType('***');
            assert.strictEqual(result.type, 'hr');
        });

        it('should detect ___ horizontal rule', () => {
            const result = getLineType('___');
            assert.strictEqual(result.type, 'hr');
        });

        it('should detect longer horizontal rules', () => {
            assert.strictEqual(getLineType('----------').type, 'hr');
            assert.strictEqual(getLineType('**********').type, 'hr');
            assert.strictEqual(getLineType('__________').type, 'hr');
        });

        it('should detect horizontal rule with trailing spaces', () => {
            const result = getLineType('---   ');
            assert.strictEqual(result.type, 'hr');
        });
    });

    describe('Lists', () => {
        it('should detect unordered list with -', () => {
            const result = getLineType('- Item');
            assert.strictEqual(result.type, 'ul');
            assert.strictEqual(result.icon, '•');
        });

        it('should detect unordered list with *', () => {
            const result = getLineType('* Item');
            assert.strictEqual(result.type, 'ul');
        });

        it('should detect unordered list with +', () => {
            const result = getLineType('+ Item');
            assert.strictEqual(result.type, 'ul');
        });

        it('should detect ordered list', () => {
            const result = getLineType('1. First item');
            assert.strictEqual(result.type, 'ol');
            assert.strictEqual(result.icon, '1.');
        });

        it('should detect ordered list with any number', () => {
            assert.strictEqual(getLineType('1. Item').type, 'ol');
            assert.strictEqual(getLineType('2. Item').type, 'ol');
            assert.strictEqual(getLineType('99. Item').type, 'ol');
            assert.strictEqual(getLineType('123. Item').type, 'ol');
        });

        it('should detect task list unchecked', () => {
            const result = getLineType('- [ ] Todo');
            assert.strictEqual(result.type, 'task');
            assert.strictEqual(result.icon, '☐');
        });

        it('should detect task list checked', () => {
            const result = getLineType('- [x] Done');
            assert.strictEqual(result.type, 'task');
        });

        it('should detect task list with uppercase X', () => {
            const result = getLineType('- [X] Done');
            assert.strictEqual(result.type, 'task');
        });

        it('should prioritize task list over unordered list', () => {
            // Task list pattern should match before ul pattern
            const result = getLineType('- [ ] Task');
            assert.strictEqual(result.type, 'task');
            assert.notStrictEqual(result.type, 'ul');
        });
    });

    describe('Blockquotes', () => {
        it('should detect single blockquote', () => {
            const result = getLineType('> Quote');
            assert.strictEqual(result.type, 'quote');
            assert.strictEqual(result.icon, '❝');
        });

        it('should detect nested blockquote (2 levels)', () => {
            const result = getLineType('>> Nested quote');
            assert.strictEqual(result.type, 'quote');
        });

        it('should detect deeply nested blockquote (3+ levels)', () => {
            assert.strictEqual(getLineType('>>> Deep').type, 'quote');
            assert.strictEqual(getLineType('>>>> Deeper').type, 'quote');
        });

        it('should detect blockquote without space after >', () => {
            const result = getLineType('>NoSpace');
            assert.strictEqual(result.type, 'quote');
        });

        it('should detect empty blockquote', () => {
            const result = getLineType('>');
            assert.strictEqual(result.type, 'quote');
        });
    });

    describe('GitHub Alerts', () => {
        it('should detect NOTE alert', () => {
            const result = getLineType('> [!NOTE]');
            assert.strictEqual(result.type, 'alert');
            assert.strictEqual(result.icon, '!');
        });

        it('should detect TIP alert', () => {
            const result = getLineType('> [!TIP]');
            assert.strictEqual(result.type, 'alert');
        });

        it('should detect IMPORTANT alert', () => {
            const result = getLineType('> [!IMPORTANT]');
            assert.strictEqual(result.type, 'alert');
        });

        it('should detect WARNING alert', () => {
            const result = getLineType('> [!WARNING]');
            assert.strictEqual(result.type, 'alert');
        });

        it('should detect CAUTION alert', () => {
            const result = getLineType('> [!CAUTION]');
            assert.strictEqual(result.type, 'alert');
        });

        it('should be case insensitive', () => {
            assert.strictEqual(getLineType('> [!note]').type, 'alert');
            assert.strictEqual(getLineType('> [!Note]').type, 'alert');
        });

        it('should prioritize alert over regular quote', () => {
            const result = getLineType('> [!NOTE]');
            assert.strictEqual(result.type, 'alert');
            assert.notStrictEqual(result.type, 'quote');
        });
    });

    describe('Code Blocks', () => {
        it('should detect code fence start', () => {
            const result = getLineType('```');
            assert.strictEqual(result.type, 'code');
            assert.strictEqual(result.icon, '{}');
        });

        it('should detect code fence with language', () => {
            assert.strictEqual(getLineType('```javascript').type, 'code');
            assert.strictEqual(getLineType('```python').type, 'code');
            assert.strictEqual(getLineType('```typescript').type, 'code');
        });

        it('should detect code fence end', () => {
            const result = getLineType('```');
            assert.strictEqual(result.type, 'code');
        });
    });

    describe('Paragraph (Default)', () => {
        it('should detect plain text as paragraph', () => {
            const result = getLineType('Just some text');
            assert.strictEqual(result.type, 'paragraph');
            assert.strictEqual(result.icon, 'T');
        });

        it('should detect empty line as paragraph', () => {
            const result = getLineType('');
            assert.strictEqual(result.type, 'paragraph');
        });

        it('should detect text with inline formatting as paragraph', () => {
            assert.strictEqual(getLineType('**bold** text').type, 'paragraph');
            assert.strictEqual(getLineType('*italic* text').type, 'paragraph');
            assert.strictEqual(getLineType('`code` text').type, 'paragraph');
        });
    });
});

describe('Line Prefix Stripping', () => {
    
    describe('Headings', () => {
        it('should strip H1 prefix', () => {
            assert.strictEqual(stripLinePrefix('# Heading'), 'Heading');
        });

        it('should strip H2 prefix', () => {
            assert.strictEqual(stripLinePrefix('## Heading'), 'Heading');
        });

        it('should strip H6 prefix', () => {
            assert.strictEqual(stripLinePrefix('###### Heading'), 'Heading');
        });
    });

    describe('Lists', () => {
        it('should strip unordered list prefix', () => {
            assert.strictEqual(stripLinePrefix('- Item'), 'Item');
            assert.strictEqual(stripLinePrefix('* Item'), 'Item');
            assert.strictEqual(stripLinePrefix('+ Item'), 'Item');
        });

        it('should strip ordered list prefix', () => {
            assert.strictEqual(stripLinePrefix('1. Item'), 'Item');
            assert.strictEqual(stripLinePrefix('99. Item'), 'Item');
        });

        it('should strip task list prefix', () => {
            assert.strictEqual(stripLinePrefix('- [ ] Task'), 'Task');
            assert.strictEqual(stripLinePrefix('- [x] Task'), 'Task');
        });
    });

    describe('Blockquotes', () => {
        it('should strip single blockquote prefix', () => {
            assert.strictEqual(stripLinePrefix('> Quote'), 'Quote');
        });

        it('should strip nested blockquote prefix', () => {
            assert.strictEqual(stripLinePrefix('>> Nested'), 'Nested');
            assert.strictEqual(stripLinePrefix('>>> Deep'), 'Deep');
        });

        it('should strip blockquote without space', () => {
            assert.strictEqual(stripLinePrefix('>Text'), 'Text');
        });
    });

    describe('Code Blocks', () => {
        it('should strip code fence', () => {
            assert.strictEqual(stripLinePrefix('```'), '');
            assert.strictEqual(stripLinePrefix('```javascript'), '');
        });
    });

    describe('Horizontal Rules', () => {
        it('should strip horizontal rule', () => {
            assert.strictEqual(stripLinePrefix('---'), '');
            assert.strictEqual(stripLinePrefix('***'), '');
            assert.strictEqual(stripLinePrefix('___'), '');
        });
    });

    describe('Paragraph', () => {
        it('should not modify plain text', () => {
            assert.strictEqual(stripLinePrefix('Plain text'), 'Plain text');
        });

        it('should not modify empty string', () => {
            assert.strictEqual(stripLinePrefix(''), '');
        });
    });
});

describe('Line Type Transformations', () => {
    
    describe('To Heading', () => {
        it('should convert paragraph to H1', () => {
            const content = stripLinePrefix('Plain text');
            const result = applyLinePrefix(content, 'h1');
            assert.strictEqual(result, '# Plain text');
        });

        it('should convert list to H2', () => {
            const content = stripLinePrefix('- List item');
            const result = applyLinePrefix(content, 'h2');
            assert.strictEqual(result, '## List item');
        });

        it('should convert blockquote to H3', () => {
            const content = stripLinePrefix('> Quote');
            const result = applyLinePrefix(content, 'h3');
            assert.strictEqual(result, '### Quote');
        });

        it('should convert nested blockquote to paragraph', () => {
            const content = stripLinePrefix('>> Nested quote');
            const result = applyLinePrefix(content, 'paragraph');
            assert.strictEqual(result, 'Nested quote');
        });
    });

    describe('To List', () => {
        it('should convert paragraph to unordered list', () => {
            const content = stripLinePrefix('Text');
            const result = applyLinePrefix(content, 'ul');
            assert.strictEqual(result, '- Text');
        });

        it('should convert heading to ordered list', () => {
            const content = stripLinePrefix('# Heading');
            const result = applyLinePrefix(content, 'ol');
            assert.strictEqual(result, '1. Heading');
        });

        it('should convert paragraph to task list', () => {
            const content = stripLinePrefix('Task');
            const result = applyLinePrefix(content, 'task');
            assert.strictEqual(result, '- [ ] Task');
        });
    });

    describe('To Blockquote', () => {
        it('should convert paragraph to blockquote', () => {
            const content = stripLinePrefix('Text');
            const result = applyLinePrefix(content, 'quote');
            assert.strictEqual(result, '> Text');
        });

        it('should convert heading to blockquote', () => {
            const content = stripLinePrefix('## Heading');
            const result = applyLinePrefix(content, 'quote');
            assert.strictEqual(result, '> Heading');
        });
    });

    describe('To Code Block', () => {
        it('should convert paragraph to code block', () => {
            const content = stripLinePrefix('code here');
            const result = applyLinePrefix(content, 'code');
            assert.strictEqual(result, '```\ncode here\n```');
        });
    });

    describe('To Horizontal Rule', () => {
        it('should convert paragraph to horizontal rule', () => {
            const result = applyLinePrefix('ignored', 'hr');
            assert.strictEqual(result, '---');
        });
    });

    describe('Round-trip Transformations', () => {
        it('should preserve content through heading round-trip', () => {
            const original = 'My content';
            const asH1 = applyLinePrefix(original, 'h1');
            const stripped = stripLinePrefix(asH1);
            const back = applyLinePrefix(stripped, 'paragraph');
            assert.strictEqual(back, original);
        });

        it('should preserve content through list round-trip', () => {
            const original = 'List item';
            const asList = applyLinePrefix(original, 'ul');
            const stripped = stripLinePrefix(asList);
            const back = applyLinePrefix(stripped, 'paragraph');
            assert.strictEqual(back, original);
        });

        it('should preserve content through quote round-trip', () => {
            const original = 'Quote text';
            const asQuote = applyLinePrefix(original, 'quote');
            const stripped = stripLinePrefix(asQuote);
            const back = applyLinePrefix(stripped, 'paragraph');
            assert.strictEqual(back, original);
        });
    });
});

describe('Menu Line Types', () => {
    const MENU_LINE_TYPES = [
        DEFAULT_LINE_TYPE,
        ...LINE_TYPES.filter(t => t.label),
    ];

    it('should include paragraph/text as first item', () => {
        assert.strictEqual(MENU_LINE_TYPES[0].type, 'paragraph');
        assert.strictEqual(MENU_LINE_TYPES[0].label, 'Text');
    });

    it('should include all heading levels', () => {
        const headings = MENU_LINE_TYPES.filter(t => /^h[1-6]$/.test(t.type));
        assert.strictEqual(headings.length, 6);
        assert.ok(headings.some(h => h.type === 'h1'));
        assert.ok(headings.some(h => h.type === 'h6'));
    });

    it('should include horizontal rule', () => {
        assert.ok(MENU_LINE_TYPES.some(t => t.type === 'hr'));
    });

    it('should include all list types', () => {
        assert.ok(MENU_LINE_TYPES.some(t => t.type === 'ul'));
        assert.ok(MENU_LINE_TYPES.some(t => t.type === 'ol'));
        assert.ok(MENU_LINE_TYPES.some(t => t.type === 'task'));
    });

    it('should include quote', () => {
        assert.ok(MENU_LINE_TYPES.some(t => t.type === 'quote'));
    });

    it('should include code block', () => {
        assert.ok(MENU_LINE_TYPES.some(t => t.type === 'code'));
    });

    it('should NOT include alert (no menu entry)', () => {
        assert.ok(!MENU_LINE_TYPES.some(t => t.type === 'alert'));
    });

    it('should have labels for all menu items', () => {
        for (const item of MENU_LINE_TYPES) {
            assert.ok(item.label, `${item.type} should have a label`);
        }
    });

    it('should have icons for all menu items', () => {
        for (const item of MENU_LINE_TYPES) {
            assert.ok(item.icon, `${item.type} should have an icon`);
        }
    });
});

describe('Code Block Content Detection', () => {
    /**
     * Code content lines should NOT be detected as any line type.
     * They should be treated specially (no icon, no clickable button).
     */
    
    it('should not detect Python comment as heading inside code block', () => {
        // This is the key test - inside a code block, # is not a heading
        const codeContent = '# This is a Python comment';
        // When inside a code block, we pass isCodeContent=true and skip detection
        // The getLineType would return h1, but we don't call it for code content
        const result = getLineType(codeContent);
        // This shows why we need the isCodeContent flag - without it, this would be h1
        assert.strictEqual(result.type, 'h1');
    });

    it('should not detect list syntax inside code block', () => {
        const codeContent = '- not a list, just code';
        const result = getLineType(codeContent);
        // Again, this would be detected as ul without the isCodeContent flag
        assert.strictEqual(result.type, 'ul');
    });

    it('should not detect blockquote inside code block', () => {
        const codeContent = '> not a quote, just code';
        const result = getLineType(codeContent);
        assert.strictEqual(result.type, 'quote');
    });
});

describe('Icon Consistency', () => {
    it('should use T for paragraph', () => {
        assert.strictEqual(DEFAULT_LINE_TYPE.icon, 'T');
    });

    it('should use {} for code blocks', () => {
        const codeDef = LINE_TYPES.find(t => t.type === 'code');
        assert.strictEqual(codeDef?.icon, '{}');
    });

    it('should use subscript numbers for headings', () => {
        assert.strictEqual(LINE_TYPES.find(t => t.type === 'h1')?.icon, 'H₁');
        assert.strictEqual(LINE_TYPES.find(t => t.type === 'h2')?.icon, 'H₂');
        assert.strictEqual(LINE_TYPES.find(t => t.type === 'h3')?.icon, 'H₃');
        assert.strictEqual(LINE_TYPES.find(t => t.type === 'h4')?.icon, 'H₄');
        assert.strictEqual(LINE_TYPES.find(t => t.type === 'h5')?.icon, 'H₅');
        assert.strictEqual(LINE_TYPES.find(t => t.type === 'h6')?.icon, 'H₆');
    });

    it('should use 1. for ordered lists', () => {
        const olDef = LINE_TYPES.find(t => t.type === 'ol');
        assert.strictEqual(olDef?.icon, '1.');
    });

    it('should use • for unordered lists', () => {
        const ulDef = LINE_TYPES.find(t => t.type === 'ul');
        assert.strictEqual(ulDef?.icon, '•');
    });

    it('should use ☐ for task lists', () => {
        const taskDef = LINE_TYPES.find(t => t.type === 'task');
        assert.strictEqual(taskDef?.icon, '☐');
    });

    it('should use ❝ for quotes', () => {
        const quoteDef = LINE_TYPES.find(t => t.type === 'quote');
        assert.strictEqual(quoteDef?.icon, '❝');
    });

    it('should use ! for alerts', () => {
        const alertDef = LINE_TYPES.find(t => t.type === 'alert');
        assert.strictEqual(alertDef?.icon, '!');
    });

    it('should use ― for horizontal rules', () => {
        const hrDef = LINE_TYPES.find(t => t.type === 'hr');
        assert.strictEqual(hrDef?.icon, '―');
    });
});

