import * as assert from 'assert';
import { saveState, getStoredState, type CursorPosition } from '../../webview/editor/state';

/**
 * Unit tests for editor state persistence. `state.ts` is decoupled from the
 * real VS Code API via a tiny { setState, getState } interface, so we drive it
 * with an in-memory fake.
 */
describe('Editor State', () => {

    function createFakeVscode() {
        let stored: unknown;
        return {
            setState(state: unknown): void { stored = state; },
            getState(): unknown { return stored; },
        };
    }

    it('returns a falsy value when nothing has been stored', () => {
        const vscode = createFakeVscode();
        assert.ok(!getStoredState(vscode));
    });

    it('round-trips cursor position and scroll offset', () => {
        const vscode = createFakeVscode();
        const cursor: CursorPosition = { lineIndex: 4, offset: 12 };

        saveState(vscode, cursor, 256);
        const restored = getStoredState(vscode);

        assert.deepStrictEqual(restored, { cursorPosition: cursor, scrollTop: 256 });
    });

    it('stores a null cursor position', () => {
        const vscode = createFakeVscode();
        saveState(vscode, null, 0);
        assert.deepStrictEqual(getStoredState(vscode), { cursorPosition: null, scrollTop: 0 });
    });

    it('overwrites previously stored state', () => {
        const vscode = createFakeVscode();
        saveState(vscode, { lineIndex: 1, offset: 1 }, 10);
        saveState(vscode, { lineIndex: 2, offset: 2 }, 20);
        assert.deepStrictEqual(getStoredState(vscode), {
            cursorPosition: { lineIndex: 2, offset: 2 },
            scrollTop: 20,
        });
    });
});
