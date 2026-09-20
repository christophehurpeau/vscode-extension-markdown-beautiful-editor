import * as vscode from 'vscode';
import * as path from 'path';
import { getWebviewContent } from './webviewContent';
import { createImagePathProcessor, webviewAssetUris, webviewLocalResourceRoots } from './webviewResources';
import { getGitApi, isInRepository, showAtRef, type GitRepositoryLike } from './gitContent';
import { fontFamilySettingSection, getConfiguredFontFamily } from './settings';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../shared/messages';
import { parseLinkTarget } from '../shared/links';

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
    private activeWebviewPanels = new Map<string, vscode.WebviewPanel>();
    /** Heading slug to scroll to once a freshly-opened editor signals `ready`, keyed by document URI string. */
    private pendingAnchors = new Map<string, string>();
    /**
     * Cached git HEAD content per open document (keyed by URI string), the
     * single source both `sendDocument`/the change gutter and `toggleDiffMode`
     * read from. Refreshed only on an actual git state change (see the
     * listeners `setupGitListeners` installs below) or lazily on first use --
     * never on every keystroke.
     *
     * This also fixes docs/TRIAGE.md #5 (`isDiffAvailable` re-ran the whole
     * git-extension lookup on every document change, and `getOriginalContent`
     * duplicated it again): the per-edit path (`changeHandler` below) now
     * only does a string compare against this cache, no git spawn.
     */
    private headContentCache = new Map<string, string | null>();
    /** View type id registered for this custom editor (see extension.ts). */
    private static readonly VIEW_TYPE = 'markdown.beautifulEditor';

    constructor(private readonly context: vscode.ExtensionContext) {}

    /** Post a typed message to a webview. */
    private post(panel: vscode.WebviewPanel, message: HostToWebviewMessage): void {
        panel.webview.postMessage(message);
    }

    /**
     * Refresh {@link headContentCache} for `uri` from git (the one place
     * that actually spawns git for this purpose) and return the new value.
     */
    private async refreshHeadContent(uri: vscode.Uri): Promise<string | null> {
        const content = await showAtRef(uri, 'HEAD');
        this.headContentCache.set(uri.toString(), content);
        return content;
    }

    /** Populate the cache for `uri` if it hasn't been loaded yet. Does not
     *  re-fetch once a value (including `null`) is cached -- only
     *  {@link refreshHeadContent} (driven by a git state change) does that. */
    private async ensureHeadContentLoaded(uri: vscode.Uri): Promise<string | null> {
        const uriString = uri.toString();
        if (this.headContentCache.has(uriString)) {
            return this.headContentCache.get(uriString) ?? null;
        }
        return this.refreshHeadContent(uri);
    }

    private getCachedHeadContent(uri: vscode.Uri): string | null {
        return this.headContentCache.get(uri.toString()) ?? null;
    }

    /**
     * Whether diff is available for this file, purely from the cached HEAD
     * content and the content passed in -- no git call. See
     * {@link headContentCache}'s doc comment (docs/TRIAGE.md #5).
     */
    private computeDiffAvailable(headContent: string | null, currentContent: string): boolean {
        return headContent !== null && headContent !== currentContent;
    }

    public async toggleDiffMode(documentUri: vscode.Uri): Promise<void> {
        const uriString = documentUri.toString();
        const webviewPanel = this.activeWebviewPanels.get(uriString);

        if (!webviewPanel) {
            vscode.window.showErrorMessage('No active Markdown Beautiful Editor for this file');
            return;
        }

        // Reuse the cache rather than a fresh git call; it's kept fresh by
        // the git state listeners set up in resolveCustomTextEditor.
        const originalContent = await this.ensureHeadContentLoaded(documentUri);

        if (originalContent === null) {
            vscode.window.showErrorMessage(
                `Markdown Beautiful Editor: no git HEAD version of ${path.basename(documentUri.fsPath)} — it may be untracked, or not inside a repository.`
            );
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

        // Anything but a `file:` document is one this extension cannot write
        // back to -- in practice a `git:` URI, which is what VS Code hands
        // each pane when this editor is picked for a diff (docs/TRIAGE.md
        // #12). Its `fsPath` is not a real path either, so the git lookup and
        // the image roots below would both be built on nonsense. Render it,
        // read-only, and point at the diff panel instead.
        const isReadOnly = document.uri.scheme !== 'file';

        // Get the document's directory for resolving relative image paths
        const documentDirPath = path.dirname(document.uri.fsPath);

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: webviewLocalResourceRoots({
                extensionUri: this.context.extensionUri,
                documentDirPath,
            }),
        };

        const { scriptUri, styleUri } = webviewAssetUris({
            context: this.context,
            webview: webviewPanel.webview,
        });

        webviewPanel.webview.html = getWebviewContent(webviewPanel.webview, scriptUri, styleUri);

        // Track the last content we sent to the webview or received from it
        // to avoid ping-pong updates
        let lastKnownContent = document.getText();
        let isApplyingEdit = false;

        const processImagePaths = createImagePathProcessor({ webview: webviewPanel.webview, documentDirPath });

        // Send initial document content
        const sendDocument = async () => {
            lastKnownContent = document.getText();
            const processedContent = processImagePaths(lastKnownContent);

            // Loads the cache on first use; a git state change later keeps it
            // fresh via setupGitListeners below (docs/TRIAGE.md #5). Skipped
            // for a read-only document: its `fsPath` names no working-tree
            // file, so the lookup can only fail.
            const headContent = isReadOnly ? null : await this.ensureHeadContentLoaded(document.uri);
            const diffAvailable = this.computeDiffAvailable(headContent, lastKnownContent);

            const fontFamily = getConfiguredFontFamily(document.uri);

            if (isDiffMode && originalContent) {
                // Send both original and current content for diff view
                this.post(webviewPanel, {
                    type: 'init',
                    content: processedContent,
                    originalContent: lastKnownContent,
                    diffMode: true,
                    originalVersionContent: processImagePaths(originalContent),
                    diffAvailable,
                    fontFamily,
                    readOnly: isReadOnly,
                    headContent
                });
            } else {
                // Normal editor mode
                this.post(webviewPanel, {
                    type: 'init',
                    content: processedContent,
                    originalContent: lastKnownContent,
                    diffMode: false,
                    diffAvailable,
                    fontFamily,
                    readOnly: isReadOnly,
                    headContent
                });
            }
        };

        // Pushes an `update` off the CACHED head content -- no git call, just
        // a string compare. Used for ordinary document edits, where the git
        // HEAD hasn't changed at all (docs/TRIAGE.md #5).
        const pushUpdate = () => {
            const currentContent = document.getText();
            const processedContent = processImagePaths(currentContent);
            const headContent = this.getCachedHeadContent(document.uri);
            const diffAvailable = this.computeDiffAvailable(headContent, currentContent);

            this.post(webviewPanel, {
                type: 'update',
                content: processedContent,
                originalContent: currentContent,
                diffAvailable,
                headContent
            });
        };

        // Re-fetches HEAD content from git (an actual git state change --
        // commit, checkout, stage, branch switch) then pushes the result.
        const refreshHeadContentAndPushUpdate = async () => {
            await this.refreshHeadContent(document.uri);
            pushUpdate();
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
                case 'diffSkipped':
                    vscode.window.showInformationMessage(
                        `Markdown Beautiful Editor: ${path.basename(document.uri.fsPath)} has no changes since git HEAD.`
                    );
                    break;
                case 'openBeautifulDiff':
                    await vscode.commands.executeCommand('markdown.beautifulEditor.openDiff', document.uri);
                    break;
                case 'edit':
                    // A read-only document would take a WorkspaceEdit that
                    // silently fails; the webview is non-editable so this
                    // shouldn't arrive, but the guard is what makes that a
                    // fact rather than a hope.
                    if (isReadOnly) {
                        return;
                    }

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
            const api = await getGitApi();
            if (!api) {
                return;
            }

            // Listen for git state changes (when git extension initializes)
            const gitStateHandler = api.onDidChangeState(async () => {
                await refreshHeadContentAndPushUpdate();
            });

            // Listen for repository changes (commits, checkouts, etc.)
            const gitRepoHandlers: vscode.Disposable[] = [];
            for (const repo of api.repositories) {
                if (isInRepository(repo, document.uri)) {
                    // Listen to repository state changes
                    const stateHandler = repo.state.onDidChange(async () => {
                        await refreshHeadContentAndPushUpdate();
                    });
                    gitRepoHandlers.push(stateHandler);
                }
            }

            // Listen for new repositories being opened
            const openRepoHandler = api.onDidOpenRepository(async (repo: GitRepositoryLike) => {
                if (isInRepository(repo, document.uri)) {
                    await refreshHeadContentAndPushUpdate();

                    // Also listen to this new repository's state changes
                    const stateHandler = repo.state.onDidChange(async () => {
                        await refreshHeadContentAndPushUpdate();
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
        };

        // Set up git listeners asynchronously (don't block webview setup).
        // Pointless for a read-only document, whose `fsPath` is in no
        // repository this could match.
        if (!isReadOnly) {
            setupGitListeners();
        }

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

            // External change detected - update the webview. The document's
            // text changed, not git's HEAD, so this reuses the cache
            // (docs/TRIAGE.md #5) rather than re-running the git lookup.
            lastKnownContent = currentContent;
            pushUpdate();
        });

        const configHandler = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(fontFamilySettingSection, document.uri)) {
                this.post(webviewPanel, { type: 'fontFamily', fontFamily: getConfiguredFontFamily(document.uri) });
            }
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
            configHandler.dispose();
            viewStateHandler.dispose();
            // Remove from active panels map
            this.activeWebviewPanels.delete(uriString);
            this.headContentCache.delete(uriString);
        });
    }
}
