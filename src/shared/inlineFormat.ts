/**
 * Inline markdown formatting toggle: bold/italic/code/strikethrough/link.
 *
 * Pure (no DOM): operates on a line of markdown text and character offsets
 * into it, and returns a description of the edit to make plus where the
 * cursor should land — the caller (main.ts) is responsible for turning a real
 * DOM selection into these offsets and applying the returned edit.
 */

import { inlineLinkText } from './links';

export type InlineFormat = 'bold' | 'italic' | 'code' | 'strikethrough' | 'link';

const INLINE_FORMATS: ReadonlySet<string> = new Set<InlineFormat>(['bold', 'italic', 'code', 'strikethrough', 'link']);

/** Narrow an arbitrary string (e.g. a toolbar button's `dataset.format`) to a known {@link InlineFormat}. */
export function isInlineFormat(value: string): value is InlineFormat {
    return INLINE_FORMATS.has(value);
}

const MARKERS: Record<Exclude<InlineFormat, 'link'>, { prefix: string; suffix: string }> = {
    bold: { prefix: '**', suffix: '**' },
    italic: { prefix: '*', suffix: '*' },
    code: { prefix: '`', suffix: '`' },
    strikethrough: { prefix: '~~', suffix: '~~' },
};

export interface InlineFormatChangeInput {
    /** The full line of markdown text the selection lives in. */
    text: string;
    /** Selection start offset within `text` (0-based). */
    from: number;
    /** Selection end offset within `text`. */
    to: number;
    format: InlineFormat;
}

export interface InlineFormatChange {
    /** Text to splice into `text` in place of the `[from, to)` range. */
    insert: string;
    /** Start offset of the range being replaced (may differ from the input `from` when markers just outside the selection are consumed). */
    from: number;
    /** End offset of the range being replaced. */
    to: number;
    /** Offset (in the resulting line) where the cursor should land. */
    selection: number;
}

/**
 * Toggle inline markdown formatting over a selection within a single line.
 *
 * Mirrors the previous `applyInlineFormat`'s toggle rules exactly:
 * - `link`: unwraps a selection that is exactly `[label](dest)` back to
 *   `label` (via {@link inlineLinkText}); otherwise wraps the selection as
 *   `[selection](url)`.
 * - other formats: if markers sit just outside the selection, remove them;
 *   if the selection itself is fully wrapped in markers, remove them; else
 *   wrap the selection in markers.
 *
 * Returns `null` when there is nothing to do (empty selection).
 */
export function inlineFormatChange({ text, from, to, format }: InlineFormatChangeInput): InlineFormatChange | null {
    const selectedText = text.slice(from, to);
    if (!selectedText) {
        return null;
    }

    if (format === 'link') {
        const linkLabel = inlineLinkText(selectedText);
        if (linkLabel !== null) {
            return { insert: linkLabel, from, to, selection: from + linkLabel.length };
        }
        const wrapped = `[${selectedText}](url)`;
        return { insert: wrapped, from, to, selection: from + wrapped.length };
    }

    const { prefix, suffix } = MARKERS[format];
    const before = text.slice(0, from);
    const after = text.slice(to);

    // Markers sit just outside the selection.
    if (before.endsWith(prefix) && after.startsWith(suffix)) {
        return {
            insert: selectedText,
            from: from - prefix.length,
            to: to + suffix.length,
            selection: from - prefix.length + selectedText.length,
        };
    }

    // The selection itself includes the markers (e.g. selecting "**bold**").
    if (selectedText.startsWith(prefix) && selectedText.endsWith(suffix) && selectedText.length > prefix.length + suffix.length) {
        const inner = selectedText.slice(prefix.length, -suffix.length);
        return { insert: inner, from, to, selection: from + inner.length };
    }

    const wrapped = prefix + selectedText + suffix;
    return { insert: wrapped, from, to, selection: from + wrapped.length };
}
