import * as vscode from 'vscode';

export function getWebviewContent(
    webview: vscode.Webview,
    scriptUri: vscode.Uri,
    styleUri: vscode.Uri
): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:;">
    <link href="${styleUri}" rel="stylesheet">
    <title>Markdown Editor</title>
</head>
<body>
    <div class="editor-container">
        <nav class="toc-sidebar" id="toc"></nav>
        <div class="editor-main">
            <div id="editor"></div>
        </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

