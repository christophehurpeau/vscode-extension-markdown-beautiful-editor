/**
 * Markdown Serializer Module
 *
 * Converts the editor's HTML DOM back to plain markdown text.
 * This is the inverse of the parser module.
 */

/**
 * Extract plain markdown text from the editor container
 *
 * @param container The editor container element
 * @returns Plain markdown text
 */
export function extractMarkdown(container: HTMLElement): string {
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

/**
 * Get selected markdown text, extracting only from .line-content elements
 *
 * @param selection The current selection
 * @param editorContainer The editor container element
 * @returns Selected markdown text
 */
export function getSelectedMarkdownText(selection: Selection, editorContainer: HTMLElement | null): string {
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
