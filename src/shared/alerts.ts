/**
 * GitHub alert (`> [!NOTE]`, `> [!TIP]`, ...) header parsing and the line
 * classes for the contiguous header+content block it introduces. Pure (no
 * DOM), so it is shared between the webview and unit tests.
 */

export type AlertType = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';

const ALERT_HEADER_PATTERN = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i;

/**
 * Parse a GitHub alert header line (e.g. `> [!NOTE]`), or `null` if the line
 * isn't one. Matching is case-insensitive; the returned type is always
 * uppercase, matching the header's rendered label regardless of the source
 * line's casing.
 */
export function parseAlertHeader(line: string): AlertType | null {
    const match = line.match(ALERT_HEADER_PATTERN);
    return match ? (match[1].toUpperCase() as AlertType) : null;
}

export interface AlertHeaderRanges {
    /** The bare type label (`NOTE`), styled `md-alert-type`. */
    type: { from: number; to: number };
    /** The `[!` and `]` delimiters, styled `md-syntax`. The leading `>` is
     *  already a `QuoteMark` in the grammar and gets `md-syntax` from there. */
    syntax: { from: number; to: number }[];
}

/**
 * Character offsets, relative to the start of the header line, of the parts
 * of `> [!NOTE]` that are styled individually. The old parser emitted
 * `<span class="md-syntax">&gt; [!</span><span class="md-alert-type">NOTE</span>
 * <span class="md-syntax">]</span>`; this reproduces that split as decoration
 * ranges. Returns `null` when the line is not an alert header.
 */
export function alertHeaderRanges(line: string): AlertHeaderRanges | null {
    if (!parseAlertHeader(line)) {
        return null;
    }
    const open = line.indexOf('[!');
    const close = line.indexOf(']', open);
    if (open === -1 || close === -1) {
        return null;
    }
    return {
        type: { from: open + 2, to: close },
        syntax: [
            { from: open, to: open + 2 },
            { from: close, to: close + 1 },
        ],
    };
}

export interface AlertLinePosition {
    /** Zero-based position of this line within its contiguous alert block (0 = the header). */
    index: number;
    /** Total number of lines in the block (header + content). */
    total: number;
    type: AlertType;
}

/**
 * The classes for one line of a rendered alert block, given its position
 * within the contiguous header+content block. The header (index 0) gets
 * `md-alert`; content lines get `md-alert-content`. Both get `md-alert-<type>`
 * and the `alert-first`/`alert-last`/`alert-single` boundary classes, so CSS
 * can round the block's outer corners without a wrapper element.
 */
export function alertLineClasses({ index, total, type }: AlertLinePosition): string {
    const isFirst = index === 0;
    const isLast = index === total - 1;
    const typeClass = `md-alert-${type.toLowerCase()}`;

    if (isFirst) {
        const classes = ['md-alert', typeClass, 'alert-first'];
        if (isLast) {
            classes.push('alert-last', 'alert-single');
        }
        return classes.join(' ');
    }

    const classes = ['md-alert-content', typeClass];
    if (isLast) {
        classes.push('alert-last');
    }
    return classes.join(' ');
}
