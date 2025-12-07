import { updateToc, setupScrollSpy } from './toc';

// Acquire VS Code API
declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// Track if we're currently applying an external update to avoid loops
let isExternalUpdate = false;

// Track the last content we sent to avoid redundant messages
let lastSentContent = '';

// Debounce timer for sending edits
let editDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const EDIT_DEBOUNCE_MS = 300;

// Editor container reference
let editorContainer: HTMLElement | null = null;

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
        
        // Code fence
        if (info.isCodeFence) {
            if (!inCodeBlock) {
                inCodeBlock = true;
                const lang = info.line.slice(3).trim();
                htmlLines.push(`<div class="line code-fence code-start"><span class="line-content"><span class="code-inner">\`\`\`${escapeHtml(lang)}</span></span></div>`);
            } else {
                inCodeBlock = false;
                htmlLines.push(`<div class="line code-fence code-end"><span class="line-content"><span class="code-inner">\`\`\`</span></span></div>`);
            }
            continue;
        }
        
        // Code content
        if (info.isCodeContent) {
            const content = escapeHtml(info.line);
            const isEmpty = !content;
            htmlLines.push(`<div class="line code-content${isEmpty ? ' empty-line' : ''}"><span class="line-content"><span class="code-inner">${content || '\u200B'}</span></span></div>`);
            continue;
        }
        
        // GitHub alert header
        if (info.isAlertHeader) {
            const alertMatch = info.line.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
            const alertType = alertMatch![1].toUpperCase();
            const isLast = !nextInfo?.isAlertContent;
            let classes = `line md-alert md-alert-${info.alertType} alert-first`;
            if (isLast) classes += ' alert-last alert-single';
            htmlLines.push(`<div class="${classes}"><span class="line-content"><span class="alert-inner"><span class="md-syntax">&gt; [!</span><span class="md-alert-type">${alertType}</span><span class="md-syntax">]</span></span></span></div>`);
            continue;
        }
        
        // GitHub alert content
        if (info.isAlertContent) {
            const content = info.line.replace(/^>\s?/, '');
            const styledContent = styleInline(content);
            const isLast = !nextInfo?.isAlertContent;
            let classes = `line md-alert-content md-alert-${info.alertType}`;
            if (isLast) classes += ' alert-last';
            htmlLines.push(`<div class="${classes}"><span class="line-content"><span class="alert-inner"><span class="md-syntax">&gt;</span> ${styledContent}</span></span></div>`);
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
            htmlLines.push(`<div class="${classes}"><span class="line-content">${styledLine}</span></div>`);
            continue;
        }
        
        // Regular line
        const styledLine = styleLine(info.line);
        const isEmpty = !styledLine;
        htmlLines.push(`<div class="line${isEmpty ? ' empty-line' : ''}"><span class="line-content">${styledLine || '\u200B'}</span></div>`);
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

// Extract plain markdown text from the editor
function extractMarkdown(container: HTMLElement): string {
    const lines: string[] = [];
    
    // Get all direct children - they should be .line divs, but browser might add others on edit
    const children = container.children;
    
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        let text = child.textContent || '';
        // Remove zero-width spaces (used by CSS for empty line cursor placement)
        text = text.replace(/\u200B/g, '');
        lines.push(text);
    }
    
    return lines.join('\n');
}

// Save and restore cursor position
interface CursorPosition {
    lineIndex: number;
    offset: number;
}

function saveCursorPosition(container: HTMLElement): CursorPosition | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return null;
    }
    
    const range = selection.getRangeAt(0);
    let node = range.startContainer;
    let offset = range.startOffset;
    
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
        if (treeWalker.currentNode === node) {
            foundNode = node;
            break;
        }
        charCount += (treeWalker.currentNode.textContent || '').length;
    }
    
    if (foundNode) {
        charCount += offset;
    }
    
    return { lineIndex, offset: charCount };
}

function restoreCursorPosition(container: HTMLElement, pos: CursorPosition): void {
    const children = container.children;
    if (pos.lineIndex >= children.length) {
        return;
    }
    
    const lineEl = children[pos.lineIndex];
    const treeWalker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
    
    let charCount = 0;
    let targetNode: Node | null = null;
    let targetOffset = 0;
    
    while (treeWalker.nextNode()) {
        const nodeLength = (treeWalker.currentNode.textContent || '').length;
        if (charCount + nodeLength >= pos.offset) {
            targetNode = treeWalker.currentNode;
            targetOffset = pos.offset - charCount;
            break;
        }
        charCount += nodeLength;
    }
    
    // If no text node found, try to place cursor in the line-content or the element itself
    if (!targetNode) {
        const lineContent = lineEl.querySelector('.line-content');
        if (lineContent && lineContent.firstChild) {
            targetNode = lineContent.firstChild;
            targetOffset = 0;
        }
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

// Initialize editor with content
function initEditor(container: HTMLElement, markdown: string): void {
    editorContainer = container;
    lastSentContent = markdown;
    
    // Render initial content
    container.innerHTML = markdownToStyledHtml(markdown);
    
    // Set up event listeners
    container.addEventListener('input', handleInput);
    
    // Handle paste to strip formatting
    container.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = e.clipboardData?.getData('text/plain') || '';
        document.execCommand('insertText', false, text);
    });
    
    // Handle keyboard shortcuts
    container.addEventListener('keydown', (e) => {
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
