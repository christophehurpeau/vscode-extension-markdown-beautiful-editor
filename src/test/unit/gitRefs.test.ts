import * as assert from 'assert';
import {
    diffPanelKey,
    diffPanelTitle,
    diffScopeLabel,
    diffSideForRef,
    diffSideLabel,
    gitRefForSide,
    gitStatus,
    gitUriQuery,
    isModifiedSideWritable,
    parseDiffPanelRestoreState,
    readsOriginalUri,
    resolveDiffSides,
    scmResourceGroupIdFor,
    type DiffSides,
} from '../../shared/gitRefs';

/**
 * The diff panel's ref decisions (src/editor/diffPanel.ts drives them, but the
 * decisions themselves are pure and live in src/shared/gitRefs.ts).
 *
 * The expectations below mirror the built-in git extension's own
 * `getLeftResource`/`getRightResource`, read off the shipped bundle. That
 * mapping switches on the file's **status**; keying it on the Source Control
 * group instead is what broke staged adds and deletes.
 */
describe('git ref resolution', () => {

    describe('resolveDiffSides', () => {
        it('compares the index against the working tree for an unstaged modify', () => {
            assert.deepStrictEqual(resolveDiffSides(gitStatus.modified), {
                original: { kind: 'index' },
                modified: { kind: 'workingTree' },
            });
        });

        it('compares HEAD against the index for a staged modify', () => {
            assert.deepStrictEqual(resolveDiffSides(gitStatus.indexModified), {
                original: { kind: 'ref', ref: 'HEAD' },
                modified: { kind: 'index' },
            });
        });

        it('reads no HEAD version for a staged add, which has none', () => {
            assert.deepStrictEqual(resolveDiffSides(gitStatus.indexAdded), {
                original: { kind: 'empty' },
                modified: { kind: 'index' },
            });
        });

        it('reads no modified version for a delete, staged or not', () => {
            const deleted: DiffSides = { original: { kind: 'ref', ref: 'HEAD' }, modified: { kind: 'empty' } };
            assert.deepStrictEqual(resolveDiffSides(gitStatus.indexDeleted), deleted);
            assert.deepStrictEqual(resolveDiffSides(gitStatus.deleted), deleted);
        });

        it('compares an empty original against the working tree for untracked files', () => {
            assert.deepStrictEqual(resolveDiffSides(gitStatus.untracked), {
                original: { kind: 'empty' },
                modified: { kind: 'workingTree' },
            });
        });

        it('reads a rename or copy from the index, against HEAD', () => {
            const staged: DiffSides = { original: { kind: 'ref', ref: 'HEAD' }, modified: { kind: 'index' } };
            assert.deepStrictEqual(resolveDiffSides(gitStatus.indexRenamed), staged);
            assert.deepStrictEqual(resolveDiffSides(gitStatus.indexCopied), staged);
        });

        it('never asks for a side that cannot exist for that status', () => {
            // A staged add has no HEAD version and a delete has no modified
            // version; asking for either is the failure this mapping exists to
            // avoid, since the read errors out rather than returning empty.
            assert.strictEqual(resolveDiffSides(gitStatus.indexAdded).original.kind, 'empty');
            assert.strictEqual(resolveDiffSides(gitStatus.untracked).original.kind, 'empty');
            assert.strictEqual(resolveDiffSides(gitStatus.deleted).modified.kind, 'empty');
            assert.strictEqual(resolveDiffSides(gitStatus.indexDeleted).modified.kind, 'empty');
        });

        it('distinguishes a staged modify from an unstaged one', () => {
            assert.notDeepStrictEqual(
                resolveDiffSides(gitStatus.indexModified),
                resolveDiffSides(gitStatus.modified)
            );
        });

        it('falls back to HEAD against the working tree for conflicts and unknown statuses', () => {
            const expected: DiffSides = {
                original: { kind: 'ref', ref: 'HEAD' },
                modified: { kind: 'workingTree' },
            };
            assert.deepStrictEqual(resolveDiffSides(undefined), expected);
            assert.deepStrictEqual(resolveDiffSides(gitStatus.bothModified), expected);
            assert.deepStrictEqual(resolveDiffSides(gitStatus.bothAdded), expected);
        });
    });

    describe('diffSideForRef', () => {
        it('reads the empty ref as the index, as `git show :path` does', () => {
            assert.deepStrictEqual(diffSideForRef(''), { kind: 'index' });
        });

        it("collapses git's `~` onto the index", () => {
            // `~` means "the index if staged, else HEAD" -- and for an
            // unstaged tracked file the index still holds the HEAD version,
            // so the two are the same bytes either way.
            assert.deepStrictEqual(diffSideForRef('~'), diffSideForRef(''));
        });

        it('keeps a named ref', () => {
            assert.deepStrictEqual(diffSideForRef('HEAD'), { kind: 'ref', ref: 'HEAD' });
            assert.deepStrictEqual(diffSideForRef('abc1234'), { kind: 'ref', ref: 'abc1234' });
        });

        it('reproduces what VS Code shows for a staged diff', () => {
            // The git extension builds the staged diff as
            // `toGitUri(uri, 'HEAD')` vs `toGitUri(uri, '')`.
            const sides: DiffSides = { original: diffSideForRef('HEAD'), modified: diffSideForRef('') };
            // Reading the diff tab's two URIs and reading the file's status
            // must land on the same pair -- that equivalence is what lets the
            // title-bar button and the Source Control row agree.
            assert.deepStrictEqual(sides, resolveDiffSides(gitStatus.indexModified));
            assert.strictEqual(diffPanelTitle({ fileName: 'markdown.md', sides }), 'markdown.md (Staged)');
        });
    });

    describe('scmResourceGroupIdFor', () => {
        it('maps the git extension resource group types', () => {
            // Verified against the shipped extension: `resourceGroupType === 1`
            // gates unstage/revert, 2 and 3 gate stage/clean, 0 the merge
            // commands.
            assert.strictEqual(scmResourceGroupIdFor(0), 'merge');
            assert.strictEqual(scmResourceGroupIdFor(1), 'index');
            assert.strictEqual(scmResourceGroupIdFor(2), 'workingTree');
            assert.strictEqual(scmResourceGroupIdFor(3), 'untracked');
        });

        it('yields nothing for a value that is not one of them', () => {
            // These fields are not in the git extension's public `.d.ts`, so
            // an absent or reshaped one must degrade to "unknown group"
            // rather than to a wrong group.
            for (const value of [undefined, null, 4, -1, '1', {}]) {
                assert.strictEqual(scmResourceGroupIdFor(value), undefined, `for ${JSON.stringify(value)}`);
            }
        });
    });

    describe('isModifiedSideWritable', () => {
        it('allows editing when the modified side is the file on disk', () => {
            assert.strictEqual(isModifiedSideWritable(resolveDiffSides(gitStatus.modified)), true);
            assert.strictEqual(isModifiedSideWritable(resolveDiffSides(gitStatus.untracked)), true);
        });

        it('refuses the git index, which a WorkspaceEdit cannot write', () => {
            assert.strictEqual(isModifiedSideWritable(resolveDiffSides(gitStatus.indexModified)), false);
            assert.strictEqual(isModifiedSideWritable(resolveDiffSides(gitStatus.indexAdded)), false);
        });

        it('refuses a side that does not exist', () => {
            assert.strictEqual(isModifiedSideWritable(resolveDiffSides(gitStatus.deleted)), false);
        });

        it('agrees with the scope label on which views are editable', () => {
            // "Staged" means the modified side is the index, and "Deleted"
            // means there is no modified side -- neither can take an edit.
            for (const status of Object.values(gitStatus)) {
                const sides = resolveDiffSides(status);
                const scope = diffScopeLabel(sides);
                if (scope === 'Staged' || scope === 'Deleted') {
                    assert.strictEqual(isModifiedSideWritable(sides), false, `${scope} should not be writable`);
                }
            }
        });
    });

    describe('readsOriginalUri', () => {
        it('is true only where the original side is a different path', () => {
            assert.strictEqual(readsOriginalUri(gitStatus.indexRenamed), true);
            assert.strictEqual(readsOriginalUri(gitStatus.indexCopied), true);
            assert.strictEqual(readsOriginalUri(gitStatus.intentToRename), true);
            assert.strictEqual(readsOriginalUri(gitStatus.indexModified), false);
            assert.strictEqual(readsOriginalUri(gitStatus.modified), false);
            assert.strictEqual(readsOriginalUri(undefined), false);
        });
    });

    describe('gitRefForSide', () => {
        it('spells the index as the empty ref, as `git show :path` does', () => {
            assert.strictEqual(gitRefForSide({ kind: 'index' }), '');
        });

        it('passes a named ref through', () => {
            assert.strictEqual(gitRefForSide({ kind: 'ref', ref: 'HEAD' }), 'HEAD');
        });

        it('reports the non-git sides as not being a git read', () => {
            assert.strictEqual(gitRefForSide({ kind: 'workingTree' }), null);
            assert.strictEqual(gitRefForSide({ kind: 'empty' }), null);
        });
    });

    describe('gitUriQuery', () => {
        it('matches the shape the built-in git extension builds', () => {
            assert.deepStrictEqual(
                JSON.parse(gitUriQuery({ fsPath: '/repo/NOTES.md', ref: 'HEAD' })),
                { path: '/repo/NOTES.md', ref: 'HEAD' }
            );
        });

        it('keeps the empty index ref rather than dropping the key', () => {
            const parsed = JSON.parse(gitUriQuery({ fsPath: '/repo/NOTES.md', ref: '' })) as Record<string, unknown>;
            assert.strictEqual(parsed.ref, '');
            assert.ok('ref' in parsed);
        });
    });

    describe('labels and titles', () => {
        it('labels each side', () => {
            assert.strictEqual(diffSideLabel({ kind: 'workingTree' }), 'Working Tree');
            assert.strictEqual(diffSideLabel({ kind: 'index' }), 'Index');
            assert.strictEqual(diffSideLabel({ kind: 'empty' }), 'Empty');
            assert.strictEqual(diffSideLabel({ kind: 'ref', ref: 'HEAD' }), 'HEAD');
        });

        it('names the tab after the file and what the comparison means', () => {
            assert.strictEqual(
                diffPanelTitle({ fileName: 'NOTES.md', sides: resolveDiffSides(gitStatus.indexModified) }),
                'NOTES.md (Staged)'
            );
            assert.strictEqual(
                diffPanelTitle({ fileName: 'NOTES.md', sides: resolveDiffSides(gitStatus.modified) }),
                'NOTES.md (Unstaged)'
            );
        });
    });

    describe('diffScopeLabel', () => {
        it('tells the staged and unstaged views of one file apart', () => {
            // The whole point: a file can be in both at once, and two tabs
            // reading "Index ↔ Working Tree" and "HEAD ↔ Index" are far harder
            // to tell apart at a glance than "Unstaged" and "Staged".
            assert.strictEqual(diffScopeLabel(resolveDiffSides(gitStatus.indexModified)), 'Staged');
            assert.strictEqual(diffScopeLabel(resolveDiffSides(gitStatus.modified)), 'Unstaged');
        });

        it('calls a staged add staged, despite it having no HEAD side', () => {
            assert.strictEqual(diffScopeLabel(resolveDiffSides(gitStatus.indexAdded)), 'Staged');
        });

        it('calls a delete deleted, staged or not', () => {
            assert.strictEqual(diffScopeLabel(resolveDiffSides(gitStatus.deleted)), 'Deleted');
            assert.strictEqual(diffScopeLabel(resolveDiffSides(gitStatus.indexDeleted)), 'Deleted');
        });

        it('names untracked files', () => {
            assert.strictEqual(diffScopeLabel(resolveDiffSides(gitStatus.untracked)), 'Untracked');
        });

        it('has no word for a comparison against a commit', () => {
            // "Staged" and "unstaged" split the work between HEAD and the
            // working tree; a commit comparison is not one of those halves,
            // so the refs are left to speak instead of inventing a label.
            assert.strictEqual(diffScopeLabel(resolveDiffSides(undefined)), null);
            assert.strictEqual(diffScopeLabel(resolveDiffSides(gitStatus.bothModified)), null);
            assert.strictEqual(
                diffScopeLabel({ original: { kind: 'ref', ref: 'abc1234' }, modified: { kind: 'workingTree' } }),
                null
            );
        });

        it('never produces an empty string -- a label is a real word or absent', () => {
            for (const [name, status] of Object.entries(gitStatus)) {
                const label = diffScopeLabel(resolveDiffSides(status));
                assert.ok(label === null || label.length > 0, `${name} produced an empty scope label`);
            }
        });

        it('titles a commit comparison with its refs instead', () => {
            assert.strictEqual(
                diffPanelTitle({ fileName: 'NOTES.md', sides: resolveDiffSides(undefined) }),
                'NOTES.md (HEAD ↔ Working Tree)'
            );
        });
    });

    describe('diffPanelKey', () => {
        it('reuses one panel for the same file at the same versions', () => {
            const sides = resolveDiffSides(gitStatus.modified);
            assert.strictEqual(
                diffPanelKey({ uriString: 'file:///repo/NOTES.md', sides }),
                diffPanelKey({ uriString: 'file:///repo/NOTES.md', sides })
            );
        });

        it('keeps staged and unstaged views of one file apart', () => {
            assert.notStrictEqual(
                diffPanelKey({ uriString: 'file:///repo/NOTES.md', sides: resolveDiffSides(gitStatus.modified) }),
                diffPanelKey({ uriString: 'file:///repo/NOTES.md', sides: resolveDiffSides(gitStatus.indexModified) })
            );
        });

        it('keeps different files apart', () => {
            const sides = resolveDiffSides(gitStatus.modified);
            assert.notStrictEqual(
                diffPanelKey({ uriString: 'file:///repo/A.md', sides }),
                diffPanelKey({ uriString: 'file:///repo/B.md', sides })
            );
        });

        it('distinguishes two named refs', () => {
            const uriString = 'file:///repo/NOTES.md';
            const at = (ref: string): DiffSides => ({ original: { kind: 'ref', ref }, modified: { kind: 'workingTree' } });
            assert.notStrictEqual(
                diffPanelKey({ uriString, sides: at('HEAD') }),
                diffPanelKey({ uriString, sides: at('HEAD~1') })
            );
        });
    });

    describe('parseDiffPanelRestoreState', () => {
        it('round-trips what the webview stashed', () => {
            const state = { fileUri: 'file:///repo/NOTES.md', sides: resolveDiffSides(gitStatus.indexModified) };
            assert.deepStrictEqual(parseDiffPanelRestoreState(JSON.parse(JSON.stringify(state))), state);
        });

        it('rejects anything that is not that shape', () => {
            const sides = resolveDiffSides(gitStatus.indexModified);
            const rejected: unknown[] = [
                undefined,
                null,
                'file:///repo/NOTES.md',
                {},
                { fileUri: 'file:///repo/NOTES.md' },
                { sides },
                { fileUri: 42, sides },
                { fileUri: 'file:///repo/NOTES.md', sides: { original: { kind: 'nope' }, modified: { kind: 'index' } } },
                { fileUri: 'file:///repo/NOTES.md', sides: { original: { kind: 'ref' }, modified: { kind: 'index' } } },
            ];
            for (const value of rejected) {
                assert.strictEqual(parseDiffPanelRestoreState(value), null, `should reject ${JSON.stringify(value)}`);
            }
        });
    });
});
