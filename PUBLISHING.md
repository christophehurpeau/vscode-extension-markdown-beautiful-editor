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
   ```bash
   npm install -g @vscode/vsce
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
    "url": "https://github.com/yourusername/vscode-extension-markdown-wysiwyg"
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
yarn run test:unit
yarn run check-types
```

### 5. Build Production Bundle
```bash
yarn run package
```

## Publishing

### First-time Setup
```bash
vsce login your-publisher-id
# Enter your PAT when prompted
```

### Package Extension
```bash
vsce package
# Creates markdown-wysiwyg-1.0.0.vsix
```

### Publish to Marketplace
```bash
vsce publish
```

Or publish a specific version:
```bash
vsce publish 1.0.0
```

### Publish Pre-release
```bash
vsce publish --pre-release
```

## Post-Publishing

1. Verify the extension appears on the marketplace
2. Test installation from the marketplace
3. Create a GitHub release with the .vsix file
4. Update README badges if applicable

## Version Bumping

To bump version and publish:
```bash
vsce publish minor  # 1.0.0 -> 1.1.0
vsce publish major  # 1.0.0 -> 2.0.0
vsce publish patch  # 1.0.0 -> 1.0.1
```

## Troubleshooting

### "Missing publisher"
Update `publisher` field in package.json with your publisher ID.

### "Missing icon"
Ensure `images/icon.png` exists and is a valid 128x128 PNG.

### "Personal Access Token invalid"
Create a new PAT with "Marketplace (Publish)" scope.

### Build errors
Run `yarn run compile` to check for TypeScript errors.

