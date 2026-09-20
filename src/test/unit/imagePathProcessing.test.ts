import * as assert from 'assert';
import { rewriteImagePaths } from '../../shared/imagePaths';

/**
 * Unit tests for `rewriteImagePaths`, the pure part of `processImagePaths`
 * (src/editor/customEditorProvider.ts) extracted to src/shared/imagePaths.ts.
 * These exercise the real production regex/skip logic — the resolver callback
 * stands in for the `vscode.Uri`/`asWebviewUri` resolution the host injects.
 *
 * Replaces the previous version of this file, which asserted against a
 * hand-copied regex living only in the test and would pass regardless of
 * what the production code did (see docs/TRIAGE.md #1, the title-loss bug a
 * test like that could never have caught).
 */

const toWebviewUri = (imagePath: string): string => `vscode-webview://converted/${imagePath}`;

describe('rewriteImagePaths', () => {
    it('rewrites a simple local image path', () => {
        const result = rewriteImagePaths('![alt text](./image.png)', toWebviewUri);
        assert.strictEqual(result, '![alt text](vscode-webview://converted/./image.png)');
    });

    it('preserves an empty alt', () => {
        const result = rewriteImagePaths('![](./image.png)', toWebviewUri);
        assert.strictEqual(result, '![](vscode-webview://converted/./image.png)');
    });

    it('rewrites a relative parent path', () => {
        const result = rewriteImagePaths('![logo](../images/logo.png)', toWebviewUri);
        assert.strictEqual(result, '![logo](vscode-webview://converted/../images/logo.png)');
    });

    // docs/TRIAGE.md #1: the title (with its quotes) was previously dropped by
    // the replacement, silently losing data on save.
    it('preserves a double-quoted title', () => {
        const result = rewriteImagePaths('![a](img.png "Image Title")', toWebviewUri);
        assert.strictEqual(result, '![a](vscode-webview://converted/img.png "Image Title")');
    });

    it('preserves a single-quoted title', () => {
        const result = rewriteImagePaths("![a](img.png 'Image Title')", toWebviewUri);
        assert.strictEqual(result, "![a](vscode-webview://converted/img.png 'Image Title')");
    });

    it('leaves a title-less image unchanged in shape', () => {
        const result = rewriteImagePaths('![a](img.png)', toWebviewUri);
        assert.strictEqual(result, '![a](vscode-webview://converted/img.png)');
    });

    it('rewrites multiple images independently', () => {
        const result = rewriteImagePaths('![first](./a.png) and ![second](./b.png)', toWebviewUri);
        assert.strictEqual(
            result,
            '![first](vscode-webview://converted/./a.png) and ![second](vscode-webview://converted/./b.png)'
        );
    });

    it('does not touch https URLs', () => {
        const markdown = '![remote](https://example.com/image.png)';
        assert.strictEqual(rewriteImagePaths(markdown, toWebviewUri), markdown);
    });

    it('does not touch https URLs even when titled', () => {
        const markdown = '![a](https://example.com/i.png "Title")';
        assert.strictEqual(rewriteImagePaths(markdown, toWebviewUri), markdown);
    });

    it('does not touch data URIs', () => {
        const markdown = '![data](data:image/png;base64,ABC123)';
        assert.strictEqual(rewriteImagePaths(markdown, toWebviewUri), markdown);
    });

    it('does not touch already-converted vscode-webview:// URIs', () => {
        const markdown = '![alt](vscode-webview://abc123/image.png)';
        assert.strictEqual(rewriteImagePaths(markdown, toWebviewUri), markdown);
    });

    it('does not touch an already-converted URI even when titled', () => {
        const markdown = '![alt](vscode-webview://abc123/image.png "title")';
        assert.strictEqual(rewriteImagePaths(markdown, toWebviewUri), markdown);
    });

    it('leaves the match unchanged when the resolver returns null (resolution failure)', () => {
        const markdown = '![a](./broken.png)';
        assert.strictEqual(rewriteImagePaths(markdown, () => null), markdown);
    });

    it('resolves an absolute path via the injected resolver', () => {
        const result = rewriteImagePaths('![a](/Users/test/image.png)', (p) => `vscode-webview://converted${p}`);
        assert.strictEqual(result, '![a](vscode-webview://converted/Users/test/image.png)');
    });
});
