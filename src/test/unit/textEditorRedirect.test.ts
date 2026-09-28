import * as assert from 'assert';
import { createRedirectExemptions, isRedirectCandidate, selectionToReveal } from '../../shared/textEditorRedirect';

describe('textEditorRedirect: isRedirectCandidate', () => {
    it('accepts a markdown file on disk in a plain text tab', () => {
        assert.strictEqual(isRedirectCandidate({ scheme: 'file', path: '/docs/README.MD', isPlainTextTab: true }), true);
    });

    it('rejects a diff pane, peek or other non-plain tab', () => {
        assert.strictEqual(isRedirectCandidate({ scheme: 'file', path: '/docs/a.md', isPlainTextTab: false }), false);
    });

    it('rejects a git: or untitled document', () => {
        assert.strictEqual(isRedirectCandidate({ scheme: 'git', path: '/docs/a.md', isPlainTextTab: true }), false);
        assert.strictEqual(isRedirectCandidate({ scheme: 'untitled', path: 'Untitled-1', isPlainTextTab: true }), false);
    });

    it('rejects files the customEditors selector does not claim', () => {
        assert.strictEqual(isRedirectCandidate({ scheme: 'file', path: '/docs/a.markdown', isPlainTextTab: true }), false);
    });
});

describe('textEditorRedirect: selectionToReveal', () => {
    it('ignores the caret at the document start a text editor opens with', () => {
        assert.strictEqual(selectionToReveal({ anchor: { line: 0, character: 0 }, active: { line: 0, character: 0 } }), null);
    });

    it('keeps a selection starting at the document start', () => {
        const selection = { anchor: { line: 0, character: 0 }, active: { line: 0, character: 7 } };
        assert.deepStrictEqual(selectionToReveal(selection), selection);
    });

    it('keeps a caret anywhere else', () => {
        const selection = { anchor: { line: 20, character: 8 }, active: { line: 20, character: 8 } };
        assert.deepStrictEqual(selectionToReveal(selection), selection);
    });
});

describe('textEditorRedirect: createRedirectExemptions', () => {
    function setup() {
        let time = 1000;
        const exemptions = createRedirectExemptions({ now: () => time, reopenWindowMs: 500 });
        return { exemptions, advance: (ms: number) => (time += ms) };
    }

    it('exempts nothing by default', () => {
        const { exemptions } = setup();
        assert.strictEqual(exemptions.isExempt('file:///a.md'), false);
    });

    it('keeps an explicit exemption until the file has no text tab left', () => {
        const { exemptions } = setup();
        exemptions.exempt('file:///a.md');
        assert.strictEqual(exemptions.isExempt('file:///a.md'), true);
        assert.strictEqual(exemptions.isExempt('file:///a.md'), true);
        exemptions.noteTextTabsClosed('file:///a.md');
        assert.strictEqual(exemptions.isExempt('file:///a.md'), false);
    });

    it('treats a text editor right after this editor closed as a reopen-as-text, and makes it last', () => {
        const { exemptions, advance } = setup();
        exemptions.noteCustomEditorClosed('file:///a.md');
        advance(100);
        assert.strictEqual(exemptions.isExempt('file:///a.md'), true);
        advance(10_000);
        assert.strictEqual(exemptions.isExempt('file:///a.md'), true);
    });

    it('does not exempt a text editor opened well after this editor closed', () => {
        const { exemptions, advance } = setup();
        exemptions.noteCustomEditorClosed('file:///a.md');
        advance(501);
        assert.strictEqual(exemptions.isExempt('file:///a.md'), false);
    });

    it('matches a close to the next text editor only once', () => {
        const { exemptions } = setup();
        exemptions.noteCustomEditorClosed('file:///a.md');
        assert.strictEqual(exemptions.isExempt('file:///b.md'), false);
        assert.strictEqual(exemptions.isExempt('file:///a.md'), true);
        exemptions.noteTextTabsClosed('file:///a.md');
        assert.strictEqual(exemptions.isExempt('file:///a.md'), false);
    });
});
