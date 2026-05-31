/**
 * Document Operations Module
 *
 * Pure string/array transforms over markdown lines. These functions have no
 * DOM dependency, so they can be reused by the editor's event handlers and
 * exercised directly by unit tests (no jsdom / VS Code needed).
 */

import type { CursorPosition } from './state';

/**
 * A selection expressed in markdown line/offset coordinates.
 * Structurally compatible with `SelectionPosition` from `./cursor`.
 */
export interface LineRange {
    startLineIndex: number;
    startOffset: number;
    endLineIndex: number;
    endOffset: number;
}

/**
 * Delete a selected range from an array of markdown lines.
 *
 * Pure: the input array is not mutated. Returns the resulting lines and the
 * cursor position at the deletion point.
 */
export function deleteRange(lines: string[], range: LineRange): { lines: string[]; cursor: CursorPosition } {
    const cursor: CursorPosition = { lineIndex: range.startLineIndex, offset: range.startOffset };

    if (range.startLineIndex === range.endLineIndex) {
        // Single-line deletion
        const line = lines[range.startLineIndex];
        const merged = line.slice(0, range.startOffset) + line.slice(range.endOffset);
        const newLines = [...lines];
        newLines[range.startLineIndex] = merged;
        return { lines: newLines, cursor };
    }

    // Multi-line deletion: keep the head of the first line and the tail of the
    // last line, dropping everything in between.
    const before = lines[range.startLineIndex].slice(0, range.startOffset);
    const after = lines[range.endLineIndex].slice(range.endOffset);
    const newLines = [
        ...lines.slice(0, range.startLineIndex),
        before + after,
        ...lines.slice(range.endLineIndex + 1)
    ];
    return { lines: newLines, cursor };
}

/**
 * Insert `text` at a selection range in an array of markdown lines.
 *
 * Pure: the input array is not mutated. Any selected range is removed first
 * (a collapsed range is a no-op delete), then the text is inserted at that
 * point. `text` may contain newlines. Returns the resulting lines and the
 * cursor position immediately after the inserted text.
 */
export function insertText(lines: string[], range: LineRange, text: string): { lines: string[]; cursor: CursorPosition } {
    // Collapse any selected range, then insert at the collapse point.
    const { lines: collapsed, cursor: at } = deleteRange(lines, range);
    const line = collapsed[at.lineIndex] ?? '';
    const before = line.slice(0, at.offset);
    const after = line.slice(at.offset);

    const insertedLines = (before + text + after).split('\n');
    const newLines = [
        ...collapsed.slice(0, at.lineIndex),
        ...insertedLines,
        ...collapsed.slice(at.lineIndex + 1)
    ];

    const textLines = text.split('\n');
    const cursor: CursorPosition = textLines.length === 1
        ? { lineIndex: at.lineIndex, offset: at.offset + text.length }
        : { lineIndex: at.lineIndex + textLines.length - 1, offset: textLines[textLines.length - 1].length };

    return { lines: newLines, cursor };
}

/**
 * Remove any line-type prefix (heading, list, quote, code fence, …) from a line,
 * leaving the bare content.
 *
 * Note: these strip patterns intentionally differ from the detection patterns in
 * `LINE_TYPES` (parser.ts) — they also consume the trailing separator space so
 * the content comes back clean. Order matters: most specific first.
 */
export function stripLinePrefix(line: string): string {
    return line
        .replace(/^(-{3,}|\*{3,}|_{3,})\s*$/, '') // Horizontal rule
        .replace(/^#{1,6}\s/, '')                 // Headings
        .replace(/^[-*+]\s\[[ xX]\]\s/, '')       // Task list
        .replace(/^[-*+]\s/, '')                  // Unordered list
        .replace(/^\d+\.\s/, '')                  // Ordered list
        .replace(/^>+\s?/, '')                    // Blockquote (incl. nested)
        .replace(/^```\w*\s*/, '');               // Code fence
}

/**
 * Apply a line-type prefix to bare content, producing a markdown line of `type`.
 * Expects content that has already been run through {@link stripLinePrefix}.
 */
export function applyLinePrefix(content: string, type: string): string {
    switch (type) {
        case 'paragraph': return content;
        case 'h1': return `# ${content}`;
        case 'h2': return `## ${content}`;
        case 'h3': return `### ${content}`;
        case 'h4': return `#### ${content}`;
        case 'h5': return `##### ${content}`;
        case 'h6': return `###### ${content}`;
        case 'hr': return `---`;
        case 'ul': return `- ${content}`;
        case 'ol': return `1. ${content}`;
        case 'task': return `- [ ] ${content}`;
        case 'quote': return `> ${content}`;
        case 'code': return `\`\`\`\n${content}\n\`\`\``;
        default: return content;
    }
}
