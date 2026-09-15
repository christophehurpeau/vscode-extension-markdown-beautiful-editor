# Markdown WYSIWYG

A beautiful WYSIWYG-style markdown editor for VS Code that renders markdown syntax with visual styling while keeping the raw markdown fully editable.

![Markdown WYSIWYG Editor](images/screenshot.png)

## Features

### 📝 Visual Markdown Editing
- **Styled Headings**: H1-H6 rendered with proper typography and sizing
- **Text Formatting**: Bold, italic, strikethrough, and inline code with visual styling
- **Links & Images**: Clickable links (Cmd/Ctrl+Click) with styled syntax
- **Code Blocks**: Syntax-highlighted fenced code blocks with rounded corners
- **Blockquotes**: Styled blockquotes with left border and background (supports nested quotes)
- **Lists**: Unordered, ordered, and task lists with proper indentation
- **Tables**: Clean table rendering with separator styling
- **Horizontal Rules**: Visual dividers with centered syntax

### 🎨 GitHub-Style Alerts
Full support for GitHub's alert syntax:
- `[!NOTE]` - Blue informational notes
- `[!TIP]` - Green helpful tips  
- `[!IMPORTANT]` - Purple important information
- `[!WARNING]` - Yellow/orange warnings
- `[!CAUTION]` - Red caution alerts

### 📑 Table of Contents
- Auto-generated sidebar TOC from document headings
- Click to navigate to any section
- Scroll spy highlights current section
- Toggle it from the toolbar (☰) for more editing space; hidden by default on narrow viewports

### 🛠️ Formatting Toolbar
- **Selection-based toolbar**: Appears when you select text
- **Toggle formatting**: Bold, italic, code, strikethrough, and links
- **Smart detection**: Toolbar highlights active formatting at cursor position
- **Keyboard shortcuts**: Cmd/Ctrl+B (bold), Cmd/Ctrl+I (italic), Cmd/Ctrl+E (code), Cmd/Ctrl+K (link)

### 📋 Line Type Selector
- **Quick line conversion**: Click the line type icon next to any line number
- **Supported types**: Text, Headings (H1-H6), Bullet List, Numbered List, Task List, Quote, Code Block, Horizontal Rule
- **Visual indicators**: Each line shows its type with a distinctive icon
- **Nested support**: Properly handles nested blockquotes

### 🔤 Content Font
- **Proportional by default**: Prose renders with the UI font
- **Monospace option**: `markdown.beautifulEditor.fontFamily` set to `mono` uses the editor font
- **Temporary toggle**: The `Aa` button on the right of the toolbar switches the font for the current panel only, without changing the setting
- **Code stays monospace**: Inline code, fenced code blocks and tables always use the editor font

### 🎯 Editor Features
- **Line Numbers**: Always visible line numbers for easy reference
- **Syntax Visible**: Markdown syntax stays visible and editable
- **VS Code Theme Integration**: Respects your VS Code color theme
- **Bidirectional Sync**: Changes sync with the actual file
- **Undo/Redo**: Full undo/redo support via VS Code
- **Local Images**: Supports relative image paths
- **Clipboard Support**: Full copy, cut, paste, and select all (Cmd/Ctrl+A)
- **Cursor Persistence**: Cursor position preserved when switching tabs

## Installation

### From VS Code Marketplace
1. Open VS Code
2. Go to Extensions (Cmd/Ctrl+Shift+X)
3. Search for "Markdown WYSIWYG"
4. Click Install

### From VSIX
1. Download the `.vsix` file from releases
2. In VS Code: Cmd/Ctrl+Shift+P → "Extensions: Install from VSIX..."
3. Select the downloaded file

## Usage

### Opening Files
- **Right-click** any `.md` file → **Open With...** → **Markdown WYSIWYG**
- Or set as default: **Open With...** → Select editor → **Configure Default Editor...**

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+B` | Toggle bold |
| `Cmd/Ctrl+I` | Toggle italic |
| `Cmd/Ctrl+E` | Toggle inline code |
| `Cmd/Ctrl+K` | Insert/edit link |
| `Cmd/Ctrl+A` | Select all content |
| `Cmd/Ctrl+C` | Copy selection |
| `Cmd/Ctrl+X` | Cut selection |
| `Cmd/Ctrl+V` | Paste |
| `Cmd/Ctrl+Click` | Open link in browser |
| `Tab` | Insert 4 spaces |
| `Enter` | New line |
| `Backspace` | Delete/merge lines |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |

### Supported Markdown Syntax

```markdown
# Heading 1
## Heading 2

**bold** or __bold__
*italic* or _italic_
***bold and italic***
~~strikethrough~~
`inline code`

[Link](https://example.com)
![Image](./path/to/image.png)

- Unordered list
1. Ordered list
- [ ] Task list
- [x] Completed task

> Blockquote
>> Nested blockquote

> [!NOTE]
> GitHub-style alert

\`\`\`javascript
// Code block
\`\`\`

| Table | Header |
|-------|--------|
| Cell  | Cell   |

---
Horizontal rule
```

## Screenshots

### Headings and Text Formatting
![Text Formatting](images/formatting.png)

### GitHub Alerts
![GitHub Alerts](images/alerts.png)

### Code Blocks
![Code Blocks](images/code.png)

## Development

### Prerequisites
- Node.js 18+
- pnpm

### Setup
```bash
git clone https://github.com/yourusername/vscode-extension-markdown-beautiful-editor.git
cd vscode-extension-markdown-beautiful-editor
pnpm install
```

### Build
```bash
pnpm run compile      # Build extension
pnpm run watch        # Watch mode for development
```

### Test
```bash
pnpm run test:unit    # Run unit tests
pnpm run test         # Run all tests
```

### Debug
1. Open project in VS Code
2. Press F5 to launch Extension Development Host
3. Open any `.md` file with the WYSIWYG editor

### Project Structure
```
src/
├── extension.ts              # Extension entry point
├── editor/
│   ├── customEditorProvider.ts  # VS Code custom editor
│   └── webviewContent.ts        # Webview HTML generation
├── webview/
│   ├── main.ts               # Webview editor logic
│   └── toc.ts                # Table of contents
├── styles/
│   └── editor.css            # Editor styling
└── test/
    ├── unit/                 # Unit tests
    └── integration/          # Integration tests
```

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `pnpm test`
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

**Enjoy writing markdown!** ✨
