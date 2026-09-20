import * as assert from 'assert';
import { EditorSelection, EditorState, type StateCommand } from '@codemirror/state';
import { getLineTypeAtCursor, setLineType } from '../../webview/cm/commands/lineType';

/**
 * Unit tests for the CM6 line-type `StateCommand` and cursor query
 * (`src/webview/cm/commands/lineType.ts`) — the thin CM6 layer over the pure
 * `stripLinePrefix`/`applyLinePrefix`/`getLineType` transforms (already
 * covered by `lineTypes.test.ts`). No `EditorView`/DOM: run the
 * `StateCommand` directly against a plain `EditorState`.
 */
function stateFor(doc: string, cursorPos: number): EditorState {
    return EditorState.create({ doc, selection: EditorSelection.cursor(cursorPos) });
}

/** `allowMultipleSelections` is not on by default — without it CM6 silently
 *  reduces the selection to its main range (`asSingle`), and every assertion
 *  below would pass for a single cursor. */
function multiCursorStateFor(doc: string, cursorPositions: number[]): EditorState {
    return EditorState.create({
        doc,
        selection: EditorSelection.create(cursorPositions.map((pos) => EditorSelection.cursor(pos))),
        extensions: [EditorState.allowMultipleSelections.of(true)],
    });
}

function run(cmd: StateCommand, state: EditorState): { ran: boolean; state: EditorState } {
    let resultState = state;
    const ran = cmd({ state, dispatch: (tr) => { resultState = tr.state; } });
    return { ran, state: resultState };
}

describe('cm/commands/lineType: setLineType', () => {
    it('applies a heading to a plain paragraph line', () => {
        const { ran, state } = run(setLineType('h1'), stateFor('hello world', 3));
        assert.strictEqual(ran, true);
        assert.strictEqual(state.doc.toString(), '# hello world');
        assert.strictEqual(state.selection.main.head, 0);
    });

    it('applies a bullet list', () => {
        const { state } = run(setLineType('ul'), stateFor('item', 0));
        assert.strictEqual(state.doc.toString(), '- item');
    });

    it('applies an ordered list', () => {
        const { state } = run(setLineType('ol'), stateFor('item', 0));
        assert.strictEqual(state.doc.toString(), '1. item');
    });

    it('applies a task list', () => {
        const { state } = run(setLineType('task'), stateFor('item', 0));
        assert.strictEqual(state.doc.toString(), '- [ ] item');
    });

    it('applies a quote', () => {
        const { state } = run(setLineType('quote'), stateFor('item', 0));
        assert.strictEqual(state.doc.toString(), '> item');
    });

    it('applies a horizontal rule, discarding line content', () => {
        const { state } = run(setLineType('hr'), stateFor('item', 0));
        assert.strictEqual(state.doc.toString(), '---');
    });

    it('applies a code block', () => {
        const { state } = run(setLineType('code'), stateFor('item', 0));
        assert.strictEqual(state.doc.toString(), '```\nitem\n```');
    });

    it('switches from one line type to another (heading -> quote)', () => {
        const { state } = run(setLineType('quote'), stateFor('# hello', 3));
        assert.strictEqual(state.doc.toString(), '> hello');
    });

    it('toggles a line type off back to paragraph', () => {
        const { ran, state } = run(setLineType('paragraph'), stateFor('# hello world', 3));
        assert.strictEqual(ran, true);
        assert.strictEqual(state.doc.toString(), 'hello world');
    });

    it('is a no-op when the line is already that type', () => {
        const { ran, state } = run(setLineType('paragraph'), stateFor('hello world', 3));
        assert.strictEqual(ran, false);
        assert.strictEqual(state.doc.toString(), 'hello world');
    });

    it('only changes the line the cursor is on, in a multi-line document', () => {
        const doc = 'first\nsecond\nthird';
        const cursorPos = doc.indexOf('second') + 2;
        const { state } = run(setLineType('h2'), stateFor(doc, cursorPos));
        assert.strictEqual(state.doc.toString(), 'first\n## second\nthird');
    });
});

describe('cm/commands/lineType: setLineType with multiple cursors', () => {
    it('rewrites one line per cursor', () => {
        const doc = 'first\nsecond\nthird';
        const state = multiCursorStateFor(doc, [1, doc.indexOf('third') + 1]);
        const { ran, state: result } = run(setLineType('h2'), state);
        assert.strictEqual(ran, true);
        assert.strictEqual(result.doc.toString(), '## first\nsecond\n## third');
    });

    it('leaves one cursor at the start of each rewritten line', () => {
        const doc = 'first\nsecond\nthird';
        const state = multiCursorStateFor(doc, [1, doc.indexOf('third') + 1]);
        const { state: result } = run(setLineType('ul'), state);
        assert.deepStrictEqual(result.selection.ranges.map((r) => r.head), [0, '- first\nsecond\n'.length]);
    });

    it('rewrites a line only once when two cursors share it', () => {
        const state = multiCursorStateFor('first\nsecond', [0, 2]);
        const { state: result } = run(setLineType('quote'), state);
        assert.strictEqual(result.doc.toString(), '> first\nsecond');
        assert.strictEqual(result.selection.ranges.length, 1);
    });

    it('skips the cursors whose line is already that type', () => {
        const doc = '# first\nsecond';
        const state = multiCursorStateFor(doc, [2, doc.indexOf('second')]);
        const { ran, state: result } = run(setLineType('h1'), state);
        assert.strictEqual(ran, true);
        assert.strictEqual(result.doc.toString(), '# first\n# second');
    });

    it('is a no-op when no cursor line changes', () => {
        const { ran, state } = run(setLineType('paragraph'), multiCursorStateFor('first\nsecond', [1, 7]));
        assert.strictEqual(ran, false);
        assert.strictEqual(state.doc.toString(), 'first\nsecond');
    });
});

describe('cm/commands/lineType: getLineTypeAtCursor', () => {
    it('classifies the cursor line as a heading', () => {
        const def = getLineTypeAtCursor(stateFor('## Heading', 3));
        assert.strictEqual(def.type, 'h2');
    });

    it('classifies the cursor line as paragraph by default', () => {
        const def = getLineTypeAtCursor(stateFor('plain text', 3));
        assert.strictEqual(def.type, 'paragraph');
    });

    it('classifies an empty blockquote line as a quote, not paragraph', () => {
        const def = getLineTypeAtCursor(stateFor('> ', 1));
        assert.strictEqual(def.type, 'quote');
    });

    it('tracks the line the cursor is currently on', () => {
        const doc = 'plain\n# heading';
        const cursorPos = doc.indexOf('heading') + 1;
        const def = getLineTypeAtCursor(stateFor(doc, cursorPos));
        assert.strictEqual(def.type, 'h1');
    });
});
