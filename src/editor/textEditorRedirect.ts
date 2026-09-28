import * as vscode from 'vscode';
import {
    createRedirectExemptions,
    isRedirectCandidate,
    selectionToReveal,
    type RedirectExemptions,
    type TextSelection,
} from '../shared/textEditorRedirect';
import { markdownEditorViewType } from '../shared/viewTypes';
import type { MarkdownEditorProvider } from './customEditorProvider';

/**
 * Experimental `replaceTextEditors`: swap each markdown text editor for this
 * editor, carrying over the selection it was opened with. See
 * `src/shared/textEditorRedirect.ts` for why a text editor has to open first.
 */

export const replaceTextEditorsSettingSection = 'markdown.beautifulEditor.experimental.replaceTextEditors';
export const openAsTextCommandId = 'markdown.beautifulEditor.openAsText';

// VS Code applies the opening selection in its own event ~2ms after the
// editor becomes visible (measured on 1.139). The wait only bounds the case
// where the caller passed no selection at all.
const selectionWaitMs = 100;
// "Reopen Editor With… > Text Editor" closes this editor and shows the text
// editor within the same few milliseconds.
const reopenAsTextWindowMs = 500;

function isReplaceTextEditorsEnabled(): boolean {
    return vscode.workspace.getConfiguration().get<boolean>(replaceTextEditorsSettingSection, false);
}

function toTextSelection(selection: vscode.Selection): TextSelection {
    return {
        anchor: { line: selection.anchor.line, character: selection.anchor.character },
        active: { line: selection.active.line, character: selection.active.character },
    };
}

function isTextTabFor(tab: vscode.Tab, uri: vscode.Uri): boolean {
    return tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri.toString();
}

function hasTextTab(uri: vscode.Uri): boolean {
    return vscode.window.tabGroups.all.some(group => group.tabs.some(tab => isTextTabFor(tab, uri)));
}

/** The group showing `editor` as a plain text tab. A peek or other embedded
 *  editor has no `viewColumn`; a diff pane's tab is a `TabInputTextDiff`. */
function findTextTabGroup(editor: vscode.TextEditor): vscode.TabGroup | undefined {
    return vscode.window.tabGroups.all.find(
        group => group.viewColumn === editor.viewColumn && group.activeTab !== undefined && isTextTabFor(group.activeTab, editor.document.uri)
    );
}

/** The selection `editor` was opened with. It starts as a caret at the
 *  document start and gets the caller's selection in a follow-up event. */
function waitForOpeningSelection(editor: vscode.TextEditor): Promise<vscode.Selection> {
    if (selectionToReveal(toTextSelection(editor.selection))) {
        return Promise.resolve(editor.selection);
    }
    return new Promise(resolve => {
        const finish = (selection: vscode.Selection): void => {
            clearTimeout(timer);
            listener.dispose();
            resolve(selection);
        };
        const listener = vscode.window.onDidChangeTextEditorSelection(event => {
            if (event.textEditor === editor) {
                finish(event.selections[0]);
            }
        });
        const timer = setTimeout(() => finish(editor.selection), selectionWaitMs);
    });
}

interface RedirectContext {
    provider: MarkdownEditorProvider;
    exemptions: RedirectExemptions;
}

async function redirectTextEditor(editor: vscode.TextEditor, { provider, exemptions }: RedirectContext): Promise<void> {
    const { uri } = editor.document;
    const isCandidate = isRedirectCandidate({
        scheme: uri.scheme,
        path: uri.path,
        isPlainTextTab: findTextTabGroup(editor) !== undefined,
    });
    if (!isCandidate) {
        return;
    }

    const selection = await waitForOpeningSelection(editor);
    // Lets a tab-close event that arrived alongside this editor land first:
    // that is how "Reopen Editor With… > Text Editor" is recognized.
    await new Promise(resolve => setTimeout(resolve, 0));
    if (exemptions.isExempt(uri.toString())) {
        return;
    }
    // Re-read after the wait: the user may have moved on already.
    const group = findTextTabGroup(editor);
    if (!group?.activeTab) {
        return;
    }
    const { viewColumn } = group;

    await provider.openAtSelection(uri, selectionToReveal(toTextSelection(selection)), {
        viewColumn,
        preview: group.activeTab.isPreview,
        // Keeps keyboard navigation in the Search view working. When the
        // text editor itself had focus, closing it below hands focus to
        // this editor anyway.
        preserveFocus: true,
    });

    // Closing a dirty text editor asks to save unless the same editor input is
    // open elsewhere, and this editor is a different input: the user would get
    // a modal whose "Don't Save" reverts their edits. Left in the background.
    if (editor.document.isDirty) {
        return;
    }
    // A preview open replaces the group's preview tab, which is usually the
    // text tab itself, so it may already be gone.
    const leftovers = (vscode.window.tabGroups.all.find(g => g.viewColumn === viewColumn)?.tabs ?? []).filter(tab => isTextTabFor(tab, uri));
    if (leftovers.length > 0) {
        await vscode.window.tabGroups.close(leftovers, true);
    }
}

function trackTabsForExemptions(exemptions: RedirectExemptions): vscode.Disposable {
    return vscode.window.tabGroups.onDidChangeTabs(({ closed }) => {
        for (const tab of closed) {
            if (tab.input instanceof vscode.TabInputCustom && tab.input.viewType === markdownEditorViewType && !tab.isPreview) {
                exemptions.noteCustomEditorClosed(tab.input.uri.toString());
            } else if (tab.input instanceof vscode.TabInputText && !hasTextTab(tab.input.uri)) {
                exemptions.noteTextTabsClosed(tab.input.uri.toString());
            }
        }
    });
}

function isAssociatedAsDefaultEditor(): boolean {
    const associations = vscode.workspace.getConfiguration('workbench').get<Record<string, string>>('editorAssociations') ?? {};
    return Object.values(associations).includes(markdownEditorViewType);
}

/** With this editor as the default, text editors never open, so there is no
 *  selection to recover: the setting silently does nothing. */
function warnIfAssociatedAsDefaultEditor(): void {
    if (!isReplaceTextEditorsEnabled() || !isAssociatedAsDefaultEditor()) {
        return;
    }
    const openSettings = 'Open Settings';
    vscode.window
        .showWarningMessage(
            'Markdown Beautiful Editor: "Replace Text Editors" needs markdown files to open in the text editor. Remove markdown.beautifulEditor from workbench.editorAssociations.',
            openSettings
        )
        .then(choice => {
            if (choice === openSettings) {
                vscode.commands.executeCommand('workbench.action.openSettings', 'workbench.editorAssociations');
            }
        });
}

async function openActiveEditorAsText(exemptions: RedirectExemptions): Promise<void> {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    if (!(input instanceof vscode.TabInputCustom) || input.viewType !== markdownEditorViewType) {
        vscode.window.showErrorMessage('No active Markdown Beautiful Editor');
        return;
    }
    exemptions.exempt(input.uri.toString());
    await vscode.commands.executeCommand('workbench.action.reopenTextEditor');
}

export function registerTextEditorRedirect(provider: MarkdownEditorProvider): vscode.Disposable {
    const exemptions = createRedirectExemptions({ now: Date.now, reopenWindowMs: reopenAsTextWindowMs });
    const seenEditors = new WeakSet<vscode.TextEditor>();

    const redirectNewEditors = (editors: readonly vscode.TextEditor[]): void => {
        if (!isReplaceTextEditorsEnabled()) {
            return;
        }
        for (const editor of editors) {
            if (seenEditors.has(editor)) {
                continue;
            }
            seenEditors.add(editor);
            redirectTextEditor(editor, { provider, exemptions }).catch(error => {
                console.error('[markdown-beautiful-editor] replacing text editor failed:', error);
            });
        }
    };

    warnIfAssociatedAsDefaultEditor();
    // The editor whose markdown document activated the extension is already visible.
    redirectNewEditors(vscode.window.visibleTextEditors);

    return vscode.Disposable.from(
        vscode.window.onDidChangeVisibleTextEditors(redirectNewEditors),
        trackTabsForExemptions(exemptions),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(replaceTextEditorsSettingSection) || event.affectsConfiguration('workbench.editorAssociations')) {
                warnIfAssociatedAsDefaultEditor();
            }
        }),
        vscode.commands.registerCommand(openAsTextCommandId, () => openActiveEditorAsText(exemptions))
    );
}
