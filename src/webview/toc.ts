interface TocItem {
    level: number;
    text: string;
    id: string;
}

interface DocLike {
    descendants: (callback: (node: { type: { name: string }; attrs: { level: number }; textContent: string }) => boolean) => void;
}

// Extract headings from document (ProseMirror doc or mock)
function extractHeadings(doc: DocLike): TocItem[] {
    const headings: TocItem[] = [];
    let headingIndex = 0;

    doc.descendants((node) => {
        if (node.type.name === 'heading') {
            const level = node.attrs.level as number;
            const text = node.textContent;
            const id = `heading-${headingIndex++}`;
            
            if (text.trim()) {
                headings.push({ level, text, id });
            }
        }
        return true;
    });

    return headings;
}

// Render TOC to the sidebar
export function updateToc(doc: DocLike): void {
    const tocContainer = document.getElementById('toc');
    if (!tocContainer) {
        return;
    }

    const headings = extractHeadings(doc);

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

// Scroll to a heading by index
function scrollToHeading(index: number): void {
    const editor = document.getElementById('editor');
    if (!editor) {
        return;
    }

    // Find all heading lines in the editor (lines starting with #)
    const lines = editor.querySelectorAll('.line');
    let headingCount = 0;
    
    for (const line of lines) {
        const text = line.textContent || '';
        if (/^#{1,6}\s/.test(text)) {
            if (headingCount === index) {
                line.scrollIntoView({ behavior: 'smooth', block: 'start' });
                
                // Update active state in TOC
                document.querySelectorAll('.toc-link').forEach((link: Element, i: number) => {
                    link.classList.toggle('active', i === index);
                });
                return;
            }
            headingCount++;
        }
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
        const text = line.textContent || '';
        if (/^#{1,6}\s/.test(text)) {
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
