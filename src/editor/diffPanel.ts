/**
 * Standalone, read-only diff tab.
 *
 * VS Code's finalized custom editor API has no notion of a diff: a
 * `CustomTextEditorProvider` is handed one `TextDocument` per pane and never
 * learns it is one side of a comparison (microsoft/vscode#138525). Picking this
 * editor from "Open With" on a diff therefore yields two unrelated editors side
 * by side. The `customEditorDiffs` proposal would fix that properly but cannot
 * be published to the Marketplace while it stays proposed — see docs/TRIAGE.md
 * #12.
 *
 * So this is a plain `WebviewPanel` driven by our own commands rather than by
 * VS Code's diff machinery. A panel — rather than a second `customEditors`
 * contribution — because it lets us title the tab with the two versions being
 * compared, needs no virtual filesystem, and stays out of the "Open With"
 * picker for ordinary `*.md` files.
 *
 * It renders the same `@codemirror/merge` view the in-editor diff toggle uses
 * (`src/webview/cm/diff/mergeView.ts`), so adopting `customEditorDiffs` later
 * means pointing a new resolve method at the same `initDiff` message.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { getWebviewContent } from './webviewContent';
import { createImagePathProcessor, webviewAssetUris, webviewLocalResourceRoots } from './webviewResources';
import { readDiffSide } from './gitContent';
import { getConfiguredFontFamily } from './settings';
import {
    diffPanelKey,
    diffPanelTitle,
    diffScopeLabel,
    diffSideLabel,
    isModifiedSideWritable,
    parseDiffPanelRestoreState,
    type DiffSides,
} from '../shared/gitRefs';
import { diffPanelViewType } from '../shared/viewTypes';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../shared/messages';

/** Open panels by {@link diffPanelKey}, so asking for the same file at the
 *  same pair of versions reveals the existing tab instead of stacking one. */
const openPanels = new Map<string, vscode.WebviewPanel>();

interface DiffPanelTarget {
    context: vscode.ExtensionContext;
    fileUri: vscode.Uri;
    /** Where the original side is read from when it is a different file — a
     *  rename or copy. Defaults to `fileUri`. */
    originalFileUri?: vscode.Uri;
    sides: DiffSides;
}

export async function openDiffPanel({ context, fileUri, originalFileUri, sides }: DiffPanelTarget): Promise<void> {
    const key = diffPanelKey({ uriString: fileUri.toString(), sides });

    const existing = openPanels.get(key);
    if (existing) {
        existing.reveal();
        // Re-sent rather than left as-is: the working tree or the index may
        // have moved on since the tab was opened. The webview tears down its
        // previous `MergeView` on every `initDiff`.
        await postDiff({ panel: existing, fileUri, originalFileUri, sides });
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        diffPanelViewType,
        diffPanelTitle({ fileName: path.basename(fileUri.fsPath), sides }),
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    registerPanel({ key, panel });
    fillPanel({ context, panel, fileUri, originalFileUri, sides });
}

/**
 * Restores a diff tab after a window reload from the state the webview stashed
 * via `setState` (see the `initDiff` handler in `src/webview/main.ts`).
 */
export function registerDiffPanelSerializer(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerWebviewPanelSerializer(diffPanelViewType, {
        deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown): Thenable<void> {
            const restored = parseDiffPanelRestoreState(state);
            if (!restored) {
                panel.dispose();
                return Promise.resolve();
            }
            const { fileUri: fileUriString, sides } = restored;
            registerPanel({ key: diffPanelKey({ uriString: fileUriString, sides }), panel });
            fillPanel({ context, panel, fileUri: vscode.Uri.parse(fileUriString), sides });
            return Promise.resolve();
        },
    });
}

function registerPanel({ key, panel }: { key: string; panel: vscode.WebviewPanel }): void {
    openPanels.set(key, panel);
    panel.onDidDispose(() => {
        if (openPanels.get(key) === panel) {
            openPanels.delete(key);
        }
    });
}

function fillPanel({ context, panel, fileUri, originalFileUri, sides }: DiffPanelTarget & { panel: vscode.WebviewPanel }): void {
    const documentDirPath = path.dirname(fileUri.fsPath);
    const editable = isModifiedSideWritable(sides);

    // Mirrors the custom editor's own echo suppression
    // (`customEditorProvider.ts`): an `edit` we just applied comes back as a
    // document change, and re-sending the diff for it would tear down the
    // merge view under the user's cursor on every keystroke.
    let isApplyingEdit = false;
    let lastKnownContent: string | null = null;

    panel.webview.options = {
        enableScripts: true,
        localResourceRoots: webviewLocalResourceRoots({ extensionUri: context.extensionUri, documentDirPath }),
    };

    const sendDiff = async (): Promise<void> => {
        lastKnownContent = await postDiff({ panel, fileUri, originalFileUri, sides });
    };

    // Wired before the html is assigned, so the webview's `ready` cannot
    // arrive before there is something listening for it.
    const messageHandler = panel.webview.onDidReceiveMessage(async (message: WebviewToHostMessage) => {
        switch (message.type) {
            case 'ready':
                await sendDiff();
                break;
            case 'edit': {
                // The pane is only built editable when this holds, so this
                // guard is about the message, not the user: nothing reaches
                // the file when the modified side is the index or a commit.
                if (!editable) {
                    return;
                }
                const document = await vscode.workspace.openTextDocument(fileUri);
                if (message.content === document.getText()) {
                    return;
                }
                isApplyingEdit = true;
                lastKnownContent = message.content;
                try {
                    const edit = new vscode.WorkspaceEdit();
                    edit.replace(fileUri, new vscode.Range(0, 0, document.lineCount, 0), message.content);
                    await vscode.workspace.applyEdit(edit);
                } finally {
                    isApplyingEdit = false;
                }
                break;
            }
        }
    });

    // The working-tree side can change under the panel -- an edit in another
    // editor, a branch switch, a stage. Re-sent whole rather than patched:
    // the webview rebuilds its `MergeView` on each `initDiff`, and an
    // external change to the file being diffed is rare enough that losing the
    // cursor is a fair price for not maintaining a second sync protocol.
    const changeHandler = vscode.workspace.onDidChangeTextDocument(async (event) => {
        if (event.document.uri.toString() !== fileUri.toString() || isApplyingEdit) {
            return;
        }
        if (event.document.getText() === lastKnownContent) {
            return;
        }
        await sendDiff();
    });

    panel.onDidDispose(() => {
        messageHandler.dispose();
        changeHandler.dispose();
    });

    const { scriptUri, styleUri } = webviewAssetUris({ context, webview: panel.webview });
    panel.webview.html = getWebviewContent(panel.webview, scriptUri, styleUri, 'diff');
}

/** Returns the modified side's raw text, which the caller keeps as the
 *  baseline for echo suppression; `null` when nothing could be sent. */
async function postDiff({ panel, fileUri, originalFileUri, sides }: {
    panel: vscode.WebviewPanel;
    fileUri: vscode.Uri;
    originalFileUri?: vscode.Uri;
    sides: DiffSides;
}): Promise<string | null> {
    const [original, modified] = await Promise.all([
        readDiffSide({ fileUri: originalFileUri ?? fileUri, side: sides.original }),
        readDiffSide({ fileUri, side: sides.modified }),
    ]);

    if (original === null || modified === null) {
        const missing = diffSideLabel(original === null ? sides.original : sides.modified);
        vscode.window.showErrorMessage(
            `Markdown Beautiful Editor: could not read the "${missing}" version of ${path.basename(fileUri.fsPath)}.`
        );
        return null;
    }

    const processImagePaths = createImagePathProcessor({
        webview: panel.webview,
        documentDirPath: path.dirname(fileUri.fsPath),
    });

    const message: HostToWebviewMessage = {
        type: 'initDiff',
        original: processImagePaths(original),
        modified: processImagePaths(modified),
        originalLabel: diffSideLabel(sides.original),
        modifiedLabel: diffSideLabel(sides.modified),
        scopeLabel: diffScopeLabel(sides),
        editable: isModifiedSideWritable(sides),
        fontFamily: getConfiguredFontFamily(fileUri),
        restoreState: { fileUri: fileUri.toString(), sides },
    };
    panel.webview.postMessage(message);

    return modified;
}
