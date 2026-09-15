import * as assert from 'assert';
import {
    resolveTocVisibility,
    toggledTocPreference,
    TOC_AUTO_HIDE_MAX_WIDTH,
    type TocVisibilityPreference,
} from '../../shared/tocVisibility';

describe('TOC visibility', () => {

    describe('Width-based default (no explicit preference)', () => {
        it('shows the TOC on a wide viewport', () => {
            assert.strictEqual(resolveTocVisibility({ preference: null, viewportWidth: 1200 }), true);
        });

        it('hides the TOC at or below the auto-hide width', () => {
            assert.strictEqual(
                resolveTocVisibility({ preference: null, viewportWidth: TOC_AUTO_HIDE_MAX_WIDTH }),
                false
            );
            assert.strictEqual(resolveTocVisibility({ preference: null, viewportWidth: 320 }), false);
        });

        it('shows the TOC one pixel above the auto-hide width', () => {
            assert.strictEqual(
                resolveTocVisibility({ preference: null, viewportWidth: TOC_AUTO_HIDE_MAX_WIDTH + 1 }),
                true
            );
        });
    });

    describe('Explicit preference', () => {
        it('wins over the width default in both directions', () => {
            assert.strictEqual(resolveTocVisibility({ preference: 'visible', viewportWidth: 320 }), true);
            assert.strictEqual(resolveTocVisibility({ preference: 'hidden', viewportWidth: 1600 }), false);
        });
    });

    describe('Toggling', () => {
        it('records the opposite of the current visibility', () => {
            assert.strictEqual(toggledTocPreference(true), 'hidden');
            assert.strictEqual(toggledTocPreference(false), 'visible');
        });

        it('makes the choice stick across a resize', () => {
            // Narrow viewport, no preference: hidden by default.
            let preference: TocVisibilityPreference = null;
            assert.strictEqual(resolveTocVisibility({ preference, viewportWidth: 400 }), false);

            // User shows it, then the viewport widens and narrows again.
            preference = toggledTocPreference(false);
            assert.strictEqual(resolveTocVisibility({ preference, viewportWidth: 400 }), true);
            assert.strictEqual(resolveTocVisibility({ preference, viewportWidth: 1200 }), true);

            // User hides it on a wide viewport: stays hidden.
            preference = toggledTocPreference(true);
            assert.strictEqual(resolveTocVisibility({ preference, viewportWidth: 1200 }), false);
        });
    });
});
