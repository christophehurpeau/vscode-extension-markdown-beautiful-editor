import * as assert from 'assert';
import { findActiveHeadingIndex } from '../../webview/cm/ui/tocPanel';

/**
 * Unit tests for tocPanel's pure scroll-spy decision: given the line numbers
 * where each heading lives and the line number currently judged "at the top"
 * of the viewport, which TOC entry should be marked active. The `view`-driven
 * height/line lookup that feeds `topLineNumber` into this is DOM-dependent
 * and untested here (no `EditorView` in mocha) — see the file header.
 */
describe('tocPanel: findActiveHeadingIndex', () => {
    it('returns -1 before the first heading is reached', () => {
        assert.strictEqual(findActiveHeadingIndex([3, 10, 20], 1), -1);
    });

    it('activates the first heading once its line is reached', () => {
        assert.strictEqual(findActiveHeadingIndex([3, 10, 20], 3), 0);
    });

    it('picks the last heading at or above the current line', () => {
        assert.strictEqual(findActiveHeadingIndex([3, 10, 20], 15), 1);
    });

    it('activates the last heading once its line is reached', () => {
        assert.strictEqual(findActiveHeadingIndex([3, 10, 20], 20), 2);
    });

    it('stays on the last heading past the end of the document', () => {
        assert.strictEqual(findActiveHeadingIndex([3, 10, 20], 1000), 2);
    });

    it('returns -1 for a document with no headings', () => {
        assert.strictEqual(findActiveHeadingIndex([], 5), -1);
    });

    it('treats an exact match on a later heading correctly (no double counting)', () => {
        assert.strictEqual(findActiveHeadingIndex([1, 2, 3, 4], 3), 2);
    });
});
