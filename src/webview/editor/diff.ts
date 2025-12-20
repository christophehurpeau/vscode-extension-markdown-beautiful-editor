/**
 * Editor Diff Module
 *
 * Handles diff view rendering and computation for comparing original and modified
 * markdown content. Provides side-by-side comparison with line-level highlighting.
 */

import * as Diff from 'diff';

/**
 * Initialize diff view with side-by-side comparison
 *
 * @param container The editor container element
 * @param originalMarkdown Original markdown content (e.g., from HEAD)
 * @param modifiedMarkdown Modified markdown content (current working copy)
 * @param markdownToStyledHtml Function to convert markdown to styled HTML
 */
export function initDiffView(
    container: HTMLElement,
    originalMarkdown: string,
    modifiedMarkdown: string,
    markdownToStyledHtml: (markdown: string) => string
): void {
    // Make container non-editable for diff view
    container.setAttribute('contenteditable', 'false');

    // Create side-by-side diff layout
    container.innerHTML = `
        <div class="diff-container">
            <div class="diff-panel diff-original">
                <div class="diff-header">Original (HEAD)</div>
                <div class="diff-content" id="diff-original-content" contenteditable="false" spellcheck="false"></div>
            </div>
            <div class="diff-panel diff-modified">
                <div class="diff-header">Modified (Working Copy)</div>
                <div class="diff-content" id="diff-modified-content" contenteditable="false" spellcheck="false"></div>
            </div>
        </div>
    `;

    // Render both versions
    const originalContent = document.getElementById('diff-original-content');
    const modifiedContent = document.getElementById('diff-modified-content');

    if (originalContent && modifiedContent) {
        originalContent.innerHTML = markdownToStyledHtml(originalMarkdown);
        modifiedContent.innerHTML = markdownToStyledHtml(modifiedMarkdown);

        // Highlight differences line by line
        highlightDifferences(originalContent, modifiedContent, originalMarkdown, modifiedMarkdown);

        // Synchronize scrolling
        const originalPanel = originalContent.closest('.diff-panel') as HTMLElement;
        const modifiedPanel = modifiedContent.closest('.diff-panel') as HTMLElement;

        if (originalPanel && modifiedPanel) {
            let isScrolling = false;
            originalPanel.addEventListener('scroll', () => {
                if (!isScrolling) {
                    isScrolling = true;
                    modifiedPanel.scrollTop = originalPanel.scrollTop;
                    setTimeout(() => { isScrolling = false; }, 50);
                }
            });
            modifiedPanel.addEventListener('scroll', () => {
                if (!isScrolling) {
                    isScrolling = true;
                    originalPanel.scrollTop = modifiedPanel.scrollTop;
                    setTimeout(() => { isScrolling = false; }, 50);
                }
            });
        }
    }

    // Hide TOC in diff mode
    const toc = document.getElementById('toc');
    if (toc) {
        toc.style.display = 'none';
    }

    // Keep toolbar visible in diff mode (for the close button)
    // The button visibility is managed by the toggleDiff message handler
}

/**
 * Compute diff using the diff library for accurate change detection
 *
 * @param originalText Original text content
 * @param modifiedText Modified text content
 * @returns Sets of added and removed line indices
 */
export function computeDiff(originalText: string, modifiedText: string): {
    added: Set<number>;
    removed: Set<number>;
} {
    const added = new Set<number>();
    const removed = new Set<number>();

    // Use the diff library to compute line-by-line changes
    const changes = Diff.diffLines(originalText, modifiedText);

    let originalLineIndex = 0;
    let modifiedLineIndex = 0;

    for (const change of changes) {
        const lineCount = change.count || 0;

        if (change.removed) {
            // Mark lines as removed in the original
            for (let i = 0; i < lineCount; i++) {
                removed.add(originalLineIndex + i);
            }
            originalLineIndex += lineCount;
        } else if (change.added) {
            // Mark lines as added in the modified
            for (let i = 0; i < lineCount; i++) {
                added.add(modifiedLineIndex + i);
            }
            modifiedLineIndex += lineCount;
        } else {
            // Unchanged lines - advance both indices
            originalLineIndex += lineCount;
            modifiedLineIndex += lineCount;
        }
    }

    return { added, removed };
}

/**
 * Highlight differences between original and modified content
 *
 * @param originalContainer Container with original content
 * @param modifiedContainer Container with modified content
 * @param originalMarkdown Original markdown text
 * @param modifiedMarkdown Modified markdown text
 */
export function highlightDifferences(
    originalContainer: HTMLElement,
    modifiedContainer: HTMLElement,
    originalMarkdown: string,
    modifiedMarkdown: string
): void {
    // Compute diff using the diff library
    const diff = computeDiff(originalMarkdown, modifiedMarkdown);

    // Get line elements
    const originalLineElements = originalContainer.querySelectorAll('.line');
    const modifiedLineElements = modifiedContainer.querySelectorAll('.line');

    // Highlight removed lines in original
    diff.removed.forEach(idx => {
        if (idx < originalLineElements.length) {
            originalLineElements[idx].classList.add('diff-line-removed');
        }
    });

    // Highlight added lines in modified
    diff.added.forEach(idx => {
        if (idx < modifiedLineElements.length) {
            modifiedLineElements[idx].classList.add('diff-line-added');
        }
    });
}
