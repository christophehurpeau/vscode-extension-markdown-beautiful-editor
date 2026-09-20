import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './editor/customEditorProvider';
import { registerDiffPanelSerializer } from './editor/diffPanel';
import { openDiffCommandId, openDiffForTarget } from './editor/openDiffCommand';

export function activate(context: vscode.ExtensionContext): void {
    const provider = new MarkdownEditorProvider(context);

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            'markdown.beautifulEditor',
            provider,
            {
                supportsMultipleEditorsPerDocument: false,
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );

    context.subscriptions.push(registerDiffPanelSerializer(context));

    // Register command to open the current markdown file in the Beautiful Editor
    context.subscriptions.push(
        vscode.commands.registerCommand('markdown.beautifulEditor.open', async (uri?: vscode.Uri) => {
            const target = uri ?? vscode.window.activeTextEditor?.document.uri;

            if (!target) {
                vscode.window.showErrorMessage('No active markdown file');
                return;
            }

            await vscode.commands.executeCommand(
                'vscode.openWith',
                target,
                'markdown.beautifulEditor'
            );
        })
    );

    // Diff panel. One command for every entry point -- Source Control menu,
    // diff-editor title bar, command palette, the read-only banner -- because
    // the pairing is read off the clicked resource, not off the menu.
    context.subscriptions.push(
        vscode.commands.registerCommand(openDiffCommandId, (target: unknown) =>
            openDiffForTarget({ context, target })
        )
    );

    // Register toggle diff mode command
    context.subscriptions.push(
        vscode.commands.registerCommand('markdown.beautifulEditor.toggleDiffMode', async () => {
            // Get the active tab/editor
            const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;

            if (!activeTab || !activeTab.input) {
                vscode.window.showErrorMessage('No active editor');
                return;
            }

            // Get the URI from the tab input
            const tabInput = activeTab.input;
            const uri: vscode.Uri | undefined =
                tabInput instanceof vscode.TabInputCustom || tabInput instanceof vscode.TabInputText
                    ? tabInput.uri
                    : undefined;

            if (!uri) {
                vscode.window.showErrorMessage('Could not determine active file');
                return;
            }

            // `fsPath` ends in `.md` for a `git:` URI too, so the scheme check
            // is what actually rules out a diff pane -- which has no working
            // tree to compare against. Its banner offers the diff panel.
            if (uri.scheme !== 'file' || !uri.fsPath.toLowerCase().endsWith('.md')) {
                vscode.window.showErrorMessage('Active file is not a markdown file on disk');
                return;
            }

            await provider.toggleDiffMode(uri);
        })
    );
}

export function deactivate(): void {
    // Cleanup if needed
}
