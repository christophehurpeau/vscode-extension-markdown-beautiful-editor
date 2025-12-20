/**
 * Markdown Parser Module
 *
 * Converts plain markdown text into styled HTML for rendering in the editor.
 * Handles line-level markdown (headings, lists, blockquotes, etc.) and
 * inline formatting (bold, italic, code, links, etc.).
 */

// Line type definitions - single source of truth for type detection, icons, and menu
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
 * Check if a line is a blockquote (but not a GitHub alert)
 */
function isBlockquoteLine(line: string): boolean {
    // It's a blockquote if it starts with > but is NOT a GitHub alert header
    if (!line.match(/^>+\s?/)) {
        return false;
    }
    // Exclude GitHub alert headers
    if (line.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i)) {
        return false;
    }
    return true;
}

/**
 * Get the depth of a blockquote line (number of > markers)
 */
function getBlockquoteDepth(line: string): number {
    const match = line.match(/^(>+)/);
    return match ? match[1].length : 0;
}

/**
 * Generate line prefix (line number + type button)
 * @param lineNumber The line number (1-indexed)
 * @param line The markdown line content
 * @param isCodeContent true for lines inside code blocks (not the ``` fences themselves)
 */
export function generateLinePrefix(lineNumber: number, line: string, isCodeContent: boolean = false): string {
    if (isCodeContent) {
        // Code content lines: no icon, no button interaction
        return `<span class="line-prefix" contenteditable="false"><span class="line-number">${lineNumber}</span><span class="line-type-btn disabled"></span></span>`;
    }
    const icon = getLineTypeIcon(line);
    return `<span class="line-prefix" contenteditable="false"><span class="line-number">${lineNumber}</span><button type="button" class="line-type-btn" data-line="${lineNumber - 1}" title="Change line type">${icon}</button></span>`;
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Style inline markdown elements (bold, italic, code, links, etc.)
 */
export function styleInline(text: string): string {
    if (!text) {
        return '';
    }

    // First, handle escaped characters BEFORE escaping HTML
    // Replace \* with a placeholder to protect it
    const ESCAPE_PLACEHOLDER = '\u0000ESC\u0000';
    let result = text;

    // Collect escaped sequences and replace with placeholders
    const escapedChars: string[] = [];
    result = result.replace(/\\([*_`\[\]()#+-\.!\\])/g, (_match, char) => {
        escapedChars.push(char);
        return ESCAPE_PLACEHOLDER + (escapedChars.length - 1) + ESCAPE_PLACEHOLDER;
    });

    // Now escape HTML
    result = escapeHtml(result);

    // Images: ![alt](url) - must come before links
    result = result.replace(
        /!\[([^\]]*)\]\(([^)]+)\)/g,
        '<span class="md-image"><span class="md-syntax">![</span><span class="md-alt">$1</span><span class="md-syntax">](</span><span class="md-url">$2</span><span class="md-syntax">)</span></span>'
    );

    // Footnote references: [^id]
    result = result.replace(
        /\[\^([^\]]+)\]/g,
        '<span class="md-footnote"><span class="md-syntax">[^</span>$1<span class="md-syntax">]</span></span>'
    );

    // Links: [text](url)
    result = result.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<span class="md-link"><span class="md-syntax">[</span><span class="md-text">$1</span><span class="md-syntax">](</span><span class="md-url">$2</span><span class="md-syntax">)</span></span>'
    );

    // Use placeholders for asterisks/underscores in output to prevent re-matching
    const ASTERISK = '\u0001';
    const UNDERSCORE = '\u0002';

    // Bold + Italic: ***text*** (must come before bold and italic)
    result = result.replace(
        /\*\*\*(.+?)\*\*\*/g,
        `<span class="md-bold-italic"><span class="md-syntax">${ASTERISK}${ASTERISK}${ASTERISK}</span><strong><em>$1</em></strong><span class="md-syntax">${ASTERISK}${ASTERISK}${ASTERISK}</span></span>`
    );

    // Bold: **text** (must come before italic)
    result = result.replace(
        /\*\*(.+?)\*\*/g,
        `<span class="md-bold"><span class="md-syntax">${ASTERISK}${ASTERISK}</span><strong>$1</strong><span class="md-syntax">${ASTERISK}${ASTERISK}</span></span>`
    );

    // Bold: __text__ (use word boundary-like matching)
    result = result.replace(
        /(?<![a-zA-Z0-9])__(.+?)__(?![a-zA-Z0-9])/g,
        `<span class="md-bold"><span class="md-syntax">${UNDERSCORE}${UNDERSCORE}</span><strong>$1</strong><span class="md-syntax">${UNDERSCORE}${UNDERSCORE}</span></span>`
    );

    // Italic: *text* (but not **)
    result = result.replace(
        /(?<!\*)\*([^*]+)\*(?!\*)/g,
        `<span class="md-italic"><span class="md-syntax">${ASTERISK}</span><em>$1</em><span class="md-syntax">${ASTERISK}</span></span>`
    );

    // Italic: _text_ (use word boundary-like matching, but not __)
    result = result.replace(
        /(?<!_)_([^_]+)_(?!_)/g,
        `<span class="md-italic"><span class="md-syntax">${UNDERSCORE}</span><em>$1</em><span class="md-syntax">${UNDERSCORE}</span></span>`
    );

    // Restore asterisks and underscores
    result = result.replace(new RegExp(ASTERISK, 'g'), '*');
    result = result.replace(new RegExp(UNDERSCORE, 'g'), '_');

    // Inline code: `code`
    result = result.replace(
        /`([^`]+)`/g,
        '<span class="md-code"><span class="md-syntax">`</span><code>$1</code><span class="md-syntax">`</span></span>'
    );

    // Math inline: $formula$
    result = result.replace(
        /\$([^$]+)\$/g,
        '<span class="md-math"><span class="md-syntax">$</span><span class="md-math-content">$1</span><span class="md-syntax">$</span></span>'
    );

    // Strikethrough: ~~text~~
    result = result.replace(
        /~~([^~]+)~~/g,
        '<span class="md-strike"><span class="md-syntax">~~</span><del>$1</del><span class="md-syntax">~~</span></span>'
    );

    // Restore escaped characters
    result = result.replace(
        new RegExp(ESCAPE_PLACEHOLDER + '(\\d+)' + ESCAPE_PLACEHOLDER, 'g'),
        (_match, index) => {
            const char = escapedChars[parseInt(index, 10)];
            return `<span class="md-escaped"><span class="md-syntax">\\</span>${escapeHtml(char)}</span>`;
        }
    );

    return result;
}

/**
 * Style a single line of markdown
 */
export function styleLine(line: string): string {
    if (!line) {
        return '';
    }

    // Headings - style the # symbols and text
    const headingMatch = line.match(/^(#{1,6})\s(.*)$/);
    if (headingMatch) {
        const level = headingMatch[1].length;
        const hashes = headingMatch[1];
        const text = styleInline(headingMatch[2]);
        return `<span class="md-heading md-h${level}"><span class="md-syntax">${hashes}</span> ${text}</span>`;
    }

    // GitHub Alerts: > [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION]
    const alertMatch = line.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
    if (alertMatch) {
        const alertType = alertMatch[1].toUpperCase();
        return `<span class="md-alert md-alert-${alertType.toLowerCase()}"><span class="md-syntax">&gt; [!</span><span class="md-alert-type">${alertType}</span><span class="md-syntax">]</span></span>`;
    }

    // Blockquotes (handle multiple > for nesting)
    const quoteMatch = line.match(/^(>+)\s?(.*)$/);
    if (quoteMatch) {
        const markers = quoteMatch[1];
        const depth = markers.length;
        const content = styleInline(quoteMatch[2]);
        return `<span class="md-blockquote md-quote-${depth}"><span class="md-syntax">${escapeHtml(markers)}</span> ${content}</span>`;
    }

    // Task lists: - [ ] or - [x]
    const taskMatch = line.match(/^(\s*)([-*+])\s\[([ xX])\]\s(.*)$/);
    if (taskMatch) {
        const indent = taskMatch[1];
        const marker = taskMatch[2];
        const checked = taskMatch[3].toLowerCase() === 'x';
        const content = styleInline(taskMatch[4]);
        const checkClass = checked ? 'md-task-checked' : 'md-task-unchecked';
        return `${escapeHtml(indent)}<span class="md-task ${checkClass}"><span class="md-syntax">${marker} [${taskMatch[3]}]</span> ${content}</span>`;
    }

    // Unordered lists
    const ulMatch = line.match(/^(\s*)([-*+])\s(.*)$/);
    if (ulMatch) {
        const indent = ulMatch[1];
        const marker = ulMatch[2];
        const content = styleInline(ulMatch[3]);
        return `${escapeHtml(indent)}<span class="md-list"><span class="md-syntax">${marker}</span> ${content}</span>`;
    }

    // Ordered lists
    const olMatch = line.match(/^(\s*)(\d+\.)\s(.*)$/);
    if (olMatch) {
        const indent = olMatch[1];
        const marker = olMatch[2];
        const content = styleInline(olMatch[3]);
        return `${escapeHtml(indent)}<span class="md-list"><span class="md-syntax">${marker}</span> ${content}</span>`;
    }

    // Horizontal rules
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) {
        return `<span class="md-hr"><span class="md-hr-text">${escapeHtml(line)}</span></span>`;
    }

    // Table rows
    const tableMatch = line.match(/^\|(.+)\|$/);
    if (tableMatch) {
        const cells = line.split('|').slice(1, -1);
        const styledCells = cells.map(cell => {
            // Check if it's a separator row
            if (/^[\s:-]+$/.test(cell)) {
                return `<span class="md-table-sep">${escapeHtml(cell)}</span>`;
            }
            return styleInline(cell);
        });
        return `<span class="md-table"><span class="md-syntax">|</span>${styledCells.join('<span class="md-syntax">|</span>')}<span class="md-syntax">|</span></span>`;
    }

    // Definition lists (term followed by : definition)
    const defMatch = line.match(/^:\s(.*)$/);
    if (defMatch) {
        const content = styleInline(defMatch[1]);
        return `<span class="md-definition"><span class="md-syntax">:</span> ${content}</span>`;
    }

    // Footnote definitions
    const footnoteDefMatch = line.match(/^\[\^([^\]]+)\]:\s(.*)$/);
    if (footnoteDefMatch) {
        const id = footnoteDefMatch[1];
        const content = styleInline(footnoteDefMatch[2]);
        return `<span class="md-footnote-def"><span class="md-syntax">[^${escapeHtml(id)}]:</span> ${content}</span>`;
    }

    // Regular paragraph with inline styling
    return styleInline(line);
}

/**
 * Parse markdown text into styled HTML for display
 *
 * This is the main entry point for converting markdown to HTML.
 * It handles both line-level structure (headings, lists, blockquotes)
 * and inline formatting (bold, italic, code, links).
 *
 * @param markdown Plain markdown text
 * @returns Styled HTML string
 */
export function markdownToStyledHtml(markdown: string): string {
    const lines = markdown.split('\n');

    // First pass: determine line types and blockquote grouping
    interface LineInfo {
        line: string;
        isBlockquote: boolean;
        blockquoteDepth: number;
        isAlertHeader: boolean;
        isAlertContent: boolean;
        isCodeFence: boolean;
        isCodeContent: boolean;
        alertType: string | null;
    }

    const lineInfos: LineInfo[] = [];
    let inCodeBlock = false;
    let currentAlertType: string | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const info: LineInfo = {
            line,
            isBlockquote: false,
            blockquoteDepth: 0,
            isAlertHeader: false,
            isAlertContent: false,
            isCodeFence: false,
            isCodeContent: false,
            alertType: null
        };

        // Handle code blocks
        if (line.startsWith('```')) {
            currentAlertType = null;
            info.isCodeFence = true;
            inCodeBlock = !inCodeBlock;
            lineInfos.push(info);
            continue;
        }

        if (inCodeBlock) {
            info.isCodeContent = true;
            lineInfos.push(info);
            continue;
        }

        // Check for GitHub alert header
        const alertMatch = line.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
        if (alertMatch) {
            currentAlertType = alertMatch[1].toLowerCase();
            info.isAlertHeader = true;
            info.alertType = currentAlertType;
            lineInfos.push(info);
            continue;
        }

        // Check if this is a continuation of an alert
        if (currentAlertType && line.match(/^>\s?/)) {
            info.isAlertContent = true;
            info.alertType = currentAlertType;
            lineInfos.push(info);
            continue;
        }

        // Reset alert state if line doesn't start with >
        if (!line.match(/^>\s?/)) {
            currentAlertType = null;
        }

        // Check for regular blockquote
        if (isBlockquoteLine(line)) {
            info.isBlockquote = true;
            info.blockquoteDepth = getBlockquoteDepth(line);
        }

        lineInfos.push(info);
    }

    // Second pass: generate HTML with blockquote grouping classes
    const htmlLines: string[] = [];
    inCodeBlock = false;

    for (let i = 0; i < lineInfos.length; i++) {
        const info = lineInfos[i];
        const prevInfo = i > 0 ? lineInfos[i - 1] : null;
        const nextInfo = i < lineInfos.length - 1 ? lineInfos[i + 1] : null;
        const lineNum = i + 1;

        // Code fence - these ARE clickable to convert back to text
        if (info.isCodeFence) {
            const prefix = generateLinePrefix(lineNum, info.line, false);
            if (!inCodeBlock) {
                inCodeBlock = true;
                const lang = info.line.slice(3).trim();
                htmlLines.push(`<div class="line code-fence code-start">${prefix}<span class="line-content"><span class="code-inner">\`\`\`${escapeHtml(lang)}</span></span></div>`);
            } else {
                inCodeBlock = false;
                htmlLines.push(`<div class="line code-fence code-end">${prefix}<span class="line-content"><span class="code-inner">\`\`\`</span></span></div>`);
            }
            continue;
        }

        // Code content
        if (info.isCodeContent) {
            const prefix = generateLinePrefix(lineNum, info.line, true);
            const content = escapeHtml(info.line);
            const isEmpty = !content;
            htmlLines.push(`<div class="line code-content${isEmpty ? ' empty-line' : ''}">${prefix}<span class="line-content"><span class="code-inner">${content || '<br>'}</span></span></div>`);
            continue;
        }

        const prefix = generateLinePrefix(lineNum, info.line);

        // GitHub alert header
        if (info.isAlertHeader) {
            const alertMatch = info.line.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
            const alertType = alertMatch![1].toUpperCase();
            const isLast = !nextInfo?.isAlertContent;
            let classes = `line md-alert md-alert-${info.alertType} alert-first`;
            if (isLast) {classes += ' alert-last alert-single';}
            htmlLines.push(`<div class="${classes}">${prefix}<span class="line-content"><span class="alert-inner"><span class="md-syntax">&gt; [!</span><span class="md-alert-type">${alertType}</span><span class="md-syntax">]</span></span></span></div>`);
            continue;
        }

        // GitHub alert content
        if (info.isAlertContent) {
            const content = info.line.replace(/^>\s?/, '');
            const styledContent = styleInline(content);
            const isLast = !nextInfo?.isAlertContent;
            let classes = `line md-alert-content md-alert-${info.alertType}`;
            if (isLast) {classes += ' alert-last';}
            htmlLines.push(`<div class="${classes}">${prefix}<span class="line-content"><span class="alert-inner"><span class="md-syntax">&gt;</span> ${styledContent}</span></span></div>`);
            continue;
        }

        // Regular blockquote with grouping
        if (info.isBlockquote) {
            const isFirst = !prevInfo?.isBlockquote;
            const isLast = !nextInfo?.isBlockquote;
            const depth = Math.min(info.blockquoteDepth, 3); // Cap at 3 levels

            let classes = 'line blockquote-line';
            if (isFirst) {classes += ' blockquote-first';}
            if (isLast) {classes += ' blockquote-last';}
            if (depth > 1) {classes += ` blockquote-depth-${depth}`;}

            const styledLine = styleLine(info.line);
            htmlLines.push(`<div class="${classes}">${prefix}<span class="line-content">${styledLine}</span></div>`);
            continue;
        }

        // Regular line
        const styledLine = styleLine(info.line);
        const isEmpty = !styledLine;
        htmlLines.push(`<div class="line${isEmpty ? ' empty-line' : ''}">${prefix}<span class="line-content">${styledLine || '<br>'}</span></div>`);
    }

    return htmlLines.join('');
}
