/**
 * Editor Cursor Module
 *
 * Manages cursor positioning, selection tracking, and cursor restoration
 * in the markdown editor. Works with the editor's DOM structure to maintain
 * accurate cursor positions across re-renders.
 */

import { type CursorPosition } from './state';

/**
 * Selection position interface for tracking selection boundaries in markdown
 */
export interface SelectionPosition {
    startLineIndex: number;
    startOffset: number;
    endLineIndex: number;
    endOffset: number;
}

/**
 * Place cursor at the start of the editor
 *
 * @param container The editor container element
 */
export function placeCursorAtStart(container: HTMLElement): void {
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

/**
 * Save current cursor position
 *
 * @param container The editor container element
 * @returns Cursor position or null if no cursor
 */
export function saveCursorPosition(container: HTMLElement): CursorPosition | null {
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

    // Calculate offset within the line's text content (only in .line-content, not .line-prefix)
    const lineContent = lineEl.querySelector('.line-content');
    if (!lineContent) {
        return { lineIndex, offset: 0 };
    }

    const treeWalker = document.createTreeWalker(lineContent, NodeFilter.SHOW_TEXT);
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

/**
 * Get selection start and end positions in markdown coordinates
 *
 * @param container The editor container element
 * @param selection The current selection
 * @returns Selection position or null if no selection
 */
export function getSelectionMarkdownPosition(container: HTMLElement, selection: Selection): SelectionPosition | null {
    if (!selection || selection.rangeCount === 0) {
        return null;
    }

    const range = selection.getRangeAt(0);

    // Helper function to get position for a node and offset
    const getPositionForNode = (node: Node, offset: number): { lineIndex: number; offset: number } | null => {
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
        const lineContent = lineEl.querySelector('.line-content');
        if (!lineContent) {
            return { lineIndex, offset: 0 };
        }

        const treeWalker = document.createTreeWalker(lineContent, NodeFilter.SHOW_TEXT);
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
    };

    // Get start position
    const startPos = getPositionForNode(range.startContainer, range.startOffset);
    if (!startPos) {
        return null;
    }

    // Get end position
    const endPos = getPositionForNode(range.endContainer, range.endOffset);
    if (!endPos) {
        return null;
    }

    return {
        startLineIndex: startPos.lineIndex,
        startOffset: startPos.offset,
        endLineIndex: endPos.lineIndex,
        endOffset: endPos.offset
    };
}

/**
 * Restore cursor to a saved position
 *
 * @param container The editor container element
 * @param pos The cursor position to restore
 */
export function restoreCursorPosition(container: HTMLElement, pos: CursorPosition): void {
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
