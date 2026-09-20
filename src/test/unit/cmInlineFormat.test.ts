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
        extensions: [markdown({ base: commonmarkLanguage, extensions: [GFM], completeHTMLTags: false })],
    });
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
});
