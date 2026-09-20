/**
 * Table column layout: alignment and width, derived from a markdown table's
 * cells.
 *
 * Takes pre-split cell arrays rather than raw `|a|b|` line strings, so a
 * future Lezer-based (CM6) table walker can feed it cell text sliced straight
 * from the syntax tree without reconstructing pipe-delimited lines. Pure (no
 * DOM), so it is shared between the webview and unit tests.
 */

/**
 * Column alignment of a markdown table, derived from the colons in the
 * delimiter row (`:---` left, `:--:` center, `---:` right, `---` none).
 */
export type TableColumnAlign = 'left' | 'center' | 'right' | 'none';

export interface TableColumn {
    align: TableColumnAlign;
    /** Width of the widest cell in this column, in characters (trimmed). */
    width: number;
}

/**
 * Whether every cell of a row looks like a delimiter cell: dashes with
 * optional surrounding colons (`---`, `:--:`, `--:`, ...).
 */
export function isDelimiterRowCells(cells: string[]): boolean {
    return cells.length > 0 && cells.every(c => /^\s*:?-+:?\s*$/.test(c));
}

/**
 * Resolve the alignment of a single delimiter cell from its colons.
 */
function alignFromDelimiterCell(cell: string): TableColumnAlign {
    const trimmed = cell.trim();
    const left = trimmed.startsWith(':');
    const right = trimmed.endsWith(':');
    if (left && right) { return 'center'; }
    if (right) { return 'right'; }
    if (left) { return 'left'; }
    return 'none';
}

/**
 * Derive per-column alignment and width for a contiguous block of table rows,
 * given as arrays of cell strings (one array per row, in row order, including
 * the delimiter row if present). Width is the widest trimmed cell across all
 * rows (including the delimiter, so the pipes line up with the author's
 * dashes), measured in characters.
 */
export function parseTableColumns(rows: string[][]): TableColumn[] {
    const delimiterCells = rows.find(isDelimiterRowCells);
    const aligns = delimiterCells ? delimiterCells.map(alignFromDelimiterCell) : [];
    const colCount = Math.max(aligns.length, ...rows.map(r => r.length));

    const columns: TableColumn[] = [];
    for (let c = 0; c < colCount; c++) {
        let width = 1;
        for (const cells of rows) {
            const cell = cells[c];
            if (cell !== undefined) {
                width = Math.max(width, cell.trim().length);
            }
        }
        columns.push({ align: aligns[c] ?? 'none', width });
    }
    return columns;
}
