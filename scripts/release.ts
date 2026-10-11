/**
 * Cuts a release: bumps package.json, prepends the CHANGELOG.md section
 * generated from conventional commits since the last tag, commits, tags and
 * pushes. The tag push triggers .github/workflows/release.yml, which publishes.
 *
 * Usage: pnpm release [patch|minor|major|x.y.z] [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    bumpVersion,
    insertReleaseSection,
    renderReleaseSection,
    type Commit,
} from '../src/release/releaseNotes.ts';

const repoRoot = join(fileURLToPath(import.meta.url), '../..');
const packagePath = join(repoRoot, 'package.json');
const changelogPath = join(repoRoot, 'CHANGELOG.md');
const releaseBranch = 'main';

function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function run(command: string, args: string[]): void {
    execFileSync(command, args, { cwd: repoRoot, stdio: 'inherit' });
}

function fail(message: string): never {
    console.error(`release: ${message}`);
    process.exit(1);
}

function assertReleasable(): void {
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    if (branch !== releaseBranch) {
        fail(`on branch ${branch}, expected ${releaseBranch}`);
    }
    if (git('status', '--porcelain') !== '') {
        fail('working tree is not clean');
    }
    git('fetch', '--quiet', 'origin', releaseBranch);
    if (git('rev-list', '--count', `HEAD..origin/${releaseBranch}`) !== '0') {
        fail(`behind origin/${releaseBranch}, pull first`);
    }
}

const fieldSeparator = '\x1f';
const recordSeparator = '\x1e';

function commitsSince(tag: string): Commit[] {
    const log = git(
        'log',
        '--reverse',
        `--format=%h${fieldSeparator}%s${fieldSeparator}%b${recordSeparator}`,
        `${tag}..HEAD`
    );
    return log
        .split(recordSeparator)
        .map((record) => record.trim())
        .filter((record) => record !== '')
        .map((record) => {
            const [hash, subject, body] = record.split(fieldSeparator);
            return { hash, subject, body };
        });
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const bump = args.find((arg) => !arg.startsWith('--')) ?? 'patch';

if (!dryRun) {
    assertReleasable();
}

const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as {
    version: string;
    repository: { url: string };
};
const version = bumpVersion(pkg.version, bump);
const tag = `v${version}`;
if (git('tag', '--list', tag) !== '') {
    fail(`tag ${tag} already exists`);
}

const previousTag = git('describe', '--tags', '--abbrev=0', '--match', 'v*');
const date = new Date().toISOString().slice(0, 10);
const section = renderReleaseSection(version, date, commitsSince(previousTag), pkg.repository.url);

console.log(`${pkg.version} -> ${version} (changes since ${previousTag})\n\n${section}`);
if (dryRun) {
    process.exit(0);
}

run('pnpm', ['run', 'compile-tests']);
run('pnpm', ['run', 'test:unit']);
run('pnpm', ['run', 'package']);

const packageJson = readFileSync(packagePath, 'utf8');
writeFileSync(packagePath, packageJson.replace(`"version": "${pkg.version}"`, `"version": "${version}"`));
writeFileSync(changelogPath, insertReleaseSection(readFileSync(changelogPath, 'utf8'), section));

git('add', packagePath, changelogPath);
git('commit', '--quiet', '-m', `chore: ${tag}`);
git('tag', '-a', tag, '-m', tag);
run('git', ['push', '--atomic', 'origin', releaseBranch, tag]);

console.log(`\nPushed ${tag}; the Release workflow publishes it.`);
