/**
 * Token highlighting for fenced code blocks.
 *
 * `codeLanguages` in `./extensions.ts` makes a ` ```css ` fence *parse* with
 * the CSS grammar, but parsing alone paints nothing: CM6 turns Lezer
 * highlight tags into DOM classes only through a `syntaxHighlighting()`
 * extension, and this project never installs `basicSetup` (which is where
 * most CM6 setups get one for free).
 *
 * Every style here is SCOPED to a nested language. An unscoped
 * `HighlightStyle` would also repaint prose: `@lezer/markdown` tags its own
 * nodes (`tags.heading1`, `tags.strong`, `tags.emphasis`, ...), and markdown
 * presentation belongs exclusively to the `md-*` decoration layer in
 * `./decorations.ts`. Two sources of colour on the same text is the bug this
 * scoping exists to prevent.
 *
 * `HighlightStyle` scope matches on a language's `data` facet, and
 * `LRLanguage.configure()` reuses it — so `javascriptLanguage` alone covers
 * the ts/tsx/js/jsx entries, which are all `javascriptLanguage.configure()`
 * dialects. HTML's embedded `<style>`/`<script>` regions mount `cssLanguage`
 * and `javascriptLanguage` as inner trees and are matched by those entries.
 *
 * Classes, not colours: VS Code exposes no theme token colours to a webview,
 * so the palette is hand-picked in `src/styles/code-tokens.css` with
 * light/dark variants, like every other colour in this project.
 */
import { HighlightStyle, syntaxHighlighting, type TagStyle } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { cssLanguage } from '@codemirror/lang-css';
import { htmlLanguage } from '@codemirror/lang-html';
import { javascriptLanguage } from '@codemirror/lang-javascript';
import { jsonLanguage } from '@codemirror/lang-json';
import { yamlLanguage } from '@codemirror/lang-yaml';
import { tags } from '@lezer/highlight';

/**
 * Deliberately coarse: most entries target a PARENT tag and inherit to its
 * children — `tags.comment` catches `lineComment`/`blockComment`/`docComment`,
 * `tags.string` catches `docString`/`character`/`attributeValue`,
 * `tags.typeName` catches `tagName`, `tags.propertyName` catches
 * `attributeName` — so a language emitting a tag nobody listed still lands
 * somewhere sensible. A child listed on its own line overrides its parent
 * regardless of array order (`HighlightStyle` resolves by tag specificity):
 * that is why `atom`/`unit`/`null` read as constants rather than inheriting
 * `tags.keyword`, which is their parent.
 *
 * Plain identifiers (`tags.variableName`) and `tags.punctuation` are left
 * unstyled on purpose — colouring every identifier and brace is noise, and
 * they inherit the code block's own foreground.
 */
export const codeTokenStyles: TagStyle[] = [
    { tag: tags.comment, class: 'tok-comment' },
    { tag: tags.keyword, class: 'tok-keyword' },
    { tag: tags.string, class: 'tok-string' },
    {
        tag: [
            tags.number,
            tags.bool,
            tags.null,
            tags.atom,
            tags.unit,
            tags.color,
            tags.url,
            tags.regexp,
            tags.escape,
        ],
        class: 'tok-constant',
    },
    { tag: tags.propertyName, class: 'tok-property' },
    { tag: [tags.typeName, tags.className, tags.namespace, tags.labelName], class: 'tok-type' },
    {
        tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName],
        class: 'tok-function',
    },
    { tag: tags.operator, class: 'tok-operator' },
    { tag: tags.invalid, class: 'tok-invalid' },
];

/**
 * `yamlLanguage` is here for the frontmatter block, not for fenced code:
 * `./lang/frontmatter.ts` mounts it over a `FrontmatterContent` range, and a
 * mounted tree carries its own language's `data` facet on its top node, which
 * is exactly what `HighlightStyle`'s `scope` matches on — so frontmatter is
 * tokenized through the same path as a ` ```css ` fence. (It is deliberately
 * NOT registered in `./extensions.ts`'s `codeLanguages`, so a ` ```yaml `
 * fence stays plain text, as before.)
 *
 * YAML's unquoted scalars (`title: Hello`) are `tags.content`, which nothing
 * below styles: they keep the block's own foreground, the same deliberate
 * choice already made for plain identifiers. Keys (`tags.definition(
 * tags.propertyName)`), quoted strings, comments, anchors and tags all
 * inherit a parent tag that is styled.
 */
const scopedLanguages = [cssLanguage, htmlLanguage, javascriptLanguage, jsonLanguage, yamlLanguage];

/** Exported for `src/test/unit/codeHighlight.test.ts`, which runs them through
 *  `highlightTree` directly — a `HighlightStyle` is itself a `Highlighter`, so
 *  the scoping rule is assertable without an `EditorView` or a DOM. */
export const codeHighlighters = scopedLanguages.map((language) =>
    HighlightStyle.define(codeTokenStyles, { scope: language }),
);

export const codeHighlighting: Extension = codeHighlighters.map((highlighter) =>
    syntaxHighlighting(highlighter),
);
