/**
 * Editor State Module
 *
 * Manages editor state persistence across tab switches using VS Code's state API.
 * Stores cursor position and scroll position for state restoration.
 */

// Cursor position interface
export interface CursorPosition {
    lineIndex: number;
    offset: number;
}

// Editor state interface for VS Code persistence
export interface EditorState {
    cursorPosition: CursorPosition | null;
    scrollTop: number;
}

/**
 * Save current editor state to VS Code's state API
 *
 * @param vscode VS Code API instance
 * @param cursorPosition Current cursor position
 * @param scrollTop Current scroll position
 */
export function saveState(
    vscode: { setState(state: unknown): void },
    cursorPosition: CursorPosition | null,
    scrollTop: number
): void {
    const state: EditorState = {
        cursorPosition,
        scrollTop
    };
    vscode.setState(state);
}

/**
 * Retrieve stored editor state from VS Code's state API
 *
 * @param vscode VS Code API instance
 * @returns Stored editor state or null if none exists
 */
export function getStoredState(
    vscode: { getState(): unknown }
): EditorState | null {
    return vscode.getState() as EditorState | null;
}
