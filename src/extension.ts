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
}

export function deactivate(): void {
    // Cleanup if needed
}
