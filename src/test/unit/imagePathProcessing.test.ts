import * as assert from 'assert';
import * as path from 'path';

/**
 * Unit tests for image path processing logic.
 * These tests verify that image paths are correctly identified and processed.
 */

// Simulate the regex used in customEditorProvider.ts for image path detection
const IMAGE_PATH_REGEX = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+['"]([^'"]*)['"])?\)/g;

describe('Image Path Processing', () => {
    
    describe('Image Path Detection', () => {
        it('should detect simple image', () => {
            const markdown = '![alt text](./image.png)';
            const matches = [...markdown.matchAll(IMAGE_PATH_REGEX)];
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0][1], 'alt text');
            assert.strictEqual(matches[0][2], './image.png');
        });

        it('should detect image with empty alt', () => {
            const markdown = '![](./image.png)';
            const matches = [...markdown.matchAll(IMAGE_PATH_REGEX)];
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0][1], '');
            assert.strictEqual(matches[0][2], './image.png');
        });

        it('should detect image with relative path using ../', () => {
            const markdown = '![logo](../images/logo.png)';
            const matches = [...markdown.matchAll(IMAGE_PATH_REGEX)];
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0][2], '../images/logo.png');
        });

        it('should detect image with double-quoted title', () => {
            const markdown = '![alt](./image.png "Image Title")';
            const matches = [...markdown.matchAll(IMAGE_PATH_REGEX)];
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0][2], './image.png');
            assert.strictEqual(matches[0][3], 'Image Title');
        });

        it('should detect image with single-quoted title', () => {
            const markdown = "![alt](./image.png 'Image Title')";
            const matches = [...markdown.matchAll(IMAGE_PATH_REGEX)];
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0][2], './image.png');
            assert.strictEqual(matches[0][3], 'Image Title');
        });

        it('should detect multiple images', () => {
            const markdown = '![first](./a.png) and ![second](./b.png)';
            const matches = [...markdown.matchAll(IMAGE_PATH_REGEX)];
            assert.strictEqual(matches.length, 2);
            assert.strictEqual(matches[0][1], 'first');
            assert.strictEqual(matches[1][1], 'second');
        });

        it('should detect https URL images', () => {
            const markdown = '![remote](https://example.com/image.png)';
            const matches = [...markdown.matchAll(IMAGE_PATH_REGEX)];
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0][2], 'https://example.com/image.png');
        });

        it('should detect data URI images', () => {
            const markdown = '![data](data:image/png;base64,ABC123)';
            const matches = [...markdown.matchAll(IMAGE_PATH_REGEX)];
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0][2], 'data:image/png;base64,ABC123');
        });
    });

    describe('Path Type Detection', () => {
        it('should identify https URL', () => {
            const imagePath = 'https://example.com/image.png';
            const isRemote = /^(https?:|data:)/i.test(imagePath);
            assert.ok(isRemote, 'Should identify https as remote');
        });

        it('should identify http URL', () => {
            const imagePath = 'http://example.com/image.png';
            const isRemote = /^(https?:|data:)/i.test(imagePath);
            assert.ok(isRemote, 'Should identify http as remote');
        });

        it('should identify data URI', () => {
            const imagePath = 'data:image/png;base64,ABC123';
            const isRemote = /^(https?:|data:)/i.test(imagePath);
            assert.ok(isRemote, 'Should identify data URI as remote');
        });

        it('should identify relative path as local', () => {
            const imagePath = './images/photo.png';
            const isRemote = /^(https?:|data:)/i.test(imagePath);
            assert.ok(!isRemote, 'Should identify relative path as local');
        });

        it('should identify parent path as local', () => {
            const imagePath = '../images/photo.png';
            const isRemote = /^(https?:|data:)/i.test(imagePath);
            assert.ok(!isRemote, 'Should identify parent path as local');
        });

        it('should identify absolute path as local', () => {
            const imagePath = '/Users/test/image.png';
            const isRemote = /^(https?:|data:)/i.test(imagePath);
            assert.ok(!isRemote, 'Should identify absolute path as local');
        });
    });

    describe('Path Resolution', () => {
        it('should resolve relative path correctly', () => {
            const documentDir = '/Users/test/docs';
            const imagePath = './images/photo.png';
            const resolved = path.resolve(documentDir, imagePath);
            assert.strictEqual(resolved, '/Users/test/docs/images/photo.png');
        });

        it('should resolve parent path correctly', () => {
            const documentDir = '/Users/test/docs/subfolder';
            const imagePath = '../images/photo.png';
            const resolved = path.resolve(documentDir, imagePath);
            assert.strictEqual(resolved, '/Users/test/docs/images/photo.png');
        });

        it('should resolve double parent path correctly', () => {
            const documentDir = '/Users/test/docs/sub1/sub2';
            const imagePath = '../../images/photo.png';
            const resolved = path.resolve(documentDir, imagePath);
            assert.strictEqual(resolved, '/Users/test/docs/images/photo.png');
        });

        it('should handle absolute path', () => {
            const documentDir = '/Users/test/docs';
            const imagePath = '/Users/other/image.png';
            const isAbsolute = path.isAbsolute(imagePath);
            assert.ok(isAbsolute, 'Should detect absolute path');
        });
    });

    describe('Image Path Restoration', () => {
        // Simulates the regex for restoring original paths
        const RESTORE_REGEX = /!\[([^\]]*)\]\((vscode-webview:\/\/[^)\s]+)(?:\s+['"]([^'"]*)['"])?\)/g;

        it('should match webview URI format', () => {
            const processed = '![alt](vscode-webview://abc123/image.png)';
            const matches = [...processed.matchAll(RESTORE_REGEX)];
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0][1], 'alt');
            assert.ok(matches[0][2].startsWith('vscode-webview://'));
        });

        it('should handle webview URI with title', () => {
            const processed = '![alt](vscode-webview://abc123/image.png "title")';
            const matches = [...processed.matchAll(RESTORE_REGEX)];
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0][3], 'title');
        });
    });
});

describe('Markdown Content Extraction', () => {
    
    describe('Line Processing', () => {
        it('should split markdown by newlines', () => {
            const markdown = 'Line 1\nLine 2\nLine 3';
            const lines = markdown.split('\n');
            assert.strictEqual(lines.length, 3);
            assert.strictEqual(lines[0], 'Line 1');
            assert.strictEqual(lines[1], 'Line 2');
            assert.strictEqual(lines[2], 'Line 3');
        });

        it('should handle empty lines', () => {
            const markdown = 'Line 1\n\nLine 3';
            const lines = markdown.split('\n');
            assert.strictEqual(lines.length, 3);
            assert.strictEqual(lines[1], '');
        });

        it('should handle Windows line endings', () => {
            const markdown = 'Line 1\r\nLine 2';
            const lines = markdown.replace(/\r\n/g, '\n').split('\n');
            assert.strictEqual(lines.length, 2);
        });
    });

    describe('Content Joining', () => {
        it('should join lines with newlines', () => {
            const lines = ['Line 1', 'Line 2', 'Line 3'];
            const markdown = lines.join('\n');
            assert.strictEqual(markdown, 'Line 1\nLine 2\nLine 3');
        });

        it('should preserve empty lines', () => {
            const lines = ['Line 1', '', 'Line 3'];
            const markdown = lines.join('\n');
            assert.strictEqual(markdown, 'Line 1\n\nLine 3');
        });
    });
});

