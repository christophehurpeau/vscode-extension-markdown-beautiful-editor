/**
 * Pure release logic for `scripts/release.ts` and `scripts/release-notes.ts`:
 * version bumping, conventional-commit parsing and CHANGELOG.md editing.
 * Git and file access stay in the scripts so this stays unit-testable.
 */

export type Bump = 'major' | 'minor' | 'patch';

export interface Commit {
    hash: string;
    subject: string;
    body: string;
}

export interface ConventionalCommit {
    type: string;
    scope: string | undefined;
    breaking: boolean;
    description: string;
}

const semverPattern = /^(\d+)\.(\d+)\.(\d+)$/;

/** `bump` is a bump keyword or an explicit `x.y.z`, which must be greater than `version`. */
export function bumpVersion(version: string, bump: string): string {
    const current = semverPattern.exec(version);
    if (!current) {
        throw new Error(`Unsupported version "${version}"`);
    }
    const [major, minor, patch] = current.slice(1).map(Number);
    switch (bump) {
        case 'major':
            return `${major + 1}.0.0`;
        case 'minor':
            return `${major}.${minor + 1}.0`;
        case 'patch':
            return `${major}.${minor}.${patch + 1}`;
    }
    const explicit = semverPattern.exec(bump);
    if (!explicit) {
        throw new Error(`Expected major, minor, patch or x.y.z, got "${bump}"`);
    }
    const next = explicit.slice(1).map(Number);
    const order = next[0] - major || next[1] - minor || next[2] - patch;
    if (order <= 0) {
        throw new Error(`${bump} is not greater than the current version ${version}`);
    }
    return bump;
}

const subjectPattern = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/;

export function parseCommit(subject: string, body = ''): ConventionalCommit | undefined {
    const match = subjectPattern.exec(subject);
    if (!match) {
        return undefined;
    }
    return {
        type: match[1],
        scope: match[2],
        breaking: match[3] === '!' || /^BREAKING[ -]CHANGE: /m.test(body),
        description: match[4],
    };
}

type SectionTitle = 'Added' | 'Changed' | 'Fixed';

const sectionOrder: SectionTitle[] = ['Added', 'Changed', 'Fixed'];

const sectionByType: Record<string, SectionTitle> = {
    feat: 'Added',
    perf: 'Changed',
    fix: 'Fixed',
};

/**
 * `deps` commits are dropped: "update X to Y" does not tell a user of the
 * bundled extension what changed for them.
 */
const ignoredScopes = new Set(['deps', 'deps-dev']);

/** chore, build, refactor... are internal, unless breaking. */
function sectionOf(commit: ConventionalCommit): SectionTitle | undefined {
    if (commit.scope !== undefined && ignoredScopes.has(commit.scope)) {
        return undefined;
    }
    return sectionByType[commit.type] ?? (commit.breaking ? 'Changed' : undefined);
}

function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

export function renderReleaseSection(
    version: string,
    date: string,
    commits: Commit[],
    repositoryUrl: string
): string {
    const parsed = commits.flatMap((commit) => {
        const conventional = parseCommit(commit.subject, commit.body);
        const section = conventional && sectionOf(conventional);
        return conventional && section ? [{ commit, conventional, section }] : [];
    });

    const lines = [`## [${version}] - ${date}`];
    for (const title of sectionOrder) {
        const entries = parsed.filter(({ section }) => section === title);
        if (entries.length === 0) {
            continue;
        }
        lines.push('', `### ${title}`, '');
        for (const { commit, conventional } of entries) {
            const breaking = conventional.breaking ? '**Breaking:** ' : '';
            const link = `[${commit.hash}](${repositoryUrl}/commit/${commit.hash})`;
            lines.push(`- ${breaking}${capitalize(conventional.description)} (${link})`);
        }
    }
    if (lines.length === 1) {
        lines.push('', 'No user-facing changes.');
    }
    return lines.join('\n') + '\n';
}

const releaseHeading = /^## \[/m;

/** Inserts `section` above the most recent release, or at the end if there is none. */
export function insertReleaseSection(changelog: string, section: string): string {
    const match = releaseHeading.exec(changelog);
    if (!match) {
        return `${changelog.trimEnd()}\n\n${section}`;
    }
    return `${changelog.slice(0, match.index)}${section}\n${changelog.slice(match.index)}`;
}

/** Body of the `version` section (heading excluded), for GitHub release notes. */
export function extractReleaseSection(changelog: string, version: string): string | undefined {
    const lines = changelog.split('\n');
    const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
    if (start === -1) {
        return undefined;
    }
    const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
    return lines
        .slice(start + 1, end === -1 ? undefined : end)
        .join('\n')
        .trim();
}
