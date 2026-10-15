/**
 * Indent/outdent for the host-owned Cmd+[ / Cmd+] keybindings; see
 * `src/shared/indentCommands.ts` for why VS Code, not CodeMirror, resolves
 * those keys.
 */
import type { KeyBinding } from '@codemirror/view';
import type { StateCommand } from '@codemirror/state';
import { defaultKeymap, historyKeymap, indentLess, indentMore } from '@codemirror/commands';
import type { IndentDirection } from '../../../shared/indentCommands';

const hostOwnedKeys = new Set(['Mod-[', 'Mod-]']);

/**
 * The webview forwards every keydown reaching its window to VS Code, whose
 * `undo`/`redo` would then also run on the backing TextDocument: one Cmd+Z
 * undoes twice, and the host's `update` echo moves the cursor mid-word.
 */
const webviewOwnedHistoryKeymap: readonly KeyBinding[] = historyKeymap.map((binding) => ({
    ...binding,
    preventDefault: true,
    stopPropagation: true,
}));

/** `defaultKeymap` + `historyKeymap`, minus the keys the host keybinding
 *  owns. Shared by every editable surface: the main view and the merge
 *  view's modified pane both receive the host's `indent` message. */
export const editingKeymap: readonly KeyBinding[] = [
    ...defaultKeymap.filter((binding) => binding.key === undefined || !hostOwnedKeys.has(binding.key)),
    ...webviewOwnedHistoryKeymap,
];

export function indentCommand(direction: IndentDirection): StateCommand {
    return direction === 'more' ? indentMore : indentLess;
}
