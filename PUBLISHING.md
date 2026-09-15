# Publishing Guide

This document describes how to publish the Markdown WYSIWYG extension to the VS Code Marketplace.

## Prerequisites

1. **VS Code Publisher Account**
   - Create a publisher at https://marketplace.visualstudio.com/manage
   - Note your publisher ID

2. **Personal Access Token (PAT)**
   - Go to https://dev.azure.com/
   - Create a PAT with "Marketplace (Publish)" scope
   - Save the token securely

3. **vsce CLI**
   `vsce` is pinned in devDependencies, so run it through pnpm (`pnpm exec vsce ...`).
   To install it globally instead:
   ```bash
   pnpm add -g @vscode/vsce
   ```

## Before Publishing

### 1. Update package.json
Edit `package.json` and replace placeholder values:
```json
{
  "publisher": "your-actual-publisher-id",
  "author": {
    "name": "Your Actual Name"
  },
  "repository": {
    "url": "https://github.com/yourusername/vscode-extension-markdown-beautiful-editor"
  }
}
```

### 2. Create PNG Icon
The marketplace requires a PNG icon (128x128 recommended):
```bash
# Convert SVG to PNG (requires ImageMagick or similar)
convert images/icon.svg -resize 128x128 images/icon.png
```

Or create a PNG icon manually and save to `images/icon.png`.

### 3. Add Screenshots
Take screenshots of the extension in action and save to `images/`:
- `images/screenshot.png` - Main editor view
- `images/formatting.png` - Text formatting examples
- `images/alerts.png` - GitHub alerts
- `images/code.png` - Code blocks

### 4. Run Tests
```bash
pnpm run test:unit
pnpm run check-types
```

### 5. Build Production Bundle
```bash
pnpm run package
```

## Publishing

Everything is bundled by esbuild and `node_modules` is excluded via `.vscodeignore`, so
`vsce` is always run with `--no-dependencies`: its npm-based dependency walk does not
understand pnpm's symlinked `node_modules`.

### First-time Setup
```bash
pnpm exec vsce login your-publisher-id
# Enter your PAT when prompted
```

### Package Extension
```bash
pnpm run package:vsce
# Creates markdown-beautiful-editor-1.0.0.vsix
```

### Publish to Marketplace
```bash
pnpm exec vsce publish --no-dependencies
```

Or publish a specific version:
```bash
pnpm exec vsce publish 1.0.0 --no-dependencies
```

### Publish Pre-release
```bash
pnpm exec vsce publish --pre-release --no-dependencies
```

## Post-Publishing

1. Verify the extension appears on the marketplace
2. Test installation from the marketplace
3. Create a GitHub release with the .vsix file
4. Update README badges if applicable

## Version Bumping

To bump version and publish:
```bash
pnpm exec vsce publish minor --no-dependencies  # 1.0.0 -> 1.1.0
pnpm exec vsce publish major --no-dependencies  # 1.0.0 -> 2.0.0
pnpm exec vsce publish patch --no-dependencies  # 1.0.0 -> 1.0.1
```

## Troubleshooting

### "Missing publisher"
Update `publisher` field in package.json with your publisher ID.

### "Missing icon"
Ensure `images/icon.png` exists and is a valid 128x128 PNG.

### "Personal Access Token invalid"
Create a new PAT with "Marketplace (Publish)" scope.

### Build errors
Run `pnpm run compile` to check for TypeScript errors.

