import * as assert from 'assert';
import { webviewBodyClass, webviewBodyHtml } from '../../shared/webviewBody';

describe('Webview body markup', () => {

    describe('Editor mode', () => {
        const html = webviewBodyHtml('editor');

        it('mounts the editor container the bootstrap looks for', () => {
            assert.ok(html.includes('id="editor"'));
        });

        it('ships the chrome the editor bootstrap wires up', () => {
            for (const id of [
                'toc',
                'toolbar',
                'toc-toggle-btn',
                'line-type-toolbar',
                'font-toggle-btn',
                'diff-toggle-btn',
                'diff-close-btn',
                'readonly-banner',
                'formatting-toolbar',
            ]) {
                assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
            }
        });

        it('carries the body class main.ts branches on', () => {
            assert.strictEqual(webviewBodyClass('editor'), 'editor-panel');
        });
    });

    describe('Diff panel mode', () => {
        const html = webviewBodyHtml('diff');

        it('mounts the editor container', () => {
            assert.ok(html.includes('id="editor"'));
        });

        it('omits the chrome that would have nothing to act on', () => {
            for (const id of ['toc', 'toolbar', 'formatting-toolbar', 'readonly-banner']) {
                assert.ok(!html.includes(`id="${id}"`), `unexpected #${id}`);
            }
        });

        it('labels both sides of the comparison', () => {
            assert.ok(html.includes('id="diff-label-original"'));
            assert.ok(html.includes('id="diff-label-modified"'));
            assert.ok(html.includes('id="diff-label-scope"'));
        });

        it('carries the body class main.ts branches on', () => {
            assert.strictEqual(webviewBodyClass('diff'), 'diff-panel');
        });
    });
});
