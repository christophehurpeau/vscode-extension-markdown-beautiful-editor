# Publishing Guide

This document describes how to publish the Markdown Beautiful Editor extension to the VS Code Marketplace.

## Prerequisites

1. **VS Code Publisher Account**
   - Create a publisher at https://marketplace.visualstudio.com/manage
   - Note your publisher ID

2. **Personal Access Token (PAT)**

   The PAT comes from Azure DevOps, not from the marketplace site:

   1. Sign in to https://dev.azure.com/ with the same Microsoft account that owns the publisher.
      Create an organization if you don't have one (any name; it is only used to issue the token).
   2. Open the user settings menu (icon next to your avatar, top right) →
      **Personal access tokens** — direct link: https://dev.azure.com/<your-org>/_usersSettings/tokens
   3. **+ New Token**.
   4. **Organization**: select **All accessible organizations** (required — a token scoped to a
      single organization is rejected by the marketplace).
   5. **Expiration**: max 1 year; note the date, publishing fails once it expires.
   6. **Scopes**: click **Show all scopes**, find **Marketplace**, check **Manage**.
   7. **Create**, then copy the token immediately — it is shown only once.

   Store it in a password manager. For CI, pass it as the `VSCE_PAT` environment variable
   instead of running `vsce login`.

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

### 3. Regenerate Screenshots
```bash
pnpm exec playwright install chromium   # once per machine
pnpm run screenshots
```

Rewrites `images/screenshot.png`, `formatting.png`, `alerts.png` and `code.png`.
See [screenshots/README.md](../screenshots/README.md) to change what they show.

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
# Enter the PAT from Prerequisites step 2 when prompted
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
Usually one of: the token expired, it was scoped to a single organization instead of
**All accessible organizations**, or it lacks the **Marketplace → Manage** scope.
Create a new one following Prerequisites step 2.

### Build errors
Run `pnpm run compile` to check for TypeScript errors.

