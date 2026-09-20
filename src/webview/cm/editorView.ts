/**
 * Constructs the CM6 `EditorView`. The single place `./extensions.ts` is
 * turned into a live view — later work packages should not construct their
 * own `EditorView`; add extensions to `extensions.ts` instead, so there is
 * exactly one editor instance and one owner of it.
 */
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownExtensions } from './extensions';

export interface CreateEditorViewOptions {
    /** Initial document content. */
    doc: string;
    /** DOM element the view mounts into. */
    parent: HTMLElement;
    /** Called with the full document text whenever `update.docChanged`. */
    onDocChanged?: (doc: string) => void;
    /**
     * Set for a document the host cannot write back to — a non-`file:` scheme
     * such as one side of a VS Code diff. `EditorState.readOnly` alone still
     * leaves a focusable cursor and an editable-looking surface, so
     * `EditorView.editable` goes with it.
     */
    readOnly?: boolean;
}

export function createEditorView({ doc, parent, onDocChanged, readOnly = false }: CreateEditorViewOptions): EditorView {
    const changeListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
            onDocChanged?.(update.state.doc.toString());
        }
    });

    const readOnlyExtensions = readOnly
        ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
        : [];

    return new EditorView({
        state: EditorState.create({
            doc,
            extensions: [...markdownExtensions, changeListener, ...readOnlyExtensions],
        }),
        parent,
    });
}
