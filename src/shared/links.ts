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

/** A parsed link reference definition: `[label]: url "title"`. */
export interface LinkDefinition {
    label: string;
    url: string;
}

/**
 * Resolve a reference-style link label to its destination URL. Labels are
 * matched case-insensitively and with surrounding whitespace collapsed, per the
 * CommonMark spec. Returns the first matching definition's URL, or `''` when
 * none matches. Pure so it can be unit-tested without a DOM.
 */
export function resolveReferenceUrl(ref: string, definitions: ReadonlyArray<LinkDefinition>): string {
    const wanted = ref.trim().toLowerCase();
    for (const def of definitions) {
        if (def.label.trim().toLowerCase() === wanted) {
            return def.url;
        }
    }
    return '';
}

export function parseLinkTarget(raw: string): LinkTarget {
    let dest = raw.trim();

    // Strip a trailing title: `dest "title"` or `dest 'title'`. A double-quoted
    // title may contain apostrophes (and vice versa), so match each quote style
    // against its own delimiter rather than a shared character class.
    const titleMatch = dest.match(/^(.*?)\s+(?:"[^"]*"|'[^']*')\s*$/);
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

/**
 * The clean destination URL of a link for display (e.g. a hover tooltip): any
 * title and angle brackets are stripped, but the `#fragment` is kept.
 */
export function linkDisplayUrl(raw: string): string {
    const { path, fragment } = parseLinkTarget(raw);
    return fragment ? `${path}#${fragment}` : path;
}
