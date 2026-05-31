import * as assert from 'assert';
import { parseLinkTarget, resolveReferenceUrl, linkDisplayUrl, inlineLinkText } from '../../shared/links';

describe('parseLinkTarget', () => {
    it('splits a path and fragment', () => {
        assert.deepStrictEqual(parseLinkTarget('./full.md#links'), { path: './full.md', fragment: 'links' });
    });

    it('handles a path with no fragment', () => {
        assert.deepStrictEqual(parseLinkTarget('../LICENSE'), { path: '../LICENSE', fragment: '' });
    });

    it('handles a pure fragment', () => {
        assert.deepStrictEqual(parseLinkTarget('#links'), { path: '', fragment: 'links' });
    });

    it('strips a double-quoted title', () => {
        assert.deepStrictEqual(parseLinkTarget('./full.md#links "Go to links"'), { path: './full.md', fragment: 'links' });
    });

    it('strips a single-quoted title', () => {
        assert.deepStrictEqual(parseLinkTarget("../LICENSE 'the license'"), { path: '../LICENSE', fragment: '' });
    });

    it('strips a double-quoted title containing an apostrophe', () => {
        assert.deepStrictEqual(
            parseLinkTarget('https://www.google.com "Google\'s Homepage"'),
            { path: 'https://www.google.com', fragment: '' }
        );
    });

    it('strips a title on a pure fragment', () => {
        assert.deepStrictEqual(parseLinkTarget('#links "tip"'), { path: '', fragment: 'links' });
    });

    it('strips angle brackets', () => {
        assert.deepStrictEqual(parseLinkTarget('<./full.md#links>'), { path: './full.md', fragment: 'links' });
    });

    it('trims surrounding whitespace', () => {
        assert.deepStrictEqual(parseLinkTarget('  ./full.md#links  '), { path: './full.md', fragment: 'links' });
    });

    it('leaves a plain web URL untouched', () => {
        assert.deepStrictEqual(parseLinkTarget('https://example.com/page'), { path: 'https://example.com/page', fragment: '' });
    });
});

describe('linkDisplayUrl', () => {
    it("shows only the URL for an inline link with a title", () => {
        // [I'm an inline-style link with title](https://www.google.com "Google's Homepage")
        assert.strictEqual(
            linkDisplayUrl('https://www.google.com "Google\'s Homepage"'),
            'https://www.google.com'
        );
    });

    it('keeps the fragment but drops the title', () => {
        assert.strictEqual(linkDisplayUrl('./full.md#links "Go to links"'), './full.md#links');
    });

    it('returns a pure fragment with its leading hash', () => {
        assert.strictEqual(linkDisplayUrl('#links'), '#links');
    });

    it('leaves a plain URL untouched', () => {
        assert.strictEqual(linkDisplayUrl('https://example.com/page'), 'https://example.com/page');
    });
});

describe('inlineLinkText', () => {
    it('returns the label of a single inline link', () => {
        assert.strictEqual(inlineLinkText('[text](url)'), 'text');
    });

    it('matches a link whose destination carries a title', () => {
        assert.strictEqual(inlineLinkText('[text](url "a title")'), 'text');
    });

    it('returns null for plain text', () => {
        assert.strictEqual(inlineLinkText('not a link'), null);
    });

    it('does not unwrap a selection spanning two links', () => {
        assert.strictEqual(inlineLinkText('[a](b) [c](d)'), null);
    });

    it('does not unwrap a link followed by trailing link-like text', () => {
        assert.strictEqual(inlineLinkText('[a](b)](c)'), null);
    });

    it('does not unwrap text preceding a link', () => {
        assert.strictEqual(inlineLinkText('before [a](b)'), null);
    });

    it('returns null for an empty destination', () => {
        assert.strictEqual(inlineLinkText('[text]()'), null);
    });

    it('returns null for an empty label', () => {
        assert.strictEqual(inlineLinkText('[](url)'), null);
    });
});

describe('resolveReferenceUrl', () => {
    const defs = [
        { label: 'Arbitrary case-insensitive reference text', url: 'https://www.mozilla.org' },
        { label: '1', url: 'http://slashdot.org' },
    ];

    it('resolves a label to its URL', () => {
        assert.strictEqual(resolveReferenceUrl('1', defs), 'http://slashdot.org');
    });

    it('matches labels case-insensitively', () => {
        assert.strictEqual(
            resolveReferenceUrl('ARBITRARY CASE-INSENSITIVE REFERENCE TEXT', defs),
            'https://www.mozilla.org'
        );
    });

    it('ignores surrounding whitespace on both sides', () => {
        assert.strictEqual(resolveReferenceUrl('  1  ', [{ label: ' 1 ', url: 'http://x' }]), 'http://x');
    });

    it('returns an empty string when no definition matches', () => {
        assert.strictEqual(resolveReferenceUrl('unknown', defs), '');
    });

    it('returns an empty string when there are no definitions', () => {
        assert.strictEqual(resolveReferenceUrl('1', []), '');
    });

    it('returns the first matching definition', () => {
        const dupes = [
            { label: 'ref', url: 'http://first' },
            { label: 'ref', url: 'http://second' },
        ];
        assert.strictEqual(resolveReferenceUrl('ref', dupes), 'http://first');
    });
});
