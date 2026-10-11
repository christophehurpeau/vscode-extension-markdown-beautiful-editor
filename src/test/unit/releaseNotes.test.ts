import * as assert from 'assert';
import {
    bumpVersion,
    extractReleaseSection,
    insertReleaseSection,
    parseCommit,
    renderReleaseSection,
} from '../../release/releaseNotes';

const repo = 'https://github.com/owner/repo';

describe('bumpVersion', () => {
    it('bumps each semver component', () => {
        assert.strictEqual(bumpVersion('0.4.4', 'patch'), '0.4.5');
        assert.strictEqual(bumpVersion('0.4.4', 'minor'), '0.5.0');
        assert.strictEqual(bumpVersion('0.4.4', 'major'), '1.0.0');
    });

    it('accepts an explicit greater version', () => {
        assert.strictEqual(bumpVersion('0.4.4', '0.10.0'), '0.10.0');
    });

    it('rejects an explicit version that is not greater', () => {
        assert.throws(() => bumpVersion('0.4.4', '0.4.4'), /not greater/);
        assert.throws(() => bumpVersion('0.4.4', '0.3.9'), /not greater/);
    });

    it('rejects an unknown bump', () => {
        assert.throws(() => bumpVersion('0.4.4', 'next'), /Expected major/);
    });
});

describe('parseCommit', () => {
    it('parses type, scope and description', () => {
        assert.deepStrictEqual(parseCommit('fix(deps): update diff'), {
            type: 'fix',
            scope: 'deps',
            breaking: false,
            description: 'update diff',
        });
    });

    it('detects breaking changes from ! and from the body', () => {
        assert.strictEqual(parseCommit('feat!: drop setting')?.breaking, true);
        assert.strictEqual(
            parseCommit('feat: drop setting', 'Details\n\nBREAKING CHANGE: setting removed')?.breaking,
            true
        );
    });

    it('returns undefined for a non-conventional subject', () => {
        assert.strictEqual(parseCommit('0.2.3'), undefined);
        assert.strictEqual(parseCommit('Merge branch main'), undefined);
    });
});

describe('renderReleaseSection', () => {
    it('groups user-facing commits into Keep a Changelog sections', () => {
        const section = renderReleaseSection(
            '0.4.5',
            '2026-10-11',
            [
                { hash: 'aaa', subject: 'fix: show selection over code', body: '' },
                { hash: 'bbb', subject: 'feat(toc): collapse sections', body: '' },
                { hash: 'ccc', subject: 'perf: faster decorations', body: '' },
                { hash: 'ddd', subject: 'build: dedupe lockfile (#25)', body: '' },
                { hash: 'eee', subject: 'fix(deps): update diff', body: '' },
                { hash: 'fff', subject: 'refactor!: rename setting', body: '' },
            ],
            repo
        );
        assert.strictEqual(
            section,
            [
                '## [0.4.5] - 2026-10-11',
                '',
                '### Added',
                '',
                `- Collapse sections ([bbb](${repo}/commit/bbb))`,
                '',
                '### Changed',
                '',
                `- Faster decorations ([ccc](${repo}/commit/ccc))`,
                `- **Breaking:** Rename setting ([fff](${repo}/commit/fff))`,
                '',
                '### Fixed',
                '',
                `- Show selection over code ([aaa](${repo}/commit/aaa))`,
                '',
            ].join('\n')
        );
    });

    it('says so when nothing is user-facing', () => {
        const section = renderReleaseSection(
            '0.4.5',
            '2026-10-11',
            [{ hash: 'ddd', subject: 'chore: tidy', body: '' }],
            repo
        );
        assert.strictEqual(section, '## [0.4.5] - 2026-10-11\n\nNo user-facing changes.\n');
    });
});

const changelog = [
    '# Changelog',
    '',
    'Intro.',
    '',
    '## [0.2.0] - 2026-01-02',
    '',
    '### Fixed',
    '',
    '- Two',
    '',
    '## [0.1.0] - 2026-01-01',
    '',
    '- One',
    '',
].join('\n');

describe('insertReleaseSection', () => {
    it('inserts above the most recent release', () => {
        const result = insertReleaseSection(changelog, '## [0.3.0] - 2026-01-03\n\n- Three\n');
        assert.ok(result.startsWith('# Changelog\n\nIntro.\n\n## [0.3.0] - 2026-01-03\n\n- Three\n\n## [0.2.0]'));
    });

    it('appends when there is no release yet', () => {
        assert.strictEqual(
            insertReleaseSection('# Changelog\n', '## [0.1.0] - 2026-01-01\n'),
            '# Changelog\n\n## [0.1.0] - 2026-01-01\n'
        );
    });
});

describe('extractReleaseSection', () => {
    it('returns the body of a middle section', () => {
        assert.strictEqual(extractReleaseSection(changelog, '0.2.0'), '### Fixed\n\n- Two');
    });

    it('returns the body of the last section', () => {
        assert.strictEqual(extractReleaseSection(changelog, '0.1.0'), '- One');
    });

    it('returns undefined for a missing version', () => {
        assert.strictEqual(extractReleaseSection(changelog, '9.9.9'), undefined);
    });
});
