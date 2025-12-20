import { updateToc, setupScrollSpy } from './toc';
import {
    markdownToStyledHtml,
    getLineType,
    MENU_LINE_TYPES} from './markdown/parser';
import { extractMarkdown, getSelectedMarkdownText } from './markdown/serializer';
import {
    saveState as saveEditorState,
    getStoredState} from './editor/state';
import {
    placeCursorAtStart,
    saveCursorPosition,
    getSelectionMarkdownPosition,
    restoreCursorPosition} from './editor/cursor';
import {
    initDiffView} from './editor/diff';

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

// Track diff mode state
let isDiffModeActive = false;
let storedOriginalContent: string | null = null;
let storedCurrentContent: string | null = null;

// Wrapper functions for state management (to avoid passing vscode everywhere)
function saveState(): void {
    if (!editorContainer) {
        return;
    }
    const cursorPosition = saveCursorPosition(editorContainer);
    const scrollTop = editorContainer.scrollTop;
    saveEditorState(vscode, cursorPosition, scrollTop);
}

// Delete selected text from the editor
function deleteSelection(selection: Selection): boolean {
    if (!editorContainer) {
        return false;
    }

    // Check if there's actually a selection
    if (!selection || selection.isCollapsed) {
        return false;
    }

    // Get selection position in markdown coordinates
    const selPos = getSelectionMarkdownPosition(editorContainer, selection);
    if (!selPos) {
        return false;
    }

    // Extract current markdown
    const markdown = extractMarkdown(editorContainer);
    const lines = markdown.split('\n');

    // Calculate new markdown and cursor position after deletion
    let newMarkdown: string;
    let cursorLineIndex: number;
    let cursorOffset: number;

    if (selPos.startLineIndex === selPos.endLineIndex) {
        // SINGLE LINE DELETION
        const line = lines[selPos.startLineIndex];
        const beforeSelection = line.slice(0, selPos.startOffset);
        const afterSelection = line.slice(selPos.endOffset);
        lines[selPos.startLineIndex] = beforeSelection + afterSelection;

        cursorLineIndex = selPos.startLineIndex;
        cursorOffset = selPos.startOffset;
    } else {
        // MULTI-LINE DELETION
        const beforeSelection = lines[selPos.startLineIndex].slice(0, selPos.startOffset);
        const afterSelection = lines[selPos.endLineIndex].slice(selPos.endOffset);
        const mergedLine = beforeSelection + afterSelection;

        // Build new lines array:
        // - Lines before selection start
        // - Merged line
        // - Lines after selection end
        const newLines = [
            ...lines.slice(0, selPos.startLineIndex),
            mergedLine,
            ...lines.slice(selPos.endLineIndex + 1)
        ];

        lines.length = 0;
        lines.push(...newLines);

        cursorLineIndex = selPos.startLineIndex;
        cursorOffset = selPos.startOffset;
    }

    // Join back into markdown
    newMarkdown = lines.join('\n');

    // Send edit to VS Code
    sendEdit(newMarkdown);

    // Re-render editor
    isExternalUpdate = true;
    editorContainer.innerHTML = markdownToStyledHtml(newMarkdown);
    isExternalUpdate = false;

    // Restore cursor to deletion point
    restoreCursorPosition(editorContainer, {
        lineIndex: cursorLineIndex,
        offset: cursorOffset
    });

    // Update TOC
    updateTocFromMarkdown(newMarkdown);

    return true;
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
let lineTypeToolbar: HTMLElement | null = null;
let currentLineIndex: number = -1;

function initToolbar(): void {
    formattingToolbar = document.getElementById('formatting-toolbar');
    lineTypeToolbar = document.getElementById('line-type-toolbar');

    if (!formattingToolbar) {
        return;
    }

    // Generate line type toolbar buttons from MENU_LINE_TYPES
    if (lineTypeToolbar) {
        lineTypeToolbar.innerHTML = MENU_LINE_TYPES.map(def => `
            <button type="button" data-type="${def.type}" class="toolbar-btn line-type-btn" title="${def.label}">
                <span class="toolbar-btn-icon">${def.icon}</span>
            </button>
        `).join('');
    }
    
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
    
    // Handle line type toolbar button clicks
    if (lineTypeToolbar) {
        lineTypeToolbar.addEventListener('click', (e) => {
            const button = (e.target as HTMLElement).closest('button');
            if (!button) {
                return;
            }

            const type = button.dataset.type;
            if (type && currentLineIndex >= 0 && editorContainer) {
                applyLineType(currentLineIndex, type);
                // Update button states after applying
                updateLineTypeToolbarState();
            }
        });
    }

    // Hide formatting toolbar when clicking outside
    document.addEventListener('mousedown', (e) => {
        const target = e.target as HTMLElement;

        if (formattingToolbar && !formattingToolbar.contains(target)) {
            hideFormattingToolbar();
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
    
    let left = rect.left;
    let top = rect.top - toolbarHeight - 8;
    
    // Keep within viewport
    if (left < 250) {
        left = 250;
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

function updateLineTypeToolbarState(): void {
    if (!lineTypeToolbar || !editorContainer || currentLineIndex < 0) {
        return;
    }

    const markdown = extractMarkdown(editorContainer);
    const lines = markdown.split('\n');
    const line = lines[currentLineIndex] || '';

    // Detect current line type using shared definitions
    const lineTypeDef = getLineType(line);
    // Map 'alert' type to 'quote' for toolbar purposes (alerts are a special kind of quote)
    const currentType = lineTypeDef.type === 'alert' ? 'quote' : lineTypeDef.type;

    // Update active state on toolbar buttons
    const buttons = lineTypeToolbar.querySelectorAll('.line-type-btn');
    buttons.forEach((button) => {
        const type = (button as HTMLElement).dataset.type;
        button.classList.toggle('active', type === currentType);
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

    // Show toolbar and TOC (in case we're switching from diff mode)
    const toolbar = document.getElementById('toolbar');
    if (toolbar) {
        toolbar.style.display = 'flex';
    }
    const toc = document.getElementById('toc');
    if (toc) {
        toc.style.display = 'block';
    }

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
            const text = getSelectedMarkdownText(selection, editorContainer);
            e.clipboardData?.setData('text/plain', text);
        }
    });

    // Handle cut (copy + delete)
    container.addEventListener('cut', (e) => {
        e.preventDefault();
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            // Extract only text from .line-content elements
            const text = getSelectedMarkdownText(selection, editorContainer);
            e.clipboardData?.setData('text/plain', text);

            // Delete the selection using our new function (instead of execCommand)
            deleteSelection(selection);
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
        
        // Backspace key - handle selection deletion and line merging
        if (e.key === 'Backspace') {
            const selection = window.getSelection();

            // Handle selection deletion FIRST
            if (selection && !selection.isCollapsed) {
                e.preventDefault();
                deleteSelection(selection);
                return;
            }

            // EXISTING: Line-merge logic when cursor at line start
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
        
        // Delete key - handle selection deletion and line merging
        if (e.key === 'Delete') {
            const selection = window.getSelection();

            // Handle selection deletion FIRST
            if (selection && !selection.isCollapsed) {
                e.preventDefault();
                deleteSelection(selection);
                return;
            }

            // EXISTING: Line-merge logic when cursor at line end
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
    const storedState = getStoredState(vscode);
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
        const state = getStoredState(vscode);
        container.focus();
        if (state && state.cursorPosition) {
            restoreCursorPosition(container, state.cursorPosition);
        }
        if (state && state.scrollTop) {
            container.scrollTop = state.scrollTop;
        }
    });
    
    // Initialize formatting toolbar and line type toolbar
    initToolbar();

    // Track cursor position changes to update line type toolbar
    container.addEventListener('click', (e) => {
        updateCurrentLineIndex();
    });

    container.addEventListener('keyup', (e) => {
        updateCurrentLineIndex();
    });
}

// Update the current line index based on cursor position
function updateCurrentLineIndex(): void {
    if (!editorContainer) {
        return;
    }

    const cursorPos = saveCursorPosition(editorContainer);
    if (cursorPos) {
        currentLineIndex = cursorPos.lineIndex;
        updateLineTypeToolbarState();
    }
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

    // Set up diff toggle button
    const diffToggleBtn = document.getElementById('diff-toggle-btn');
    if (diffToggleBtn) {
        diffToggleBtn.addEventListener('click', () => {
            // Send message to extension to toggle diff mode
            vscode.postMessage({ type: 'requestDiffToggle' });
        });
    }

    // Set up diff close button
    const diffCloseBtn = document.getElementById('diff-close-btn');
    if (diffCloseBtn) {
        diffCloseBtn.addEventListener('click', () => {
            // Send message to extension to toggle diff mode (same as toggle button)
            vscode.postMessage({ type: 'requestDiffToggle' });
        });
    }

    // Handle messages from extension
    window.addEventListener('message', (event: MessageEvent) => {
        const message = event.data;

        switch (message.type) {
            case 'init': {
                const content = message.originalContent || message.content || '';

                console.log('Received init message. diffAvailable:', message.diffAvailable, 'diffMode:', message.diffMode);

                // Show/hide diff button based on availability
                const diffToggleBtn = document.getElementById('diff-toggle-btn');
                if (diffToggleBtn) {
                    if (message.diffAvailable) {
                        console.log('Showing diff button');
                        diffToggleBtn.style.display = 'flex';
                    } else {
                        console.log('Hiding diff button - no changes or not in git');
                        diffToggleBtn.style.display = 'none';
                    }
                } else {
                    console.error('Diff toggle button not found in DOM');
                }

                if (message.diffMode && message.originalVersionContent) {
                    // Initialize in diff mode
                    initDiffView(container, message.originalVersionContent, content, markdownToStyledHtml);
                } else {
                    // Normal editor mode
                    initEditor(container, content);
                }
                break;
            }
            case 'update': {
                const updateContent = message.originalContent || message.content || '';
                updateEditorContent(updateContent);

                // Update diff button visibility based on diffAvailable flag
                const diffToggleBtn = document.getElementById('diff-toggle-btn');
                if (diffToggleBtn) {
                    if (message.diffAvailable) {
                        console.log('Showing diff button after update');
                        diffToggleBtn.style.display = 'flex';
                    } else {
                        console.log('Hiding diff button after update - no changes');
                        diffToggleBtn.style.display = 'none';
                    }
                }
                break;
            }
            case 'focus': {
                // Tab became active - focus editor and restore cursor position
                if (editorContainer) {
                    const state = getStoredState(vscode);
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
            case 'toggleDiff': {
                // Toggle between diff mode and normal editor mode
                const container = document.getElementById('editor');
                if (!container) {
                    break;
                }

                const diffToggleBtn = document.getElementById('diff-toggle-btn');
                const diffCloseBtn = document.getElementById('diff-close-btn');

                if (isDiffModeActive) {
                    // Switch back to normal editor mode
                    isDiffModeActive = false;
                    // Restore the content we stored before entering diff mode
                    const currentMarkdown = storedCurrentContent || extractMarkdown(container);
                    container.setAttribute('contenteditable', 'true');
                    container.setAttribute('spellcheck', 'false');
                    initEditor(container, currentMarkdown);

                    // Clear stored content
                    storedCurrentContent = null;
                    storedOriginalContent = null;

                    // Update button states
                    if (diffToggleBtn) {
                        diffToggleBtn.classList.remove('active');
                        diffToggleBtn.style.display = 'flex';
                    }
                    if (diffCloseBtn) {
                        diffCloseBtn.style.display = 'none';
                    }
                } else {
                    // Switch to diff mode
                    const originalVersionContent = message.originalVersionContent || '';
                    if (!originalVersionContent) {
                        break;
                    }
                    isDiffModeActive = true;
                    // Store current content before entering diff mode
                    const currentMarkdown = extractMarkdown(container);
                    storedCurrentContent = currentMarkdown;
                    storedOriginalContent = originalVersionContent;
                    initDiffView(container, originalVersionContent, currentMarkdown, markdownToStyledHtml);

                    // Update button states
                    if (diffToggleBtn) {
                        diffToggleBtn.classList.add('active');
                        diffToggleBtn.style.display = 'none';
                    }
                    if (diffCloseBtn) {
                        diffCloseBtn.style.display = 'flex';
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
