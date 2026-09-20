/**
 * Editor Diff Module
 *
 * `computeDiff` is the sole surviving export of the pre-CM6 diff module —
 * pure `string -> line indices`, no DOM, ported unchanged (the `diff` npm
 * dependency stays either way; nothing about the CM6 migration displaces
 * it). `computeLineChangeMarkers` further down is a new export, added for
 * the always-on gutter indicator feature, built on the same `diffLines` call.
 *
 * The DOM-rendering half (`initDiffView`, `highlightDifferences`) is
 * deleted: `initDiffView` took `markdownToStyledHtml` as an injected
 * parameter and died with the deleted parser, and `highlightDifferences`
 * indexed into a `.line` NodeList by line number, which CM6's viewport
 * virtualization (only visible lines exist in the DOM) invalidates by
 * construction — see docs/plans/CODEMIRROR6_MIGRATION.md's "Diff mode does
 * not survive untouched" section.
 *
 * The CM6 replacement is `@codemirror/merge`'s `MergeView`, wired in
 * `../cm/diff/mergeView.ts`. `hasChanges` below is used there (via
 * `planToggleDiff`) to answer "is there anything to show" before an
 * `EditorView`/`MergeView` is ever constructed, so a stale `diffAvailable`
 * flag from the host can't open an empty diff.
 */

import * as Diff from 'diff';

/**
 * Compute diff using the diff library for accurate change detection
 *
 * @param originalText Original text content
 * @param modifiedText Modified text content
 * @returns Sets of added and removed line indices
 */
export function computeDiff(originalText: string, modifiedText: string): {
    added: Set<number>;
    removed: Set<number>;
} {
    const added = new Set<number>();
    const removed = new Set<number>();

    // Use the diff library to compute line-by-line changes
    const changes = Diff.diffLines(originalText, modifiedText);

    let originalLineIndex = 0;
    let modifiedLineIndex = 0;

    for (const change of changes) {
        const lineCount = change.count || 0;

        if (change.removed) {
            // Mark lines as removed in the original
            for (let i = 0; i < lineCount; i++) {
                removed.add(originalLineIndex + i);
            }
            originalLineIndex += lineCount;
        } else if (change.added) {
            // Mark lines as added in the modified
            for (let i = 0; i < lineCount; i++) {
                added.add(modifiedLineIndex + i);
            }
            modifiedLineIndex += lineCount;
        } else {
            // Unchanged lines - advance both indices
            originalLineIndex += lineCount;
            modifiedLineIndex += lineCount;
        }
    }

    return { added, removed };
}

/**
 * Whether `computeDiff` finds any changed line between `originalText` and
 * `modifiedText`. Gates opening the merge view: the host's `diffAvailable`
 * flag (see `../../shared/messages.ts`) can go stale between the moment the
 * toggle button is shown and the moment it's clicked (the live document
 * keeps changing under debounced sync), so this is checked again, locally,
 * against the document actually in the editor right now.
 */
export function hasChanges(originalText: string, modifiedText: string): boolean {
    const { added, removed } = computeDiff(originalText, modifiedText);
    return added.size > 0 || removed.size > 0;
}

/** How a line in the *current* (modified) document relates to git HEAD, for
 *  the always-on gutter indicator (see `../cm/lineNumberGutter.ts`). `added`
 *  and `modified` mark a real line in the current document (1-based, matching
 *  `EditorState.doc.lineAt().number`); `removed` has no line of its own --
 *  it is attached to the line adjacent to where the deletion happened, the
 *  same convention VS Code's own diff gutter uses. */
export type LineChangeKind = 'added' | 'modified' | 'removed';

/**
 * Line-level change markers for the current document, keyed by its own
 * 1-based line number. Built directly from `Diff.diffLines` rather than from
 * `computeDiff`'s `{ added, removed }` sets: those two sets are flattened
 * (line numbers only, in two different coordinate spaces -- `removed` indexes
 * the *original* text) and lose the adjacency between a removed hunk and the
 * added hunk replacing it, which is exactly what distinguishes "modified"
 * from a plain "added" line. This walks the same `diffLines` output once,
 * pairing an added block with an immediately preceding removed block of the
 * same shape `computeDiff` already relies on (the `diff` library emits a
 * line-replacement as adjacent removed-then-added change entries).
 *
 * Pure `string -> Map`, no `EditorView`; unit-tested against real
 * `EditorState`s in `src/test/unit/lineNumberGutter.test.ts`.
 */
export function computeLineChangeMarkers(originalText: string, modifiedText: string): Map<number, LineChangeKind> {
    const markers = new Map<number, LineChangeKind>();
    const changes = Diff.diffLines(originalText, modifiedText);

    // 0-based count of modified-document lines already accounted for by
    // preceding change entries -- i.e. the 0-based index of the next
    // not-yet-emitted modified line.
    let modifiedLineIndex = 0;

    for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        const lineCount = change.count ?? 0;

        if (change.removed) {
            const next = changes[i + 1];
            if (next?.added) {
                // Replacement: the lines taking the deleted ones' place are
                // "modified", not freshly "added".
                const modifiedCount = next.count ?? 0;
                for (let line = 0; line < modifiedCount; line++) {
                    markers.set(modifiedLineIndex + line + 1, 'modified');
                }
                modifiedLineIndex += modifiedCount;
                i++; // the paired added block has been consumed here
            } else {
                // Pure deletion: no line of the current document to mark, so
                // attach the marker to the line adjacent to the deletion --
                // the line right before it, or line 1 when the deletion is
                // at the very start of the document.
                const anchor = modifiedLineIndex === 0 ? 1 : modifiedLineIndex;
                if (!markers.has(anchor)) {
                    markers.set(anchor, 'removed');
                }
            }
        } else if (change.added) {
            for (let line = 0; line < lineCount; line++) {
                markers.set(modifiedLineIndex + line + 1, 'added');
            }
            modifiedLineIndex += lineCount;
        } else {
            modifiedLineIndex += lineCount;
        }
    }

    return markers;
}
