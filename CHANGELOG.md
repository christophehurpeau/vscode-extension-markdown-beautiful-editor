# Changelog

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.4.6](https://github.com/christophehurpeau/vscode-extension-markdown-beautiful-editor/compare/v0.4.5...v0.4.6) (2026-10-16)

### Bug Fixes

* keep Cmd+Z from also undoing the backing document
* keep scroll position when the file is edited externally
* stop git refreshes from reverting unsent keystrokes

## [0.4.5](https://github.com/christophehurpeau/vscode-extension-markdown-beautiful-editor/compare/v0.4.4...v0.4.5) (2026-10-11)

### Bug Fixes

* **deps:** replace vsce 2.15.0 with @vscode/vsce 4.0.0 ([#23](https://github.com/christophehurpeau/vscode-extension-markdown-beautiful-editor/issues/23))
* **deps:** update brace-expansion to patched versions ([#22](https://github.com/christophehurpeau/vscode-extension-markdown-beautiful-editor/issues/22))
* show selection over code, quote and frontmatter backgrounds

## [0.1.0] - 2024-12-07

### Added
- Initial release of Markdown WYSIWYG editor
- **Visual Markdown Editing**
  - Styled headings (H1-H6) with proper typography
  - Bold, italic, strikethrough, and inline code formatting
  - Links with Cmd/Ctrl+Click to open
  - Image syntax display with local file support
  - Fenced code blocks with language indicator
  - Blockquotes with visual styling
  - Nested blockquotes support
  - Unordered, ordered, and task lists
  - Table rendering with separator styling
  - Horizontal rules with centered syntax

- **GitHub-Style Alerts**
  - `[!NOTE]` - Blue informational notes
  - `[!TIP]` - Green helpful tips
  - `[!IMPORTANT]` - Purple important information
  - `[!WARNING]` - Yellow/orange warnings
  - `[!CAUTION]` - Red caution alerts
  - Multi-line alert content support
  - Blended styling for consecutive lines

- **Table of Contents**
  - Auto-generated sidebar from document headings
  - Click to navigate to sections
  - Scroll spy for current section highlighting
  - Responsive design

- **Editor Features**
  - Line numbers with baseline alignment
  - Full undo/redo support
  - Bidirectional sync with source file
  - VS Code theme integration
  - Local image path resolution
  - Keyboard shortcuts (Tab, Enter, Backspace, Delete)

- **Testing**
  - Comprehensive unit test suite (136 tests)
  - Tests for markdown styling patterns
  - Tests for serialization round-trips
  - Tests for image path processing
  - Tests for TOC generation

### Technical
- Built with TypeScript
- Uses contenteditable for editing
- Custom CSS styling with VS Code theme variables
- ESBuild for bundling
- Mocha for testing
