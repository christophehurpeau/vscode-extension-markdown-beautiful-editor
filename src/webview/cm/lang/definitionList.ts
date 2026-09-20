/**
 * Definition lists (`Term\n: Definition`) as a Lezer `MarkdownExtension`.
 *
 * Shape copied from `./math.ts` (the WP-G reference implementation): a
 * header explaining provenance and scope, parser(s) authored against
 * `@lezer/markdown`'s public `BlockContext`/`Line` API (absolute document
 * positions via `cx.lineStart + line.pos`, not raw string indexing, mirroring
 * how the built-in parsers such as `Table`'s `TaskParser` are written),
 * plain-string/`{name, block}` `defineNodes` entries, and a parse-tree-string
 * test file (`src/test/unit/definitionListLang.test.ts`) that configures the
 * RAW parser via `parser.configure([GFM, extension])` and asserts
 * `.parse(src).toString()`.
 *
 * `@lezer/markdown` ships no definition-list support (confirmed by grep in
 * docs/plans/CODEMIRROR6_MIGRATION.md's parity list) — this is authored
 * in-house against its block extension API. Registered in `../lang/registry.ts`.
 *
 * Node naming (mirrors `InlineCode`/`CodeMark` and math.ts's
 * `InlineMath`/`MathMark`, and `src/shared/nodeClassMap.ts`'s convention of
 * one node -> one `md-*` class):
 *   - `Definition`     the whole `: text` line (block)   -> `md-definition`
 *   - `DefinitionMark` the `:` marker (leaf)              -> `md-syntax`
 * `nodeClassMap.ts` and `decorations.ts` are owned by WP-1/WP-H, not this
 * package — wiring these two node names into that table is the coordinator's
 * job, not done here.
 *
 * Semantics recovered from the deleted regex parser (`git show
 * main:src/webview/markdown/parser.ts`, the `md-definition` case in
 * `styleLine`, ~line 484):
 *
 *   const defMatch = line.match(/^:\s(.*)$/);
 *   if (defMatch) {
 *       const content = styleInline(defMatch[1]);
 *       return `<span class="md-definition"><span class="md-syntax">:</span> ${content}</span>`;
 *   }
 *
 * That parser ran per rendered line with NO lookback: it is a plain `^:` line
 * match, not conditioned on the previous line actually being a "term" —
 * `styleLine` never inspects neighboring lines for this case. So a bare `:
 * text` line at the very start of a document matches exactly as readily as
 * one under a preceding paragraph. This port preserves that: `parseDefinition`
 * below claims any `: `-prefixed line unconditionally, term or no term. Only
 * the *term* line itself was never given a class by the old parser (it falls
 * through to the final `styleInline(line)` regular-paragraph case) — this
 * port adds no term styling either.
 *
 * Single-line leaf block, not `NodeSpec.composite`: the old parser matched
 * and styled each `: text` line independently (no merging of consecutive
 * definition lines into one grouped construct), so multiple consecutive
 * definitions under one term parse as multiple sibling `Definition` nodes,
 * not one multi-line composite. This is deliberately the "trouble not worth
 * it for parity" branch called out in the work package: a composite would
 * change behavior (multi-line bodies, blank-line-tolerant grouping) the old
 * parser never had.
 *
 * `endLeaf` is the entire reason this needs a block parser at all. A
 * definition line's most common position is directly under a term line,
 * which by construction is a `Paragraph` — so absent `endLeaf`, every
 * `: text` line right after one is silently absorbed as lazy paragraph
 * continuation text and this parser's `parse` never runs. `endLeaf` ends the
 * open paragraph leaf as soon as it sees a `:` + space line, handing the line
 * back to the normal block-parser pass (see `@lezer/markdown`'s
 * `BlockContext`: `endLeafBlock` hooks close the current leaf, then the same
 * line is retried against `parser.blockParsers`). When there is no preceding
 * paragraph (start of document, or right after a blank line), `parse` is
 * reached directly on the first pass with no `endLeaf` involved — both paths
 * produce the same `Definition` node, matching the old parser's
 * context-free match.
 *
 * Parity difference, deliberate:
 *   - The old regex anchored `^:` at column 0 (no leading-space tolerance).
 *     This port checks `line.next`/`line.pos`, which — like every built-in
 *     block construct — tolerates up to 3 leading spaces (CommonMark's usual
 *     block-start allowance) before `IndentedCode` would claim 4+. Matching
 *     the old zero-tolerance exactly would require fighting the grammar's
 *     general indent handling for a case real documents are unlikely to hit.
 *
 * Ordering: registered `before: 'LinkReference'` for deterministic ordering
 * only — no default block parser claims a bare `:` line as a block start, so
 * there is no real precedence conflict to resolve.
 *
 * Inline content after the marker is parsed recursively via
 * `cx.parser.parseInline`, so `: some **bold**` still gets `StrongEmphasis`
 * inside `Definition`, matching the old parser's `styleInline(defMatch[1])`.
 */
import type { BlockContext, BlockParser, Line, MarkdownConfig } from '@lezer/markdown';

const COLON = 58;
const SPACE = 32;
const TAB = 9;

/** True when `line` (already positioned past any base indent/markers) starts
 *  with a colon followed by a space or tab — the old parser's `^:\s` check. */
function isDefinitionLine(line: Line): boolean {
    const after = line.text.charCodeAt(line.pos + 1);
    return line.next === COLON && (after === SPACE || after === TAB);
}

function parseDefinition(cx: BlockContext, line: Line): boolean {
    if (!isDefinitionLine(line)) {
        return false;
    }

    const colonPos = cx.lineStart + line.pos;
    const contentStart = colonPos + 2; // past ":" and the one space after it
    const contentText = line.text.slice(line.pos + 2);
    const lineEnd = cx.lineStart + line.text.length;

    cx.addElement(
        cx.elt('Definition', colonPos, lineEnd, [
            cx.elt('DefinitionMark', colonPos, colonPos + 1),
            ...cx.parser.parseInline(contentText, contentStart),
        ])
    );
    cx.nextLine();
    return true;
}

const definitionBlockParser: BlockParser = {
    name: 'Definition',
    before: 'LinkReference',
    parse: parseDefinition,
    // Ends an in-progress paragraph (the term line) as soon as a `: `-line
    // follows, so `parseDefinition` gets a chance to claim it instead of the
    // line being absorbed as lazy continuation text. See header comment.
    endLeaf(_cx, line) {
        return isDefinitionLine(line);
    },
};

export const definitionListExtension: MarkdownConfig = {
    defineNodes: [{ name: 'Definition', block: true }, 'DefinitionMark'],
    parseBlock: [definitionBlockParser],
};
