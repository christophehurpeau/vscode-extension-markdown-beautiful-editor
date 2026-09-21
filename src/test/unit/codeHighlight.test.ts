import * as assert from 'assert';
import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { highlightTree } from '@lezer/highlight';
import { codeHighlighters } from '../../webview/cm/codeHighlight';
import { markdownExtensions } from '../../webview/cm/extensions';

/**
 * Same DOM-free shape as `decorations.test.ts`, one layer lower: build the
 * state the webview actually ships (`markdownExtensions`, so `codeLanguages`
 * and the highlighter are both wired), then run `highlightTree` over its
 * syntax tree and assert the `tok-*` classes it hands back.
 *
 * Two things are under test and the second is the reason the highlighter is
 * scoped per language at all: fenced code gets tokens, and markdown prose
 * gets none — `@lezer/markdown` tags its own nodes (`tags.heading1`,
 * `tags.strong`, ...), so an unscoped `HighlightStyle` would silently start
 * repainting prose that `decorations.ts` already owns.
 */

interface Token {
    text: string;
    class: string;
}

function tokensIn(doc: string): Token[] {
    const state = EditorState.create({ doc, extensions: markdownExtensions });
    const out: Token[] = [];
    highlightTree(syntaxTree(state), codeHighlighters, (from, to, classes) => {
        out.push({ text: doc.slice(from, to), class: classes });
    });
    return out;
}

function classOf(tokens: Token[], text: string): string | undefined {
    return tokens.find((token) => token.text === text)?.class;
}

describe('cm/codeHighlight: fenced code tokens', () => {
    it('highlights a css fence', () => {
        const tokens = tokensIn('```css\n@font-face {\n  font-family: Chunkfive; src: url("a.otf");\n}\n```\n');
        assert.strictEqual(classOf(tokens, '@font-face'), 'tok-keyword');
        assert.strictEqual(classOf(tokens, 'font-family'), 'tok-property');
        assert.strictEqual(classOf(tokens, 'Chunkfive'), 'tok-constant');
        assert.strictEqual(classOf(tokens, '"a.otf"'), 'tok-string');
    });

    it('highlights a javascript fence', () => {
        const tokens = tokensIn('```js\n// hi\nconst x = 1;\n```\n');
        assert.strictEqual(classOf(tokens, '// hi'), 'tok-comment');
        assert.strictEqual(classOf(tokens, 'const'), 'tok-keyword');
        assert.strictEqual(classOf(tokens, '1'), 'tok-constant');
    });

    it('highlights a typescript fence through the ts alias', () => {
        const tokens = tokensIn('```ts\ninterface A { b: string }\n```\n');
        assert.strictEqual(classOf(tokens, 'interface'), 'tok-keyword');
        assert.strictEqual(classOf(tokens, 'string'), 'tok-type');
    });

    it('highlights a json fence', () => {
        const tokens = tokensIn('```json\n{ "a": true }\n```\n');
        assert.strictEqual(classOf(tokens, '"a"'), 'tok-property');
        assert.strictEqual(classOf(tokens, 'true'), 'tok-constant');
    });

    it('highlights css embedded in an html fence', () => {
        const tokens = tokensIn('```html\n<style>a { color: red }</style>\n```\n');
        assert.strictEqual(classOf(tokens, 'style'), 'tok-type');
        assert.strictEqual(classOf(tokens, 'color'), 'tok-property');
    });

    it('leaves a fence with no language tag unhighlighted', () => {
        assert.deepStrictEqual(tokensIn('```\nconst x = 1;\n```\n'), []);
    });

    it('leaves a yaml fence unhighlighted (yamlLanguage is scoped, not in codeLanguages)', () => {
        assert.deepStrictEqual(tokensIn('```yaml\ntitle: x\n```\n'), []);
    });
});

/**
 * Frontmatter reaches the highlighter the same way a fence does, but through
 * the `parseMixed` wrap in `cm/lang/frontmatter.ts` rather than `markdown()`'s
 * `codeLanguages`. This is the only test that can see that the mount actually
 * happened — the decoration tests assert the *absence* of `md-*` classes over
 * the same range, which an unmounted (unparsed) body would also satisfy.
 */
describe('cm/codeHighlight: YAML frontmatter tokens', () => {
    it('highlights keys, quoted strings and comments in the frontmatter body', () => {
        const tokens = tokensIn('---\n# note\ntitle: "Hello"\n---\n\nbody\n');
        assert.strictEqual(classOf(tokens, '# note'), 'tok-comment');
        assert.strictEqual(classOf(tokens, 'title'), 'tok-property');
        assert.strictEqual(classOf(tokens, '"Hello"'), 'tok-string');
    });

    it('leaves unquoted scalars to inherit the block foreground', () => {
        const tokens = tokensIn('---\ntitle: Hello\n---\n\nbody\n');
        assert.strictEqual(classOf(tokens, 'Hello'), undefined);
    });

    it('emits nothing for the markdown below the closing fence', () => {
        const tokens = tokensIn('---\ntitle: x\n---\n\n# Heading\n\n**bold**\n');
        assert.deepStrictEqual(tokens.filter((token) => /Heading|bold/.test(token.text)), []);
    });
});

describe('cm/codeHighlight: prose is never repainted', () => {
    it('emits nothing for headings, emphasis, links or inline code', () => {
        const doc = '# Title\n\n**bold** and *em* and [a](https://x) and `code`.\n';
        assert.deepStrictEqual(tokensIn(doc), []);
    });

    it('emits nothing for a table or a task list', () => {
        const doc = '| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n';
        assert.deepStrictEqual(tokensIn(doc), []);
    });
});
