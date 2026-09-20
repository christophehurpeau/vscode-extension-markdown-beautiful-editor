/**
 * View type ids that `package.json` also names, kept here so the pair can be
 * asserted from a unit test (`viewTypes.test.ts`).
 */

/**
 * The standalone diff tab (`src/editor/diffPanel.ts`).
 *
 * Tied to an `onWebviewPanel:<viewType>` entry in `activationEvents`: unlike
 * `customEditors`, a webview panel serializer gets no implicit activation
 * event, so without it VS Code restores the tab, finds no registered
 * serializer and leaves the panel spinning until something else activates the
 * extension -- typically the user clicking through to a markdown custom
 * editor and back.
 */
export const diffPanelViewType = 'markdown.beautifulEditor.diffPanel';
