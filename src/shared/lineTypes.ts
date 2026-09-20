/**
 * Line-type detection and the line-type-prefix transforms built on it.
 *
 * A "line type" (heading, list, quote, code fence, ...) is detected from a
 * single line of markdown text and drives the line-type toolbar's icon/menu
 * and the paragraph<->heading/list/quote/code conversions. Pure (no DOM), so
 * it is shared between the webview and unit tests.
 */

export interface LineTypeDefinition {
    type: string;
    pattern: RegExp;
    icon: string;
    label?: string; // Label for menu (if shown in menu)
}

// Types for line detection (order matters - more specific patterns first)
export const LINE_TYPES: LineTypeDefinition[] = [
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
    { type: 'alert', pattern: /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i, icon: '!' }, // No menu entry
    { type: 'quote', pattern: /^>/, icon: '❝', label: 'Quote' },
    { type: 'code', pattern: /^```/, icon: '{}', label: 'Code Block' },
];

export const DEFAULT_LINE_TYPE: LineTypeDefinition = { type: 'paragraph', pattern: /^/, icon: 'T', label: 'Text' };

// Menu items (subset of LINE_TYPES that appear in the menu, in display order)
export const MENU_LINE_TYPES: LineTypeDefinition[] = [
    DEFAULT_LINE_TYPE,
    ...LINE_TYPES.filter(t => t.label), // Only types with labels
];

/**
 * Get the line type for a given line of markdown
 */
export function getLineType(line: string): LineTypeDefinition {
    for (const def of LINE_TYPES) {
        if (def.pattern.test(line)) {
            return def;
        }
    }
    return DEFAULT_LINE_TYPE;
}

/**
 * Get the icon for a line type
 */
export function getLineTypeIcon(line: string): string {
    return getLineType(line).icon;
}

/**
 * Remove any line-type prefix (heading, list, quote, code fence, …) from a line,
 * leaving the bare content.
 *
 * Note: these strip patterns intentionally differ from the detection patterns in
 * {@link LINE_TYPES} — they also consume the trailing separator space so the
 * content comes back clean. Order matters: most specific first.
 */
export function stripLinePrefix(line: string): string {
    return line
        .replace(/^(-{3,}|\*{3,}|_{3,})\s*$/, '') // Horizontal rule
        .replace(/^#{1,6}\s/, '')                 // Headings
        .replace(/^[-*+]\s\[[ xX]\]\s/, '')       // Task list
        .replace(/^[-*+]\s/, '')                  // Unordered list
        .replace(/^\d+\.\s/, '')                  // Ordered list
        .replace(/^>+\s?/, '')                    // Blockquote (incl. nested)
        .replace(/^```\w*\s*/, '');               // Code fence
}

/**
 * Apply a line-type prefix to bare content, producing a markdown line of `type`.
 * Expects content that has already been run through {@link stripLinePrefix}.
 */
export function applyLinePrefix(content: string, type: string): string {
    switch (type) {
        case 'paragraph': return content;
        case 'h1': return `# ${content}`;
        case 'h2': return `## ${content}`;
        case 'h3': return `### ${content}`;
        case 'h4': return `#### ${content}`;
        case 'h5': return `##### ${content}`;
        case 'h6': return `###### ${content}`;
        case 'hr': return `---`;
        case 'ul': return `- ${content}`;
        case 'ol': return `1. ${content}`;
        case 'task': return `- [ ] ${content}`;
        case 'quote': return `> ${content}`;
        case 'code': return `\`\`\`\n${content}\n\`\`\``;
        default: return content;
    }
}
