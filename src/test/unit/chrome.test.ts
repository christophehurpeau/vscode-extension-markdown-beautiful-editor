import * as assert from 'assert';
import { EditorState } from '@codemirror/state';
import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { markdownExtensions } from '../../webview/cm/lang/registry';
import {
    collectLinkReferenceDefinitions,
    cursorPositionFromHead,
    headFromCursorPosition,
    resolveClickAction,
    resolveHoverTitle,
    resolveInteractiveTargetAt,
    resolveOpenAffordance,
} from '../../webview/cm/ui/chrome';

/**
 * Unit tests for chrome's pure/DOM-free pieces: position -> interactive
 * target resolution, click-action decisions, hover-title text, link
 * reference collection, and the doc-position <-> `CursorPosition` mapping.
 * Driven against a real `EditorState` (same shape as `decorations.test.ts`),
 * no `EditorView`/DOM needed — see this project's `tsconfig.test.json` note
 * on why DOM lib types are available even though nothing here touches the
 * DOM at runtime.
 */
function stateFor(doc: string): EditorState {
    return EditorState.create({
        doc,
        extensions: [markdown({ base: commonmarkLanguage, extensions: [GFM, ...markdownExtensions], completeHTMLTags: false })],
    });
}

describe('chrome: resolveInteractiveTargetAt', () => {
    it('resolves an inline link from its visible text', () => {
        const doc = '[text](https://example.com)';
        const state = stateFor(doc);
        assert.deepStrictEqual(resolveInteractiveTargetAt(state, doc.indexOf('text')), {
            kind: 'link',
            url: 'https://example.com',
        });
    });

    it('resolves an inline link from its destination text', () => {
        const doc = '[text](https://example.com)';
        const state = stateFor(doc);
        assert.deepStrictEqual(resolveInteractiveTargetAt(state, doc.indexOf('https')), {
            kind: 'link',
            url: 'https://example.com',
        });
    });

    it('resolves an image from its alt text', () => {
        const doc = '![alt](img.png)';
        const state = stateFor(doc);
        assert.deepStrictEqual(resolveInteractiveTargetAt(state, doc.indexOf('alt')), {
            kind: 'image',
            url: 'img.png',
        });
    });

    it('resolves an image from its destination text', () => {
        const doc = '![alt](img.png)';
        const state = stateFor(doc);
        assert.deepStrictEqual(resolveInteractiveTargetAt(state, doc.indexOf('img.png')), {
            kind: 'image',
            url: 'img.png',
        });
    });

    it('resolves a reference-style link against its definition, anywhere in the document', () => {
        const doc = '[text][ref]\n\nsome text in between\n\n[ref]: https://example.com';
        const state = stateFor(doc);
        assert.deepStrictEqual(resolveInteractiveTargetAt(state, doc.indexOf('text')), {
            kind: 'link',
            url: 'https://example.com',
        });
    });

    it('resolves a shortcut reference link (label == visible text)', () => {
        const doc = '[text]\n\n[text]: https://example.com';
        const state = stateFor(doc);
        assert.deepStrictEqual(resolveInteractiveTargetAt(state, doc.indexOf('text')), {
            kind: 'link',
            url: 'https://example.com',
        });
    });

    it('returns null for a reference-style link with no matching definition', () => {
        const doc = '[text][missing]';
        const state = stateFor(doc);
        assert.strictEqual(resolveInteractiveTargetAt(state, doc.indexOf('text')), null);
    });

    it('resolves a bracketed autolink (<https://...>), excluding the brackets', () => {
        const doc = 'See <https://example.com> here';
        const state = stateFor(doc);
        assert.deepStrictEqual(resolveInteractiveTargetAt(state, doc.indexOf('https')), {
            kind: 'link',
            url: 'https://example.com',
        });
    });

    it('resolves a bare GFM autolink (no wrapping Autolink node)', () => {
        const doc = 'Visit https://example.com today';
        const state = stateFor(doc);
        assert.deepStrictEqual(resolveInteractiveTargetAt(state, doc.indexOf('https')), {
            kind: 'link',
            url: 'https://example.com',
        });
    });

    it('resolves a footnote reference to its id', () => {
        const doc = 'See[^1] here.\n\n[^1]: The note.';
        const state = stateFor(doc);
        assert.deepStrictEqual(resolveInteractiveTargetAt(state, doc.indexOf('1]')), {
            kind: 'footnoteRef',
            id: '1',
        });
    });

    it('resolves a footnote definition to its id', () => {
        const doc = 'See[^1] here.\n\n[^1]: The note.';
        const state = stateFor(doc);
        const defPos = doc.lastIndexOf('1]');
        assert.deepStrictEqual(resolveInteractiveTargetAt(state, defPos), { kind: 'footnoteDef', id: '1' });
    });

    it('returns null over a link reference definition line (never interactive, matching the old parser)', () => {
        const doc = '[ref]: https://example.com';
        const state = stateFor(doc);
        assert.strictEqual(resolveInteractiveTargetAt(state, doc.indexOf('https')), null);
    });

    it('returns null over plain text', () => {
        const doc = 'Just a plain paragraph.';
        const state = stateFor(doc);
        assert.strictEqual(resolveInteractiveTargetAt(state, doc.indexOf('plain')), null);
    });
});

describe('chrome: collectLinkReferenceDefinitions', () => {
    it('collects every definition in the document', () => {
        const doc = '[one]: https://one.example\n[two]: https://two.example';
        const state = stateFor(doc);
        assert.deepStrictEqual(collectLinkReferenceDefinitions(state), [
            { label: 'one', url: 'https://one.example' },
            { label: 'two', url: 'https://two.example' },
        ]);
    });

    it('returns an empty list when there are none', () => {
        assert.deepStrictEqual(collectLinkReferenceDefinitions(stateFor('no defs here')), []);
    });
});

describe('chrome: resolveHoverTitle', () => {
    it('shows the destination URL for a link', () => {
        const doc = '[text](https://example.com)';
        const state = stateFor(doc);
        assert.strictEqual(resolveHoverTitle(state, doc.indexOf('text')), 'https://example.com');
    });

    it('shows the destination URL for an image', () => {
        const doc = '![alt](img.png)';
        const state = stateFor(doc);
        assert.strictEqual(resolveHoverTitle(state, doc.indexOf('alt')), 'img.png');
    });

    it('is null for a footnote (never had a hover tooltip)', () => {
        const doc = 'See[^1] here.\n\n[^1]: The note.';
        const state = stateFor(doc);
        assert.strictEqual(resolveHoverTitle(state, doc.indexOf('1]')), null);
    });

    it('is null over nothing interactive', () => {
        assert.strictEqual(resolveHoverTitle(stateFor('plain text'), 2), null);
    });
});

describe('chrome: resolveClickAction', () => {
    it('scrolls within the document for a pure #fragment link', () => {
        const doc = '# Getting Started\n\nSee [there](#getting-started).';
        const state = stateFor(doc);
        const action = resolveClickAction(state, doc.indexOf('there'));
        assert.deepStrictEqual(action, { kind: 'scrollTo', pos: 0 });
    });

    it('opens the host for a link with a path', () => {
        const doc = '[text](https://example.com)';
        const state = stateFor(doc);
        assert.deepStrictEqual(resolveClickAction(state, doc.indexOf('text')), {
            kind: 'openLink',
            url: 'https://example.com',
        });
    });

    it('opens the host for a cross-file link with a fragment', () => {
        const doc = '[text](other.md#section)';
        const state = stateFor(doc);
        assert.deepStrictEqual(resolveClickAction(state, doc.indexOf('text')), {
            kind: 'openLink',
            url: 'other.md#section',
        });
    });

    it('does nothing for a #fragment with no matching heading', () => {
        const doc = '[text](#nope)';
        const state = stateFor(doc);
        assert.deepStrictEqual(resolveClickAction(state, doc.indexOf('text')), { kind: 'none' });
    });

    it('jumps from a footnote reference to its definition', () => {
        const doc = 'See[^1] here.\n\n[^1]: The note.';
        const state = stateFor(doc);
        const action = resolveClickAction(state, doc.indexOf('1]'));
        assert.deepStrictEqual(action, { kind: 'scrollTo', pos: doc.lastIndexOf('[^1]:') });
    });

    it('jumps from a footnote definition back to its reference', () => {
        const doc = 'See[^1] here.\n\n[^1]: The note.';
        const state = stateFor(doc);
        const action = resolveClickAction(state, doc.lastIndexOf('1]'));
        assert.deepStrictEqual(action, { kind: 'scrollTo', pos: doc.indexOf('[^1]') });
    });

    it('does nothing over plain text', () => {
        assert.deepStrictEqual(resolveClickAction(stateFor('plain text'), 2), { kind: 'none' });
    });
});

describe('chrome: resolveOpenAffordance', () => {
    it('offers "Open link" for an inline link', () => {
        const doc = '[text](https://example.com)';
        const state = stateFor(doc);
        assert.deepStrictEqual(resolveOpenAffordance(state, doc.indexOf('text')), {
            action: { kind: 'openLink', url: 'https://example.com' },
            label: 'Open link',
        });
    });

    it('offers "Open link" for a reference-style link', () => {
        const doc = '[text][ref]\n\n[ref]: https://example.com';
        const state = stateFor(doc);
        assert.deepStrictEqual(resolveOpenAffordance(state, doc.indexOf('text')), {
            action: { kind: 'openLink', url: 'https://example.com' },
            label: 'Open link',
        });
    });

    it('offers "Open link" for a bracketed autolink', () => {
        const doc = 'See <https://example.com> here';
        const state = stateFor(doc);
        assert.deepStrictEqual(resolveOpenAffordance(state, doc.indexOf('https')), {
            action: { kind: 'openLink', url: 'https://example.com' },
            label: 'Open link',
        });
    });

    it('offers "Open link" for a bare GFM autolink', () => {
        const doc = 'Visit https://example.com today';
        const state = stateFor(doc);
        assert.deepStrictEqual(resolveOpenAffordance(state, doc.indexOf('https')), {
            action: { kind: 'openLink', url: 'https://example.com' },
            label: 'Open link',
        });
    });

    it('offers "Open image" for an image', () => {
        const doc = '![alt](img.png)';
        const state = stateFor(doc);
        assert.deepStrictEqual(resolveOpenAffordance(state, doc.indexOf('alt')), {
            action: { kind: 'openLink', url: 'img.png' },
            label: 'Open image',
        });
    });

    it('offers "Go to section" for a resolvable #fragment link', () => {
        const doc = '# Getting Started\n\nSee [there](#getting-started).';
        const state = stateFor(doc);
        assert.deepStrictEqual(resolveOpenAffordance(state, doc.indexOf('there')), {
            action: { kind: 'scrollTo', pos: 0 },
            label: 'Go to section',
        });
    });

    it('is null for a #fragment with no matching heading', () => {
        const doc = '[text](#nope)';
        assert.strictEqual(resolveOpenAffordance(stateFor(doc), doc.indexOf('text')), null);
    });

    it('is null for a reference-style link with no matching definition', () => {
        const doc = '[text][missing]';
        assert.strictEqual(resolveOpenAffordance(stateFor(doc), doc.indexOf('text')), null);
    });

    it('is null over a footnote reference and its definition (Cmd+click still jumps)', () => {
        const doc = 'See[^1] here.\n\n[^1]: The note.';
        const state = stateFor(doc);
        assert.strictEqual(resolveOpenAffordance(state, doc.indexOf('1]')), null);
        assert.strictEqual(resolveOpenAffordance(state, doc.lastIndexOf('1]')), null);
    });

    it('is null over a link reference definition line', () => {
        const doc = '[ref]: https://example.com';
        assert.strictEqual(resolveOpenAffordance(stateFor(doc), doc.indexOf('https')), null);
    });

    it('is null over plain text', () => {
        assert.strictEqual(resolveOpenAffordance(stateFor('plain text'), 2), null);
    });
});

describe('chrome: cursor position <-> doc position', () => {
    it('round-trips a position back to the same line/offset', () => {
        const state = EditorState.create({ doc: 'line one\nline two\nline three' });
        const head = state.doc.line(2).from + 3; // "lin|e two"
        const cursor = cursorPositionFromHead(state, head);
        assert.deepStrictEqual(cursor, { lineIndex: 1, offset: 3 });
        assert.strictEqual(headFromCursorPosition(state, cursor), head);
    });

    it('clamps a stored position past the end of a shrunk document', () => {
        const state = EditorState.create({ doc: 'short' });
        const pos = headFromCursorPosition(state, { lineIndex: 5, offset: 20 });
        assert.strictEqual(pos, state.doc.line(state.doc.lines).length + state.doc.line(state.doc.lines).from);
    });

    it('clamps a negative offset to the start of the line', () => {
        const state = EditorState.create({ doc: 'hello' });
        assert.strictEqual(headFromCursorPosition(state, { lineIndex: 0, offset: -5 }), 0);
    });
});
