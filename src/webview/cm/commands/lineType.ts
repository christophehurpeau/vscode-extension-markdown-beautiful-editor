/**
 * Line-type commands (paragraph/heading/list/quote/code) — the CM6
 * counterpart of the old `applyLineType`/`updateLineTypeToolbarState` in
 * `main.ts` (~750-784 / ~560-581).
 *
 * Reuses the pure `stripLinePrefix`/`applyLinePrefix`/`getLineType`
 * transforms in `src/shared/lineTypes.ts` unchanged — this file's job is
 * only to resolve the target line's text from the state and dispatch the
 * resulting change as a transaction. Everything the old version did around
 * that (scroll save/restore, `innerHTML =`, the `isExternalUpdate` guard,
 * `restoreCursorPosition`, `updateTocFromMarkdown`) is deleted; CM6's
 * transaction/selection model handles it.
 *
 * Cursor placement matches the old behavior: after a line-type change, the
 * cursor lands at the very start of the (rewritten) line — old
 * `applyLineType` restored `{lineIndex, offset: 0}`, and offset 0 in that
 * coordinate system was the absolute start of the line's raw text, i.e.
 * `line.from` here.
 */
import type { EditorState, StateCommand } from '@codemirror/state';
import { applyLinePrefix, getLineType, stripLinePrefix, type LineTypeDefinition } from '../../../shared/lineTypes';

/** "What line type is at the cursor?" query, for the line-type toolbar's
 *  active-button state (old `updateLineTypeToolbarState`). Deliberately the
 *  regex classifier, not a syntax-tree query — see
 *  docs/plans/CODEMIRROR6_MIGRATION.md and `src/shared/lineTypes.ts`'s own
 *  header: it has 561 lines of existing tests and can classify an empty
 *  `> ` line the way the toolbar needs, which a tree query could not. */
export function getLineTypeAtCursor(state: EditorState): LineTypeDefinition {
    return getLineType(state.doc.lineAt(state.selection.main.head).text);
}

/** Set the cursor's line to `type` (paragraph/h1-h6/hr/ul/ol/task/quote/code).
 *  A `StateCommand`: returns `false` (nothing dispatched) when the line is
 *  already that type (stripping and re-applying the prefix is a no-op). */
export function setLineType(type: string): StateCommand {
    return ({ state, dispatch }) => {
        const line = state.doc.lineAt(state.selection.main.head);
        const newText = applyLinePrefix(stripLinePrefix(line.text), type);
        if (newText === line.text) {
            return false;
        }

        dispatch(
            state.update({
                changes: { from: line.from, to: line.to, insert: newText },
                selection: { anchor: line.from },
                scrollIntoView: true,
            }),
        );
        return true;
    };
}
