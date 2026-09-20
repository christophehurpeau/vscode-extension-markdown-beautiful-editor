/**
 * Multi-cursor / multiple selections.
 *
 * CM6 supports several selection ranges but ships none of it enabled:
 * `allowMultipleSelections` gates the state (a transaction carrying more than
 * one range throws without it), and the native browser selection can only
 * render one range, so `drawSelection()` — which hides the native caret and
 * paints every cursor as a `.cm-cursor` element — is a hard requirement, not
 * a cosmetic choice. Its cost is one extra DOM layout cycle per update.
 *
 * Gestures, matching VS Code:
 * - Alt/Option-click adds a cursor. CM6's own default is Cmd/Ctrl-click,
 *   which this editor already spends on "open the link under the pointer"
 *   (`cm/ui/chrome.ts`) — leaving the default in place would fire both.
 * - Alt/Option-drag selects a rectangle (one range per line).
 * - Mod-Alt-ArrowUp/Down adds a cursor on the line above/below.
 * - Escape collapses back to one cursor — already bound to `simplifySelection`
 *   by `defaultKeymap`, nothing to add here.
 *
 * Cmd-D "select next occurrence" is not bound here: it comes with
 * `searchKeymap` (`./search.ts`), which also owns Mod-Shift-l "select all
 * occurrences of the selection".
 *
 * Not implemented: VS Code's "pressing the opposite direction removes the
 * last added cursor".
 */
import { EditorSelection, EditorState, type Extension, type SelectionRange } from '@codemirror/state';
import { EditorView, crosshairCursor, drawSelection, keymap, rectangularSelection, type Command } from '@codemirror/view';

export interface AddedCursorOptions {
    selection: EditorSelection;
    /** `true` for the line below (the last range), `false` for the line above
     *  (the first range). `selection.ranges` is always sorted by position. */
    forward: boolean;
    /** `view.moveVertically(range, forward)` — visual, not logical: with
     *  `lineWrapping` on, "one line down" is one screen row, which needs the
     *  view's geometry. Injected so the decision below stays DOM-free. */
    moveVertically: (range: SelectionRange) => SelectionRange;
}

/**
 * The new selection after "add cursor above/below", or `null` when the edge
 * range is already on the first/last line and `moveVertically` has nowhere to
 * go (CM6 returns the range unmoved in that case).
 *
 * The added cursor becomes the main range, so subsequent vertical motion
 * extends away from it, and it carries the edge range's `goalColumn` so a run
 * of presses keeps the same column across short lines.
 */
export function selectionWithAddedCursor({ selection, forward, moveVertically }: AddedCursorOptions): EditorSelection | null {
    const edge = forward ? selection.ranges[selection.ranges.length - 1] : selection.ranges[0];
    const added = moveVertically(EditorSelection.cursor(edge.head, edge.assoc, undefined, edge.goalColumn));
    if (added.head === edge.head) {
        return null;
    }
    const ranges = [...selection.ranges, EditorSelection.cursor(added.head, added.assoc, undefined, added.goalColumn)];
    return EditorSelection.create(ranges, ranges.length - 1);
}

function addCursorVertically(forward: boolean): Command {
    return (view) => {
        const selection = selectionWithAddedCursor({
            selection: view.state.selection,
            forward,
            moveVertically: (range) => view.moveVertically(range, forward),
        });
        if (!selection) {
            return false;
        }
        view.dispatch({ selection, scrollIntoView: true, userEvent: 'select' });
        return true;
    };
}

export const multipleSelections: Extension[] = [
    EditorState.allowMultipleSelections.of(true),
    drawSelection(),
    rectangularSelection(),
    crosshairCursor(),
    EditorView.clickAddsSelectionRange.of((event) => event.altKey),
    keymap.of([
        { key: 'Mod-Alt-ArrowUp', run: addCursorVertically(false) },
        { key: 'Mod-Alt-ArrowDown', run: addCursorVertically(true) },
    ]),
];
