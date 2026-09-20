/**
 * Which version of a file each side of a diff reads, and how a Source Control
 * resource maps onto that pair.
 *
 * Pure and free of `vscode`/DOM so the mapping stays unit-testable
 * (`src/test/unit/gitRefs.test.ts`); the content reads themselves live in
 * `src/editor/gitContent.ts`.
 */

/**
 * `index` is git's staging area, spelled as the empty ref in the git
 * extension's own `git:` URIs (`git show :path`). `empty` is not a git read at
 * all — it is the left side of an untracked file, which has no prior version.
 */
export type DiffSide =
    | { kind: 'workingTree' }
    | { kind: 'index' }
    | { kind: 'ref'; ref: string }
    | { kind: 'empty' };

export interface DiffSides {
    original: DiffSide;
    modified: DiffSide;
}

/** What a diff panel needs to rebuild itself after a window reload. */
export interface DiffPanelRestoreState {
    fileUri: string;
    sides: DiffSides;
}

const workingTreeSide: DiffSide = { kind: 'workingTree' };
const indexSide: DiffSide = { kind: 'index' };
const headSide: DiffSide = { kind: 'ref', ref: 'HEAD' };
const emptySide: DiffSide = { kind: 'empty' };

/**
 * The built-in git extension's `Status` enum, mirrored here because the real
 * one lives in the git extension's `git.d.ts`, which this bundle does not
 * import. Numbering verified against the shipped extension.
 */
export const gitStatus = {
    indexModified: 0,
    indexAdded: 1,
    indexDeleted: 2,
    indexRenamed: 3,
    indexCopied: 4,
    modified: 5,
    deleted: 6,
    untracked: 7,
    ignored: 8,
    intentToAdd: 9,
    intentToRename: 10,
    typeChanged: 11,
    addedByUs: 12,
    addedByThem: 13,
    deletedByUs: 14,
    deletedByThem: 15,
    bothAdded: 16,
    bothDeleted: 17,
    bothModified: 18,
} as const;

export type GitStatus = (typeof gitStatus)[keyof typeof gitStatus];

/**
 * The git extension's internal `ResourceGroupType`, mirrored for the same
 * reason as `gitStatus`. Numbering verified against the shipped extension
 * (`resourceGroupType === 1` gates unstage/revert, `2`/`3` gate stage/clean,
 * `0` gates the merge-conflict commands).
 */
const scmResourceGroupIdByType: Record<number, string> = {
    0: 'merge',
    1: 'index',
    2: 'workingTree',
    3: 'untracked',
};

export function scmResourceGroupIdFor(resourceGroupType: unknown): string | undefined {
    return typeof resourceGroupType === 'number' ? scmResourceGroupIdByType[resourceGroupType] : undefined;
}

/**
 * The pair of versions VS Code's own diff shows for a Source Control resource.
 *
 * Keyed on the file's git **status**, not on the group it appears under: that
 * is what the git extension's own `getLeftResource`/`getRightResource` switch
 * on, and the group alone cannot tell a staged modify (HEAD ↔ index) from a
 * staged add (nothing ↔ index) or a staged delete (HEAD ↔ nothing). Reading
 * HEAD for a file that was only just added fails outright, so the group-keyed
 * approximation did not merely mislabel those — it produced no diff at all.
 *
 * `index` here stands in for git's own `~` ref ("the index if the file is
 * staged, else HEAD"). The two are always the same bytes: for an unstaged
 * tracked file the index still holds the HEAD version.
 *
 * Conflict statuses and an unknown status fall through to HEAD ↔ working tree:
 * a real conflict needs a three-way view, which this editor does not render.
 */
export function resolveDiffSides(status?: GitStatus): DiffSides {
    switch (status) {
        case gitStatus.indexModified:
        case gitStatus.indexCopied:
        case gitStatus.indexRenamed:
            return { original: headSide, modified: indexSide };
        case gitStatus.indexAdded:
            return { original: emptySide, modified: indexSide };
        case gitStatus.indexDeleted:
        case gitStatus.deleted:
            return { original: headSide, modified: emptySide };
        case gitStatus.modified:
        case gitStatus.typeChanged:
            return { original: indexSide, modified: workingTreeSide };
        case gitStatus.untracked:
        case gitStatus.ignored:
        case gitStatus.intentToAdd:
            return { original: emptySide, modified: workingTreeSide };
        default:
            return { original: headSide, modified: workingTreeSide };
    }
}

/**
 * The side a `git:` URI's ref names. `~` is git's "the index if the file is
 * staged, else HEAD", which is always the same bytes as the index, so both
 * spellings collapse to the same side.
 */
export function diffSideForRef(ref: string): DiffSide {
    return ref === '' || ref === '~' ? indexSide : { kind: 'ref', ref };
}

export const emptyDiffSide: DiffSide = emptySide;
export const workingTreeDiffSide: DiffSide = workingTreeSide;

/**
 * Whether the modified side is a file on disk, and so can be edited and
 * reverted into. The git index and a commit are not: writing either needs
 * `git apply --cached` or a commit, neither of which a `WorkspaceEdit` can do.
 */
export function isModifiedSideWritable({ modified }: DiffSides): boolean {
    return modified.kind === 'workingTree';
}

/** Statuses whose original side is a different file — a rename or copy reads
 *  its previous version from `Change.originalUri`, not the current path. */
export function readsOriginalUri(status?: GitStatus): boolean {
    return status === gitStatus.indexRenamed
        || status === gitStatus.indexCopied
        || status === gitStatus.intentToRename;
}

export function diffSideLabel(side: DiffSide): string {
    switch (side.kind) {
        case 'workingTree':
            return 'Working Tree';
        case 'index':
            return 'Index';
        case 'empty':
            return 'Empty';
        case 'ref':
            return side.ref;
    }
}

/** The git ref a side reads at, or `null` when it is not a git read. */
export function gitRefForSide(side: DiffSide): string | null {
    switch (side.kind) {
        case 'index':
            return '';
        case 'ref':
            return side.ref;
        default:
            return null;
    }
}

/**
 * Query string of a `git:` URI as the built-in git extension's own `toGitUri`
 * builds it. Verified against the shipped extension bundle
 * (`{path:i.fsPath,ref:e}`), but de-facto rather than public API — which is
 * why `gitContent.ts` keeps a `repository.show` fallback.
 */
export function gitUriQuery({ fsPath, ref }: { fsPath: string; ref: string }): string {
    return JSON.stringify({ path: fsPath, ref });
}

/**
 * What the pair *means*, as opposed to which refs it names. "Index ↔ Working
 * Tree" is precise but does not say "these are your unstaged changes", and the
 * two comparisons a file can be in at once are told apart far more easily by
 * this word than by reading both ref labels.
 *
 * Ordered so the modified side decides first: a staged add is HEAD-less but
 * still staged, and a delete has no modified side at all whatever the original.
 *
 * `null` when the original is a commit: "staged" and "unstaged" carve up the
 * work between HEAD and the working tree, and a comparison against a named
 * revision is not one of those halves. There is no true word for it, so the
 * refs speak for themselves rather than being labelled with a vague one.
 */
export function diffScopeLabel({ original, modified }: DiffSides): string | null {
    if (modified.kind === 'empty') {
        return 'Deleted';
    }
    if (modified.kind === 'index') {
        return 'Staged';
    }
    if (original.kind === 'empty') {
        return 'Untracked';
    }
    if (original.kind === 'index') {
        return 'Unstaged';
    }
    return null;
}

/** Names the tab the way git names its own diff tabs — one parenthetical: the
 *  scope where there is one, and otherwise the refs themselves. */
export function diffPanelTitle({ fileName, sides }: { fileName: string; sides: DiffSides }): string {
    const scope = diffScopeLabel(sides)
        ?? `${diffSideLabel(sides.original)} ↔ ${diffSideLabel(sides.modified)}`;
    return `${fileName} (${scope})`;
}

function sideKey(side: DiffSide): string {
    return side.kind === 'ref' ? `ref:${side.ref}` : side.kind;
}

/** Identity of a diff panel: same file at the same pair of versions reuses the
 *  open tab instead of stacking a duplicate. */
export function diffPanelKey({ uriString, sides }: { uriString: string; sides: DiffSides }): string {
    return `${uriString}|${sideKey(sides.original)}|${sideKey(sides.modified)}`;
}

function isDiffSide(value: unknown): value is DiffSide {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const { kind, ref } = value as { kind?: unknown; ref?: unknown };
    if (kind === 'ref') {
        return typeof ref === 'string';
    }
    return kind === 'workingTree' || kind === 'index' || kind === 'empty';
}

/** Validates a `WebviewPanelSerializer` payload, which is whatever JSON
 *  survived a window reload and so cannot be trusted to have a shape. */
export function parseDiffPanelRestoreState(value: unknown): DiffPanelRestoreState | null {
    if (typeof value !== 'object' || value === null) {
        return null;
    }
    const { fileUri, sides } = value as { fileUri?: unknown; sides?: unknown };
    if (typeof fileUri !== 'string' || typeof sides !== 'object' || sides === null) {
        return null;
    }
    const { original, modified } = sides as { original?: unknown; modified?: unknown };
    if (!isDiffSide(original) || !isDiffSide(modified)) {
        return null;
    }
    return { fileUri, sides: { original, modified } };
}
