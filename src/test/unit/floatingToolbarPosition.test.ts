import * as assert from 'assert';
import { floatingToolbarPosition, type ToolbarAnchorRect } from '../../shared/floatingToolbarPosition';

const baseOptions = {
    toolbarWidth: 160,
    toolbarHeight: 36,
    viewportWidth: 1200,
    minLeft: 8,
    align: 'center' as const,
};

describe('floatingToolbarPosition', () => {
    describe('vertical placement', () => {
        it('positions above the rect when there is room', () => {
            const rect: ToolbarAnchorRect = { left: 500, top: 100, bottom: 120, width: 50 };
            const pos = floatingToolbarPosition(rect, baseOptions);
            assert.strictEqual(pos.top, 100 - 36 - 8);
        });

        it('flips below the rect when above would go off the top of the viewport', () => {
            const rect: ToolbarAnchorRect = { left: 500, top: 10, bottom: 30, width: 50 };
            const pos = floatingToolbarPosition(rect, baseOptions);
            assert.strictEqual(pos.top, 30 + 8);
        });
    });

    describe('align: center', () => {
        it('centers the toolbar horizontally on the rect', () => {
            const rect: ToolbarAnchorRect = { left: 500, top: 100, bottom: 120, width: 100 };
            const pos = floatingToolbarPosition(rect, { ...baseOptions, align: 'center' });
            // left + width/2 - toolbarWidth/2 = 500 + 50 - 80 = 470
            assert.strictEqual(pos.left, 470);
        });

        it('clamps to minLeft when centering would push it off the left edge', () => {
            const rect: ToolbarAnchorRect = { left: 0, top: 100, bottom: 120, width: 10 };
            const pos = floatingToolbarPosition(rect, { ...baseOptions, align: 'center', minLeft: 8 });
            assert.strictEqual(pos.left, 8);
        });
    });

    describe('align: start', () => {
        it('aligns the toolbar to the rect\'s left edge', () => {
            const rect: ToolbarAnchorRect = { left: 300, top: 100, bottom: 120, width: 10 };
            const pos = floatingToolbarPosition(rect, { ...baseOptions, align: 'start' });
            assert.strictEqual(pos.left, 300);
        });

        it('clamps to a custom minLeft (e.g. to avoid the TOC)', () => {
            const rect: ToolbarAnchorRect = { left: 50, top: 100, bottom: 120, width: 10 };
            const pos = floatingToolbarPosition(rect, { ...baseOptions, align: 'start', minLeft: 250 });
            assert.strictEqual(pos.left, 250);
        });
    });

    describe('right-edge clamping', () => {
        it('clamps to the viewport width minus toolbarWidth and the 8px gutter', () => {
            const rect: ToolbarAnchorRect = { left: 1190, top: 100, bottom: 120, width: 10 };
            const pos = floatingToolbarPosition(rect, { ...baseOptions, align: 'start', viewportWidth: 1200 });
            assert.strictEqual(pos.left, 1200 - 160 - 8);
        });
    });
});
