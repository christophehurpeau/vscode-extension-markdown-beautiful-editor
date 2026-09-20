/**
 * Footnotes (`[^id]` inline reference + `[^id]: text` block definition) as a
 * Lezer `MarkdownExtension`.
 *
 * Shape copied from `./math.ts` (the WP-G reference implementation) and
 * `./definitionList.ts` (the sibling WP-G3 block construct, landed first —
 * its `endLeaf` pattern is copied verbatim below): a header explaining
 * provenance and scope, parser(s) authored against `@lezer/markdown`'s
 * public `InlineContext`/`BlockContext`/`Line` API (absolute document
 * positions via `cx.char()`/`cx.lineStart + line.pos`, never raw string
 * indexing), plain-string/`{name, block}` `defineNodes` entries, and a
 * parse-tree-string test file (`src/test/unit/footnotesLang.test.ts`) that
 * configures the RAW parser via `parser.configure([GFM, extension])` and
 * asserts `.parse(src).toString()`.
 *
 * `@lezer/markdown` ships no footnote support (confirmed by grep in
 * docs/plans/CODEMIRROR6_MIGRATION.md's parity list) — this is authored
 * in-house against its block/inline extension API. Registered in
 * `../lang/registry.ts`.
 *
 * Node naming (mirrors `InlineCode`/`CodeMark`, math.ts's
 * `InlineMath`/`MathMark`/`MathContent`, and `src/shared/nodeClassMap.ts`'s
 * convention of one node -> one `md-*` class):
 *   - `Footnote`         the whole `[^id]` reference (inline) -> `md-footnote`
 *   - `FootnoteMark`     `[^` and `]` delimiters (leaf, x2)    -> `md-syntax`
 *   - `FootnoteLabel`    the id text between them              -> no class
 *     (the old parser left the id as plain, undimmed text inside
 *     `md-footnote` — see semantics below. This node exists purely so the id
 *     is a directly addressable sub-range; it deliberately gets no entry in
 *     `nodeClassMap.ts`, same treatment as e.g. `LinkLabel`.)
 *   - `FootnoteDef`      the whole `[^id]: text` line (block)  -> `md-footnote-def`
 *   - `FootnoteDefMark`  `[^` and `]:` delimiters (leaf, x2)   -> `md-syntax`
 *   - `FootnoteDefLabel` the id text between them              -> `md-syntax`
 *     too, unlike `FootnoteLabel` above — see the parity note below on why
 *     the definition's id is dimmed while the reference's id is not.
 * `nodeClassMap.ts` and `decorations.ts` are owned by WP-1/WP-H, not this
 * package — wiring these node names into that table (with the class per
 * node listed above) is the coordinator's job, not done here.
 *
 * Semantics recovered from the deleted regex parser (`git show
 * main:src/webview/markdown/parser.ts`, the `md-footnote` cases in
 * `styleInline`/`styleLine`):
 *
 *   // inline reference, in styleInline:
 *   result = result.replace(
 *       /\[\^([^\]]+)\]/g,
 *       (_match, id) => protect(`<span class="md-footnote" data-footnote-id="${id}">` +
 *           `<span class="md-syntax">[^</span>${id}<span class="md-syntax">]</span></span>`)
 *   );
 *
 *   // block definition, in styleLine:
 *   const footnoteDefMatch = line.match(/^\[\^([^\]]+)\]:\s(.*)$/);
 *   if (footnoteDefMatch) {
 *       const id = footnoteDefMatch[1];
 *       const content = styleInline(footnoteDefMatch[2]);
 *       return `<span class="md-footnote-def" data-footnote-id="${escapeHtml(id)}">` +
 *           `<span class="md-syntax">[^${escapeHtml(id)}]:</span> ${content}</span>`;
 *   }
 *
 * Two behaviors follow directly from these regexes and are preserved here:
 *   - The reference's id renders as plain text (only `[^` and `]` are
 *     `md-syntax`); the definition's id renders dimmed *along with* its
 *     brackets/colon (the whole `[^id]:` is one `md-syntax` span in the old
 *     HTML). Hence `FootnoteLabel` gets no class but `FootnoteDefLabel` is
 *     recommended as `md-syntax` — same visual result (a dimmed id) reached
 *     via a classed node instead of folding the id into an unsplit mark, so
 *     the id stays independently addressable (see the `data-footnote-id`
 *     note below).
 *   - The definition requires exactly one whitespace character after the
 *     colon (`\s`) before the body starts; that character itself carries no
 *     class in the old output (it sits between the syntax span and the
 *     content span) and correspondingly is covered by neither
 *     `FootnoteDefMark` nor the inline body content here — the same
 *     single-character gap pattern `@lezer/markdown`'s own `ATXHeading`
 *     parser uses for the space after `#`.
 *
 * `data-footnote-id` (WP-U3's click-to-jump) needs the id text, not just
 * that a footnote exists. Both node structures expose it as a directly
 * sliceable sub-range rather than requiring `[^`/`]`-stripping string
 * surgery: `FootnoteLabel` for the reference, `FootnoteDefLabel` for the
 * definition (source-slice `node.from`..`node.to`, no regex needed).
 *
 * The old parser's ` `/protect() placeholder-protection machinery is NOT
 * needed. A grammar consumes `[^id]` structurally, so `Link`'s bracket
 * scanning never sees it in the first place. Do not port it.
 *
 * Ordering — the single most important directives in this file:
 *   - Inline `Footnote` is registered `before: 'Link'`. Per
 *     `@lezer/markdown`'s `finishLink`, a bare `[t]` with no following `(url)`
 *     or `[ref]` still resolves as a shortcut reference `Link` (`Link(LinkMark,
 *     LinkMark)`, only two marks and no reference actually needing to exist).
 *     Without this directive `[^id]` would silently become exactly that —
 *     `Link(LinkMark,LinkMark)` — and `md-footnote` would never appear. There
 *     is no similar risk from `Image`/`HTMLTag`/etc., so only `Link` needs
 *     naming.
 *   - Block `FootnoteDef` is registered `before: 'LinkReference'`.
 *     `LinkReference` is the first entry in `@lezer/markdown`'s default block
 *     parser/leaf-override list, and `^id` (caret included) is a
 *     syntactically legal link label — so a body that happens to look like a
 *     single bare URL token with nothing else on the line (e.g. `[^1]: text`)
 *     would otherwise parse as a `LinkReference` definition for the literal
 *     label `^1`, not our construct. Because `FootnoteDef` provides an eager
 *     `parse()` (not a `leaf()` override) that fully claims and consumes the
 *     line before any leaf-fallback dispatch happens, this directive is
 *     belt-and-suspenders relative to `parse()`'s own precedence, but it is
 *     what the work package's verified findings call for, so it is kept
 *     exactly as specified.
 *
 * `FootnoteDef` also supplies `endLeaf`, copied verbatim in approach from
 * `definitionList.ts`'s `endLeaf` (see that file's header for the general
 * mechanism). The old parser was line-scoped (`styleLine` runs per rendered
 * line with no lookback), so a `[^id]:` line immediately after a paragraph
 * line was styled independently. Under a block grammar, that same line is by
 * default lazy paragraph continuation text — `FootnoteDef.parse` is only
 * reached on a *fresh* line dispatch, and once a paragraph's leaf
 * accumulation has started, subsequent lines skip that dispatch entirely
 * unless an `endLeaf` predicate breaks it early. Miss this and the feature
 * silently never fires directly under a paragraph; the dedicated test below
 * covers exactly this case. `endLeaf` uses the narrower prefix-only pattern
 * `^\[\^[^\]]+\]:` (no trailing-whitespace/body requirement) per the work
 * package's guidance — it only needs to recognize "a footnote-def-shaped
 * line is starting", not fully validate it; the full match (with its
 * required `\s`) is re-checked by `parse` once dispatch reaches the fresh
 * line.
 *
 * Single-line leaf block, not `NodeSpec.composite`: the old regex
 * (`/^\[\^([^\]]+)\]:\s(.*)$/`) matches and styles exactly one line with no
 * continuation/lookahead, identical in shape to `definitionList.ts`'s `:
 * text` case (see that file's "single-line leaf block, not composite" note,
 * which applies here verbatim). The migration doc's spike confirmed
 * `NodeSpec.composite` works cleanly against a footnote-definition-shaped
 * block (lazy continuation, blank-line handling, closing on dedent/heading),
 * so a multi-line composite body is technically available — but choosing it
 * would be new behavior (multi-paragraph footnote bodies) the old parser
 * never had, not parity. Chosen deliberately: single-line, exact parity.
 *
 * Inline content after the definition's marker is parsed recursively via
 * `cx.parser.parseInline`, so `[^1]: some **bold**` still gets
 * `StrongEmphasis` inside `FootnoteDef`, matching the old parser's
 * `styleInline(footnoteDefMatch[2])`.
 */
import type { BlockContext, BlockParser, InlineContext, Line, MarkdownConfig } from '@lezer/markdown';

const BRACKET_OPEN = 91; // [
const BRACKET_CLOSE = 93; // ]
const CARET = 94; // ^
const NEWLINE = 10;

/** Full match for a footnote-definition line, already positioned past any
 *  base indent/markers: `[^id]:` followed by exactly one required whitespace
 *  character and then the (possibly empty) body. Mirrors the old parser's
 *  `/^\[\^([^\]]+)\]:\s(.*)$/` exactly. */
const FOOTNOTE_DEF_LINE_RE = /^\[\^([^\]]+)\]:\s(.*)$/;

/** Prefix-only check used by `endLeaf`: recognizes a footnote-def-shaped
 *  line is starting, without requiring the trailing whitespace/body — see
 *  the header comment on why `endLeaf` intentionally uses this narrower
 *  pattern instead of `FOOTNOTE_DEF_LINE_RE`. */
const FOOTNOTE_DEF_START_RE = /^\[\^[^\]]+\]:/;

/** Find the end of a footnote id starting right after `[^` (at `pos`),
 *  stopping at (and excluding) a line break — same treatment as math.ts's
 *  `findClosingDollar` for why a soft-wrapped paragraph line must not let
 *  the construct cross it (the old parser ran per rendered line and never
 *  could). Returns -1 if there is no closing `]` before the line ends, or if
 *  the id would be empty (old regex requires `[^\]]+`, one or more chars). */
function findFootnoteLabelEnd(cx: InlineContext, from: number): number {
    let pos = from;
    while (pos < cx.end) {
        const code = cx.char(pos);
        if (code === NEWLINE) {
            return -1;
        }
        if (code === BRACKET_CLOSE) {
            return pos > from ? pos : -1;
        }
        pos++;
    }
    return -1;
}

function parseFootnoteRef(cx: InlineContext, next: number, pos: number): number {
    if (next !== BRACKET_OPEN || cx.char(pos + 1) !== CARET) {
        return -1;
    }

    const labelStart = pos + 2;
    const close = findFootnoteLabelEnd(cx, labelStart);
    if (close === -1) {
        return -1;
    }

    const end = close + 1;
    return cx.addElement(
        cx.elt('Footnote', pos, end, [
            cx.elt('FootnoteMark', pos, labelStart),
            cx.elt('FootnoteLabel', labelStart, close),
            cx.elt('FootnoteMark', close, end),
        ])
    );
}

/** True when `line` (already positioned past any base indent/markers) looks
 *  like the start of a footnote-definition line. Shared by `parse` (as a
 *  cheap pre-check) and `endLeaf`. */
function looksLikeFootnoteDefStart(line: Line): boolean {
    return line.next === BRACKET_OPEN && FOOTNOTE_DEF_START_RE.test(line.text.slice(line.pos));
}

function parseFootnoteDef(cx: BlockContext, line: Line): boolean {
    if (!looksLikeFootnoteDefStart(line)) {
        return false;
    }

    const text = line.text.slice(line.pos);
    const match = FOOTNOTE_DEF_LINE_RE.exec(text);
    if (!match) {
        return false;
    }

    const [, id, body] = match;
    const from = cx.lineStart + line.pos;
    const labelStart = from + 2; // past "[^"
    const labelEnd = labelStart + id.length;
    const markCloseEnd = labelEnd + 2; // past "]:"
    const bodyStart = markCloseEnd + 1; // past the one required whitespace char
    const lineEnd = cx.lineStart + line.text.length;

    cx.addElement(
        cx.elt('FootnoteDef', from, lineEnd, [
            cx.elt('FootnoteDefMark', from, labelStart),
            cx.elt('FootnoteDefLabel', labelStart, labelEnd),
            cx.elt('FootnoteDefMark', labelEnd, markCloseEnd),
            ...cx.parser.parseInline(body, bodyStart),
        ])
    );
    cx.nextLine();
    return true;
}

const footnoteDefBlockParser: BlockParser = {
    name: 'FootnoteDef',
    before: 'LinkReference',
    parse: parseFootnoteDef,
    // Ends an in-progress paragraph as soon as a footnote-def-shaped line
    // follows, so `parseFootnoteDef` gets a chance to claim it instead of it
    // being absorbed as lazy continuation text. See header comment.
    endLeaf(_cx, line) {
        return looksLikeFootnoteDefStart(line);
    },
};

export const footnotesExtension: MarkdownConfig = {
    defineNodes: [
        'Footnote',
        'FootnoteMark',
        'FootnoteLabel',
        { name: 'FootnoteDef', block: true },
        'FootnoteDefMark',
        'FootnoteDefLabel',
    ],
    parseInline: [
        {
            name: 'Footnote',
            before: 'Link',
            parse: parseFootnoteRef,
        },
    ],
    parseBlock: [footnoteDefBlockParser],
};
