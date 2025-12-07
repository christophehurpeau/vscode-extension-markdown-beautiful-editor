import { updateToc, setupScrollSpy } from './toc';

// Acquire VS Code API
declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// Cursor position interface (defined early for use in EditorState)
interface CursorPosition {
    lineIndex: number;
    offset: number;
}

// Track if we're currently applying an external update to avoid loops
let isExternalUpdate = false;

// Track the last content we sent to avoid redundant messages
let lastSentContent = '';

// Debounce timer for sending edits
let editDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const EDIT_DEBOUNCE_MS = 300;

// Editor container reference
let editorContainer: HTMLElement | null = null;

// State management for persistence across tab switches
interface EditorState {
    cursorPosition: CursorPosition | null;
    scrollTop: number;
}

function saveState(): void {
    if (!editorContainer) {
        return;
    }
    const state: EditorState = {
        cursorPosition: saveCursorPosition(editorContainer),
        scrollTop: editorContainer.scrollTop
    };
    vscode.setState(state);
}

function getStoredState(): EditorState | null {
    return vscode.getState() as EditorState | null;
}

// Check if a line is a blockquote (but not a GitHub alert)
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

// Get the depth of a blockquote line (number of > markers)
function getBlockquoteDepth(line: string): number {
    const match = line.match(/^(>+)/);
    return match ? match[1].length : 0;
}

// Line type definitions - single source of truth for type detection, icons, and menu
interface LineTypeDefinition {
    type: string;
    pattern: RegExp;
    icon: string;
    label?: string; // Label for menu (if shown in menu)
}

// Types for line detection (order matters - more specific patterns first)
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
    { type: 'alert', pattern: /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i, icon: '!' }, // No menu entry
    { type: 'quote', pattern: /^>/, icon: '❝', label: 'Quote' },
    { type: 'code', pattern: /^```/, icon: '{}', label: 'Code Block' },
];

const DEFAULT_LINE_TYPE: LineTypeDefinition = { type: 'paragraph', pattern: /^/, icon: 'T', label: 'Text' };

// Menu items (subset of LINE_TYPES that appear in the menu, in display order)
const MENU_LINE_TYPES: LineTypeDefinition[] = [
    DEFAULT_LINE_TYPE,
    ...LINE_TYPES.filter(t => t.label), // Only types with labels
];

// Get the line type for a given line
function getLineType(line: string): LineTypeDefinition {
    for (const def of LINE_TYPES) {
        if (def.pattern.test(line)) {
            return def;
        }
    }
    return DEFAULT_LINE_TYPE;
}

// Get the icon for a line type
function getLineTypeIcon(line: string): string {
    return getLineType(line).icon;
}

// Generate line prefix (line number + type button)
// isCodeContent: true for lines inside code blocks (not the ``` fences themselves)
function generateLinePrefix(lineNumber: number, line: string, isCodeContent: boolean = false): string {
    if (isCodeContent) {
        // Code content lines: no icon, no button interaction
        return `<span class="line-prefix" contenteditable="false"><span class="line-number">${lineNumber}</span><span class="line-type-btn disabled"></span></span>`;
    }
    const icon = getLineTypeIcon(line);
    return `<span class="line-prefix" contenteditable="false"><span class="line-number">${lineNumber}</span><button type="button" class="line-type-btn" data-line="${lineNumber - 1}" title="Change line type">${icon}</button></span>`;
}

// Parse markdown text into styled HTML for display
function markdownToStyledHtml(markdown: string): string {
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

// Style a single line of markdown
function styleLine(line: string): string {
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

// Style inline markdown elements
function styleInline(text: string): string {
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

// Escape HTML special characters
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Get selected text, extracting only from .line-content elements
function getSelectedMarkdownText(selection: Selection): string {
    if (!selection.rangeCount || !editorContainer) {
        return '';
    }
    
    const range = selection.getRangeAt(0);
    
    // If selection is within a single line-content, just return the text
    const commonAncestor = range.commonAncestorContainer;
    if (commonAncestor instanceof Text || 
        (commonAncestor instanceof HTMLElement && commonAncestor.closest('.line-content'))) {
        return selection.toString();
    }
    
    // Multi-line selection: extract text from each line-content
    const lines: string[] = [];
    const children = editorContainer.children;
    
    for (let i = 0; i < children.length; i++) {
        const lineEl = children[i];
        const lineContent = lineEl.querySelector('.line-content');
        if (!lineContent) {
            continue;
        }
        
        // Check if this line is within the selection
        if (selection.containsNode(lineContent, true)) {
            // Get the text from this line-content
            const lineRange = document.createRange();
            lineRange.selectNodeContents(lineContent);
            
            // Intersect with selection
            if (range.compareBoundaryPoints(Range.START_TO_START, lineRange) > 0) {
                lineRange.setStart(range.startContainer, range.startOffset);
            }
            if (range.compareBoundaryPoints(Range.END_TO_END, lineRange) < 0) {
                lineRange.setEnd(range.endContainer, range.endOffset);
            }
            
            lines.push(lineRange.toString());
        }
    }
    
    return lines.join('\n');
}

// Extract plain markdown text from the editor
function extractMarkdown(container: HTMLElement): string {
    const lines: string[] = [];
    
    // Get all direct children - they should be .line divs, but browser might add others on edit
    const children = container.children;
    
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        // Only get text from .line-content, not line numbers or buttons
        const lineContent = child.querySelector('.line-content');
        const text = lineContent ? lineContent.textContent || '' : child.textContent || '';
        lines.push(text);
    }
    
    return lines.join('\n');
}

// Place cursor at the start of the editor
function placeCursorAtStart(container: HTMLElement): void {
    const selection = window.getSelection();
    if (!selection) {
        return;
    }
    
    // Find the first line-content element
    const firstLineContent = container.querySelector('.line-content');
    if (!firstLineContent) {
        return;
    }
    
    // Find the first text node within the line-content
    const treeWalker = document.createTreeWalker(firstLineContent, NodeFilter.SHOW_TEXT);
    const firstTextNode = treeWalker.nextNode();
    
    const range = document.createRange();
    if (firstTextNode) {
        range.setStart(firstTextNode, 0);
        range.collapse(true);
    } else {
        // No text node (empty line), place cursor at start of line content
        range.selectNodeContents(firstLineContent);
        range.collapse(true);
    }
    
    selection.removeAllRanges();
    selection.addRange(range);
}

// Save and restore cursor position
function saveCursorPosition(container: HTMLElement): CursorPosition | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return null;
    }
    
    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    const offset = range.startOffset;
    
    // Find the line element (direct child of container)
    let lineEl: HTMLElement | null = null;
    let current: Node | null = node;
    while (current && current !== container) {
        if (current.parentNode === container && current instanceof HTMLElement) {
            lineEl = current;
            break;
        }
        current = current.parentNode;
    }
    
    if (!lineEl) {
        return null;
    }
    
    // Find line index among all direct children
    const children = container.children;
    let lineIndex = -1;
    for (let i = 0; i < children.length; i++) {
        if (children[i] === lineEl) {
            lineIndex = i;
            break;
        }
    }
    
    if (lineIndex === -1) {
        return null;
    }
    
    // Calculate offset within the line's text content
    const treeWalker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
    let charCount = 0;
    let foundNode: Node | null = null;
    
    while (treeWalker.nextNode()) {
        const currentNode = treeWalker.currentNode;
        if (currentNode === node) {
            foundNode = node;
            charCount += offset;
            break;
        }
        charCount += (currentNode.textContent || '').length;
    }
    
    if (!foundNode) {
        // Node not found in tree walker, use offset directly
        charCount = offset;
    }
    
    return { lineIndex, offset: charCount };
}

function restoreCursorPosition(container: HTMLElement, pos: CursorPosition): void {
    const children = container.children;
    if (pos.lineIndex >= children.length) {
        return;
    }
    
    const lineEl = children[pos.lineIndex];
    // Only walk through text nodes in .line-content, not .line-prefix
    const lineContent = lineEl.querySelector('.line-content');
    if (!lineContent) {
        return;
    }
    
    const treeWalker = document.createTreeWalker(lineContent, NodeFilter.SHOW_TEXT);
    
    let charCount = 0;
    let targetNode: Node | null = null;
    let targetOffset = 0;
    
    while (treeWalker.nextNode()) {
        const currentNode = treeWalker.currentNode;
        const nodeLength = (currentNode.textContent || '').length;
        
        if (charCount + nodeLength >= pos.offset) {
            targetNode = currentNode;
            targetOffset = pos.offset - charCount;
            break;
        }
        charCount += nodeLength;
    }
    
    // If no text node found or offset beyond content, place cursor at end of line-content
    if (!targetNode) {
        const range = document.createRange();
        // Try to find the last text node
        const lastTextWalker = document.createTreeWalker(lineContent, NodeFilter.SHOW_TEXT);
        let lastTextNode: Node | null = null;
        while (lastTextWalker.nextNode()) {
            lastTextNode = lastTextWalker.currentNode;
        }
        
        if (lastTextNode) {
            // Place cursor at end of last text node
            range.setStart(lastTextNode, lastTextNode.textContent?.length || 0);
            range.collapse(true);
        } else {
            // No text nodes, place at start of line-content
            range.selectNodeContents(lineContent);
            range.collapse(true);
        }
        
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }
        return;
    }
    
    if (targetNode) {
        const selection = window.getSelection();
        if (selection) {
            const range = document.createRange();
            range.setStart(targetNode, Math.min(targetOffset, targetNode.textContent?.length || 0));
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }
}

// Send edit to VS Code (debounced)
function sendEdit(markdown: string): void {
    if (editDebounceTimer) {
        clearTimeout(editDebounceTimer);
    }
    
    editDebounceTimer = setTimeout(() => {
        if (markdown === lastSentContent) {
            return;
        }
        
        lastSentContent = markdown;
        vscode.postMessage({
            type: 'edit',
            content: markdown
        });
    }, EDIT_DEBOUNCE_MS);
}

// Handle input in the editor
function handleInput(): void {
    if (isExternalUpdate || !editorContainer) {
        return;
    }
    
    // Save cursor position
    const cursorPos = saveCursorPosition(editorContainer);
    
    // Extract markdown
    const markdown = extractMarkdown(editorContainer);
    
    // Send to VS Code
    sendEdit(markdown);
    
    // Re-render with styling
    editorContainer.innerHTML = markdownToStyledHtml(markdown);
    
    // Restore cursor position
    if (cursorPos) {
        restoreCursorPosition(editorContainer, cursorPos);
    }
    
    // Update TOC
    updateTocFromMarkdown(markdown);
}

// Update TOC from markdown text
function updateTocFromMarkdown(markdown: string): void {
    const headings: Array<{ level: number; text: string }> = [];
    const lines = markdown.split('\n');
    
    for (const line of lines) {
        const match = line.match(/^(#{1,6})\s+(.*)$/);
        if (match) {
            headings.push({
                level: match[1].length,
                text: match[2]
            });
        }
    }
    
    const mockDoc = {
        descendants: (callback: (node: { type: { name: string }; attrs: { level: number }; textContent: string }) => boolean) => {
            for (const heading of headings) {
                callback({
                    type: { name: 'heading' },
                    attrs: { level: heading.level },
                    textContent: heading.text
                });
            }
        }
    };
    
    updateToc(mockDoc as any);
}

// ============================================
// Formatting Toolbar
// ============================================

let formattingToolbar: HTMLElement | null = null;
let lineTypeMenu: HTMLElement | null = null;
let currentLineIndex: number = -1;

function initToolbar(): void {
    formattingToolbar = document.getElementById('formatting-toolbar');
    lineTypeMenu = document.getElementById('line-type-menu');
    
    if (!formattingToolbar || !lineTypeMenu) {
        return;
    }
    
    // Generate line type menu from MENU_LINE_TYPES
    lineTypeMenu.innerHTML = MENU_LINE_TYPES.map(def => `
        <button type="button" data-type="${def.type}" class="line-type-option">
            <span class="line-type-icon">${def.icon}</span>
            <span class="line-type-label">${def.label}</span>
        </button>
    `).join('');
    
    // Handle formatting toolbar button clicks
    formattingToolbar.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent losing selection
    });
    
    formattingToolbar.addEventListener('click', (e) => {
        const button = (e.target as HTMLElement).closest('button');
        if (!button) {
            return;
        }
        
        const format = button.dataset.format;
        if (format) {
            applyInlineFormat(format);
            hideFormattingToolbar();
        }
    });
    
    // Handle line type menu button clicks
    lineTypeMenu.addEventListener('click', (e) => {
        const button = (e.target as HTMLElement).closest('button');
        if (!button) {
            return;
        }
        
        const type = button.dataset.type;
        if (type && currentLineIndex >= 0) {
            applyLineType(currentLineIndex, type);
            hideLineTypeMenu();
        }
    });
    
    // Hide menus when clicking outside
    document.addEventListener('mousedown', (e) => {
        const target = e.target as HTMLElement;
        
        if (formattingToolbar && !formattingToolbar.contains(target)) {
            hideFormattingToolbar();
        }
        
        if (lineTypeMenu && !lineTypeMenu.contains(target) && !target.closest('#editor > *::before')) {
            hideLineTypeMenu();
        }
    });
    
    // Show formatting toolbar on text selection
    document.addEventListener('selectionchange', () => {
        const selection = window.getSelection();
        if (!selection || !editorContainer) {
            hideFormattingToolbar();
            return;
        }
        
        // Check if selection/cursor is within editor
        if (selection.rangeCount === 0) {
            hideFormattingToolbar();
            return;
        }
        
        const range = selection.getRangeAt(0);
        if (!editorContainer.contains(range.commonAncestorContainer)) {
            hideFormattingToolbar();
            return;
        }
        
        // Check if selection is within .line-content (not line numbers or buttons)
        const startInLineContent = isNodeInLineContent(range.startContainer);
        const endInLineContent = isNodeInLineContent(range.endContainer);
        
        if (!startInLineContent && !endInLineContent) {
            hideFormattingToolbar();
            return;
        }
        
        // Show toolbar if there's a selection OR if cursor is inside formatted text
        if (!selection.isCollapsed) {
            showFormattingToolbar(selection);
        } else {
            // Check if cursor is inside formatted text
            const formattingInfo = getFormattingAtCursor(selection);
            if (formattingInfo.hasFormatting) {
                showFormattingToolbarAtCursor(selection, formattingInfo);
            } else {
                hideFormattingToolbar();
            }
        }
    });
}

// Check if a node is within a .line-content element
function isNodeInLineContent(node: Node): boolean {
    let current: Node | null = node;
    while (current && current !== editorContainer) {
        if (current instanceof HTMLElement && current.classList.contains('line-content')) {
            return true;
        }
        current = current.parentNode;
    }
    return false;
}

// Detect what formatting is applied at the current cursor position
function getFormattingAtCursor(selection: Selection): { hasFormatting: boolean; bold: boolean; italic: boolean; code: boolean; strikethrough: boolean; link: boolean } {
    const result = { hasFormatting: false, bold: false, italic: false, code: false, strikethrough: false, link: false };
    
    if (!selection.rangeCount) {
        return result;
    }
    
    let node: Node | null = selection.getRangeAt(0).startContainer;
    
    // Walk up the DOM tree to find formatting spans
    while (node && node !== editorContainer) {
        if (node instanceof HTMLElement) {
            if (node.classList.contains('md-bold') || node.classList.contains('md-bold-italic')) {
                result.bold = true;
                result.hasFormatting = true;
            }
            if (node.classList.contains('md-italic') || node.classList.contains('md-bold-italic')) {
                result.italic = true;
                result.hasFormatting = true;
            }
            if (node.classList.contains('md-code')) {
                result.code = true;
                result.hasFormatting = true;
            }
            if (node.classList.contains('md-strike')) {
                result.strikethrough = true;
                result.hasFormatting = true;
            }
            if (node.classList.contains('md-link')) {
                result.link = true;
                result.hasFormatting = true;
            }
        }
        node = node.parentNode;
    }
    
    return result;
}

// Update toolbar button active states
function updateToolbarButtonStates(formattingInfo: { bold: boolean; italic: boolean; code: boolean; strikethrough: boolean; link: boolean }): void {
    if (!formattingToolbar) {
        return;
    }
    
    const buttons = formattingToolbar.querySelectorAll('button');
    buttons.forEach((button) => {
        const format = button.dataset.format;
        let isActive = false;
        
        switch (format) {
            case 'bold':
                isActive = formattingInfo.bold;
                break;
            case 'italic':
                isActive = formattingInfo.italic;
                break;
            case 'code':
                isActive = formattingInfo.code;
                break;
            case 'strikethrough':
                isActive = formattingInfo.strikethrough;
                break;
            case 'link':
                isActive = formattingInfo.link;
                break;
        }
        
        button.classList.toggle('active', isActive);
    });
}

function showFormattingToolbar(selection: Selection): void {
    if (!formattingToolbar) {
        return;
    }
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Position toolbar above the selection
    const toolbarHeight = 36;
    const toolbarWidth = 160;
    
    let left = rect.left + (rect.width / 2) - (toolbarWidth / 2);
    let top = rect.top - toolbarHeight - 8;
    
    // Keep within viewport
    if (left < 8) {
        left = 8;
    }
    if (left + toolbarWidth > window.innerWidth - 8) {
        left = window.innerWidth - toolbarWidth - 8;
    }
    if (top < 8) {
        top = rect.bottom + 8; // Show below if not enough space above
    }
    
    formattingToolbar.style.left = `${left}px`;
    formattingToolbar.style.top = `${top}px`;
    formattingToolbar.style.display = 'flex';
    
    // Update button states based on selection
    const formattingInfo = getFormattingAtCursor(selection);
    updateToolbarButtonStates(formattingInfo);
}

function showFormattingToolbarAtCursor(selection: Selection, formattingInfo: { bold: boolean; italic: boolean; code: boolean; strikethrough: boolean; link: boolean }): void {
    if (!formattingToolbar) {
        return;
    }
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Position toolbar above the cursor
    const toolbarHeight = 36;
    const toolbarWidth = 160;
    
    let left = rect.left - (toolbarWidth / 2);
    let top = rect.top - toolbarHeight - 8;
    
    // Keep within viewport
    if (left < 8) {
        left = 8;
    }
    if (left + toolbarWidth > window.innerWidth - 8) {
        left = window.innerWidth - toolbarWidth - 8;
    }
    if (top < 8) {
        top = rect.bottom + 8;
    }
    
    formattingToolbar.style.left = `${left}px`;
    formattingToolbar.style.top = `${top}px`;
    formattingToolbar.style.display = 'flex';
    
    // Update button states
    updateToolbarButtonStates(formattingInfo);
}

function hideFormattingToolbar(): void {
    if (formattingToolbar) {
        formattingToolbar.style.display = 'none';
        // Clear active states
        const buttons = formattingToolbar.querySelectorAll('button');
        buttons.forEach((button) => button.classList.remove('active'));
    }
}

function showLineTypeMenu(lineElement: HTMLElement, lineIndex: number): void {
    if (!lineTypeMenu || !editorContainer) {
        return;
    }
    
    currentLineIndex = lineIndex;
    
    // Get line rect
    const rect = lineElement.getBoundingClientRect();
    
    // Position menu to the left of the line
    const menuWidth = 180;
    let left = rect.left - menuWidth - 8;
    let top = rect.top;
    
    // If not enough space on left, show on right
    if (left < 8) {
        left = rect.left + 50; // After line number
    }
    
    // Keep within viewport vertically
    const menuHeight = 320; // Approximate
    if (top + menuHeight > window.innerHeight - 8) {
        top = window.innerHeight - menuHeight - 8;
    }
    
    lineTypeMenu.style.left = `${left}px`;
    lineTypeMenu.style.top = `${top}px`;
    lineTypeMenu.style.display = 'block';
    
    // Mark current line type as active
    updateLineTypeMenuState(lineIndex);
}

function hideLineTypeMenu(): void {
    if (lineTypeMenu) {
        lineTypeMenu.style.display = 'none';
    }
    currentLineIndex = -1;
}

function updateLineTypeMenuState(lineIndex: number): void {
    if (!lineTypeMenu || !editorContainer) {
        return;
    }
    
    const markdown = extractMarkdown(editorContainer);
    const lines = markdown.split('\n');
    const line = lines[lineIndex] || '';
    
    // Detect current line type using shared definitions
    const lineTypeDef = getLineType(line);
    // Map 'alert' type to 'quote' for menu purposes (alerts are a special kind of quote)
    const currentType = lineTypeDef.type === 'alert' ? 'quote' : lineTypeDef.type;
    
    // Update active state
    const options = lineTypeMenu.querySelectorAll('.line-type-option');
    options.forEach((option) => {
        const type = (option as HTMLElement).dataset.type;
        option.classList.toggle('active', type === currentType);
    });
}

// Find the formatting span element at cursor position for a given format type
function findFormattingSpanAtCursor(format: string): HTMLElement | null {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
        return null;
    }
    
    let node: Node | null = selection.getRangeAt(0).startContainer;
    const classMap: Record<string, string[]> = {
        'bold': ['md-bold', 'md-bold-italic'],
        'italic': ['md-italic', 'md-bold-italic'],
        'code': ['md-code'],
        'strikethrough': ['md-strike'],
        'link': ['md-link']
    };
    
    const targetClasses = classMap[format] || [];
    
    while (node && node !== editorContainer) {
        if (node instanceof HTMLElement) {
            for (const cls of targetClasses) {
                if (node.classList.contains(cls)) {
                    return node;
                }
            }
        }
        node = node.parentNode;
    }
    
    return null;
}

function applyInlineFormat(format: string): void {
    const selection = window.getSelection();
    if (!selection || !editorContainer) {
        return;
    }
    
    // If no selection, check if cursor is inside formatted text and select it
    if (selection.isCollapsed) {
        const formattingSpan = findFormattingSpanAtCursor(format);
        if (formattingSpan) {
            // Select the entire formatted span
            const range = document.createRange();
            range.selectNodeContents(formattingSpan);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            // No selection and not inside formatted text - nothing to do
            return;
        }
    }
    
    const selectedText = selection.toString();
    if (!selectedText) {
        return;
    }
    
    // Get cursor position info
    const cursorPos = saveCursorPosition(editorContainer);
    if (!cursorPos) {
        return;
    }
    
    // Get the line and find selection position
    const markdown = extractMarkdown(editorContainer);
    const lines = markdown.split('\n');
    const line = lines[cursorPos.lineIndex];
    
    // Find selection start and end within the line
    const range = selection.getRangeAt(0);
    const preSelectionRange = range.cloneRange();
    const lineContent = editorContainer.children[cursorPos.lineIndex]?.querySelector('.line-content');
    if (!lineContent) {
        return;
    }
    preSelectionRange.selectNodeContents(lineContent);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const selectionStart = preSelectionRange.toString().length;
    const selectionEnd = selectionStart + selectedText.length;
    
    // Check if the selection is already formatted (for toggle)
    let prefix = '';
    let suffix = '';
    
    switch (format) {
        case 'bold':
            prefix = '**';
            suffix = '**';
            break;
        case 'italic':
            prefix = '*';
            suffix = '*';
            break;
        case 'code':
            prefix = '`';
            suffix = '`';
            break;
        case 'strikethrough':
            prefix = '~~';
            suffix = '~~';
            break;
        case 'link':
            // Links are special - check if already a link
            const linkMatch = selectedText.match(/^\[(.+)\]\(.+\)$/);
            if (linkMatch) {
                // Remove link formatting - extract just the text
                const newLine = line.slice(0, selectionStart) + linkMatch[1] + line.slice(selectionEnd);
                lines[cursorPos.lineIndex] = newLine;
                const newMarkdown = lines.join('\n');
                sendEdit(newMarkdown);
                isExternalUpdate = true;
                editorContainer.innerHTML = markdownToStyledHtml(newMarkdown);
                isExternalUpdate = false;
                restoreCursorPosition(editorContainer, {
                    lineIndex: cursorPos.lineIndex,
                    offset: selectionStart + linkMatch[1].length
                });
                updateTocFromMarkdown(newMarkdown);
                return;
            }
            // Add link formatting
            const wrappedLink = `[${selectedText}](url)`;
            const newLineLink = line.slice(0, selectionStart) + wrappedLink + line.slice(selectionEnd);
            lines[cursorPos.lineIndex] = newLineLink;
            const newMarkdownLink = lines.join('\n');
            sendEdit(newMarkdownLink);
            isExternalUpdate = true;
            editorContainer.innerHTML = markdownToStyledHtml(newMarkdownLink);
            isExternalUpdate = false;
            restoreCursorPosition(editorContainer, {
                lineIndex: cursorPos.lineIndex,
                offset: selectionStart + wrappedLink.length
            });
            updateTocFromMarkdown(newMarkdownLink);
            return;
        default:
            return;
    }
    
    // Check if text before and after selection has the formatting markers
    const beforeSelection = line.slice(0, selectionStart);
    const afterSelection = line.slice(selectionEnd);
    
    // Check if selection itself is wrapped with markers
    if (beforeSelection.endsWith(prefix) && afterSelection.startsWith(suffix)) {
        // Remove formatting
        // Remove formatting
        const newLine = line.slice(0, selectionStart - prefix.length) + selectedText + line.slice(selectionEnd + suffix.length);
        lines[cursorPos.lineIndex] = newLine;
        
        const newMarkdown = lines.join('\n');
        sendEdit(newMarkdown);
        isExternalUpdate = true;
        editorContainer.innerHTML = markdownToStyledHtml(newMarkdown);
        isExternalUpdate = false;
        
        restoreCursorPosition(editorContainer, {
            lineIndex: cursorPos.lineIndex,
            offset: selectionStart - prefix.length + selectedText.length
        });
        updateTocFromMarkdown(newMarkdown);
        return;
    }
    
    // Check if the selected text itself contains the markers (e.g., selecting "**bold**")
    if (selectedText.startsWith(prefix) && selectedText.endsWith(suffix) && selectedText.length > prefix.length + suffix.length) {
        // Remove formatting from selected text
        const innerText = selectedText.slice(prefix.length, -suffix.length);
        const newLine = line.slice(0, selectionStart) + innerText + line.slice(selectionEnd);
        lines[cursorPos.lineIndex] = newLine;
        
        const newMarkdown = lines.join('\n');
        sendEdit(newMarkdown);
        isExternalUpdate = true;
        editorContainer.innerHTML = markdownToStyledHtml(newMarkdown);
        isExternalUpdate = false;
        
        restoreCursorPosition(editorContainer, {
            lineIndex: cursorPos.lineIndex,
            offset: selectionStart + innerText.length
        });
        updateTocFromMarkdown(newMarkdown);
        return;
    }
    
    // Add formatting
    const wrappedText = prefix + selectedText + suffix;
    const newLine = line.slice(0, selectionStart) + wrappedText + line.slice(selectionEnd);
    lines[cursorPos.lineIndex] = newLine;
    
    const newMarkdown = lines.join('\n');
    sendEdit(newMarkdown);
    isExternalUpdate = true;
    editorContainer.innerHTML = markdownToStyledHtml(newMarkdown);
    isExternalUpdate = false;
    
    // Place cursor after the formatted text
    const newOffset = selectionStart + wrappedText.length;
    restoreCursorPosition(editorContainer, {
        lineIndex: cursorPos.lineIndex,
        offset: newOffset
    });
    
    updateTocFromMarkdown(newMarkdown);
}

function applyLineType(lineIndex: number, type: string): void {
    if (!editorContainer) {
        return;
    }
    
    const markdown = extractMarkdown(editorContainer);
    const lines = markdown.split('\n');
    let line = lines[lineIndex] || '';
    
    // Strip existing line prefix (order matters - check more specific patterns first)
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
    
    // Apply new prefix
    switch (type) {
        case 'paragraph':
            // Already stripped
            break;
        case 'h1':
            line = `# ${line}`;
            break;
        case 'h2':
            line = `## ${line}`;
            break;
        case 'h3':
            line = `### ${line}`;
            break;
        case 'h4':
            line = `#### ${line}`;
            break;
        case 'h5':
            line = `##### ${line}`;
            break;
        case 'h6':
            line = `###### ${line}`;
            break;
        case 'hr':
            line = `---`;
            break;
        case 'ul':
            line = `- ${line}`;
            break;
        case 'ol':
            line = `1. ${line}`;
            break;
        case 'task':
            line = `- [ ] ${line}`;
            break;
        case 'quote':
            line = `> ${line}`;
            break;
        case 'code':
            // Insert code block (3 lines)
            line = `\`\`\`\n${line}\n\`\`\``;
            break;
    }
    
    lines[lineIndex] = line;
    const newMarkdown = lines.join('\n');
    
    // Update editor
    sendEdit(newMarkdown);
    isExternalUpdate = true;
    editorContainer.innerHTML = markdownToStyledHtml(newMarkdown);
    isExternalUpdate = false;
    
    // Place cursor at beginning of line content (after any markdown prefix)
    // This ensures cursor stays on the same line after type change
    editorContainer.focus();
    restoreCursorPosition(editorContainer, {
        lineIndex: lineIndex,
        offset: 0
    });
    
    updateTocFromMarkdown(newMarkdown);
}

// Initialize editor with content
function initEditor(container: HTMLElement, markdown: string): void {
    editorContainer = container;
    lastSentContent = markdown;
    
    // Render initial content
    container.innerHTML = markdownToStyledHtml(markdown);
    
    // Set up event listeners
    container.addEventListener('input', handleInput);
    
    // Handle paste to strip formatting and properly insert multi-line content
    container.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = e.clipboardData?.getData('text/plain') || '';
        if (!text) {
            return;
        }
        
        // Get current cursor position
        const cursorPos = saveCursorPosition(container);
        if (!cursorPos) {
            // No cursor, just append at the end
            const currentMarkdown = extractMarkdown(container);
            const newMarkdown = currentMarkdown + text;
            sendEdit(newMarkdown);
            isExternalUpdate = true;
            container.innerHTML = markdownToStyledHtml(newMarkdown);
            isExternalUpdate = false;
            updateTocFromMarkdown(newMarkdown);
            return;
        }
        
        // Get current markdown and insert text at cursor position
        const currentMarkdown = extractMarkdown(container);
        const lines = currentMarkdown.split('\n');
        const currentLine = lines[cursorPos.lineIndex] || '';
        
        // Split the current line at cursor position and insert pasted text
        const beforeCursor = currentLine.slice(0, cursorPos.offset);
        const afterCursor = currentLine.slice(cursorPos.offset);
        
        // Handle multi-line paste
        const pastedLines = text.split('\n');
        if (pastedLines.length === 1) {
            // Single line paste - simple insertion
            lines[cursorPos.lineIndex] = beforeCursor + text + afterCursor;
        } else {
            // Multi-line paste
            const firstPastedLine = pastedLines[0];
            const lastPastedLine = pastedLines[pastedLines.length - 1];
            const middlePastedLines = pastedLines.slice(1, -1);
            
            // Build new lines array
            const newLines = [
                ...lines.slice(0, cursorPos.lineIndex),
                beforeCursor + firstPastedLine,
                ...middlePastedLines,
                lastPastedLine + afterCursor,
                ...lines.slice(cursorPos.lineIndex + 1)
            ];
            lines.length = 0;
            lines.push(...newLines);
        }
        
        const newMarkdown = lines.join('\n');
        
        // Calculate new cursor position (end of pasted content)
        const pastedLineCount = pastedLines.length;
        let newLineIndex: number;
        let newOffset: number;
        if (pastedLineCount === 1) {
            newLineIndex = cursorPos.lineIndex;
            newOffset = cursorPos.offset + text.length;
        } else {
            newLineIndex = cursorPos.lineIndex + pastedLineCount - 1;
            newOffset = pastedLines[pastedLines.length - 1].length;
        }
        
        // Update and re-render
        sendEdit(newMarkdown);
        isExternalUpdate = true;
        container.innerHTML = markdownToStyledHtml(newMarkdown);
        isExternalUpdate = false;
        
        // Restore cursor to end of pasted content
        restoreCursorPosition(container, {
            lineIndex: newLineIndex,
            offset: newOffset
        });
        
        // Update TOC
        updateTocFromMarkdown(newMarkdown);
    });
    
    // Handle copy to ensure plain markdown text is copied (only line content)
    container.addEventListener('copy', (e) => {
        e.preventDefault();
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            // Extract only text from .line-content elements
            const text = getSelectedMarkdownText(selection);
            e.clipboardData?.setData('text/plain', text);
        }
    });
    
    // Handle cut (copy + delete)
    container.addEventListener('cut', (e) => {
        e.preventDefault();
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            // Extract only text from .line-content elements
            const text = getSelectedMarkdownText(selection);
            e.clipboardData?.setData('text/plain', text);
            
            // Delete the selection by inserting empty text
            document.execCommand('insertText', false, '');
        }
    });
    
    // Handle keyboard shortcuts
    container.addEventListener('keydown', (e) => {
        // Cmd/Ctrl+A for select all - select only line content, not line numbers
        if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
            e.preventDefault();
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                
                // Select content from first line-content to last line-content
                const lineContents = container.querySelectorAll('.line-content');
                if (lineContents.length > 0) {
                    const range = document.createRange();
                    range.setStartBefore(lineContents[0]);
                    range.setEndAfter(lineContents[lineContents.length - 1]);
                    selection.addRange(range);
                }
            }
            return;
        }
        
        // Formatting shortcuts
        if (e.metaKey || e.ctrlKey) {
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed) {
                switch (e.key.toLowerCase()) {
                    case 'b':
                        e.preventDefault();
                        applyInlineFormat('bold');
                        hideFormattingToolbar();
                        return;
                    case 'i':
                        e.preventDefault();
                        applyInlineFormat('italic');
                        hideFormattingToolbar();
                        return;
                    case 'e':
                        e.preventDefault();
                        applyInlineFormat('code');
                        hideFormattingToolbar();
                        return;
                    case 'k':
                        e.preventDefault();
                        applyInlineFormat('link');
                        hideFormattingToolbar();
                        return;
                }
            }
        }
        
        // Cmd/Ctrl+Z for undo (let browser handle it)
        // Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y for redo (let browser handle it)
        
        // Tab handling for indentation
        if (e.key === 'Tab') {
            e.preventDefault();
            document.execCommand('insertText', false, '    ');
        }
        
        // Enter key - insert a proper newline
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            
            // Get current markdown, cursor position
            const cursorPos = saveCursorPosition(container);
            const markdown = extractMarkdown(container);
            
            if (cursorPos) {
                // Split the markdown at cursor position
                const lines = markdown.split('\n');
                const insertLineIndex = cursorPos.lineIndex;
                const insertCharIndex = cursorPos.offset;
                
                // Split the current line at cursor position
                const currentLine = lines[insertLineIndex] || '';
                const beforeCursor = currentLine.slice(0, insertCharIndex);
                const afterCursor = currentLine.slice(insertCharIndex);
                
                // Create new lines array with the split
                const newLines = [
                    ...lines.slice(0, insertLineIndex),
                    beforeCursor,
                    afterCursor,
                    ...lines.slice(insertLineIndex + 1)
                ];
                
                const newMarkdown = newLines.join('\n');
                
                // Update and re-render
                sendEdit(newMarkdown);
                isExternalUpdate = true;
                container.innerHTML = markdownToStyledHtml(newMarkdown);
                isExternalUpdate = false;
                
                // Place cursor at start of new line
                restoreCursorPosition(container, {
                    lineIndex: insertLineIndex + 1,
                    offset: 0
                });
                
                // Update TOC
                updateTocFromMarkdown(newMarkdown);
            }
        }
        
        // Backspace key - handle line merging
        if (e.key === 'Backspace') {
            const cursorPos = saveCursorPosition(container);
            const markdown = extractMarkdown(container);
            const lines = markdown.split('\n');
            
            // Check if at start of line (offset 0, or offset 1 with empty line due to zero-width space)
            const currentLineText = cursorPos ? lines[cursorPos.lineIndex] || '' : '';
            const isAtLineStart = cursorPos && (cursorPos.offset === 0 || (cursorPos.offset <= 1 && currentLineText === ''));
            
            if (cursorPos && isAtLineStart && cursorPos.lineIndex > 0) {
                // At the start of a line (not the first line) - merge with previous line
                e.preventDefault();
                
                const prevLineLength = lines[cursorPos.lineIndex - 1].length;
                
                // Merge current line with previous
                const newLines = [
                    ...lines.slice(0, cursorPos.lineIndex - 1),
                    lines[cursorPos.lineIndex - 1] + lines[cursorPos.lineIndex],
                    ...lines.slice(cursorPos.lineIndex + 1)
                ];
                
                const newMarkdown = newLines.join('\n');
                
                // Update and re-render
                sendEdit(newMarkdown);
                isExternalUpdate = true;
                container.innerHTML = markdownToStyledHtml(newMarkdown);
                isExternalUpdate = false;
                
                // Place cursor at the merge point
                restoreCursorPosition(container, {
                    lineIndex: cursorPos.lineIndex - 1,
                    offset: prevLineLength
                });
                
                // Update TOC
                updateTocFromMarkdown(newMarkdown);
            }
            // Otherwise, let browser handle normal backspace within a line
        }
        
        // Delete key - handle line merging
        if (e.key === 'Delete') {
            const cursorPos = saveCursorPosition(container);
            const markdown = extractMarkdown(container);
            const lines = markdown.split('\n');
            
            if (cursorPos && cursorPos.lineIndex < lines.length - 1) {
                const currentLine = lines[cursorPos.lineIndex];
                
                // At the end of a line (not the last line) - merge with next line
                if (cursorPos.offset >= currentLine.length) {
                    e.preventDefault();
                    
                    // Merge current line with next
                    const newLines = [
                        ...lines.slice(0, cursorPos.lineIndex),
                        lines[cursorPos.lineIndex] + lines[cursorPos.lineIndex + 1],
                        ...lines.slice(cursorPos.lineIndex + 2)
                    ];
                    
                    const newMarkdown = newLines.join('\n');
                    
                    // Update and re-render
                    sendEdit(newMarkdown);
                    isExternalUpdate = true;
                    container.innerHTML = markdownToStyledHtml(newMarkdown);
                    isExternalUpdate = false;
                    
                    // Keep cursor at same position
                    restoreCursorPosition(container, cursorPos);
                    
                    // Update TOC
                    updateTocFromMarkdown(newMarkdown);
                }
            }
            // Otherwise, let browser handle normal delete within a line
        }
    });
    
    // Handle Cmd/Ctrl+Click on links
    container.addEventListener('click', (e) => {
        // Check if Cmd (Mac) or Ctrl (Windows/Linux) is pressed
        if (e.metaKey || e.ctrlKey) {
            const target = e.target as HTMLElement;
            
            // Check if clicked on a link URL or within a link span
            const linkSpan = target.closest('.md-link');
            if (linkSpan) {
                e.preventDefault();
                const urlSpan = linkSpan.querySelector('.md-url');
                if (urlSpan) {
                    const url = urlSpan.textContent || '';
                    if (url) {
                        // Send message to extension to open the URL
                        vscode.postMessage({
                            type: 'openLink',
                            url: url
                        });
                    }
                }
            }
            
            // Check if clicked on an image URL
            const imageSpan = target.closest('.md-image');
            if (imageSpan) {
                e.preventDefault();
                const urlSpan = imageSpan.querySelector('.md-url');
                if (urlSpan) {
                    const url = urlSpan.textContent || '';
                    if (url) {
                        vscode.postMessage({
                            type: 'openLink',
                            url: url
                        });
                    }
                }
            }
        }
    });
    
    // Show pointer cursor when Cmd/Ctrl is held over links
    document.addEventListener('keydown', (e) => {
        if (e.metaKey || e.ctrlKey) {
            container.classList.add('cmd-held');
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (!e.metaKey && !e.ctrlKey) {
            container.classList.remove('cmd-held');
        }
    });
    
    // Update TOC and set up scroll spy
    updateTocFromMarkdown(markdown);
    setupScrollSpy();
    
    // Focus editor and restore/set cursor position
    container.focus();
    
    // Focus the editor first
    container.focus();
    
    // Restore state from previous session (cursor position, scroll)
    const storedState = getStoredState();
    if (storedState && storedState.cursorPosition) {
        restoreCursorPosition(container, storedState.cursorPosition);
        if (storedState.scrollTop) {
            container.scrollTop = storedState.scrollTop;
        }
    } else {
        // No stored state - place cursor at the beginning
        placeCursorAtStart(container);
    }
    
    // Save state on blur (when focus leaves the editor)
    container.addEventListener('blur', () => {
        saveState();
    });
    
    // Save state after edits
    container.addEventListener('input', () => {
        saveState();
    });
    
    // Handle window/document focus (Cmd+Tab back to VS Code)
    window.addEventListener('focus', () => {
        // Window regained focus - restore editor focus and cursor
        const state = getStoredState();
        container.focus();
        if (state && state.cursorPosition) {
            restoreCursorPosition(container, state.cursorPosition);
        }
        if (state && state.scrollTop) {
            container.scrollTop = state.scrollTop;
        }
    });
    
    // Initialize formatting toolbar and line-type menu
    initToolbar();
    
    // Handle click on line-type button to show menu
    container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const lineTypeBtn = target.closest('.line-type-btn') as HTMLElement;
        
        if (lineTypeBtn) {
            e.preventDefault();
            e.stopPropagation();
            
            const lineIndex = parseInt(lineTypeBtn.dataset.line || '-1', 10);
            const lineElement = lineTypeBtn.closest('#editor > *') as HTMLElement;
            
            if (lineIndex >= 0 && lineElement) {
                showLineTypeMenu(lineElement, lineIndex);
            }
        }
    });
}

// Update editor content from external source (e.g., undo/redo)
function updateEditorContent(markdown: string): void {
    if (!editorContainer) {
        return;
    }
    
    if (markdown === lastSentContent) {
        return;
    }
    
    // Save cursor position before update
    const cursorPos = saveCursorPosition(editorContainer);
    
    isExternalUpdate = true;
    try {
        lastSentContent = markdown;
        editorContainer.innerHTML = markdownToStyledHtml(markdown);
        updateTocFromMarkdown(markdown);
        
        // Restore cursor position after update
        if (cursorPos) {
            restoreCursorPosition(editorContainer, cursorPos);
        }
    } finally {
        isExternalUpdate = false;
    }
}

// Initialize
function init(): void {
    const container = document.getElementById('editor');
    if (!container) {
        console.error('Editor container not found');
        return;
    }
    
    // Make container editable
    container.setAttribute('contenteditable', 'true');
    container.setAttribute('spellcheck', 'false');

    // Handle messages from extension
    window.addEventListener('message', (event: MessageEvent) => {
        const message = event.data;

        switch (message.type) {
            case 'init': {
                const content = message.originalContent || message.content || '';
                initEditor(container, content);
                break;
            }
            case 'update': {
                const updateContent = message.originalContent || message.content || '';
                updateEditorContent(updateContent);
                break;
            }
            case 'focus': {
                // Tab became active - focus editor and restore cursor position
                if (editorContainer) {
                    const state = getStoredState();
                    editorContainer.focus();
                    if (state && state.cursorPosition) {
                        restoreCursorPosition(editorContainer, state.cursorPosition);
                    }
                    if (state && state.scrollTop) {
                        editorContainer.scrollTop = state.scrollTop;
                    }
                }
                break;
            }
        }
    });

    // Tell extension we're ready
    vscode.postMessage({ type: 'ready' });
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
