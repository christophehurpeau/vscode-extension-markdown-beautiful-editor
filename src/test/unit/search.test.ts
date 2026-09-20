import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { markdownExtensions } from '../../webview/cm/extensions';
import { isFindShortcut } from '../../webview/cm/search';

/**
 * Find support is library wiring, so what is worth guarding is that it stays
 * wired: the keymap the editor actually resolves (read off a real
 * `EditorState`, not off the import), the shortcut predicate behind the
 * out-of-editor Cmd+F fallback, and the stylesheet import without which the
 * panel ships with browser-default inputs. None of it needs a DOM.
 */

function boundKeys(state: EditorState): Set<string> {
    return new Set(state.facet(keymap).flatMap((bindings) => bindings.map((binding) => binding.key ?? '')));
}

describe('cm/search: keymap wiring', () => {
    const keys = boundKeys(EditorState.create({ doc: '', extensions: markdownExtensions }));

    it('binds Cmd/Ctrl+F to the search panel', () => {
        assert.ok(keys.has('Mod-f'));
    });

    it('binds find next/previous and close', () => {
        assert.ok(keys.has('Mod-g'));
        assert.ok(keys.has('F3'));
        assert.ok(keys.has('Escape'));
    });

    it('binds Cmd/Ctrl+D to select next occurrence', () => {
        assert.ok(keys.has('Mod-d'));
    });
});

describe('cm/search: isFindShortcut', () => {
    const event = (overrides: Partial<Parameters<typeof isFindShortcut>[0]>) => ({
        key: 'f', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...overrides,
    });

    it('accepts Cmd+F and Ctrl+F', () => {
        assert.strictEqual(isFindShortcut(event({ metaKey: true })), true);
        assert.strictEqual(isFindShortcut(event({ ctrlKey: true })), true);
    });

    it('accepts the uppercase key a modifier can produce', () => {
        assert.strictEqual(isFindShortcut(event({ key: 'F', metaKey: true })), true);
    });

    it('rejects F without a modifier', () => {
        assert.strictEqual(isFindShortcut(event({})), false);
    });

    it('rejects the neighbouring shortcuts that mean something else', () => {
        // Cmd-Alt-f and Cmd-Shift-f mean other things elsewhere (replace,
        // search across files); neither should open plain find here.
        assert.strictEqual(isFindShortcut(event({ metaKey: true, altKey: true })), false);
        assert.strictEqual(isFindShortcut(event({ metaKey: true, shiftKey: true })), false);
        assert.strictEqual(isFindShortcut(event({ key: 'g', metaKey: true })), false);
    });
});

describe('cm/search: stylesheet', () => {
    it('search.css is imported by the stylesheet root', () => {
        const root = fs.readFileSync(path.resolve(__dirname, '../../../src/styles/editor.css'), 'utf8');
        assert.ok(root.includes('@import "search.css"'));
    });
});
