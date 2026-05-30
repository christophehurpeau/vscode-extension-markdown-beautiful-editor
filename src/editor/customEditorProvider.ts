import * as vscode from 'vscode';
import * as path from 'path';
import { getWebviewContent } from './webviewContent';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../shared/messages';
import { parseLinkTarget } from '../shared/links';

/** Minimal shape of a git Repository from the built-in `vscode.git` API. */
interface GitRepositoryLike {
    rootUri: vscode.Uri;
    state: { onDidChange: vscode.Event<void> };
}

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
    private activeWebviewPanels = new Map<string, vscode.WebviewPanel>();
    /** Heading slug to scroll to once a freshly-opened editor signals `ready`, keyed by document URI string. */
    private pendingAnchors = new Map<string, string>();
    /** View type id registered for this custom editor (see extension.ts). */
    private static readonly VIEW_TYPE = 'markdown.beautifulEditor';

    constructor(private readonly context: vscode.ExtensionContext) {}

    /** Post a typed message to a webview. */
    private post(panel: vscode.WebviewPanel, message: HostToWebviewMessage): void {
        panel.webview.postMessage(message);
    }

    /**
     * Get the original version of a file from git for diff comparison
     */
    private async getOriginalContent(uri: vscode.Uri): Promise<string | null> {
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (!gitExtension) {
                return null;
            }

            const git = gitExtension.exports;
            const api = git.getAPI(1);

            if (!api || api.repositories.length === 0) {
                return null;
            }

            // Find the repository containing this file
            let repository = null;
            for (const repo of api.repositories) {
                if (uri.fsPath.startsWith(repo.rootUri.fsPath)) {
                    repository = repo;
                    break;
                }
            }

            if (!repository) {
                return null;
            }

            // Get the relative path from repo root
            const relativePath = path.relative(repository.rootUri.fsPath, uri.fsPath);

            // Get the HEAD version
            const headCommit = await repository.getCommit('HEAD');
            const content = await repository.show(headCommit.hash, relativePath);

            return content;
        } catch (error) {
            console.log('Could not get original content:', error);
            return null;
        }
    }

    /**
     * Check if diff is available for this file (file is in git and has changes)
     */
    private async isDiffAvailable(uri: vscode.Uri): Promise<boolean> {
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (!gitExtension) {
                console.log('Git extension not found');
                return false;
            }

            const git = gitExtension.exports;
            const api = git.getAPI(1);

            if (!api || api.repositories.length === 0) {
                console.log('No git repositories found');
                return false;
            }

            // Find the repository containing this file
            let repository = null;
            for (const repo of api.repositories) {
                if (uri.fsPath.startsWith(repo.rootUri.fsPath)) {
                    repository = repo;
                    break;
                }
            }

            if (!repository) {
                console.log('File not in any git repository');
                return false;
            }

            // Get the original content from HEAD
            const originalContent = await this.getOriginalContent(uri);
            if (!originalContent) {
                console.log('Could not get original content from HEAD - file might be new or untracked');
                return false;
            }

            // Get current content
            const document = await vscode.workspace.openTextDocument(uri);
            const currentContent = document.getText();

            // Check if there are differences
            const hasDiff = originalContent !== currentContent;
            console.log('Diff available:', hasDiff, 'for file:', uri.fsPath);
            return hasDiff;
        } catch (error) {
            console.log('Could not check diff availability:', error);
            return false;
        }
    }

    public async toggleDiffMode(documentUri: vscode.Uri): Promise<void> {
        const uriString = documentUri.toString();
        const webviewPanel = this.activeWebviewPanels.get(uriString);

        if (!webviewPanel) {
            vscode.window.showErrorMessage('No active Markdown Beautiful Editor for this file');
            return;
        }

        // Get the original content from git
        const originalContent = await this.getOriginalContent(documentUri);

        if (!originalContent) {
            vscode.window.showErrorMessage('Could not get git HEAD version of this file');
            return;
        }

        // Toggle diff mode by sending a message to the webview
        this.post(webviewPanel, {
            type: 'toggleDiff',
            originalVersionContent: originalContent
        });
    }

    /**
     * Open a link clicked in the webview. Web URLs and `mailto:` open externally;
     * relative/absolute file paths open inside VS Code. A `#fragment` on a
     * markdown target scrolls that editor to the matching heading — revealing an
     * already-open editor, or stashing the slug so it scrolls once the freshly
     * opened editor signals `ready`.
     *
     * Pure `#fragment` links (same-document anchors) are handled in the webview
     * and never reach here.
     */
    private async openLink(url: string, documentDirPath: string): Promise<void> {
        try {
            // Web URLs and mail links open externally.
            if (/^(https?:|mailto:)/i.test(url)) {
                vscode.env.openExternal(vscode.Uri.parse(url));
                return;
            }
            // Already-resolved webview URIs (images) are not navigable.
            if (url.startsWith('vscode-webview://')) {
                return;
            }

            const { path: pathPart, fragment } = parseLinkTarget(url);

            // Defensive: a pure `#fragment` should have been handled in the webview.
            if (pathPart === '') {
                return;
            }

            const resolvedPath = path.isAbsolute(pathPart)
                ? pathPart
                : path.resolve(documentDirPath, pathPart);
            const fileUri = vscode.Uri.file(resolvedPath);

            // Make sure the target exists before trying to open it.
            try {
                await vscode.workspace.fs.stat(fileUri);
            } catch {
                vscode.window.showErrorMessage(`File not found: ${pathPart} (resolved to ${resolvedPath})`);
                return;
            }

            if (pathPart.toLowerCase().endsWith('.md')) {
                await this.openMarkdownAtAnchor(fileUri, fragment);
            } else {
                // Text files open in an editor tab, images in the image viewer, etc.
                await vscode.commands.executeCommand('vscode.open', fileUri);
            }
        } catch (e) {
            console.error('Failed to open link:', url, e);
        }
    }

    /**
     * Open a markdown file in the beautiful editor and scroll to a heading slug.
     * If the file is already open, reveal it and scroll immediately; otherwise
     * stash the slug for {@link pendingAnchors} so it scrolls once the new
     * editor's webview is ready.
     */
    private async openMarkdownAtAnchor(fileUri: vscode.Uri, fragment: string): Promise<void> {
        const targetKey = fileUri.toString();
        const existingPanel = this.activeWebviewPanels.get(targetKey);

        if (existingPanel) {
            existingPanel.reveal();
            if (fragment) {
                this.post(existingPanel, { type: 'scrollToAnchor', slug: fragment });
            }
            return;
        }

        if (fragment) {
            this.pendingAnchors.set(targetKey, fragment);
        }
        await vscode.commands.executeCommand('vscode.openWith', fileUri, MarkdownEditorProvider.VIEW_TYPE);
    }

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Register this webview panel for command access
        const uriString = document.uri.toString();
        this.activeWebviewPanels.set(uriString, webviewPanel);

        // Custom editors cannot detect git diff context automatically
        // Always start in normal editor mode
        const isDiffMode = false;
        const originalContent: string | null = null;

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
                /!\[([^\]]*)\]\(([^)\s'"]+)(\s+['"][^'"]*['"])?\)/g,
                (match, alt, imagePath, title = '') => {
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
                        return `![${alt}](${webviewImageUri.toString()}${title})`;
                    } catch (e) {
                        console.error('Markdown WYSIWYG: Failed to process image path:', imagePath, e);
                        return match;
                    }
                }
            );
        };

        // Send initial document content
        const sendDocument = async () => {
            lastKnownContent = document.getText();
            const processedContent = processImagePaths(lastKnownContent);

            // Check if diff is available (file in git with changes)
            const diffAvailable = await this.isDiffAvailable(document.uri);

            if (isDiffMode && originalContent) {
                // Send both original and current content for diff view
                this.post(webviewPanel, {
                    type: 'init',
                    content: processedContent,
                    originalContent: lastKnownContent,
                    diffMode: true,
                    originalVersionContent: processImagePaths(originalContent),
                    diffAvailable
                });
            } else {
                // Normal editor mode
                this.post(webviewPanel, {
                    type: 'init',
                    content: processedContent,
                    originalContent: lastKnownContent,
                    diffMode: false,
                    diffAvailable
                });
            }
        };

        // Function to update diff availability in the webview
        const updateDiffAvailability = async () => {
            const diffAvailable = await this.isDiffAvailable(document.uri);
            const currentContent = document.getText();
            const processedContent = processImagePaths(currentContent);

            this.post(webviewPanel, {
                type: 'update',
                content: processedContent,
                originalContent: currentContent,
                diffAvailable
            });
        };

        // Handle messages from webview
        const messageHandler = webviewPanel.webview.onDidReceiveMessage(async (message: WebviewToHostMessage) => {
            switch (message.type) {
                case 'ready':
                    // Webview is ready, send initial content
                    await sendDocument();
                    // If this editor was opened to navigate to an anchor, scroll
                    // to it now that the content has been sent and rendered.
                    {
                        const pendingSlug = this.pendingAnchors.get(uriString);
                        if (pendingSlug) {
                            this.pendingAnchors.delete(uriString);
                            this.post(webviewPanel, { type: 'scrollToAnchor', slug: pendingSlug });
                        }
                    }
                    break;
                case 'requestDiffToggle':
                    // Handle diff toggle request from webview button
                    await this.toggleDiffMode(document.uri);
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
                        this.post(webviewPanel, {
                            type: 'imageResolved',
                            originalPath: message.path,
                            resolvedUri: webviewImageUri.toString()
                        });
                    } catch {
                        // Ignore resolution errors
                    }
                    break;
                case 'openLink':
                    await this.openLink(message.url, documentDirPath);
                    break;
            }
        });

        // Set up git repository event listeners
        const setupGitListeners = async () => {
            try {
                const gitExtension = vscode.extensions.getExtension('vscode.git');
                if (!gitExtension) {
                    return;
                }

                // Activate the git extension if not already activated
                const git = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
                const api = git.getAPI(1);

                if (!api) {
                    return;
                }

                // Listen for git state changes (when git extension initializes)
                const gitStateHandler = api.onDidChangeState(async () => {
                    await updateDiffAvailability();
                });

                // Listen for repository changes (commits, checkouts, etc.)
                const gitRepoHandlers: vscode.Disposable[] = [];
                for (const repo of api.repositories) {
                    if (document.uri.fsPath.startsWith(repo.rootUri.fsPath)) {
                        // Listen to repository state changes
                        const stateHandler = repo.state.onDidChange(async () => {
                            await updateDiffAvailability();
                        });
                        gitRepoHandlers.push(stateHandler);
                    }
                }

                // Listen for new repositories being opened
                const openRepoHandler = api.onDidOpenRepository(async (repo: GitRepositoryLike) => {
                    if (document.uri.fsPath.startsWith(repo.rootUri.fsPath)) {
                        await updateDiffAvailability();

                        // Also listen to this new repository's state changes
                        const stateHandler = repo.state.onDidChange(async () => {
                            await updateDiffAvailability();
                        });
                        gitRepoHandlers.push(stateHandler);
                    }
                });

                // Clean up git handlers on dispose
                webviewPanel.onDidDispose(() => {
                    gitStateHandler.dispose();
                    openRepoHandler.dispose();
                    gitRepoHandlers.forEach(h => h.dispose());
                });
            } catch (error) {
                // Git extension not available or failed to activate - silently continue
                console.log('Could not set up git listeners:', error);
            }
        };

        // Set up git listeners asynchronously (don't block webview setup)
        setupGitListeners();

        // Watch for external document changes (e.g., from other editors, source control)
        const changeHandler = vscode.workspace.onDidChangeTextDocument(async (e) => {
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

            // Check if diff is available with the new content
            const diffAvailable = await this.isDiffAvailable(document.uri);

            this.post(webviewPanel, {
                type: 'update',
                content: processedContent,
                originalContent: currentContent,
                diffAvailable
            });
        });

        // Track previous active state to detect tab switches
        let wasActive = webviewPanel.active;
        
        // Notify webview when panel becomes active (tab switch)
        const viewStateHandler = webviewPanel.onDidChangeViewState((e) => {
            const isNowActive = e.webviewPanel.active;
            
            // Only send focus when transitioning from inactive to active
            if (isNowActive && !wasActive) {
                this.post(webviewPanel, { type: 'focus' });
            }
            
            wasActive = isNowActive;
        });

        webviewPanel.onDidDispose(() => {
            messageHandler.dispose();
            changeHandler.dispose();
            viewStateHandler.dispose();
            // Remove from active panels map
            this.activeWebviewPanels.delete(uriString);
        });
    }
}
