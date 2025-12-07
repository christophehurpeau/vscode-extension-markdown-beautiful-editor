import * as vscode from 'vscode';
import * as path from 'path';
import { getWebviewContent } from './webviewContent';

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
    constructor(private readonly context: vscode.ExtensionContext) {}

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Get the document's directory for resolving relative image paths
        const documentDirPath = path.dirname(document.uri.fsPath);
        const documentDir = vscode.Uri.file(documentDirPath);
        
        // Get workspace folders for image resolution
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        
        // Build list of allowed resource roots
        const localResourceRoots: vscode.Uri[] = [
            vscode.Uri.joinPath(this.context.extensionUri, 'dist')
        ];

        // Add document directory
        localResourceRoots.push(documentDir);

        // Add parent directory (for ../images/ type paths)
        const parentDir = vscode.Uri.file(path.dirname(documentDirPath));
        localResourceRoots.push(parentDir);
        
        // Add grandparent directory (for ../../ type paths)
        const grandparentDir = vscode.Uri.file(path.dirname(path.dirname(documentDirPath)));
        localResourceRoots.push(grandparentDir);

        // Add all workspace folders
        for (const folder of workspaceFolders) {
            localResourceRoots.push(folder.uri);
        }

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots
        };

        const webviewUri = webviewPanel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
        );
        const styleUri = webviewPanel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'editor.css')
        );

        webviewPanel.webview.html = getWebviewContent(webviewPanel.webview, webviewUri, styleUri);

        // Track the last content we sent to the webview or received from it
        // to avoid ping-pong updates
        let lastKnownContent = document.getText();
        let isApplyingEdit = false;

        // Convert local image paths to webview URIs
        const processImagePaths = (markdown: string): string => {
            // Match markdown image syntax: ![alt](path) or ![alt](path "title") or ![alt](path 'title')
            return markdown.replace(
                /!\[([^\]]*)\]\(([^)\s'"]+)(?:\s+['"][^'"]*['"])?\)/g,
                (match, alt, imagePath) => {
                    // Skip URLs (http, https, data URIs)
                    if (/^(https?:|data:)/i.test(imagePath)) {
                        return match;
                    }
                    
                    // Skip already-converted webview URIs
                    if (imagePath.startsWith('vscode-webview://')) {
                        return match;
                    }
                    
                    try {
                        // Resolve the path relative to the document directory
                        let imageUri: vscode.Uri;
                        if (path.isAbsolute(imagePath)) {
                            imageUri = vscode.Uri.file(imagePath);
                        } else {
                            // Use path.resolve to handle ../ and ./ correctly
                            const resolvedPath = path.resolve(documentDirPath, imagePath);
                            imageUri = vscode.Uri.file(resolvedPath);
                        }
                        
                        // Convert to webview URI
                        const webviewImageUri = webviewPanel.webview.asWebviewUri(imageUri);
                        return `![${alt}](${webviewImageUri.toString()})`;
                    } catch (e) {
                        console.error('Markdown WYSIWYG: Failed to process image path:', imagePath, e);
                        return match;
                    }
                }
            );
        };

        // Send initial document content
        const sendDocument = () => {
            lastKnownContent = document.getText();
            const processedContent = processImagePaths(lastKnownContent);
            webviewPanel.webview.postMessage({
                type: 'init',
                content: processedContent,
                originalContent: lastKnownContent
            });
        };

        // Handle messages from webview
        const messageHandler = webviewPanel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'ready':
                    // Webview is ready, send initial content
                    sendDocument();
                    break;
                case 'edit':
                    // Skip if content hasn't actually changed
                    if (message.content === document.getText()) {
                        return;
                    }
                    
                    // Track that we're applying an edit from the webview
                    isApplyingEdit = true;
                    lastKnownContent = message.content;
                    
                    try {
                        // Apply edit from webview to document
                        const edit = new vscode.WorkspaceEdit();
                        edit.replace(
                            document.uri,
                            new vscode.Range(0, 0, document.lineCount, 0),
                            message.content
                        );
                        await vscode.workspace.applyEdit(edit);
                    } finally {
                        isApplyingEdit = false;
                    }
                    break;
                case 'resolveImage':
                    // Webview requests an image URI resolution
                    try {
                        let imageUri: vscode.Uri;
                        if (path.isAbsolute(message.path)) {
                            imageUri = vscode.Uri.file(message.path);
                        } else {
                            const resolvedPath = path.resolve(documentDirPath, message.path);
                            imageUri = vscode.Uri.file(resolvedPath);
                        }
                        const webviewImageUri = webviewPanel.webview.asWebviewUri(imageUri);
                        webviewPanel.webview.postMessage({
                            type: 'imageResolved',
                            originalPath: message.path,
                            resolvedUri: webviewImageUri.toString()
                        });
                    } catch {
                        // Ignore resolution errors
                    }
                    break;
                case 'openLink':
                    // Open link in browser or handle relative paths
                    try {
                        let url = message.url;
                        
                        // Check if it's a web URL
                        if (/^https?:\/\//i.test(url)) {
                            vscode.env.openExternal(vscode.Uri.parse(url));
                        } else if (url.startsWith('vscode-webview://')) {
                            // It's already a webview URI (for images), skip
                        } else {
                            // It's a relative path - could be a local file
                            const resolvedPath = path.resolve(documentDirPath, url);
                            const fileUri = vscode.Uri.file(resolvedPath);
                            
                            // Check if it's a markdown file to open in editor
                            if (url.endsWith('.md')) {
                                vscode.workspace.openTextDocument(fileUri).then(doc => {
                                    vscode.window.showTextDocument(doc);
                                });
                            } else {
                                // Open with default application
                                vscode.env.openExternal(fileUri);
                            }
                        }
                    } catch (e) {
                        console.error('Failed to open link:', message.url, e);
                    }
                    break;
            }
        });

        // Watch for external document changes (e.g., from other editors, source control)
        const changeHandler = vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.uri.toString() !== document.uri.toString()) {
                return;
            }
            
            // Skip if we're currently applying an edit from the webview
            if (isApplyingEdit) {
                return;
            }
            
            // Skip if content matches what we last sent/received
            const currentContent = document.getText();
            if (currentContent === lastKnownContent) {
                return;
            }
            
            // External change detected - update the webview
            lastKnownContent = currentContent;
            const processedContent = processImagePaths(currentContent);
            webviewPanel.webview.postMessage({
                type: 'update',
                content: processedContent,
                originalContent: currentContent
            });
        });

        // Track previous active state to detect tab switches
        let wasActive = webviewPanel.active;
        
        // Notify webview when panel becomes active (tab switch)
        const viewStateHandler = webviewPanel.onDidChangeViewState((e) => {
            const isNowActive = e.webviewPanel.active;
            
            // Only send focus when transitioning from inactive to active
            if (isNowActive && !wasActive) {
                webviewPanel.webview.postMessage({
                    type: 'focus'
                });
            }
            
            wasActive = isNowActive;
        });

        webviewPanel.onDidDispose(() => {
            messageHandler.dispose();
            changeHandler.dispose();
            viewStateHandler.dispose();
        });
    }
}
