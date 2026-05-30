import * as assert from 'assert';
import { parseLinkTarget } from '../../shared/links';

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
