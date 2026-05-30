/**
 * Parsing of markdown link destinations, shared between the webview (click
 * handling) and the extension host (link opening).
 *
 * A markdown link target can carry an optional title — `path "title"` or
 * `path 'title'` — and may be wrapped in angle brackets — `<path>`. The styled
 * `.md-url` span keeps the raw destination verbatim, so both must be stripped
 * before the destination is split into its path and `#fragment` parts.
 *
 * Pure (no DOM / no `vscode`) so both bundles can import it and it can be
 * unit-tested directly.
 */

export interface LinkTarget {
    /** The destination path with any title and angle brackets removed (may be empty for a pure `#fragment`). */
    path: string;
    /** The `#fragment` with the leading `#` removed (empty when there is none). */
    fragment: string;
}

export function parseLinkTarget(raw: string): LinkTarget {
    let dest = raw.trim();

    // Strip a trailing title: `dest "title"` or `dest 'title'`.
    const titleMatch = dest.match(/^(.*?)\s+["'][^"']*["']\s*$/);
    if (titleMatch) {
        dest = titleMatch[1].trim();
    }

    // Strip angle-bracket wrapping: `<dest>`.
    if (dest.startsWith('<') && dest.endsWith('>')) {
        dest = dest.slice(1, -1).trim();
    }

    const hashIndex = dest.indexOf('#');
    const path = hashIndex === -1 ? dest : dest.slice(0, hashIndex);
    const fragment = hashIndex === -1 ? '' : dest.slice(hashIndex + 1);

    return { path, fragment };
}
