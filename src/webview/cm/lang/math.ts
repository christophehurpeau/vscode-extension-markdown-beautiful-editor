/**
 * Math syntax (`$inline$`) as a Lezer `MarkdownExtension`.
 *
 * REFERENCE IMPLEMENTATION for the other WP-G grammar packages (footnotes,
 * definition lists). Copy this file's shape: header explaining provenance
 * and scope, one `InlineParser`/`BlockParser` authored against `@lezer/
 * markdown`'s public `InlineContext`/`BlockContext` API (mirroring how the
 * built-in parsers such as `InlineCode` are written — absolute document
 * positions via `cx.char()`/`cx.end`, not raw string indexing), plain-string
 * `defineNodes` entries, and a parse-tree-string test file (see
 * `src/test/unit/mathLang.test.ts`) that configures the RAW parser via
 * `parser.configure([GFM, extension])` and asserts `.parse(src).toString()`.
 *
 * `@lezer/markdown` ships no math support (confirmed by grep in
 * docs/plans/CODEMIRROR6_MIGRATION.md's parity list) — this is authored
 * in-house against its block/inline extension API. Registered in
 * `../lang/registry.ts`.
 *
 * Node naming (mirrors the built-in `InlineCode`/`CodeMark` shape, and
 * `src/shared/nodeClassMap.ts`'s convention of one node -> one `md-*`
 * class):
 *   - `InlineMath`   the whole `$...$` span               -> `md-math`
 *   - `MathMark`     each `$` delimiter (leaf, x2)         -> `md-syntax`
 *   - `MathContent`  the text between the delimiters       -> `md-math-content`
 * `nodeClassMap.ts` and `decorations.ts` are owned by WP-1/WP-H, not this
 * package (see this project's file-ownership rules) — wiring these three
 * node names into that table is WP-H's job, not done here.
 *
 * Semantics ported from the deleted regex parser (`git show
 * main:src/webview/markdown/parser.ts`, the `md-math` case in
 * `styleInline`), preserving its exact Pandoc currency-safety predicate:
 *
 *   /\$(?=\S)([^$]*?)(?<=\S)\$(?!\d)/g
 *
 * i.e. the opening `$` must be immediately followed by a non-space
 * character, the closing `$` must be immediately preceded by a non-space
 * character, and the closing `$` must not be immediately followed by a
 * digit. This is what keeps `$5 and $10` as plain text while still
 * recognizing `$x$`. Because the content class `[^$]*?` excludes `$`
 * itself, the closing delimiter is simply the next `$` in the text — there
 * is never a second candidate to disambiguate.
 *
 * Block math (`$$...$$`) was NOT ported: the old parser has no such case
 * (checked, see the header note above) and this extension does not add one.
 * A doubled `$$` with no other `$` on the line degenerately satisfies the
 * regex above as empty-content inline math (the first `$` acts as the
 * "non-space character before the close"); this extension reproduces that
 * for parity rather than special-casing it away — see the `'$$'` case in
 * the test file.
 *
 * The old parser ran its regexes per rendered line (`markdownToStyledHtml`
 * splits on `\n` before calling `styleLine`/`styleInline`), so math never
 * spanned a line break. A Lezer inline section can span multiple lines of a
 * single paragraph (soft wraps), so this parser explicitly stops its search
 * for a closing `$` at the first `\n` to preserve that behavior.
 *
 * Ordering: registered `after: 'InlineCode'` so a backtick span claims its
 * contents first and `` `$x$` `` stays code (`DefaultInline` order:
 * Escape, Entity, InlineCode, HTMLTag, Emphasis, HardBreak, Link, Image,
 * LinkEnd). `\$` needs no handling here: `Escape` runs before this parser
 * and already consumes it. Link text is inline-parsed recursively by the
 * core `Link` parser, so `[$x$](u)` works with no ordering directive on our
 * side.
 */
import type { InlineContext, MarkdownConfig } from '@lezer/markdown';

const DOLLAR = 36;

function isAsciiWhitespace(code: number): boolean {
    return code === 32 || code === 9 || code === 10 || code === 13 || code === 12 || code === 11;
}

function isAsciiDigit(code: number): boolean {
    return code >= 48 && code <= 57;
}

/** Find the next `$` after `from`, stopping at (and excluding) a line break. */
function findClosingDollar(cx: InlineContext, from: number): number {
    for (let pos = from; pos < cx.end; pos++) {
        const code = cx.char(pos);
        if (code === 10) {
            return -1;
        }
        if (code === DOLLAR) {
            return pos;
        }
    }
    return -1;
}

function parseMath(cx: InlineContext, next: number, pos: number): number {
    if (next !== DOLLAR) {
        return -1;
    }

    const afterOpen = cx.char(pos + 1);
    if (afterOpen === -1 || isAsciiWhitespace(afterOpen)) {
        return -1;
    }

    const close = findClosingDollar(cx, pos + 1);
    if (close === -1) {
        return -1;
    }

    const beforeClose = cx.char(close - 1);
    if (isAsciiWhitespace(beforeClose)) {
        return -1;
    }

    const afterClose = cx.char(close + 1);
    if (afterClose !== -1 && isAsciiDigit(afterClose)) {
        return -1;
    }

    const end = close + 1;
    return cx.addElement(
        cx.elt('InlineMath', pos, end, [
            cx.elt('MathMark', pos, pos + 1),
            cx.elt('MathContent', pos + 1, close),
            cx.elt('MathMark', close, end),
        ])
    );
}

export const mathExtension: MarkdownConfig = {
    defineNodes: ['InlineMath', 'MathMark', 'MathContent'],
    parseInline: [
        {
            name: 'Math',
            after: 'InlineCode',
            parse: parseMath,
        },
    ],
};
