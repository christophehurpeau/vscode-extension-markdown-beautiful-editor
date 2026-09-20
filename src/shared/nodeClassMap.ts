/**
 * Lezer node name -> `md-*` decoration mapping, as DATA.
 *
 * This is CONVENTION (a) for the CM6 migration (see
 * `.claude/agents/cm6-migration.md` and `docs/plans/CODEMIRROR6_MIGRATION.md`):
 * a new construct is added by inserting an entry here, not by adding a branch
 * to the tree walk in `src/webview/cm/decorations.ts`. That file reads this
 * table mechanically; it should not need to change shape as the table grows.
 *
 * Each node name maps to exactly one entry describing which decoration layer
 * it belongs to (see `decorations.ts`'s header for what the three layers are
 * and why the split exists):
 *
 *   - 'mark'   Decoration.mark over the node's whole range, default Prec.
 *              Use for a construct's overall span (e.g. `StrongEmphasis` ->
 *              the entire `**bold**` range).
 *   - 'syntax' Decoration.mark over the node's whole range, Prec.highest,
 *              class `md-syntax` by convention. Use for delimiter/marker
 *              leaf nodes (e.g. `EmphasisMark`, `CodeMark`, `HeaderMark`) so
 *              they render dimmed *inside* the construct's mark rather than
 *              beside it.
 *   - 'line'   Decoration.line, applied to every line the node's range
 *              touches, Prec.lowest. Classes accumulate per line (a line can
 *              carry several). Use for anything that needs a block box
 *              (background/border/padding) — marks cannot carry one, they
 *              are split at line boundaries.
 *
 * A node name may appear at most once here. This table does not (and must
 * not need to) express parent-context distinctions — e.g. `EmphasisMark`
 * appears identically under both `Emphasis` and `StrongEmphasis`, and gets
 * the same `md-syntax` treatment either way, because the leaf layer's
 * *nesting* (which construct's mark it renders inside) comes from CM6's own
 * Prec-based DOM nesting, not from anything recorded here.
 *
 * WP-1 proved the pipeline with four constructs (`md-bold`, `md-italic`,
 * `md-heading`, `md-code`) plus their `md-syntax` delimiters. WP-H (this
 * table, below the WP-1 marker) extends it for the remaining `md-*` classes
 * recovered from the deleted regex parser (`git show
 * main:src/webview/markdown/parser.ts` / `main:src/styles/editor.css`) —
 * see the full class table in WP-H's report. Some entries are one node's
 * *primary* class here, with an additional synthesized decoration layered
 * on top by `decorations.ts` itself (documented per-row below) for classes
 * this flat one-row-per-node shape genuinely cannot express alone — a
 * conditional class (`Task`'s checked/unchecked), a class that depends on
 * *which* node the same name means in context (`TableDelimiter` is both a
 * single '|' and, once, the whole delimiter row), or a class synthesized
 * over a *sub-range* with no node of its own (`md-text`, `md-alt`,
 * `md-ref`, `md-strike-text`, the `Escape` backslash). Those nodes
 * (`Task`, `TableCell`, `TableDelimiter`, `LinkLabel`, `LinkTitle`) are
 * deliberately absent from this table — see `decorations.ts`'s per-node
 * special-case functions.
 *
 * Out of scope for WP-H (owned by other packages, entries added by them):
 * GitHub alerts (`md-alert*`, WP-A — alerts have no grammar node of their
 * own, they read a `Blockquote`'s first line; see
 * `./alerts.ts` / `decorations/alerts.ts`), footnotes (`md-footnote*`,
 * WP-G2 — grammar not implemented yet, `lang/footnotes.ts` is a no-op
 * stub), definition lists (`md-definition`, WP-G3 — grammar not
 * implemented yet, `lang/definitionList.ts` is a no-op stub). Math
 * (`md-math`, `md-math-content`) *is* implemented below — WP-G1's grammar
 * (`lang/math.ts`) landed with real `InlineMath`/`MathContent`/`MathMark`
 * nodes, so unlike footnotes/definitions there is something to map.
 */

export type NodeDecorationLayer = 'mark' | 'syntax' | 'line';

export interface NodeClassEntry {
    layer: NodeDecorationLayer;
    /** The `md-*` class to apply. Exactly one class per entry; a node that
     *  legitimately needs more than one class is a sign it needs its own
     *  decoration-layer logic (e.g. alerts), not a second entry here.
     *  Exception: a handful of line-level entries below hold a
     *  space-separated pair of *statically* co-occurring classes (e.g.
     *  ATXHeading1's `'md-heading md-h1'`) — that is still one fixed
     *  string per node name, not a conditional choice, so it does not need
     *  the special-case treatment described in this file's header. */
    class: string;
}

// Worked example (WP-1) — do not remove existing entries when extending this
// table; append new ones.
export const NODE_CLASS_MAP: Readonly<Record<string, NodeClassEntry>> = {
    // Construct marks (default Prec)
    StrongEmphasis: { layer: 'mark', class: 'md-bold' },
    Emphasis: { layer: 'mark', class: 'md-italic' },
    InlineCode: { layer: 'mark', class: 'md-code' },

    // Line decorations (Prec.lowest). ATXHeading1..6 are separate node names
    // in @lezer/markdown (one per level). WP-H activates per-level sizing
    // (`md-h1`..`md-h6`, alongside the shared `md-heading`) deliberately —
    // see the report: this reactivates the six `.md-h1`..`.md-h6` margin
    // rules that were inert while `.md-heading` was `display: inline`, and
    // every document's heading spacing visibly changes as a result. That is
    // the chosen behavior, not a regression.
    ATXHeading1: { layer: 'line', class: 'md-heading md-h1' },
    ATXHeading2: { layer: 'line', class: 'md-heading md-h2' },
    ATXHeading3: { layer: 'line', class: 'md-heading md-h3' },
    ATXHeading4: { layer: 'line', class: 'md-heading md-h4' },
    ATXHeading5: { layer: 'line', class: 'md-heading md-h5' },
    ATXHeading6: { layer: 'line', class: 'md-heading md-h6' },

    // Setext headings (`Title` over `===` / `---`) are a deliberate behavior
    // change. The old regex parser had no setext support, so `---` under a
    // paragraph line rendered as `md-hr`; Lezer parses it as SetextHeading,
    // which CommonMark agrees it is. Left unmapped these render with no class
    // at all, so mapping them to the heading classes is both the CommonMark
    // reading and the only option that does not silently lose styling.
    // A standalone `---` after a blank line is still HorizontalRule/`md-hr`.
    // The node spans the title AND its underline, but this class applies to
    // the title line(s) only — decorations.ts stops it there and gives the
    // `===`/`---` line `md-setext-underline`, so the underline keeps normal
    // line metrics instead of a second heading-sized line box.
    SetextHeading1: { layer: 'line', class: 'md-heading md-h1' },
    SetextHeading2: { layer: 'line', class: 'md-heading md-h2' },

    // Leaf syntax marks (Prec.highest)
    EmphasisMark: { layer: 'syntax', class: 'md-syntax' },
    CodeMark: { layer: 'syntax', class: 'md-syntax' },
    HeaderMark: { layer: 'syntax', class: 'md-syntax' },

    // --- WP-H below ---

    // Delimiter/marker leaves reused across several constructs — one entry
    // each covers every parent context (Strikethrough, task items, list
    // items, links/images/autolinks/link references, blockquotes).
    StrikethroughMark: { layer: 'syntax', class: 'md-syntax' },
    TaskMarker: { layer: 'syntax', class: 'md-syntax' },
    ListMark: { layer: 'syntax', class: 'md-syntax' },
    LinkMark: { layer: 'syntax', class: 'md-syntax' },
    QuoteMark: { layer: 'syntax', class: 'md-syntax' },

    // Fenced code: CodeMark (the ``` marks) already maps via the shared
    // CodeMark entry above. CodeInfo is the fence's language tag (` ```ts `).
    // CodeText (the nested language's own tokens) is never mapped — the
    // tree walk returns `false` on it before reaching this table.
    CodeInfo: { layer: 'mark', class: 'md-code-info' },

    // Primary classes with an additional synthesized decoration layered on
    // top by decorations.ts (see that file's per-node special cases):
    //   Escape          -> also md-syntax on the backslash [from, from+1)
    //   Strikethrough   -> also md-strike-text on the inner text range
    //   Link            -> also md-text (text range) and, when the link has
    //                      a LinkLabel child, md-ref-link over the same span
    //   Image           -> also md-alt (alt-text range), Prec.highest
    //   Blockquote      -> also md-quote-1/2/3 (ancestor depth, capped) and
    //                      blockquote-first/blockquote-last
    //   HorizontalRule  -> also md-hr-text over the same range
    //   Table           -> also per-cell md-table-cell/md-col-*/md-table-sep
    //                      classes on its TableCell/TableDelimiter children
    //                      (see decorations.ts: those two node names are
    //                      deliberately absent from this table because the
    //                      same node name means different things depending
    //                      on position — a lone '|' vs. the whole delimiter
    //                      row — which this flat shape cannot express)
    Escape: { layer: 'mark', class: 'md-escaped' },
    Strikethrough: { layer: 'mark', class: 'md-strike' },
    Autolink: { layer: 'mark', class: 'md-autolink' },
    Link: { layer: 'mark', class: 'md-link' },
    Image: { layer: 'mark', class: 'md-image' },
    LinkReference: { layer: 'mark', class: 'md-link-def' },
    URL: { layer: 'syntax', class: 'md-url' },
    ListItem: { layer: 'mark', class: 'md-list' },
    Blockquote: { layer: 'line', class: 'md-blockquote' },
    HorizontalRule: { layer: 'line', class: 'md-hr' },
    FencedCode: { layer: 'line', class: 'md-code-block' },
    Table: { layer: 'mark', class: 'md-table' },

    // Math (WP-G1, `lang/math.ts` — grammar landed, this package owns the
    // decoration mapping per this file's ownership split).
    InlineMath: { layer: 'mark', class: 'md-math' },
    MathContent: { layer: 'mark', class: 'md-math-content' },
    MathMark: { layer: 'syntax', class: 'md-syntax' },

    // Footnotes (WP-G2, `lang/footnotes.ts`). Marks, not lines: the old
    // parser emitted both as inline spans (see `git show
    // main:src/webview/markdown/parser.ts`, lines 273 and 495).
    // The reference's id was left unstyled while the definition's whole
    // `[^id]:` was one md-syntax span, so FootnoteLabel gets no entry but
    // FootnoteDefLabel does -- that asymmetry reproduces the old rendering.
    Footnote: { layer: 'mark', class: 'md-footnote' },
    FootnoteMark: { layer: 'syntax', class: 'md-syntax' },
    FootnoteDef: { layer: 'mark', class: 'md-footnote-def' },
    FootnoteDefMark: { layer: 'syntax', class: 'md-syntax' },
    FootnoteDefLabel: { layer: 'syntax', class: 'md-syntax' },

    // Definition lists (WP-G3, `lang/definitionList.ts`). Also a mark: the
    // old parser emitted `<span class="md-definition">` (parser.ts line 487).
    Definition: { layer: 'mark', class: 'md-definition' },
    DefinitionMark: { layer: 'syntax', class: 'md-syntax' },
};

/** Look up the decoration entry for a Lezer node name, if any. */
export function nodeClassEntry(nodeName: string): NodeClassEntry | undefined {
    return NODE_CLASS_MAP[nodeName];
}
