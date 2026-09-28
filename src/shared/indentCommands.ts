/**
 * Cmd+[ / Cmd+] (Ctrl elsewhere), resolved by VS Code rather than by
 * CodeMirror so they land on the same keys as the text editor's own
 * Indent/Outdent Line on every keyboard layout.
 *
 * CodeMirror matches `Mod-[` on the character the key produces: on a layout
 * where `[` needs Alt+Shift (French AZERTY on macOS), the event carries extra
 * modifiers and never matches. VS Code maps `cmd+[` through the active layout
 * and sees every keydown a webview forwards, so its keybinding is the one
 * that works everywhere. The webview drops CodeMirror's own binding for these
 * keys (`webview/cm/commands/indent.ts`); keeping both would indent twice on
 * a US layout.
 *
 * Command ids are here, not inline, so `indentCommands.test.ts` can assert
 * that `package.json` binds them.
 */

export type IndentDirection = 'more' | 'less';

export const indentCommandIds: Record<IndentDirection, string> = {
    more: 'markdown.beautifulEditor.indentLines',
    less: 'markdown.beautifulEditor.outdentLines',
};
