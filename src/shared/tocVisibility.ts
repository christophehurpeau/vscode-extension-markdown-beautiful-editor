/**
 * Visibility rules for the table-of-contents sidebar.
 *
 * Pure (no DOM, no `vscode`) so both bundles can import it and it stays
 * unit-testable.
 */

/** Viewport width (px) at or below which the TOC is hidden by default. */
export const TOC_AUTO_HIDE_MAX_WIDTH = 600;

/**
 * The user's explicit choice, or `null` when they never toggled the TOC and the
 * viewport width decides.
 */
export type TocVisibilityPreference = 'visible' | 'hidden' | null;

interface ResolveTocVisibilityParams {
    preference: TocVisibilityPreference;
    viewportWidth: number;
}

export function resolveTocVisibility({ preference, viewportWidth }: ResolveTocVisibilityParams): boolean {
    if (preference === null) {
        return viewportWidth > TOC_AUTO_HIDE_MAX_WIDTH;
    }
    return preference === 'visible';
}

/**
 * The preference to store when the toggle is pressed while the TOC is currently
 * `visible`. Toggling always records an explicit choice, so the width-based
 * default no longer applies afterwards.
 */
export function toggledTocPreference(visible: boolean): Exclude<TocVisibilityPreference, null> {
    return visible ? 'hidden' : 'visible';
}
