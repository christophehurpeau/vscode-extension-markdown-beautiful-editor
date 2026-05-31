import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './editor/customEditorProvider';

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

            if (!uri.fsPath.endsWith('.md')) {
                vscode.window.showErrorMessage('Active file is not a markdown file');
                return;
            }

            await provider.toggleDiffMode(uri);
        })
    );
}

export function deactivate(): void {
    // Cleanup if needed
}
