import * as assert from 'assert';
import { markdownCorpus } from '../fixtures/markdown-corpus';

/**
 * Sanity checks on the parity corpus itself (src/test/fixtures/markdown-corpus.ts):
 * entry count and unique names. This is fixture-integrity only — the corpus
 * is deliberately not paired with expected output (see its header comment).
 *
 * The two `md-*` class-family coverage checks this file used to run against
 * the old regex parser (`markdownToStyledHtml`) are deleted along with it
 * (CM6 migration WP-1). Their CM6 equivalent — every entry parses without
 * throwing, and every `md-*` class in `src/shared/nodeClassMap.ts` shows up
 * in the corpus somewhere — belongs to whoever brings the decoration table
 * to full parity (WP-H), reusing this same corpus rather than a new one.
 */
describe('markdown-corpus', () => {
    it('has at least 60 named entries', () => {
        assert.ok(markdownCorpus.length >= 60, `expected >= 60 entries, got ${markdownCorpus.length}`);
    });

    it('has unique entry names', () => {
        const names = markdownCorpus.map(e => e.name);
        assert.strictEqual(new Set(names).size, names.length);
    });
});
