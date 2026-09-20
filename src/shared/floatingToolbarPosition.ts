/**
 * Viewport-clamping arithmetic for the floating formatting toolbar. Pure (no
 * DOM): callers pass in the anchor rect (from `Range.getBoundingClientRect()`)
 * and viewport size instead of touching `window`/`Selection` here.
 */

export interface ToolbarAnchorRect {
    left: number;
    top: number;
    bottom: number;
    width: number;
}

export interface FloatingToolbarPositionOptions {
    toolbarWidth: number;
    toolbarHeight: number;
    viewportWidth: number;
    /**
     * Minimum left edge the toolbar is clamped to.
     *
     * `showFormattingToolbarAtCursor` (main.ts) hardcodes this to 250, per a
     * comment there meant to represent the TOC's width. The TOC is actually
     * 200px wide and can be hidden entirely, so 250 looks like a stale/wrong
     * value — preserved as-is here (as a parameter, not a second hardcode)
     * rather than silently "fixed" by this refactor.
     */
    minLeft: number;
    /** 'center' centers the toolbar on the anchor rect; 'start' aligns it to the rect's left edge. */
    align: 'center' | 'start';
}

export interface FloatingToolbarPosition {
    left: number;
    top: number;
}

/**
 * Clamp a floating toolbar's position against the viewport (and `minLeft`),
 * given the rect it should hover near. Preserves `showFormattingToolbar` and
 * `showFormattingToolbarAtCursor`'s behavior exactly: position above the rect
 * by `toolbarHeight + 8`, or below it (`rect.bottom + 8`) when that would go
 * off the top of the viewport.
 */
export function floatingToolbarPosition(rect: ToolbarAnchorRect, options: FloatingToolbarPositionOptions): FloatingToolbarPosition {
    const { toolbarWidth, toolbarHeight, viewportWidth, minLeft, align } = options;

    let left = align === 'center'
        ? rect.left + (rect.width / 2) - (toolbarWidth / 2)
        : rect.left;
    let top = rect.top - toolbarHeight - 8;

    if (left < minLeft) {
        left = minLeft;
    }
    if (left + toolbarWidth > viewportWidth - 8) {
        left = viewportWidth - toolbarWidth - 8;
    }
    if (top < 8) {
        top = rect.bottom + 8; // Show below if not enough space above
    }

    return { left, top };
}
