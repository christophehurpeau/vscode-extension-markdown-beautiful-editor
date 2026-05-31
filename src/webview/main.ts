import { updateToc, setupScrollSpy, extractHeadingsFromMarkdown, findHeadingIndexBySlug, scrollToHeading } from './toc';
import {
    markdownToStyledHtml,
    getLineType,
    MENU_LINE_TYPES} from './markdown/parser';
import { extractMarkdown, getSelectedMarkdownText } from './markdown/serializer';
import { parseLinkTarget, resolveReferenceUrl, linkDisplayUrl } from '../shared/links';
import {
    saveState as saveEditorState,
    getStoredState,
    type CursorPosition} from './editor/state';
import {
    placeCursorAtStart,
    saveCursorPosition,
    getSelectionMarkdownPosition,
    restoreCursorPosition} from './editor/cursor';
import {
    initDiffView} from './editor/diff';
import { deleteRange, stripLinePrefix, applyLinePrefix } from './editor/operations';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../shared/messages';

// Acquire VS Code API
declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// Post a typed message to the extension host.
function postToHost(message: WebviewToHostMessage): void {
    vscode.postMessage(message);
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

// Send an edit, re-render the editor, restore the cursor and refresh the TOC.
// This is the single edit→render cycle shared by every editing operation.
function rerender(markdown: string, cursor: CursorPosition, preventScroll = false): void {
    if (!editorContainer) {
        return;
    }
    sendEdit(markdown);
    isExternalUpdate = true;
    try {
        editorContainer.innerHTML = markdownToStyledHtml(markdown);
    } finally {
        // Always clear the guard, even if rendering throws, so input handling
        // doesn't get permanently stuck.
        isExternalUpdate = false;
    }
    restoreCursorPosition(editorContainer, cursor, preventScroll);
    updateTocFromMarkdown(markdown);
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

    const lines = extractMarkdown(editorContainer).split('\n');
    const { lines: newLines, cursor } = deleteRange(lines, selPos);
    rerender(newLines.join('\n'), cursor);

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
        postToHost({ type: 'edit', content: markdown });
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
    updateToc(extractHeadingsFromMarkdown(markdown));
}

// Scroll the editor to the heading matching a slug (`#fragment` without the `#`).
function scrollToAnchorInEditor(container: HTMLElement, slug: string): void {
    const headings = extractHeadingsFromMarkdown(extractMarkdown(container));
    const index = findHeadingIndexBySlug(headings, slug);
    if (index === null) {
        return;
    }
    // Defer to the next animation frame(s). When this editor was already open
    // in a background tab, the host reveals it and posts the scroll request in
    // the same tick; scrolling immediately would run before the panel is laid
    // out and visible, so `scrollIntoView` would no-op. rAF callbacks are paused
    // while the webview is hidden and resume once it becomes visible, so this
    // also naturally waits for the reveal to take effect.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToHeading(index));
    });
}

/**
 * Resolve a reference-style link label to its destination URL by finding the
 * matching link reference definition (`[label]: url`) in the document. Labels
 * are matched case-insensitively, per the CommonMark spec.
 */
function resolveLinkReference(container: HTMLElement, ref: string): string {
    const definitions = Array.from(container.querySelectorAll('.md-link-def')).map(def => ({
        label: def.getAttribute('data-ref') || '',
        url: def.querySelector('.md-url')?.textContent || '',
    }));
    return resolveReferenceUrl(ref, definitions);
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
        const isActive = type === currentType;
        button.classList.toggle('active', isActive);
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
                rerender(lines.join('\n'), {
                    lineIndex: cursorPos.lineIndex,
                    offset: selectionStart + linkMatch[1].length
                });
                return;
            }
            // Add link formatting
            const wrappedLink = `[${selectedText}](url)`;
            const newLineLink = line.slice(0, selectionStart) + wrappedLink + line.slice(selectionEnd);
            lines[cursorPos.lineIndex] = newLineLink;
            rerender(lines.join('\n'), {
                lineIndex: cursorPos.lineIndex,
                offset: selectionStart + wrappedLink.length
            });
            return;
        default:
            return;
    }

    // Check if text before and after selection has the formatting markers
    const beforeSelection = line.slice(0, selectionStart);
    const afterSelection = line.slice(selectionEnd);

    // Check if selection itself is wrapped with markers
    if (beforeSelection.endsWith(prefix) && afterSelection.startsWith(suffix)) {
        // Remove formatting (markers sit just outside the selection)
        const newLine = line.slice(0, selectionStart - prefix.length) + selectedText + line.slice(selectionEnd + suffix.length);
        lines[cursorPos.lineIndex] = newLine;
        rerender(lines.join('\n'), {
            lineIndex: cursorPos.lineIndex,
            offset: selectionStart - prefix.length + selectedText.length
        });
        return;
    }

    // Check if the selected text itself contains the markers (e.g., selecting "**bold**")
    if (selectedText.startsWith(prefix) && selectedText.endsWith(suffix) && selectedText.length > prefix.length + suffix.length) {
        // Remove formatting from selected text
        const innerText = selectedText.slice(prefix.length, -suffix.length);
        const newLine = line.slice(0, selectionStart) + innerText + line.slice(selectionEnd);
        lines[cursorPos.lineIndex] = newLine;
        rerender(lines.join('\n'), {
            lineIndex: cursorPos.lineIndex,
            offset: selectionStart + innerText.length
        });
        return;
    }

    // Add formatting
    const wrappedText = prefix + selectedText + suffix;
    const newLine = line.slice(0, selectionStart) + wrappedText + line.slice(selectionEnd);
    lines[cursorPos.lineIndex] = newLine;
    rerender(lines.join('\n'), {
        lineIndex: cursorPos.lineIndex,
        offset: selectionStart + wrappedText.length
    });
}

function applyLineType(lineIndex: number, type: string): void {
    if (!editorContainer) {
        return;
    }

    // Save scroll position before making changes
    const scrollTop = editorContainer.scrollTop;

    const markdown = extractMarkdown(editorContainer);
    const lines = markdown.split('\n');

    // Strip the current line-type prefix, then apply the requested one.
    lines[lineIndex] = applyLinePrefix(stripLinePrefix(lines[lineIndex] || ''), type);
    const newMarkdown = lines.join('\n');

    // Update editor
    sendEdit(newMarkdown);
    isExternalUpdate = true;
    editorContainer.innerHTML = markdownToStyledHtml(newMarkdown);
    isExternalUpdate = false;

    // Restore scroll position FIRST (before cursor restoration)
    editorContainer.scrollTop = scrollTop;

    // Place cursor at beginning of line content (after any markdown prefix)
    // This ensures cursor stays on the same line after type change
    // Focus without scrolling by using preventScroll option
    editorContainer.focus({ preventScroll: true });
    restoreCursorPosition(editorContainer, {
        lineIndex: lineIndex,
        offset: 0
    }, true); // preventScroll = true

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
        
        // Update, re-render and place cursor at end of pasted content
        rerender(newMarkdown, { lineIndex: newLineIndex, offset: newOffset });
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
                
                // Update, re-render and place cursor at start of new line
                rerender(newLines.join('\n'), { lineIndex: insertLineIndex + 1, offset: 0 });
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
                
                // Update, re-render and place cursor at the merge point
                rerender(newLines.join('\n'), { lineIndex: cursorPos.lineIndex - 1, offset: prevLineLength });
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
                    
                    // Update, re-render and keep cursor at same position
                    rerender(newLines.join('\n'), cursorPos);
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
                // Inline links carry the URL directly; reference-style links
                // ([text][label]) resolve their label against a definition.
                const urlSpan = linkSpan.querySelector('.md-url');
                let url = urlSpan ? (urlSpan.textContent || '') : '';
                if (!url) {
                    const ref = linkSpan.getAttribute('data-ref');
                    if (ref) {
                        url = resolveLinkReference(container, ref);
                    }
                }
                if (url) {
                    const { path: pathPart, fragment } = parseLinkTarget(url);
                    if (pathPart === '' && fragment) {
                        // Pure `#fragment`: scroll within the current document.
                        scrollToAnchorInEditor(container, fragment);
                    } else {
                        // Has a path: let the extension host open the file
                        // (and forward the fragment for cross-file scroll).
                        postToHost({ type: 'openLink', url });
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
                        postToHost({ type: 'openLink', url });
                    }
                }
            }
        }
    });
    
    // Reveal a link's URL as a native tooltip on hover. Inline links and images
    // carry the URL in their `.md-url` span; reference-style links resolve their
    // label against the document's definitions. Resolved lazily (rather than at
    // render time) so it reflects the current state of the document.
    container.addEventListener('mouseover', (e) => {
        const linkSpan = (e.target as HTMLElement).closest('.md-link, .md-image');
        if (!linkSpan) {
            return;
        }
        const urlSpan = linkSpan.querySelector('.md-url');
        let url = urlSpan ? (urlSpan.textContent || '') : '';
        if (!url) {
            const ref = linkSpan.getAttribute('data-ref');
            url = ref ? resolveLinkReference(container, ref) : '';
        }
        const displayUrl = url ? linkDisplayUrl(url) : '';
        if (displayUrl) {
            linkSpan.setAttribute('title', displayUrl);
        } else {
            linkSpan.removeAttribute('title');
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

    // Initialize formatting toolbar and line type toolbar FIRST
    initToolbar();

    // Focus editor and restore/set cursor position
    container.focus();

    // Restore state from previous session (cursor position, scroll)
    const storedState = getStoredState(vscode);
    if (storedState && storedState.cursorPosition) {
        restoreCursorPosition(container, storedState.cursorPosition);
        if (storedState.scrollTop) {
            container.scrollTop = storedState.scrollTop;
        }
        // Update toolbar state based on restored cursor position
        currentLineIndex = storedState.cursorPosition.lineIndex;
        updateLineTypeToolbarState();
    } else {
        // No stored state - place cursor at the beginning
        placeCursorAtStart(container);
        // Update toolbar state for first line
        currentLineIndex = 0;
        updateLineTypeToolbarState();
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
            postToHost({ type: 'requestDiffToggle' });
        });
    }

    // Set up diff close button
    const diffCloseBtn = document.getElementById('diff-close-btn');
    if (diffCloseBtn) {
        diffCloseBtn.addEventListener('click', () => {
            // Send message to extension to toggle diff mode (same as toggle button)
            postToHost({ type: 'requestDiffToggle' });
        });
    }

    // Handle messages from extension
    window.addEventListener('message', (event: MessageEvent) => {
        const message = event.data as HostToWebviewMessage;

        switch (message.type) {
            case 'init': {
                const content = message.originalContent || message.content || '';

                console.log('Received init message. diffAvailable:', message.diffAvailable, 'diffMode:', message.diffMode);

                if (message.diffMode && message.originalVersionContent) {
                    // Initialize in diff mode
                    isDiffModeActive = true;
                    initDiffView(container, message.originalVersionContent, content, markdownToStyledHtml);

                    // Show close button, hide diff button and line type toolbar in diff mode
                    const diffToggleBtn = document.getElementById('diff-toggle-btn');
                    const diffCloseBtn = document.getElementById('diff-close-btn');
                    const lineTypeToolbar = document.getElementById('line-type-toolbar');
                    if (diffToggleBtn) {
                        diffToggleBtn.style.display = 'none';
                        diffToggleBtn.classList.add('active');
                    }
                    if (diffCloseBtn) {
                        diffCloseBtn.style.display = 'flex';
                    }
                    if (lineTypeToolbar) {
                        lineTypeToolbar.style.display = 'none';
                    }
                } else {
                    // Normal editor mode
                    isDiffModeActive = false;
                    initEditor(container, content);

                    // Show/hide diff button based on availability, show line type toolbar
                    const diffToggleBtn = document.getElementById('diff-toggle-btn');
                    const diffCloseBtn = document.getElementById('diff-close-btn');
                    const lineTypeToolbar = document.getElementById('line-type-toolbar');
                    if (diffToggleBtn) {
                        if (message.diffAvailable) {
                            console.log('Showing diff button');
                            diffToggleBtn.style.display = 'flex';
                        } else {
                            console.log('Hiding diff button - no changes or not in git');
                            diffToggleBtn.style.display = 'none';
                        }
                        diffToggleBtn.classList.remove('active');
                    } else {
                        console.error('Diff toggle button not found in DOM');
                    }
                    if (diffCloseBtn) {
                        diffCloseBtn.style.display = 'none';
                    }
                    if (lineTypeToolbar) {
                        lineTypeToolbar.style.display = 'flex';
                    }
                }
                break;
            }
            case 'update': {
                const updateContent = message.originalContent || message.content || '';

                // If in diff mode, update stored content and re-render diff
                if (isDiffModeActive && storedOriginalContent) {
                    storedCurrentContent = updateContent;
                    const container = document.getElementById('editor');
                    if (container) {
                        initDiffView(container, storedOriginalContent, updateContent, markdownToStyledHtml);
                    }
                } else {
                    // Normal editor mode - update content
                    updateEditorContent(updateContent);
                }

                // Update diff button visibility based on diffAvailable flag (only in normal mode)
                if (!isDiffModeActive) {
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

                    // Update button states and show line type toolbar
                    const lineTypeToolbar = document.getElementById('line-type-toolbar');
                    if (diffToggleBtn) {
                        diffToggleBtn.classList.remove('active');
                        diffToggleBtn.style.display = 'flex';
                    }
                    if (diffCloseBtn) {
                        diffCloseBtn.style.display = 'none';
                    }
                    if (lineTypeToolbar) {
                        lineTypeToolbar.style.display = 'flex';
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

                    // Update button states and hide line type toolbar
                    const lineTypeToolbar = document.getElementById('line-type-toolbar');
                    if (diffToggleBtn) {
                        diffToggleBtn.classList.add('active');
                        diffToggleBtn.style.display = 'none';
                    }
                    if (diffCloseBtn) {
                        diffCloseBtn.style.display = 'flex';
                    }
                    if (lineTypeToolbar) {
                        lineTypeToolbar.style.display = 'none';
                    }
                }
                break;
            }
            case 'scrollToAnchor': {
                // Scroll to a heading by slug (e.g. opened via `other.md#heading`).
                const container = document.getElementById('editor');
                if (container) {
                    scrollToAnchorInEditor(container, message.slug);
                }
                break;
            }
        }
    });

    // Tell extension we're ready
    postToHost({ type: 'ready' });
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
