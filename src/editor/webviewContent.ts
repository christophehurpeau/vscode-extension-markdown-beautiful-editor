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
    
    <!-- Floating formatting toolbar (appears on text selection) -->
    <div id="formatting-toolbar" class="formatting-toolbar" style="display: none;">
        <button type="button" data-format="bold" title="Bold (⌘B)"><strong>B</strong></button>
        <button type="button" data-format="italic" title="Italic (⌘I)"><em>I</em></button>
        <button type="button" data-format="code" title="Code (⌘E)"><code>&lt;/&gt;</code></button>
        <button type="button" data-format="strikethrough" title="Strikethrough"><s>S</s></button>
        <button type="button" data-format="link" title="Link (⌘K)">🔗</button>
    </div>
    
    <!-- Line type selector (appears on line gutter click) -->
    <!-- Content is generated dynamically from MENU_LINE_TYPES in main.ts -->
    <div id="line-type-menu" class="line-type-menu" style="display: none;"></div>
    
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

