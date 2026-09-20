import * as assert from 'assert';
import { EditorSelection, EditorState } from '@codemirror/state';
import { activeLineTypeButton } from '../../webview/cm/ui/lineTypeToolbar';

/**
 * Unit tests for `activeLineTypeButton` (`src/webview/cm/ui/lineTypeToolbar.ts`)
 * — the pure "which line-type toolbar button is active" query, the CM6
 * counterpart of the old `updateLineTypeToolbarState`. No `EditorView`/DOM:
 * run against a plain `EditorState`. The DOM button-building/event-wiring
 * half of the module is intentionally left untested here.
 */
function stateFor(doc: string, cursorPos: number): EditorState {
    return EditorState.create({ doc, selection: EditorSelection.cursor(cursorPos) });
}

describe('cm/ui/lineTypeToolbar: activeLineTypeButton', () => {
    it('is paragraph for plain text', () => {
        assert.strictEqual(activeLineTypeButton(stateFor('hello world', 3)), 'paragraph');
    });

    it('is h2 on a heading line', () => {
        assert.strictEqual(activeLineTypeButton(stateFor('## Heading', 3)), 'h2');
    });

    it('is ul on a bullet list line', () => {
        assert.strictEqual(activeLineTypeButton(stateFor('- item', 2)), 'ul');
    });

    it('is task on a task list line', () => {
        assert.strictEqual(activeLineTypeButton(stateFor('- [ ] item', 2)), 'task');
    });

    it('is quote on a blockquote line', () => {
        assert.strictEqual(activeLineTypeButton(stateFor('> quoted', 2)), 'quote');
    });

    it('maps an alert line to quote (no dedicated alert button)', () => {
        assert.strictEqual(activeLineTypeButton(stateFor('> [!NOTE]\nBody', 3)), 'quote');
    });

    it('tracks the line the cursor is currently on in a multi-line document', () => {
        const doc = 'plain\n# heading\n- list';
        assert.strictEqual(activeLineTypeButton(stateFor(doc, doc.indexOf('heading'))), 'h1');
        assert.strictEqual(activeLineTypeButton(stateFor(doc, doc.indexOf('list'))), 'ul');
    });
});
