import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * The experimental `replaceTextEditors` setting against a real workbench:
 * which tabs end up open. What the webview then selects is covered by the
 * `selectionRangeFromTextSelection` unit tests; rendering needs a manual pass.
 */

const settingSection = 'markdown.beautifulEditor.experimental.replaceTextEditors';
const viewType = 'markdown.beautifulEditor';

type TabKind = 'custom' | 'text' | 'diff' | 'other';

function tabKind(tab: vscode.Tab): TabKind {
    if (tab.input instanceof vscode.TabInputCustom && tab.input.viewType === viewType) {
        return 'custom';
    }
    if (tab.input instanceof vscode.TabInputText) {
        return 'text';
    }
    if (tab.input instanceof vscode.TabInputTextDiff) {
        return 'diff';
    }
    return 'other';
}

function openTabKinds(): TabKind[] {
    return vscode.window.tabGroups.all.flatMap(group => group.tabs.map(tabKind));
}

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
    const start = Date.now();
    while (!condition()) {
        if (Date.now() - start > timeoutMs) {
            throw new Error(`Timed out; open tabs: ${JSON.stringify(openTabKinds())}`);
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

/** Long enough for a redirect that should not happen to have happened. */
function settle(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 800));
}

suite('Replace text editors (experimental)', () => {
    const tempDir = path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? __dirname, '.test-temp-redirect');
    const content = Array.from({ length: 40 }, (_, i) => (i === 20 ? 'line 20 bneedle here' : `filler line ${i}`)).join('\n');
    const matchSelection = new vscode.Range(20, 8, 20, 15);

    function createFile(name: string): vscode.Uri {
        fs.mkdirSync(tempDir, { recursive: true });
        const file = path.join(tempDir, name);
        fs.writeFileSync(file, content);
        return vscode.Uri.file(file);
    }

    async function setEnabled(enabled: boolean | undefined): Promise<void> {
        await vscode.workspace.getConfiguration().update(settingSection, enabled, vscode.ConfigurationTarget.Global);
    }

    setup(async () => {
        await setEnabled(true);
    });

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    suiteTeardown(async () => {
        await setEnabled(undefined);
    });

    test('a text editor opened at a selection is replaced by this editor', async () => {
        const uri = createFile('selection.md');
        await vscode.commands.executeCommand('vscode.open', uri, { selection: matchSelection, preview: true });
        await waitFor(() => openTabKinds().join() === 'custom');
    });

    test('a text editor opened without a selection is replaced too', async () => {
        const uri = createFile('plain.md');
        await vscode.commands.executeCommand('vscode.open', uri);
        await waitFor(() => openTabKinds().join() === 'custom');
    });

    test('opening at a selection while this editor is already open reuses it', async () => {
        const uri = createFile('already-open.md');
        await vscode.commands.executeCommand('vscode.openWith', uri, viewType, { preview: false });
        await waitFor(() => openTabKinds().join() === 'custom');
        await vscode.commands.executeCommand('vscode.open', uri, { selection: matchSelection });
        await settle();
        assert.deepStrictEqual(openTabKinds(), ['custom']);
    });

    test('Open as Text keeps the text editor', async () => {
        const uri = createFile('open-as-text.md');
        await vscode.commands.executeCommand('vscode.openWith', uri, viewType, { preview: false });
        await waitFor(() => openTabKinds().join() === 'custom');
        await vscode.commands.executeCommand('markdown.beautifulEditor.openAsText');
        await settle();
        assert.deepStrictEqual(openTabKinds(), ['text']);
    });

    test('Reopen Editor With Text Editor on a pinned tab keeps the text editor', async () => {
        const uri = createFile('reopen.md');
        await vscode.commands.executeCommand('vscode.openWith', uri, viewType, { preview: false });
        await waitFor(() => openTabKinds().join() === 'custom');
        await vscode.commands.executeCommand('workbench.action.reopenTextEditor');
        await settle();
        assert.deepStrictEqual(openTabKinds(), ['text']);
    });

    // Closing a dirty text tab raises a save prompt; in this harness it is
    // answered "Don't Save", which silently reverted the edit.
    test('a dirty document is shown in this editor and its text tab kept, unsaved edits intact', async () => {
        const uri = createFile('dirty.md');
        const document = await vscode.workspace.openTextDocument(uri);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(uri, new vscode.Position(0, 0), 'edited ');
        await vscode.workspace.applyEdit(edit);

        await vscode.commands.executeCommand('vscode.open', uri, { selection: matchSelection });
        await waitFor(() => {
            const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
            return activeTab !== undefined && tabKind(activeTab) === 'custom';
        });
        await settle();
        assert.deepStrictEqual(openTabKinds().sort(), ['custom', 'text']);
        assert.ok(document.isDirty);
        assert.ok(document.getText().startsWith('edited '));
        await document.save();
    });

    test('a diff editor is left alone', async () => {
        const left = createFile('left.md');
        const right = createFile('right.md');
        await vscode.commands.executeCommand('vscode.diff', left, right, 'left ↔ right');
        await settle();
        assert.deepStrictEqual(openTabKinds(), ['diff']);
    });

    test('nothing is replaced while the setting is off', async () => {
        await setEnabled(false);
        const uri = createFile('disabled.md');
        await vscode.commands.executeCommand('vscode.open', uri, { selection: matchSelection });
        await settle();
        assert.deepStrictEqual(openTabKinds(), ['text']);
    });
});
