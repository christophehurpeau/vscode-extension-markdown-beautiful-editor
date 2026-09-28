import * as vscode from 'vscode';
import type { MarkdownEditorProvider } from './customEditorProvider';
import { postToActiveDiffPanel } from './diffPanel';
import { indentCommandIds, type IndentDirection } from '../shared/indentCommands';

/** Cmd+[ / Cmd+] for the custom editor and the diff panel; see
 *  `src/shared/indentCommands.ts`. */
export function registerIndentCommands(provider: MarkdownEditorProvider): vscode.Disposable {
    const directions: IndentDirection[] = ['more', 'less'];
    return vscode.Disposable.from(
        ...directions.map((direction) =>
            vscode.commands.registerCommand(indentCommandIds[direction], () => {
                provider.postToActivePanel({ type: 'indent', direction });
                postToActiveDiffPanel({ type: 'indent', direction });
            })
        )
    );
}
