import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { EditorSelection, EditorState, type StateCommand } from '@codemirror/state';
import { defaultKeymap } from '@codemirror/commands';
import { editingKeymap, indentCommand } from '../../webview/cm/commands/indent';
import { indentCommandIds } from '../../shared/indentCommands';

interface Manifest {
    contributes?: {
        commands?: { command: string }[];
        keybindings?: { command: string; key: string; mac?: string }[];
    };
}

const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8')
) as Manifest;

function run(cmd: StateCommand, state: EditorState): EditorState {
    let resultState = state;
    cmd({ state, dispatch: (tr) => { resultState = tr.state; } });
    return resultState;
}

describe('cm/commands/indent: editingKeymap', () => {
    const keysOf = (bindings: readonly { key?: string }[]) => bindings.map((binding) => binding.key);

    // Guards the filter itself: if CodeMirror renamed these bindings, the
    // filter would silently keep them and a US layout would indent twice.
    it('drops the Mod-[ / Mod-] bindings defaultKeymap ships', () => {
        assert.ok(keysOf(defaultKeymap).includes('Mod-['));
        assert.ok(keysOf(defaultKeymap).includes('Mod-]'));
        assert.ok(!keysOf(editingKeymap).includes('Mod-['));
        assert.ok(!keysOf(editingKeymap).includes('Mod-]'));
    });

    it('keeps the rest of defaultKeymap and historyKeymap', () => {
        assert.strictEqual(editingKeymap.filter((binding) => defaultKeymap.includes(binding)).length, defaultKeymap.length - 2);
        assert.ok(keysOf(editingKeymap).includes('Mod-z'));
    });
});

describe('cm/commands/indent: indentCommand', () => {
    it('indents the cursor line', () => {
        const state = run(indentCommand('more'), EditorState.create({ doc: '- item', selection: EditorSelection.cursor(3) }));
        assert.strictEqual(state.doc.toString(), '  - item');
    });

    it('outdents the cursor line', () => {
        const state = run(indentCommand('less'), EditorState.create({ doc: '  - item', selection: EditorSelection.cursor(5) }));
        assert.strictEqual(state.doc.toString(), '- item');
    });

    it('indents every line a selection touches', () => {
        const doc = '- a\n- b\n- c';
        const state = run(indentCommand('more'), EditorState.create({ doc, selection: EditorSelection.range(1, 5) }));
        assert.strictEqual(state.doc.toString(), '  - a\n  - b\n- c');
    });
});

describe('package.json indent keybindings', () => {
    for (const [direction, key] of [['more', ']'], ['less', '[']] as const) {
        it(`binds Cmd/Ctrl+${key} to ${indentCommandIds[direction]}`, () => {
            const commandId = indentCommandIds[direction];
            const binding = manifest.contributes?.keybindings?.find((entry) => entry.command === commandId);
            assert.deepStrictEqual({ key: binding?.key, mac: binding?.mac }, { key: `ctrl+${key}`, mac: `cmd+${key}` });
            assert.ok(manifest.contributes?.commands?.some((entry) => entry.command === commandId));
        });
    }
});
