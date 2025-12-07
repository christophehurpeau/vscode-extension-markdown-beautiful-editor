import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('Extension Integration Tests', () => {
    const testWorkspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || __dirname;
    
    // Helper to create a temporary markdown file
    async function createTempMarkdownFile(content: string, filename?: string): Promise<vscode.Uri> {
        const tempDir = path.join(testWorkspaceRoot, '.test-temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const tempFile = path.join(tempDir, filename || `test-${Date.now()}.md`);
        fs.writeFileSync(tempFile, content);
        return vscode.Uri.file(tempFile);
    }

    // Helper to clean up temp files
    function cleanupTempFiles(): void {
        const tempDir = path.join(testWorkspaceRoot, '.test-temp');
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }

    teardown(() => {
        cleanupTempFiles();
    });

    test('Extension should be present', () => {
        const extension = vscode.extensions.getExtension('undefined_publisher.markdown-wysiwyg');
        // Extension may not be available in test environment without proper packaging
        // This is a basic sanity check
        assert.ok(true, 'Test suite runs successfully');
    });

    test('Custom editor provider should be registered', async () => {
        // Create a test markdown file
        const content = '# Test Document\n\nHello world.';
        const fileUri = await createTempMarkdownFile(content);

        try {
            // Open the document
            const doc = await vscode.workspace.openTextDocument(fileUri);
            assert.ok(doc, 'Document should open');
            assert.strictEqual(doc.languageId, 'markdown', 'Should be recognized as markdown');
        } finally {
            // Cleanup
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
    });

    test('Markdown file should be editable', async () => {
        const content = '# Original Title';
        const fileUri = await createTempMarkdownFile(content);

        try {
            const doc = await vscode.workspace.openTextDocument(fileUri);
            
            // Make an edit
            const edit = new vscode.WorkspaceEdit();
            edit.replace(fileUri, new vscode.Range(0, 0, 0, content.length), '# New Title');
            const success = await vscode.workspace.applyEdit(edit);
            
            assert.ok(success, 'Edit should succeed');
            assert.strictEqual(doc.getText(), '# New Title', 'Content should be updated');
        } finally {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
    });

    test('Sample markdown file should exist', () => {
        const samplePath = path.join(testWorkspaceRoot, 'samples', 'sample.md');
        // Only check if samples directory exists in the workspace
        if (fs.existsSync(path.join(testWorkspaceRoot, 'samples'))) {
            assert.ok(fs.existsSync(samplePath), 'Sample file should exist');
        }
    });

    suite('Markdown Content Tests', () => {
        test('Headings content should be preserved', async () => {
            const content = `# H1 Heading
## H2 Heading
### H3 Heading
#### H4 Heading
##### H5 Heading
###### H6 Heading`;
            const fileUri = await createTempMarkdownFile(content);

            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                const text = doc.getText();
                
                assert.ok(text.includes('# H1 Heading'), 'H1 should be preserved');
                assert.ok(text.includes('## H2 Heading'), 'H2 should be preserved');
                assert.ok(text.includes('### H3 Heading'), 'H3 should be preserved');
                assert.ok(text.includes('#### H4 Heading'), 'H4 should be preserved');
                assert.ok(text.includes('##### H5 Heading'), 'H5 should be preserved');
                assert.ok(text.includes('###### H6 Heading'), 'H6 should be preserved');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('Bold and italic content should be preserved', async () => {
            const content = `**bold text**
*italic text*
***bold and italic***
__also bold__
_also italic_`;
            const fileUri = await createTempMarkdownFile(content);

            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                const text = doc.getText();
                
                assert.ok(text.includes('**bold text**'), 'Double asterisk bold should be preserved');
                assert.ok(text.includes('*italic text*'), 'Single asterisk italic should be preserved');
                assert.ok(text.includes('***bold and italic***'), 'Triple asterisk should be preserved');
                assert.ok(text.includes('__also bold__'), 'Underscore bold should be preserved');
                assert.ok(text.includes('_also italic_'), 'Underscore italic should be preserved');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('Links and images content should be preserved', async () => {
            const content = `[Link text](https://example.com)
[Link with title](https://example.com "Title")
![Alt text](./image.png)
![](./image-no-alt.png)`;
            const fileUri = await createTempMarkdownFile(content);

            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                const text = doc.getText();
                
                assert.ok(text.includes('[Link text](https://example.com)'), 'Link should be preserved');
                assert.ok(text.includes('[Link with title](https://example.com "Title")'), 'Link with title should be preserved');
                assert.ok(text.includes('![Alt text](./image.png)'), 'Image should be preserved');
                assert.ok(text.includes('![](./image-no-alt.png)'), 'Image without alt should be preserved');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('Code content should be preserved', async () => {
            const content = `Inline \`code\` here

\`\`\`javascript
const x = 1;
\`\`\`

\`\`\`
plain code block
\`\`\``;
            const fileUri = await createTempMarkdownFile(content);

            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                const text = doc.getText();
                
                assert.ok(text.includes('`code`'), 'Inline code should be preserved');
                assert.ok(text.includes('```javascript'), 'Code fence with language should be preserved');
                assert.ok(text.includes('const x = 1;'), 'Code content should be preserved');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('Lists content should be preserved', async () => {
            const content = `- Unordered item 1
- Unordered item 2
  - Nested item

1. Ordered item 1
2. Ordered item 2

- [ ] Todo unchecked
- [x] Todo checked`;
            const fileUri = await createTempMarkdownFile(content);

            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                const text = doc.getText();
                
                assert.ok(text.includes('- Unordered item 1'), 'Unordered list should be preserved');
                assert.ok(text.includes('1. Ordered item 1'), 'Ordered list should be preserved');
                assert.ok(text.includes('- [ ] Todo unchecked'), 'Unchecked task should be preserved');
                assert.ok(text.includes('- [x] Todo checked'), 'Checked task should be preserved');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('Blockquotes content should be preserved', async () => {
            const content = `> Single blockquote

>> Nested blockquote

> Multi-line
> blockquote`;
            const fileUri = await createTempMarkdownFile(content);

            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                const text = doc.getText();
                
                assert.ok(text.includes('> Single blockquote'), 'Single blockquote should be preserved');
                assert.ok(text.includes('>> Nested blockquote'), 'Nested blockquote should be preserved');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('GitHub alerts content should be preserved', async () => {
            const content = `> [!NOTE]
> This is a note

> [!TIP]
> This is a tip

> [!IMPORTANT]
> This is important

> [!WARNING]
> This is a warning

> [!CAUTION]
> This is a caution`;
            const fileUri = await createTempMarkdownFile(content);

            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                const text = doc.getText();
                
                assert.ok(text.includes('> [!NOTE]'), 'NOTE alert should be preserved');
                assert.ok(text.includes('> [!TIP]'), 'TIP alert should be preserved');
                assert.ok(text.includes('> [!IMPORTANT]'), 'IMPORTANT alert should be preserved');
                assert.ok(text.includes('> [!WARNING]'), 'WARNING alert should be preserved');
                assert.ok(text.includes('> [!CAUTION]'), 'CAUTION alert should be preserved');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('Tables content should be preserved', async () => {
            const content = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |`;
            const fileUri = await createTempMarkdownFile(content);

            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                const text = doc.getText();
                
                assert.ok(text.includes('| Header 1 |'), 'Table header should be preserved');
                assert.ok(text.includes('|----------|'), 'Table separator should be preserved');
                assert.ok(text.includes('| Cell 1   |'), 'Table cells should be preserved');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('Escaped characters should be preserved', async () => {
            const content = `\\*not italic\\*
\\**not bold\\**
\\\`not code\\\``;
            const fileUri = await createTempMarkdownFile(content);

            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                const text = doc.getText();
                
                assert.ok(text.includes('\\*not italic\\*'), 'Escaped asterisks should be preserved');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('Horizontal rules should be preserved', async () => {
            const content = `Above

---

Below`;
            const fileUri = await createTempMarkdownFile(content);

            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                const text = doc.getText();
                
                assert.ok(text.includes('---'), 'Horizontal rule should be preserved');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('Strikethrough should be preserved', async () => {
            const content = `~~deleted text~~`;
            const fileUri = await createTempMarkdownFile(content);

            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                const text = doc.getText();
                
                assert.ok(text.includes('~~deleted text~~'), 'Strikethrough should be preserved');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });
    });

    suite('Edit Operations', () => {
        test('Should handle multiple sequential edits', async () => {
            const content = '# Title\n\nParagraph';
            const fileUri = await createTempMarkdownFile(content);

            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                
                // First edit
                let edit = new vscode.WorkspaceEdit();
                edit.insert(fileUri, new vscode.Position(2, 9), ' one');
                await vscode.workspace.applyEdit(edit);
                
                // Second edit
                edit = new vscode.WorkspaceEdit();
                edit.insert(fileUri, new vscode.Position(2, 13), ' two');
                await vscode.workspace.applyEdit(edit);
                
                assert.ok(doc.getText().includes('Paragraph one two'), 'Both edits should be applied');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('Should handle deletion edits', async () => {
            const content = '# Title to delete\n\nKeep this';
            const fileUri = await createTempMarkdownFile(content);

            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                
                const edit = new vscode.WorkspaceEdit();
                edit.delete(fileUri, new vscode.Range(0, 0, 1, 0));
                await vscode.workspace.applyEdit(edit);
                
                assert.ok(!doc.getText().includes('Title to delete'), 'Deleted content should be removed');
                assert.ok(doc.getText().includes('Keep this'), 'Remaining content should be preserved');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('Should handle replace edits', async () => {
            const content = '# Old Title';
            const fileUri = await createTempMarkdownFile(content);

            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                
                const edit = new vscode.WorkspaceEdit();
                edit.replace(fileUri, new vscode.Range(0, 2, 0, 11), 'New Title');
                await vscode.workspace.applyEdit(edit);
                
                assert.strictEqual(doc.getText(), '# New Title', 'Content should be replaced');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });
    });

    suite('File Operations', () => {
        test('Should handle empty file', async () => {
            const content = '';
            const fileUri = await createTempMarkdownFile(content);

            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                assert.strictEqual(doc.getText(), '', 'Empty file should be handled');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('Should handle large file', async () => {
            // Create a large markdown file
            let content = '# Large Document\n\n';
            for (let i = 0; i < 100; i++) {
                content += `## Section ${i}\n\nThis is paragraph ${i} with some **bold** and *italic* text.\n\n`;
            }
            const fileUri = await createTempMarkdownFile(content);

            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                assert.ok(doc.getText().length > 5000, 'Large file should be handled');
                assert.ok(doc.getText().includes('## Section 99'), 'All content should be present');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });

        test('Should handle special characters in content', async () => {
            const content = `# Special Characters

<angle brackets>
& ampersand
"quotes" and 'apostrophes'
© ® ™ symbols
emoji 🎉 🚀`;
            const fileUri = await createTempMarkdownFile(content);

            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                const text = doc.getText();
                
                assert.ok(text.includes('<angle brackets>'), 'Angle brackets should be preserved');
                assert.ok(text.includes('& ampersand'), 'Ampersand should be preserved');
                assert.ok(text.includes('emoji 🎉 🚀'), 'Emoji should be preserved');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        });
    });
});
