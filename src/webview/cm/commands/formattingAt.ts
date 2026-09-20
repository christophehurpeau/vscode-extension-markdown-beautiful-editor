/**
 * "What formatting applies at this cursor position?" query — the CM6
 * counterpart of the old `getFormattingAtCursor`/`findFormattingSpanAtCursor`
 * in `main.ts`. Under CM6 this is `syntaxTree(state).resolveInner(pos, -1)`
 * walked up through `.parent`, not a DOM walk over rendered `.md-*` spans.
 *
 * Drives the floating toolbar's active-button state (`../ui/floatingToolbar.ts`)
 * and the collapsed-cursor case in `./inlineFormat.ts` (old lines ~623-633:
 * toggling with no selection acts on the whole enclosing construct).
 */
import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import type { InlineFormat } from '../../../shared/inlineFormat';

export interface FormattingAtCursor {
    bold: boolean;
    italic: boolean;
    code: boolean;
    strikethrough: boolean;
    link: boolean;
}

/**
 * Lezer node name -> the {@link InlineFormat} it represents. `***bold
 * italic***` is `Emphasis` nested inside `StrongEmphasis` (two separate
 * nodes that compose), not a distinct node, so no `bold-italic` entry is
 * needed: walking every ancestor naturally sets both flags.
 */
const FORMAT_NODE_NAMES: Readonly<Record<string, InlineFormat>> = {
    StrongEmphasis: 'bold',
    Emphasis: 'italic',
    InlineCode: 'code',
    Strikethrough: 'strikethrough',
    Link: 'link',
};

function formatForNode(node: SyntaxNode): InlineFormat | null {
    return FORMAT_NODE_NAMES[node.name] ?? null;
}

/** Which inline formats are active at `pos` (drives toolbar button state). */
export function formattingAt(state: EditorState, pos: number): FormattingAtCursor {
    const result: FormattingAtCursor = { bold: false, italic: false, code: false, strikethrough: false, link: false };
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
    while (node) {
        const format = formatForNode(node);
        if (format) {
            result[format] = true;
        }
        node = node.parent;
    }
    return result;
}

/**
 * The `{from, to}` of the nearest ancestor construct matching `format`
 * enclosing `pos`, or `null` if `pos` is not inside one. The returned range
 * covers the whole construct including its delimiters (e.g. `**bold**` in
 * full), matching the old `findFormattingSpanAtCursor` + `selectNodeContents`
 * behavior used to seed a toggle when the cursor is collapsed.
 */
export function enclosingFormatRange(state: EditorState, pos: number, format: InlineFormat): { from: number; to: number } | null {
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
    while (node) {
        if (formatForNode(node) === format) {
            return { from: node.from, to: node.to };
        }
        node = node.parent;
    }
    return null;
}
