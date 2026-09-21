/**
 * YAML frontmatter (a leading `---` … `---` block) as a Lezer
 * `MarkdownExtension`.
 *
 * Without it, a frontmatter block is not merely unstyled — it is parsed as
 * something else entirely. `---` on line 1 is a `HorizontalRule`, the YAML
 * body below it becomes the title of a `SetextHeading2` closed by the second
 * `---`, and inline parsing runs over that title (`tags: [a, b]` parses as a
 * `Link`). The block renders as a document-wide H2.
 *
 * Authored against `@lezer/markdown`'s public `BlockContext`/`Line` API,
 * following `./math.ts` (the reference implementation for this directory) and
 * the idiom of the built-in `FencedCode` block parser: absolute document
 * positions from `cx.lineStart`, `cx.nextLine()` to advance, `cx.elt()` for
 * every node. Registered in `./registry.ts`, which is what makes it apply to
 * the diff panes too (`../diff/mergeView.ts` builds its own `markdown()` call
 * from that same registry).
 *
 * Node naming follows this directory's convention of one node -> one `md-*`
 * class in `src/shared/nodeClassMap.ts`:
 *   - `Frontmatter`         the whole block, fences included  -> `md-frontmatter`
 *   - `FrontmatterMark`     each `---` line (leaf, x2)        -> `md-syntax`
 *   - `FrontmatterContent`  the YAML between the fences       -> no class
 *
 * `FrontmatterContent` gets no `md-*` class because it is not markdown: `wrap`
 * below mounts `@lezer/yaml` over that range via `parseMixed`, exactly the way
 * `@codemirror/lang-yaml`'s own `yamlFrontmatter()` does, and the resulting
 * tokens are coloured by the language-scoped `HighlightStyle` in
 * `../codeHighlight.ts` — the same mechanism a ` ```ts ` fence already uses.
 * The decoration walk in `../decorations.ts` therefore stops at this node, as
 * it already does at `CodeText`; a nested language's tokens must never receive
 * an `md-*` class.
 *
 * Multiple `wrap`s compose: `MarkdownParser.configure` concatenates them
 * (`wrappers = wrappers.concat(config.wrap)`) and applies each in turn, so
 * this one coexists with the `parseCode` wrapper `@codemirror/lang-markdown`
 * installs for fenced code and embedded HTML.
 *
 * Ordering: `before: 'HorizontalRule'`, which is the parser that would
 * otherwise claim the opening `---`. (`SetextHeading` is a leaf-block parser
 * and never gets a chance once the block is consumed here.)
 *
 * Recognition rules, and why they are this strict:
 *   - the block must start at document position 0 (`cx.lineStart === 0`) with
 *     no enclosing block markup (`line.pos === 0`, so `> ---` inside a
 *     blockquote on line 1 is not frontmatter);
 *   - both fences are exactly three dashes plus optional trailing whitespace;
 *   - the line after the opening fence must not be blank.
 *
 * That last rule is a deliberate guard rather than part of any frontmatter
 * spec. `@lezer/markdown` gives a block parser no way to look further ahead
 * than `cx.peekLine()` and no way to un-consume a line, so whether this is
 * frontmatter has to be decided before reading the body: if the closing fence
 * turns out to be missing, the block runs to the end of the document and the
 * rest of the file stops being parsed as markdown. (`yamlFrontmatter()`'s LR
 * grammar has the same failure mode via error recovery.) Requiring a non-blank
 * line after the fence rules out the realistic false positive — a document
 * that opens with a horizontal rule, which is followed by a blank line — and
 * leaves only the transient case of a user typing a new frontmatter block into
 * an existing document, which resolves the moment the closing `---` is typed.
 */
import { parseMixed } from '@lezer/common';
import { yamlLanguage } from '@codemirror/lang-yaml';
import type { BlockContext, Element, Line, MarkdownConfig } from '@lezer/markdown';

function isFence(text: string): boolean {
    return /^---[ \t]*$/.test(text);
}

function parseFrontmatter(cx: BlockContext, line: Line): boolean {
    if (cx.lineStart !== 0 || line.pos !== 0 || !isFence(line.text) || cx.peekLine().trim() === '') {
        return false;
    }

    const from = cx.lineStart;
    const openMark = cx.elt('FrontmatterMark', from, from + line.text.length);
    // The body starts on the next line, i.e. one character past the opening
    // fence's own line break. Only ever used when a body line was read.
    const contentFrom = from + line.text.length + 1;
    let contentTo = contentFrom;
    let closeMark: Element | null = null;
    let to = from + line.text.length;

    while (cx.nextLine()) {
        const lineEnd = cx.lineStart + line.text.length;
        to = lineEnd;
        if (isFence(line.text)) {
            closeMark = cx.elt('FrontmatterMark', cx.lineStart, lineEnd);
            cx.nextLine();
            break;
        }
        contentTo = lineEnd;
    }

    const children = [
        openMark,
        ...(contentTo > contentFrom ? [cx.elt('FrontmatterContent', contentFrom, contentTo)] : []),
        ...(closeMark ? [closeMark] : []),
    ];
    cx.addElement(cx.elt('Frontmatter', from, to, children));
    return true;
}

export const frontmatterExtension: MarkdownConfig = {
    defineNodes: [{ name: 'Frontmatter', block: true }, 'FrontmatterMark', 'FrontmatterContent'],
    parseBlock: [
        {
            name: 'Frontmatter',
            before: 'HorizontalRule',
            parse: parseFrontmatter,
        },
    ],
    wrap: parseMixed((node) =>
        node.name === 'FrontmatterContent' ? { parser: yamlLanguage.parser } : null,
    ),
};
