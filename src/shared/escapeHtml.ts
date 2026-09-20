/**
 * Escape HTML special characters for safe interpolation into `innerHTML`
 * template strings (TOC list items, etc.). Pure, no DOM.
 *
 * Moved out of the deleted `webview/markdown/parser.ts` during the CM6
 * migration (WP-1) — `src/webview/toc.ts` is the remaining consumer.
 */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
