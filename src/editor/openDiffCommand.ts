/**
 * Entry point into the diff panel (`diffPanel.ts`): one command behind every
 * way in, resolving the pair of versions from whatever the caller gives it.
 *
 * Each caller is handled on its own terms, and never falls back onto another
 * caller's context:
 *
 * - A **Source Control row** carries its own git status, so the pair comes off
 *   the clicked object (with a `findChange` lookup as backup). It must never
 *   consult the open editors: a click on a file under *Changes* while that
 *   same file's staged diff happens to be the active tab would otherwise
 *   answer with the staged pair, which is exactly the bug this shape removes.
 * - The **diff-editor title bar** passes the diff's own resource. The active
 *   diff tab already holds the exact pair it is showing, one URI per side, so
 *   that is read directly — but only when the tab is about the same file.
 * - The **command palette** passes nothing, so the active tab is all there is.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { openDiffPanel } from './diffPanel';
import { diffSideFromUri, fileUriFromGitUri, findChange } from './gitContent';
import {
    readsOriginalUri,
    resolveDiffSides,
    scmResourceGroupIdFor,
    type DiffSides,
    type GitStatus,
} from '../shared/gitRefs';

export const openDiffCommandId = 'markdown.beautifulEditor.openDiff';

/**
 * The parts of the git extension's `Resource` this reads. `resourceUri` is
 * public `SourceControlResourceState`; `type` and `resourceGroupType` are not
 * in the git extension's `git.d.ts`, so both are treated as optional and
 * `findChange` — which is public API — covers their absence.
 */
interface ScmResourceLike {
    resourceUri: vscode.Uri;
    type?: unknown;
    resourceGroupType?: unknown;
}

interface DiffTarget {
    fileUri: vscode.Uri;
    originalFileUri?: vscode.Uri;
    sides: DiffSides;
}

export async function openDiffForTarget({ context, target }: {
    context: vscode.ExtensionContext;
    target: unknown;
}): Promise<void> {
    const resolved = await resolveDiffTarget(target);

    if (!resolved) {
        vscode.window.showErrorMessage('Markdown Beautiful Editor: no markdown file to diff.');
        return;
    }
    // `scm/resourceState/context` has no resource URI context of its own --
    // VS Code's per-resource overlay carries only `scmResourceState` -- so a
    // `resourceExtname` clause there would filter on whatever editor happens
    // to be active, not on the clicked file. The menu entry is therefore
    // unfiltered and this is where non-markdown is turned away.
    if (!resolved.fileUri.fsPath.toLowerCase().endsWith('.md')) {
        vscode.window.showErrorMessage(
            `Markdown Beautiful Editor: ${path.basename(resolved.fileUri.fsPath)} is not a markdown file.`
        );
        return;
    }

    await openDiffPanel({ context, ...resolved });
}

async function resolveDiffTarget(target: unknown): Promise<DiffTarget | null> {
    const scmResource = asScmResource(target);
    if (scmResource) {
        return fromScmResource(scmResource);
    }

    if (target instanceof vscode.Uri) {
        const fileUri = fileUriFromGitUri(target);
        return fileUri
            ? fromDiffTabFor(fileUri) ?? await fromFileStatus(fileUri)
            : null;
    }

    return fromActiveDiffTab() ?? await fromActiveTab();
}

/** A `SourceControlResourceState`, as opposed to a plain `Uri` or nothing. */
function asScmResource(target: unknown): ScmResourceLike | null {
    if (target instanceof vscode.Uri || typeof target !== 'object' || target === null) {
        return null;
    }
    const { resourceUri } = target as { resourceUri?: unknown };
    return resourceUri instanceof vscode.Uri ? (target as ScmResourceLike) : null;
}

async function fromScmResource(resource: ScmResourceLike): Promise<DiffTarget | null> {
    const fileUri = fileUriFromGitUri(resource.resourceUri);
    if (!fileUri) {
        return null;
    }

    const statusOnResource = typeof resource.type === 'number' ? resource.type as GitStatus : undefined;
    // The lookup is needed when the object did not carry a status, and for a
    // rename either way -- only the public `Change` has `originalUri`.
    const change = statusOnResource === undefined || readsOriginalUri(statusOnResource)
        ? await findChange({ fileUri, scmResourceGroupId: scmResourceGroupIdFor(resource.resourceGroupType) })
        : null;
    const status = statusOnResource ?? (change?.status as GitStatus | undefined);

    return {
        fileUri,
        originalFileUri: readsOriginalUri(status) ? change?.originalUri : undefined,
        sides: resolveDiffSides(status),
    };
}

/** The active diff tab, but only when it is showing `fileUri`. */
function fromDiffTabFor(fileUri: vscode.Uri): DiffTarget | null {
    const target = fromActiveDiffTab();
    return target?.fileUri.toString() === fileUri.toString() ? target : null;
}

function fromActiveDiffTab(): DiffTarget | null {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    if (!(input instanceof vscode.TabInputTextDiff)) {
        return null;
    }

    const fileUri = fileUriFromGitUri(input.modified) ?? fileUriFromGitUri(input.original);
    if (!fileUri) {
        return null;
    }

    return {
        fileUri,
        // Covers a rename for free: the original side keeps its own path.
        originalFileUri: fileUriFromGitUri(input.original) ?? undefined,
        sides: {
            original: diffSideFromUri(input.original),
            modified: diffSideFromUri(input.modified),
        },
    };
}

async function fromActiveTab(): Promise<DiffTarget | null> {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    const uri = input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom
        ? input.uri
        : null;
    const fileUri = uri ? fileUriFromGitUri(uri) : null;

    return fileUri ? fromFileStatus(fileUri) : null;
}

async function fromFileStatus(fileUri: vscode.Uri): Promise<DiffTarget> {
    const change = await findChange({ fileUri });
    const status = change?.status as GitStatus | undefined;

    return {
        fileUri,
        originalFileUri: readsOriginalUri(status) ? change?.originalUri : undefined,
        sides: resolveDiffSides(status),
    };
}
