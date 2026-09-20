import * as assert from 'assert';
import { EditorSelection, EditorState, type StateCommand } from '@codemirror/state';
import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { toggleInlineFormat } from '../../webview/cm/commands/inlineFormat';

/**
 * Unit tests for the CM6 inline-formatting `StateCommand`
 * (`src/webview/cm/commands/inlineFormat.ts`) — the thin CM6 layer over the
 * pure `inlineFormatChange` (already covered by `inlineFormat.test.ts`).
 * These tests exercise selection -> transaction wiring: real selection
 * (wrap/unwrap, selection preserved over the same text), collapsed cursor
 * (old `applyInlineFormat` semantics: act on the enclosing construct,
 * collapse to a cursor at the end), and the TRIAGE #10 two-links case.
 *
 * No `EditorView`/DOM: run the `StateCommand` directly against a plain
 * `EditorState`, capturing the dispatched transaction's resulting state.
 */
function stateFor(doc: string, selection: EditorSelection): EditorState {
    return EditorState.create({
        doc,
        selection,
        extensions: [
            markdown({ base: commonmarkLanguage, extensions: [GFM], completeHTMLTags: false }),
            EditorState.allowMultipleSelections.of(true),
        ],
    });
}

/** `allowMultipleSelections` is not on by default — without it CM6 silently
 *  reduces the selection to its main range (`asSingle`), and every multi-range
 *  assertion below would pass for a single one. */
function multiRangeStateFor(doc: string, ranges: [number, number][]): EditorState {
    return stateFor(doc, EditorSelection.create(ranges.map(([from, to]) => EditorSelection.range(from, to))));
}

function run(cmd: StateCommand, state: EditorState): { ran: boolean; state: EditorState } {
    let resultState = state;
    const ran = cmd({ state, dispatch: (tr) => { resultState = tr.state; } });
    return { ran, state: resultState };
}

describe('cm/commands/inlineFormat: toggleInlineFormat', () => {
    describe('applied to a selection (wrap)', () => {
        it('bold', () => {
            const doc = 'hello world';
            const from = doc.indexOf('world');
            const { ran, state } = run(toggleInlineFormat('bold'), stateFor(doc, EditorSelection.single(from, from + 5)));
            assert.strictEqual(ran, true);
            assert.strictEqual(state.doc.toString(), 'hello **world**');
            assert.strictEqual(state.sliceDoc(state.selection.main.from, state.selection.main.to), 'world');
        });

        it('italic', () => {
            const doc = 'hello world';
            const from = doc.indexOf('world');
            const { state } = run(toggleInlineFormat('italic'), stateFor(doc, EditorSelection.single(from, from + 5)));
            assert.strictEqual(state.doc.toString(), 'hello *world*');
            assert.strictEqual(state.sliceDoc(state.selection.main.from, state.selection.main.to), 'world');
        });

        it('code', () => {
            const doc = 'hello world';
            const from = doc.indexOf('world');
            const { state } = run(toggleInlineFormat('code'), stateFor(doc, EditorSelection.single(from, from + 5)));
            assert.strictEqual(state.doc.toString(), 'hello `world`');
            assert.strictEqual(state.sliceDoc(state.selection.main.from, state.selection.main.to), 'world');
        });

        it('strikethrough', () => {
            const doc = 'hello world';
            const from = doc.indexOf('world');
            const { state } = run(toggleInlineFormat('strikethrough'), stateFor(doc, EditorSelection.single(from, from + 5)));
            assert.strictEqual(state.doc.toString(), 'hello ~~world~~');
            assert.strictEqual(state.sliceDoc(state.selection.main.from, state.selection.main.to), 'world');
        });

        it('link', () => {
            const doc = 'hello world';
            const from = doc.indexOf('world');
            const { state } = run(toggleInlineFormat('link'), stateFor(doc, EditorSelection.single(from, from + 5)));
            assert.strictEqual(state.doc.toString(), 'hello [world](url)');
            assert.strictEqual(state.sliceDoc(state.selection.main.from, state.selection.main.to), 'world');
        });
    });

    describe('toggled OFF when already applied (selection over the bare text)', () => {
        it('bold', () => {
            const doc = 'hello **world**';
            const from = doc.indexOf('world');
            const { state } = run(toggleInlineFormat('bold'), stateFor(doc, EditorSelection.single(from, from + 5)));
            assert.strictEqual(state.doc.toString(), 'hello world');
            assert.strictEqual(state.sliceDoc(state.selection.main.from, state.selection.main.to), 'world');
        });

        it('italic', () => {
            const doc = 'hello *world*';
            const from = doc.indexOf('world');
            const { state } = run(toggleInlineFormat('italic'), stateFor(doc, EditorSelection.single(from, from + 5)));
            assert.strictEqual(state.doc.toString(), 'hello world');
        });

        it('code', () => {
            const doc = 'hello `world`';
            const from = doc.indexOf('world');
            const { state } = run(toggleInlineFormat('code'), stateFor(doc, EditorSelection.single(from, from + 5)));
            assert.strictEqual(state.doc.toString(), 'hello world');
        });

        it('strikethrough', () => {
            const doc = 'hello ~~world~~';
            const from = doc.indexOf('world');
            const { state } = run(toggleInlineFormat('strikethrough'), stateFor(doc, EditorSelection.single(from, from + 5)));
            assert.strictEqual(state.doc.toString(), 'hello world');
        });

        it('link (selection is exactly the link)', () => {
            const doc = 'x [label](https://example.com) y';
            const from = doc.indexOf('[label]');
            const to = doc.indexOf(') y') + 1;
            const { state } = run(toggleInlineFormat('link'), stateFor(doc, EditorSelection.single(from, to)));
            assert.strictEqual(state.doc.toString(), 'x label y');
        });
    });

    describe('collapsed cursor inside a construct (old applyInlineFormat semantics)', () => {
        it('unwraps the enclosing construct and collapses the cursor to its end', () => {
            const doc = 'before **bold** after';
            const cursorPos = doc.indexOf('bold') + 2;
            const { ran, state } = run(toggleInlineFormat('bold'), stateFor(doc, EditorSelection.single(cursorPos)));
            assert.strictEqual(ran, true);
            assert.strictEqual(state.doc.toString(), 'before bold after');
            assert.strictEqual(state.selection.main.empty, true);
            // Cursor lands immediately after "bold" (the unwrapped word ends there).
            assert.strictEqual(state.selection.main.head, 'before bold'.length);
        });

        it('is a no-op when the cursor is not inside any matching construct', () => {
            const doc = 'plain text';
            const { ran, state } = run(toggleInlineFormat('bold'), stateFor(doc, EditorSelection.single(3)));
            assert.strictEqual(ran, false);
            assert.strictEqual(state.doc.toString(), doc);
        });
    });

    describe('TRIAGE #10: link toggle with two links in the selection', () => {
        it('wraps the whole selection as a new link instead of unwrapping either', () => {
            const doc = '[a](b) [c](d)';
            const { ran, state } = run(toggleInlineFormat('link'), stateFor(doc, EditorSelection.single(0, doc.length)));
            assert.strictEqual(ran, true);
            assert.strictEqual(state.doc.toString(), `[${doc}](url)`);
            assert.strictEqual(state.sliceDoc(state.selection.main.from, state.selection.main.to), doc);
        });
    });

    describe('multi-line selection guard', () => {
        it('does nothing when the selection spans more than one line', () => {
            const doc = 'first\nsecond';
            const { ran, state } = run(toggleInlineFormat('bold'), stateFor(doc, EditorSelection.single(2, 8)));
            assert.strictEqual(ran, false);
            assert.strictEqual(state.doc.toString(), doc);
        });
    });

    describe('multiple selection ranges', () => {
        it('wraps every selected range, on the same line and across lines', () => {
            const doc = 'one two\nthree';
            const state = multiRangeStateFor(doc, [[0, 3], [4, 7], [8, 13]]);
            const { ran, state: result } = run(toggleInlineFormat('bold'), state);
            assert.strictEqual(ran, true);
            assert.strictEqual(result.doc.toString(), '**one** **two**\n**three**');
        });

        it('keeps each range covering the same text it started on', () => {
            const doc = 'one two';
            const { state } = run(toggleInlineFormat('italic'), multiRangeStateFor(doc, [[0, 3], [4, 7]]));
            assert.deepStrictEqual(
                state.selection.ranges.map((r) => state.sliceDoc(r.from, r.to)),
                ['one', 'two'],
            );
        });

        it('toggles a shared construct once when two cursors sit inside it', () => {
            const doc = 'before **bold** after';
            const first = doc.indexOf('bold');
            const { ran, state } = run(toggleInlineFormat('bold'), multiRangeStateFor(doc, [[first + 1, first + 1], [first + 3, first + 3]]));
            assert.strictEqual(ran, true);
            assert.strictEqual(state.doc.toString(), 'before bold after');
        });

        it('applies to the ranges that can toggle and leaves the others alone', () => {
            const doc = 'plain text\nsecond line';
            const state = multiRangeStateFor(doc, [[3, 3], [11, 17]]);
            const { ran, state: result } = run(toggleInlineFormat('bold'), state);
            assert.strictEqual(ran, true);
            assert.strictEqual(result.doc.toString(), 'plain text\n**second** line');
        });

        it('is a no-op when no range can toggle', () => {
            const doc = 'plain text';
            const { ran, state } = run(toggleInlineFormat('bold'), multiRangeStateFor(doc, [[3, 3], [7, 7]]));
            assert.strictEqual(ran, false);
            assert.strictEqual(state.doc.toString(), doc);
        });
    });
});
