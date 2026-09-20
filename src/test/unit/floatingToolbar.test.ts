import * as assert from 'assert';
import { EditorState } from '@codemirror/state';
import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { decideFloatingToolbar } from '../../webview/cm/ui/floatingToolbar';

/**
 * Unit tests for the floating toolbar's pure "should it show, where should
 * it anchor, which buttons are active" decision
 * (`src/webview/cm/ui/floatingToolbar.ts`'s `decideFloatingToolbar`) — the
 * CM6 counterpart of the deleted `showFormattingToolbar`/
 * `showFormattingToolbarAtCursor`'s selection/formatting logic in
 * `main.ts`. Same shape as `cmFormattingAt.test.ts` (CONVENTION (c)): a
 * plain `EditorState` with the markdown language installed, no
 * `EditorView`/DOM — the DOM/coordinate half is intentionally left thin and
 * untested (see that file's header comment).
 */
function stateFor(doc: string, selection: { anchor: number; head?: number }): EditorState {
    return EditorState.create({
        doc,
        selection,
        extensions: [markdown({ base: commonmarkLanguage, extensions: [GFM], completeHTMLTags: false })],
    });
}

describe('cm/ui/floatingToolbar: decideFloatingToolbar', () => {
    describe('non-empty selection', () => {
        it('always shows, centered, anchored to the full selection range', () => {
            const doc = 'plain selected text here';
            const from = doc.indexOf('selected');
            const to = from + 'selected'.length;
            const decision = decideFloatingToolbar(stateFor(doc, { anchor: from, head: to }));

            assert.strictEqual(decision.show, true);
            assert.strictEqual(decision.align, 'center');
            assert.strictEqual(decision.anchorFrom, from);
            assert.strictEqual(decision.anchorTo, to);
        });

        it('reads active formatting from the selection start, not its end', () => {
            // Selection starts inside **bold** and ends in plain text after it.
            const doc = '**bold** after';
            const from = 2; // inside the StrongEmphasis node
            const to = doc.length;
            const decision = decideFloatingToolbar(stateFor(doc, { anchor: from, head: to }));

            assert.strictEqual(decision.formatting.bold, true);
        });
    });

    describe('collapsed cursor', () => {
        it('shows, left-aligned, when the cursor sits inside a formatted construct', () => {
            const doc = 'before **bold** after';
            const pos = doc.indexOf('bold') + 2;
            const decision = decideFloatingToolbar(stateFor(doc, { anchor: pos }));

            assert.strictEqual(decision.show, true);
            assert.strictEqual(decision.align, 'start');
            assert.strictEqual(decision.anchorFrom, pos);
            assert.strictEqual(decision.anchorTo, pos);
            assert.strictEqual(decision.formatting.bold, true);
        });

        it('shows for a cursor inside a link', () => {
            const doc = 'x [label](https://example.com) y';
            const pos = doc.indexOf('label') + 2;
            const decision = decideFloatingToolbar(stateFor(doc, { anchor: pos }));

            assert.strictEqual(decision.show, true);
            assert.strictEqual(decision.formatting.link, true);
        });

        it('does not show for a cursor in plain text', () => {
            const doc = 'just plain text';
            const decision = decideFloatingToolbar(stateFor(doc, { anchor: 5 }));

            assert.strictEqual(decision.show, false);
        });
    });

    describe('open affordance', () => {
        it('is offered for a cursor inside a link', () => {
            const doc = 'x [label](https://example.com) y';
            const decision = decideFloatingToolbar(stateFor(doc, { anchor: doc.indexOf('label') + 2 }));

            assert.deepStrictEqual(decision.openAffordance, {
                action: { kind: 'openLink', url: 'https://example.com' },
                label: 'Open link',
            });
        });

        it('is read from the selection start for a non-empty selection', () => {
            const doc = '[label](https://example.com) after';
            const from = doc.indexOf('label');
            const decision = decideFloatingToolbar(stateFor(doc, { anchor: from, head: doc.length }));

            assert.strictEqual(decision.openAffordance?.label, 'Open link');
        });

        it('shows the toolbar for an image, which carries no inline formatting', () => {
            const doc = 'x ![alt](img.png) y';
            const decision = decideFloatingToolbar(stateFor(doc, { anchor: doc.indexOf('alt') + 1 }));

            assert.strictEqual(decision.show, true);
            assert.strictEqual(decision.formatting.link, false);
            assert.strictEqual(decision.openAffordance?.label, 'Open image');
        });

        it('shows the toolbar for a bare autolink, which carries no inline formatting', () => {
            const doc = 'Visit https://example.com today';
            const decision = decideFloatingToolbar(stateFor(doc, { anchor: doc.indexOf('example') }));

            assert.strictEqual(decision.show, true);
            assert.strictEqual(decision.formatting.link, false);
            assert.strictEqual(decision.openAffordance?.label, 'Open link');
        });

        it('is null inside a non-link construct', () => {
            const doc = 'before **bold** after';
            const decision = decideFloatingToolbar(stateFor(doc, { anchor: doc.indexOf('bold') + 2 }));

            assert.strictEqual(decision.openAffordance, null);
        });

        it('is null in plain text', () => {
            assert.strictEqual(decideFloatingToolbar(stateFor('just plain text', { anchor: 5 })).openAffordance, null);
        });
    });
});
