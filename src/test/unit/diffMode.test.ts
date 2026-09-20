import * as assert from 'assert';
import * as Diff from 'diff';
import { EditorState } from '@codemirror/state';
import { computeDiff, computeLineChangeMarkers, hasChanges } from '../../webview/editor/diff';
import { mergePaneOptions, planToggleDiff } from '../../webview/cm/diff/mergeView';

/**
 * Unit tests for diff mode functionality
 *
 * These tests verify:
 * - Diff computation accuracy (via the real `computeDiff` from diff.ts)
 * - Line change detection (added/removed)
 */
describe('Diff Mode Tests', () => {

    describe('Diff Computation', () => {
        it('should detect added lines', () => {
            const original = 'Line 1\nLine 2\n';
            const modified = 'Line 1\nLine 2\nLine 3\n';

            const changes = Diff.diffLines(original, modified);

            // Should detect the added line
            const hasAdded = changes.some(c => c.added);
            assert.ok(hasAdded, 'Should have added change');

            // Verify the added content contains Line 3
            const addedChange = changes.find(c => c.added);
            assert.ok(addedChange?.value.includes('Line 3'));
        });

        it('Should detect removed lines', () => {
            const original = 'Line 1\nLine 2\nLine 3\n';
            const modified = 'Line 1\nLine 2\n';

            const changes = Diff.diffLines(original, modified);

            // Should detect the removed line
            const hasRemoved = changes.some(c => c.removed);
            assert.ok(hasRemoved, 'Should have removed change');

            // Verify the removed content contains Line 3
            const removedChange = changes.find(c => c.removed);
            assert.ok(removedChange?.value.includes('Line 3'));
        });

        it('Should detect modified lines', () => {
            const original = 'Line 1\nLine 2\nLine 3';
            const modified = 'Line 1\nLine 2 Modified\nLine 3';

            const changes = Diff.diffLines(original, modified);

            // Modified line appears as removed + added
            assert.ok(changes.length >= 3);

            // Check that we have removed and added changes
            const hasRemoved = changes.some(c => c.removed);
            const hasAdded = changes.some(c => c.added);
            assert.ok(hasRemoved, 'Should have removed change');
            assert.ok(hasAdded, 'Should have added change');
        });

        it('Should handle empty original', () => {
            const original = '';
            const modified = 'New Line';

            const changes = Diff.diffLines(original, modified);

            assert.strictEqual(changes.length, 1);
            assert.strictEqual(changes[0].added, true);
        });

        it('Should handle empty modified', () => {
            const original = 'Old Line';
            const modified = '';

            const changes = Diff.diffLines(original, modified);

            assert.strictEqual(changes.length, 1);
            assert.strictEqual(changes[0].removed, true);
        });

        it('Should handle identical content', () => {
            const original = 'Line 1\nLine 2\nLine 3\n';
            const modified = 'Line 1\nLine 2\nLine 3\n';

            const changes = Diff.diffLines(original, modified);

            // Should have only unchanged content
            const hasChanges = changes.some(c => c.added || c.removed);
            assert.ok(!hasChanges, 'Should have no additions or removals');
        });

        it('Should detect multiple added lines', () => {
            const original = 'Line 1\n';
            const modified = 'Line 1\nLine 2\nLine 3\nLine 4\n';

            const changes = Diff.diffLines(original, modified);

            const addedChange = changes.find(c => c.added);
            assert.ok(addedChange, 'Should have added change');
            // Verify multiple lines were added
            assert.ok(addedChange!.value.includes('Line 2'));
            assert.ok(addedChange!.value.includes('Line 3'));
            assert.ok(addedChange!.value.includes('Line 4'));
        });

        it('Should detect multiple removed lines', () => {
            const original = 'Line 1\nLine 2\nLine 3\nLine 4\n';
            const modified = 'Line 1\n';

            const changes = Diff.diffLines(original, modified);

            const removedChange = changes.find(c => c.removed);
            assert.ok(removedChange, 'Should have removed change');
            // Verify multiple lines were removed
            assert.ok(removedChange!.value.includes('Line 2'));
            assert.ok(removedChange!.value.includes('Line 3'));
            assert.ok(removedChange!.value.includes('Line 4'));
        });

        it('Should handle whitespace changes', () => {
            const original = 'Line 1\nLine 2';
            const modified = 'Line 1\n  Line 2  ';

            const changes = Diff.diffLines(original, modified);

            // Whitespace changes should be detected
            const hasChanges = changes.some(c => c.added || c.removed);
            assert.ok(hasChanges, 'Should detect whitespace changes');
        });
    });

    describe('Line Index Mapping', () => {
        // Exercises the real computeDiff() exported from diff.ts.

        it('Should map added line indices correctly', () => {
            const original = 'Line 0\nLine 1\nLine 2';
            const modified = 'Line 0\nLine 1\nNEW LINE\nLine 2';

            const result = computeDiff(original, modified);

            assert.ok(result.added.has(2), 'Line 2 should be marked as added');
            assert.strictEqual(result.added.size, 1);
            assert.strictEqual(result.removed.size, 0);
        });

        it('Should map removed line indices correctly', () => {
            const original = 'Line 0\nLine 1\nREMOVED\nLine 2';
            const modified = 'Line 0\nLine 1\nLine 2';

            const result = computeDiff(original, modified);

            assert.ok(result.removed.has(2), 'Line 2 should be marked as removed');
            assert.strictEqual(result.removed.size, 1);
            assert.strictEqual(result.added.size, 0);
        });

        it('Should map modified line indices correctly', () => {
            const original = 'Line 0\nLine 1\nLine 2';
            const modified = 'Line 0\nLine 1 MODIFIED\nLine 2';

            const result = computeDiff(original, modified);

            // Modified line shows as both removed and added at index 1
            assert.ok(result.removed.has(1), 'Line 1 should be marked as removed in original');
            assert.ok(result.added.has(1), 'Line 1 should be marked as added in modified');
        });

        it('Should handle multiple consecutive additions', () => {
            const original = 'Line 0\nLine 3';
            const modified = 'Line 0\nLine 1\nLine 2\nLine 3';

            const result = computeDiff(original, modified);

            assert.ok(result.added.has(1), 'Line 1 should be added');
            assert.ok(result.added.has(2), 'Line 2 should be added');
            assert.strictEqual(result.added.size, 2);
        });

        it('Should handle multiple consecutive removals', () => {
            const original = 'Line 0\nLine 1\nLine 2\nLine 3';
            const modified = 'Line 0\nLine 3';

            const result = computeDiff(original, modified);

            assert.ok(result.removed.has(1), 'Line 1 should be removed');
            assert.ok(result.removed.has(2), 'Line 2 should be removed');
            assert.strictEqual(result.removed.size, 2);
        });
    });

    describe('hasChanges (mergeView open gating)', () => {
        it('is false for identical content', () => {
            assert.strictEqual(hasChanges('Line 1\nLine 2\n', 'Line 1\nLine 2\n'), false);
        });

        it('is true when a line was added', () => {
            assert.strictEqual(hasChanges('Line 1\n', 'Line 1\nLine 2\n'), true);
        });

        it('is true when a line was removed', () => {
            assert.strictEqual(hasChanges('Line 1\nLine 2\n', 'Line 1\n'), true);
        });

        it('is false for two independently-empty documents', () => {
            assert.strictEqual(hasChanges('', ''), false);
        });
    });

    // WP-D: planToggleDiff is the pure, DOM-free decision `main.ts` drives
    // off of for the `toggleDiff` message -- see src/webview/cm/diff/mergeView.ts.
    // It is deliberately exercised without ever constructing an EditorView
    // or MergeView (both need a DOM); what's tested here is entirely the
    // "what should happen" decision, not the CM6 wiring itself.
    describe('planToggleDiff (state transitions)', () => {
        it('opens with the live document as `modified` when there are changes', () => {
            const transition = planToggleDiff({
                active: false,
                originalVersionContent: 'Line 1\nLine 2\n',
                currentContent: 'Line 1\nLine 2\nLine 3\n',
            });
            assert.deepStrictEqual(transition, {
                action: 'open',
                original: 'Line 1\nLine 2\n',
                modified: 'Line 1\nLine 2\nLine 3\n',
            });
        });

        it('skips opening when there is nothing to show', () => {
            const transition = planToggleDiff({
                active: false,
                originalVersionContent: 'same\n',
                currentContent: 'same\n',
            });
            assert.deepStrictEqual(transition, { action: 'skip', reason: 'no-changes' });
        });

        it('closes when diff mode is already active, regardless of content', () => {
            const transition = planToggleDiff({
                active: true,
                originalVersionContent: 'same\n',
                currentContent: 'same\n',
            });
            assert.deepStrictEqual(transition, { action: 'close' });
        });

        it('closing never reports document content, so there is nothing for a caller to lose track of', () => {
            const transition = planToggleDiff({
                active: true,
                originalVersionContent: 'irrelevant while active\n',
                currentContent: 'also irrelevant\n',
            });
            assert.strictEqual('original' in transition, false);
            assert.strictEqual('modified' in transition, false);
        });

        it('passes the live document through to `modified` verbatim (content preservation across a toggle)', () => {
            const liveDocument = 'Some *live* content\nwith **edits** the user just made\n';
            const transition = planToggleDiff({
                active: false,
                originalVersionContent: 'Some original content\n',
                currentContent: liveDocument,
            });
            assert.strictEqual(transition.action, 'open');
            if (transition.action === 'open') {
                assert.strictEqual(transition.modified, liveDocument);
            }
        });

        it('prefers closing over gating on changes when both are active and identical', () => {
            // Diff mode is already open; the fact that the two documents
            // happen to be identical must not prevent closing it.
            const transition = planToggleDiff({
                active: true,
                originalVersionContent: 'x',
                currentContent: 'x',
            });
            assert.strictEqual(transition.action, 'close');
        });
    });

    // Always-on gutter indicator (src/webview/cm/lineNumberGutter.ts): given
    // git HEAD text and the current document, which of the current
    // document's own line numbers get which marker. Checked against a real
    // `EditorState` for the current document -- no `EditorView`/DOM needed,
    // same shape as `lineNumberGutter.test.ts`'s `lineStrutClass` tests --
    // so a marker's line number is verified against the line it actually
    // names, not just asserted in isolation.
    describe('computeLineChangeMarkers (gutter markers)', () => {
        function currentDoc(text: string): EditorState {
            return EditorState.create({ doc: text });
        }

        function lineText(state: EditorState, lineNumber: number): string {
            return state.doc.line(lineNumber).text;
        }

        it('is empty for identical content', () => {
            const markers = computeLineChangeMarkers('a\nb\nc', 'a\nb\nc');
            assert.deepStrictEqual([...markers], []);
        });

        it('marks a newly added line as added, at its own 1-based line number', () => {
            const original = 'Line 0\nLine 1\nLine 2';
            const modified = 'Line 0\nLine 1\nNEW LINE\nLine 2';
            const state = currentDoc(modified);

            const markers = computeLineChangeMarkers(original, modified);

            assert.deepStrictEqual([...markers], [[3, 'added']]);
            assert.strictEqual(lineText(state, 3), 'NEW LINE');
        });

        it('marks a replaced line as modified, not added', () => {
            const original = 'Line 0\nLine 1\nLine 2';
            const modified = 'Line 0\nLine 1 MODIFIED\nLine 2';
            const state = currentDoc(modified);

            const markers = computeLineChangeMarkers(original, modified);

            assert.deepStrictEqual([...markers], [[2, 'modified']]);
            assert.strictEqual(lineText(state, 2), 'Line 1 MODIFIED');
        });

        it('marks consecutive added lines individually', () => {
            const original = 'Line 0\nLine 3';
            const modified = 'Line 0\nLine 1\nLine 2\nLine 3';

            const markers = computeLineChangeMarkers(original, modified);

            assert.deepStrictEqual(
                [...markers].sort(([a], [b]) => a - b),
                [[2, 'added'], [3, 'added']],
            );
        });

        it('a pure deletion has no line of its own -- it lands on the line before it', () => {
            const original = 'Line 0\nLine 1\nREMOVED\nLine 2';
            const modified = 'Line 0\nLine 1\nLine 2';
            const state = currentDoc(modified);

            const markers = computeLineChangeMarkers(original, modified);

            assert.deepStrictEqual([...markers], [[2, 'removed']]);
            assert.strictEqual(lineText(state, 2), 'Line 1');
        });

        it('a deletion at the very start of the document lands on the new first line', () => {
            const original = 'REMOVED\nLine 1\nLine 2';
            const modified = 'Line 1\nLine 2';
            const state = currentDoc(modified);

            const markers = computeLineChangeMarkers(original, modified);

            assert.deepStrictEqual([...markers], [[1, 'removed']]);
            assert.strictEqual(lineText(state, 1), 'Line 1');
        });

        it('a deletion at the very end of the document lands on the new last line', () => {
            const original = 'Line 0\nLine 1\nLine 2\n';
            const modified = 'Line 0\nLine 1\n';
            const state = currentDoc(modified);

            const markers = computeLineChangeMarkers(original, modified);

            assert.deepStrictEqual([...markers], [[2, 'removed']]);
            assert.strictEqual(lineText(state, 2), 'Line 1');
        });

        it('deleting the entire document lands on its one remaining (empty) line', () => {
            const original = 'a\nb\nc';
            const modified = '';
            const state = currentDoc(modified);

            const markers = computeLineChangeMarkers(original, modified);

            assert.deepStrictEqual([...markers], [[1, 'removed']]);
            assert.strictEqual(state.doc.lines, 1);
        });

        it('does not recompute correctness by coincidence -- every marker key is a real line in the current doc', () => {
            const original = 'a\nb\nc\nd\ne';
            const modified = 'a\nB\nc\nd\nE\nf';
            const state = currentDoc(modified);

            const markers = computeLineChangeMarkers(original, modified);

            for (const lineNumber of markers.keys()) {
                assert.ok(lineNumber >= 1 && lineNumber <= state.doc.lines, `line ${lineNumber} out of range`);
            }
        });
    });

    describe('mergePaneOptions', () => {
        it('leaves the original pane read-only either way -- it is a git revision', () => {
            assert.strictEqual(mergePaneOptions(true).originalEditable, false);
            assert.strictEqual(mergePaneOptions(false).originalEditable, false);
        });

        it('offers revert controls exactly when the modified pane can accept them', () => {
            // A revert dispatches the original's text into `b`. Offered
            // against a read-only `b` it is a button that silently does
            // nothing, which is why the two are tied together rather than
            // configured independently.
            for (const editableModified of [true, false]) {
                const panes = mergePaneOptions(editableModified);
                assert.strictEqual(
                    panes.revertControls !== undefined,
                    panes.modifiedEditable,
                    `revert controls disagreed with editability for editableModified=${editableModified}`
                );
            }
        });

        it('reverts from the original into the modified side, not the reverse', () => {
            assert.strictEqual(mergePaneOptions(true).revertControls, 'a-to-b');
        });

        it('makes the modified pane editable only when asked', () => {
            assert.strictEqual(mergePaneOptions(true).modifiedEditable, true);
            assert.strictEqual(mergePaneOptions(false).modifiedEditable, false);
        });
    });
});
