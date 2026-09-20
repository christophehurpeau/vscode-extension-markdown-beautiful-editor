/**
 * The full CM6 extension array — authored once by WP-1, then FROZEN.
 *
 * Later work packages add behavior through their OWN file (decorations,
 * commands, lang extensions, UI, ...); this file and `./lang/registry.ts`
 * import all of them so nobody else needs to edit either file. If a package
 * genuinely needs a new top-level extension wired in here, say so in its
 * report rather than editing this list.
 *
 * Exception: `@codemirror/view`'s `lineNumbers()` was swapped for
 * `markdownLineNumbers()` (`./lineNumberGutter.ts`) to fix the gutter/text
 * baseline misalignment bug — see that file's header. This is gutter wiring
 * only; nothing else in this array changed for that fix.
 */
import type { Extension } from '@codemirror/state';
import { EditorView, highlightActiveLineGutter, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { LanguageDescription } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { markdownExtensions as ourGrammarExtensions } from './lang/registry';
import { codeHighlighting } from './codeHighlight';
import { markdownDecorations } from './decorations';
import { markdownLineNumbers } from './lineNumberGutter';

/**
 * Fenced-code languages, statically bundled (decided 2026-09-17/18, see
 * docs/plans/CODEMIRROR6_MIGRATION.md: ts/tsx/js/jsx + json/html/css, no lazy
 * loading). `lang-markdown` already statically depends on `lang-html` ->
 * `lang-javascript`, so ts/js/jsx cost is near-zero; json/html/css measured
 * ~+1 KB gzip on top. Do not switch to `load:` (lazy `import()`) without also
 * revisiting the CSP, which currently pins a single script nonce.
 */
const codeLanguages = [
    LanguageDescription.of({ name: 'typescript', alias: ['ts'], support: javascript({ typescript: true }) }),
    LanguageDescription.of({ name: 'tsx', support: javascript({ typescript: true, jsx: true }) }),
    LanguageDescription.of({ name: 'javascript', alias: ['js', 'mjs', 'cjs'], support: javascript() }),
    LanguageDescription.of({ name: 'jsx', support: javascript({ jsx: true }) }),
    LanguageDescription.of({ name: 'json', support: json() }),
    LanguageDescription.of({ name: 'html', support: html() }),
    LanguageDescription.of({ name: 'css', support: css() }),
];

export const markdownExtensions: Extension[] = [
    markdown({
        base: commonmarkLanguage,
        // GFM is not on by default (see the trap documented in the migration
        // agent notes: `parser.configure({extensions: [GFM]})` on the raw
        // grammar is a silent no-op — only `markdown()`'s `extensions` option
        // actually applies it).
        extensions: [GFM, ...ourGrammarExtensions],
        codeLanguages,
        // Prose editor, not a code editor: HTML-tag autocomplete pulled in
        // via lang-html is a regression here. Do NOT re-enable, and do not
        // add `@codemirror/autocomplete` / `autocompletion()` elsewhere.
        completeHTMLTags: false,
    }),
    // Without this, `codeLanguages` above only parses the nested language —
    // no token ever receives a class. See `./codeHighlight.ts`.
    codeHighlighting,
    markdownLineNumbers(),
    highlightActiveLineGutter(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    // Required: replaces the old `white-space: pre-wrap` — without this,
    // long lines run off the viewport instead of wrapping.
    EditorView.lineWrapping,
    markdownDecorations,
];
