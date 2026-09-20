/**
 * Rewriting of local image paths in markdown image syntax (`![alt](path)`),
 * used by the extension host to convert on-disk paths into webview URIs
 * before sending a document to the webview.
 *
 * The URI resolution itself needs `vscode.Uri`/`webviewPanel.webview.asWebviewUri`
 * and the document's directory, so it can't be pure — it is injected as
 * `resolveLocalPath`, keeping this module DOM/`vscode`-free and unit-testable.
 */

const IMAGE_MARKDOWN_PATTERN = /!\[([^\]]*)\]\(([^)\s'"]+)(\s+['"][^'"]*['"])?\)/g;

/**
 * Rewrite local image paths in `markdown` via `resolveLocalPath`. Remote
 * (`http(s):`/`data:`) and already-converted (`vscode-webview://`) images are
 * left untouched. Any optional title (with its leading whitespace) is
 * preserved verbatim — dropping it here previously caused silent data loss on
 * save (a titled image round-tripped without its title).
 *
 * `resolveLocalPath` returning `null` (e.g. the URI resolution throws) leaves
 * that image's markdown unchanged, matching the original try/catch fallback.
 */
export function rewriteImagePaths(markdown: string, resolveLocalPath: (imagePath: string) => string | null): string {
    return markdown.replace(
        IMAGE_MARKDOWN_PATTERN,
        (match, alt, imagePath, title = '') => {
            // Skip URLs (http, https, data URIs)
            if (/^(https?:|data:)/i.test(imagePath)) {
                return match;
            }
            // Skip already-converted webview URIs
            if (imagePath.startsWith('vscode-webview://')) {
                return match;
            }
            const resolved = resolveLocalPath(imagePath);
            if (resolved === null) {
                return match;
            }
            return `![${alt}](${resolved}${title})`;
        }
    );
}
