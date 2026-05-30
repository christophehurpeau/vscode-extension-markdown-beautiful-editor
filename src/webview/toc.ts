import { escapeHtml } from './markdown/parser';
import { restoreCursorPosition } from './editor/cursor';

export interface TocHeading {
    level: number;
    text: string;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

/**
 * Whether a line is a heading that appears in the TOC.
 *
 * A line counts only when it is an ATX heading (1–6 hashes + whitespace) **and**
 * its text is non-empty after trimming. This is the single source of truth used
 * by both heading extraction and line-index lookup, so the TOC entry order can
 * never diverge from the line-counting walk (e.g. a bare `# ` is ignored by both).
 */
export function isTocHeadingLine(text: string): boolean {
    const match = text.match(HEADING_RE);
    return match !== null && match[2].trim().length > 0;
}

/**
 * Extract headings from raw markdown text.
 *
 * Pure (no DOM) so it can be unit-tested directly. Empty headings (e.g. a bare
 * `# `) are skipped, matching the previous TOC behaviour.
 */
export function extractHeadingsFromMarkdown(markdown: string): TocHeading[] {
    const headings: TocHeading[] = [];
    for (const line of markdown.split('\n')) {
        const match = line.match(HEADING_RE);
        if (match && match[2].trim()) {
            headings.push({ level: match[1].length, text: match[2] });
        }
    }
    return headings;
}

// Render TOC to the sidebar
export function updateToc(headings: TocHeading[]): void {
    const tocContainer = document.getElementById('toc');
    if (!tocContainer) {
        return;
    }

    if (headings.length === 0) {
        tocContainer.innerHTML = `
            <div class="toc-title">Contents</div>
            <div class="toc-empty">No headings yet</div>
        `;
        return;
    }

    const listItems = headings.map((heading, index) => {
        return `
            <li class="toc-item toc-level-${heading.level}">
                <a href="#" class="toc-link" data-heading-index="${index}" title="${escapeHtml(heading.text)}">
                    ${escapeHtml(heading.text)}
                </a>
            </li>
        `;
    }).join('');

    tocContainer.innerHTML = `
        <div class="toc-title">Contents</div>
        <ul class="toc-list">${listItems}</ul>
    `;

    // Add click handlers for TOC links
    tocContainer.querySelectorAll('.toc-link').forEach((link: Element) => {
        link.addEventListener('click', (e: Event) => {
            e.preventDefault();
            const index = parseInt((link as HTMLElement).dataset.headingIndex || '0', 10);
            scrollToHeading(index);
        });
    });
}

/**
 * Map a TOC heading index (Nth heading) to the absolute editor line index.
 *
 * Pure (no DOM) so it can be unit-tested directly. `lineTexts` are the
 * `.line-content` text contents of each editor line, in order. Returns the
 * line index of the Nth heading, or null if there is no such heading.
 */
export function findHeadingLineIndex(lineTexts: string[], headingIndex: number): number | null {
    let headingCount = 0;
    for (let i = 0; i < lineTexts.length; i++) {
        if (isTocHeadingLine(lineTexts[i])) {
            if (headingCount === headingIndex) {
                return i;
            }
            headingCount++;
        }
    }
    return null;
}

/**
 * Dependencies for {@link scrollToHeading}, injectable for testing. The
 * defaults operate on the live editor DOM.
 */
export interface ScrollToHeadingDeps {
    /** Resolve the editor container element. */
    getEditor?: () => HTMLElement | null;
    /** Move keyboard focus and the cursor to the given editor line. */
    focusLine?: (editor: HTMLElement, lineIndex: number) => void;
}

function focusEditorLine(editor: HTMLElement, lineIndex: number): void {
    editor.focus({ preventScroll: true });
    restoreCursorPosition(editor, { lineIndex, offset: 0 }, true);
}

// Scroll to a heading by index and move the cursor/focus to it.
export function scrollToHeading(index: number, deps: ScrollToHeadingDeps = {}): void {
    const getEditor = deps.getEditor ?? (() => document.getElementById('editor'));
    const focusLine = deps.focusLine ?? focusEditorLine;

    const editor = getEditor();
    if (!editor) {
        return;
    }

    // Read each line's content text (excluding the .line-prefix line number).
    const lineEls = Array.from(editor.querySelectorAll('.line')) as HTMLElement[];
    const lineTexts = lineEls.map((el) => el.querySelector('.line-content')?.textContent || '');

    const lineIndex = findHeadingLineIndex(lineTexts, index);
    if (lineIndex === null) {
        return;
    }

    lineEls[lineIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Move focus and the cursor to the heading so typing continues there.
    focusLine(editor, lineIndex);

    // Update active state in TOC
    if (typeof document !== 'undefined') {
        document.querySelectorAll('.toc-link').forEach((link: Element, i: number) => {
            link.classList.toggle('active', i === index);
        });
    }
}

// Set up scroll spy to highlight current heading in TOC
export function setupScrollSpy(): void {
    const editorMain = document.querySelector('.editor-main');
    if (!editorMain) {
        return;
    }

    let ticking = false;

    editorMain.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                updateActiveHeading();
                ticking = false;
            });
            ticking = true;
        }
    });
}

function updateActiveHeading(): void {
    const editor = document.getElementById('editor');
    const editorMain = document.querySelector('.editor-main');
    const tocSidebar = document.querySelector('.toc-sidebar');
    if (!editor || !editorMain) {
        return;
    }

    const lines = editor.querySelectorAll('.line');
    const scrollTop = editorMain.scrollTop;
    const offset = 100;

    let activeIndex = -1;
    let headingCount = 0;

    lines.forEach((line: Element) => {
        // Read .line-content only — the .line-prefix holds the rendered line
        // number, so the full textContent would start with a digit and never
        // match. This mirrors findHeadingLineIndex so the spy index lines up
        // with the TOC entry order.
        const text = line.querySelector('.line-content')?.textContent || '';
        if (isTocHeadingLine(text)) {
            const rect = line.getBoundingClientRect();
            const editorRect = editorMain.getBoundingClientRect();
            const relativeTop = rect.top - editorRect.top + scrollTop;

            if (relativeTop <= scrollTop + offset) {
                activeIndex = headingCount;
            }
            headingCount++;
        }
    });

    // Update TOC active state and scroll active item into view
    const tocLinks = document.querySelectorAll('.toc-link');
    tocLinks.forEach((link: Element, i: number) => {
        const isActive = i === activeIndex;
        const wasActive = link.classList.contains('active');
        link.classList.toggle('active', isActive);
        
        // Scroll TOC to keep active item visible (only when it changes)
        if (isActive && !wasActive && tocSidebar) {
            const linkEl = link as HTMLElement;
            const sidebarRect = tocSidebar.getBoundingClientRect();
            const linkRect = linkEl.getBoundingClientRect();
            
            // Check if the link is outside the visible area of the sidebar
            const isAbove = linkRect.top < sidebarRect.top + 50; // 50px buffer for title
            const isBelow = linkRect.bottom > sidebarRect.bottom - 20;
            
            if (isAbove || isBelow) {
                linkEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    });
}
