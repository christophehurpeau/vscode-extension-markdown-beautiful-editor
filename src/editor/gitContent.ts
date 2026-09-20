/**
 * The one place this extension talks to the built-in `vscode.git` extension.
 *
 * Content is read through `git:` URIs, which is the same mechanism VS Code's
 * own diff editor uses, so the text matches it exactly (encoding included).
 * `repository.show` is the fallback for when that URI shape — de-facto, not
 * public API — stops holding.
 *
 * The ref decisions themselves are in `src/shared/gitRefs.ts`, kept pure and
 * unit-tested.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import {
    diffSideForRef,
    emptyDiffSide,
    gitRefForSide,
    gitUriQuery,
    workingTreeDiffSide,
    type DiffSide,
} from '../shared/gitRefs';

/** One entry of a repository's change lists. */
export interface GitChangeLike {
    uri: vscode.Uri;
    originalUri: vscode.Uri;
    status: number;
}

/** Minimal shape of a git `Repository` from the built-in `vscode.git` API. */
export interface GitRepositoryLike {
    rootUri: vscode.Uri;
    state: {
        onDidChange: vscode.Event<void>;
        indexChanges: GitChangeLike[];
        workingTreeChanges: GitChangeLike[];
        untrackedChanges: GitChangeLike[];
        mergeChanges: GitChangeLike[];
    };
    show(ref: string, relativePath: string): Promise<string>;
}

/** Minimal shape of the `vscode.git` API at version 1. */
export interface GitApiLike {
    repositories: GitRepositoryLike[];
    onDidChangeState: vscode.Event<unknown>;
    onDidOpenRepository: vscode.Event<GitRepositoryLike>;
}

/**
 * Activates the git extension if it hasn't been already. The previous callers
 * read `.exports` directly, which is `undefined` until activation — so a
 * lookup that ran early silently behaved as "not a git repository".
 */
export async function getGitApi(): Promise<GitApiLike | null> {
    const extension = vscode.extensions.getExtension('vscode.git');
    if (!extension) {
        return null;
    }
    try {
        const exports = extension.isActive ? extension.exports : await extension.activate();
        return exports?.getAPI(1) ?? null;
    } catch (error) {
        console.log('Markdown Beautiful Editor: git extension unavailable', error);
        return null;
    }
}

/** Path containment, not a bare `startsWith`: `/repo` must not claim
 *  `/repository/notes.md`. */
export function isInRepository(repository: GitRepositoryLike, uri: vscode.Uri): boolean {
    const root = repository.rootUri.fsPath;
    const prefix = root.endsWith(path.sep) ? root : root + path.sep;
    return uri.fsPath === root || uri.fsPath.startsWith(prefix);
}

export async function findRepository(uri: vscode.Uri): Promise<GitRepositoryLike | null> {
    const api = await getGitApi();
    return api?.repositories.find((repository) => isInRepository(repository, uri)) ?? null;
}

/** `git show <ref>:<path>` via the git extension. `null` when the file isn't
 *  in a repository or has no version at `ref`. */
export async function showAtRef(uri: vscode.Uri, ref: string): Promise<string | null> {
    const repository = await findRepository(uri);
    if (!repository) {
        return null;
    }
    try {
        return await repository.show(ref, path.relative(repository.rootUri.fsPath, uri.fsPath));
    } catch (error) {
        console.log(`Markdown Beautiful Editor: no version of ${uri.fsPath} at "${ref}"`, error);
        return null;
    }
}

/**
 * The file's entry in its Source Control group, which carries the git status
 * the ref mapping keys off (see `resolveDiffSides`). A file can sit in two
 * groups at once with a different status in each — staged and then edited
 * again — so the group the user clicked in decides which list is searched.
 *
 * Without a group (the command palette, the diff-editor title bar) the working
 * tree comes first, matching what those entry points are looking at.
 */
export async function findChange({ fileUri, scmResourceGroupId }: {
    fileUri: vscode.Uri;
    scmResourceGroupId?: string;
}): Promise<GitChangeLike | null> {
    const repository = await findRepository(fileUri);
    if (!repository) {
        return null;
    }

    const { indexChanges, workingTreeChanges, untrackedChanges, mergeChanges } = repository.state;
    const lists: Record<string, GitChangeLike[]> = {
        index: indexChanges,
        workingTree: workingTreeChanges,
        untracked: untrackedChanges,
        merge: mergeChanges,
    };
    const searched = scmResourceGroupId
        ? [lists[scmResourceGroupId] ?? []]
        : [workingTreeChanges, indexChanges, untrackedChanges, mergeChanges];

    const uriString = fileUri.toString();
    for (const changes of searched) {
        const change = changes.find((candidate) => candidate.uri.toString() === uriString);
        if (change) {
            return change;
        }
    }
    return null;
}

export function toGitUri(fileUri: vscode.Uri, ref: string): vscode.Uri {
    return fileUri.with({
        scheme: 'git',
        path: fileUri.path,
        query: gitUriQuery({ fsPath: fileUri.fsPath, ref }),
    });
}

/**
 * The working-tree file a `git:` URI points at, so an editor opened on one
 * side of a diff can still name the real file. Returns `uri` unchanged when it
 * is already a plain file URI, and `null` when the query is not the shape
 * {@link toGitUri} produces.
 */
export function fileUriFromGitUri(uri: vscode.Uri): vscode.Uri | null {
    if (uri.scheme === 'file') {
        return uri;
    }
    if (uri.scheme !== 'git' || !uri.query) {
        return null;
    }
    try {
        const { path: fsPath } = JSON.parse(uri.query) as { path?: unknown };
        return typeof fsPath === 'string' ? vscode.Uri.file(fsPath) : null;
    } catch {
        return null;
    }
}

/**
 * The version a diff pane's URI names. VS Code's own diff editor already holds
 * the exact pair it is showing — a `git:` URI per side, or a plain file URI for
 * the working tree — so reading them beats inferring the pair from a file's
 * status: the two cannot disagree.
 */
export function diffSideFromUri(uri: vscode.Uri | undefined): DiffSide {
    if (!uri) {
        return emptyDiffSide;
    }
    if (uri.scheme === 'file') {
        return workingTreeDiffSide;
    }
    if (uri.scheme !== 'git' || !uri.query) {
        return emptyDiffSide;
    }
    try {
        const { ref } = JSON.parse(uri.query) as { ref?: unknown };
        return typeof ref === 'string' ? diffSideForRef(ref) : emptyDiffSide;
    } catch {
        return emptyDiffSide;
    }
}

/** Content of one side of a diff. `null` means it could not be read at all. */
export async function readDiffSide({ fileUri, side }: { fileUri: vscode.Uri; side: DiffSide }): Promise<string | null> {
    if (side.kind === 'empty') {
        return '';
    }
    if (side.kind === 'workingTree') {
        try {
            return (await vscode.workspace.openTextDocument(fileUri)).getText();
        } catch (error) {
            console.log(`Markdown Beautiful Editor: could not open ${fileUri.fsPath}`, error);
            return null;
        }
    }

    const ref = gitRefForSide(side);
    if (ref === null) {
        return null;
    }
    try {
        return (await vscode.workspace.openTextDocument(toGitUri(fileUri, ref))).getText();
    } catch (error) {
        console.log(`Markdown Beautiful Editor: git: URI read failed at "${ref}", falling back to repository.show`, error);
        return showAtRef(fileUri, ref);
    }
}
