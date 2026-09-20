/**
 * Line-type toolbar (`#line-type-toolbar`) — CM6 port of the line-type half
 * of `initToolbar` plus `updateLineTypeToolbarState`, removed from
 * `main.ts`. Button markup generation from `MENU_LINE_TYPES`
 * (`src/shared/lineTypes.ts`) moves here too.
 *
 * State refresh has no `currentLineIndex` module global to maintain (that
 * and `updateCurrentLineIndex` are gone): an `EditorView.updateListener`,
 * installed via `StateEffect.appendConfig` (same pattern as
 * `cm/sync/hostSync.ts` — `editorView.ts` is frozen), re-derives the active
 * button on every `selectionSet`/`docChanged` update straight from
 * `state.selection.main.head`.
 *
 * Same-type clicks: `setLineType` (`../commands/lineType.ts`) returns
 * `false` and dispatches nothing when the line is already the requested
 * type. That matches the old `applyLineType`, which re-applied the same
 * prefix and produced identical text — never a toggle back to paragraph.
 * Only a paragraph line-type button dedicated to "paragraph" turns a
 * heading/list/quote/etc. line back into a paragraph (see
 * `cmLineType.test.ts`'s "toggles a line type off" case); the same-type
 * case stays inert here, unchanged from before.
 */
import { StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { MENU_LINE_TYPES } from '../../../shared/lineTypes';
import { getLineTypeAtCursor, setLineType } from '../commands/lineType';
import type { EditorState } from '@codemirror/state';

export interface LineTypeToolbarController {
    destroy(): void;
}

/**
 * Which toolbar button (if any) should show as active for the cursor's
 * current line. Pure state -> button-type mapping, DOM-free and unit
 * testable: `alert` lines (GitHub alerts, `> [!NOTE]`) have no dedicated
 * button and read as `quote`, matching the old `updateLineTypeToolbarState`.
 */
export function activeLineTypeButton(state: EditorState): string {
    const type = getLineTypeAtCursor(state).type;
    return type === 'alert' ? 'quote' : type;
}

function renderButtons(toolbarEl: HTMLElement): void {
    toolbarEl.innerHTML = MENU_LINE_TYPES.map(def => `
        <button type="button" data-type="${def.type}" class="toolbar-btn line-type-btn" title="${def.label}">
            <span class="toolbar-btn-icon">${def.icon}</span>
        </button>
    `).join('');
}

export function initLineTypeToolbar(view: EditorView, toolbarEl: HTMLElement): LineTypeToolbarController {
    renderButtons(toolbarEl);

    function updateActiveButton(): void {
        const activeType = activeLineTypeButton(view.state);
        for (const button of toolbarEl.querySelectorAll<HTMLElement>('.line-type-btn')) {
            button.classList.toggle('active', button.dataset.type === activeType);
        }
    }

    function onMouseDown(event: MouseEvent): void {
        // Prevent losing editor focus (and CM6's selection with it) to the
        // button, same as the formatting toolbar's mousedown handler.
        event.preventDefault();
    }

    function onClick(event: MouseEvent): void {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
        const type = button?.dataset.type;
        if (!type) {
            return;
        }

        setLineType(type)({ state: view.state, dispatch: view.dispatch });
        view.focus();
        updateActiveButton();
    }

    toolbarEl.addEventListener('mousedown', onMouseDown);
    toolbarEl.addEventListener('click', onClick);

    view.dispatch({
        effects: StateEffect.appendConfig.of(
            EditorView.updateListener.of((update) => {
                if (update.selectionSet || update.docChanged) {
                    updateActiveButton();
                }
            }),
        ),
    });

    updateActiveButton();

    return {
        destroy(): void {
            toolbarEl.removeEventListener('mousedown', onMouseDown);
            toolbarEl.removeEventListener('click', onClick);
        },
    };
}
