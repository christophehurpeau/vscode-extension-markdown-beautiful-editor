import * as assert from 'assert';
import * as Diff from 'diff';
import { computeDiff } from '../../webview/editor/diff';

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
});
