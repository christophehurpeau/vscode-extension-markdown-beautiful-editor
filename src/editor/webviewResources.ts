/**
 * Webview plumbing shared by the custom editor (`customEditorProvider.ts`) and
 * the standalone diff panel (`diffPanel.ts`): which local files the webview may
 * load, where its script and stylesheet live, and how markdown image paths are
 * rewritten into webview URIs.
 *
 * The markdown-parsing half of that rewrite is pure and lives in
 * `src/shared/imagePaths.ts`; only the URI resolution needs `vscode`.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { rewriteImagePaths } from '../shared/imagePaths';

/**
 * The document's own directory plus two levels up (for `../images/` and
 * `../../` style paths), every workspace folder, and the extension's `dist/`.
 */
export function webviewLocalResourceRoots({ extensionUri, documentDirPath }: {
    extensionUri: vscode.Uri;
    documentDirPath: string;
}): vscode.Uri[] {
    const parentDir = path.dirname(documentDirPath);
    return [
        vscode.Uri.joinPath(extensionUri, 'dist'),
        vscode.Uri.file(documentDirPath),
        vscode.Uri.file(parentDir),
        vscode.Uri.file(path.dirname(parentDir)),
        ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri),
    ];
}

export function webviewAssetUris({ context, webview }: {
    context: vscode.ExtensionContext;
    webview: vscode.Webview;
}): { scriptUri: vscode.Uri; styleUri: vscode.Uri } {
    const asset = (name: string): vscode.Uri => {
        const uri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist', name));
        // In the Extension Development Host the bundles are rebuilt under a
        // reloading window, and a cached stylesheet makes a CSS change look
        // like a change that did not take -- which costs a lot more than the
        // cache saves while iterating. Released builds keep the plain URI, so
        // the cache works normally for users.
        return context.extensionMode === vscode.ExtensionMode.Development
            ? uri.with({ query: `reload=${Date.now()}` })
            : uri;
    };

    return { scriptUri: asset('webview.js'), styleUri: asset('editor.css') };
}

export function createImagePathProcessor({ webview, documentDirPath }: {
    webview: vscode.Webview;
    documentDirPath: string;
}): (markdown: string) => string {
    return (markdown) => rewriteImagePaths(markdown, (imagePath) => {
        try {
            const imageUri = path.isAbsolute(imagePath)
                ? vscode.Uri.file(imagePath)
                : vscode.Uri.file(path.resolve(documentDirPath, imagePath));
            return webview.asWebviewUri(imageUri).toString();
        } catch (error) {
            console.error('Markdown Beautiful Editor: failed to process image path:', imagePath, error);
            return null;
        }
    });
}
