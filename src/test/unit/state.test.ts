import * as assert from 'assert';
import { saveState, saveTocPreference, getStoredState, type CursorPosition } from '../../webview/editor/state';

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

    describe('TOC preference', () => {
        it('round-trips the preference on its own', () => {
            const vscode = createFakeVscode();
            saveTocPreference(vscode, 'hidden');
            assert.strictEqual(getStoredState(vscode)?.tocPreference, 'hidden');
        });

        it('survives a later cursor/scroll save', () => {
            const vscode = createFakeVscode();
            saveTocPreference(vscode, 'visible');
            saveState(vscode, { lineIndex: 3, offset: 0 }, 42);

            assert.deepStrictEqual(getStoredState(vscode), {
                cursorPosition: { lineIndex: 3, offset: 0 },
                scrollTop: 42,
                tocPreference: 'visible',
            });
        });

        it('keeps cursor/scroll when the preference changes', () => {
            const vscode = createFakeVscode();
            saveState(vscode, { lineIndex: 5, offset: 2 }, 100);
            saveTocPreference(vscode, 'hidden');

            assert.deepStrictEqual(getStoredState(vscode), {
                cursorPosition: { lineIndex: 5, offset: 2 },
                scrollTop: 100,
                tocPreference: 'hidden',
            });
        });
    });
});
