/**
 * Prints the CHANGELOG.md section of a version, for the GitHub release body.
 *
 * Usage: node scripts/release-notes.ts <version>
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractReleaseSection } from '../src/release/releaseNotes.ts';

const version = process.argv[2];
if (!version) {
    console.error('release-notes: missing version argument');
    process.exit(1);
}

const changelogPath = join(fileURLToPath(import.meta.url), '../../CHANGELOG.md');
const notes = extractReleaseSection(readFileSync(changelogPath, 'utf8'), version);
if (notes === undefined) {
    console.error(`release-notes: no CHANGELOG.md section for ${version}`);
    process.exit(1);
}
console.log(notes);
