/**
 * Editor State Module
 *
 * Manages editor state persistence across tab switches using VS Code's state API.
 * Stores cursor position, scroll position and the TOC visibility preference.
 */

import type { TocVisibilityPreference } from '../../shared/tocVisibility';

// Cursor position interface
export interface CursorPosition {
    lineIndex: number;
    offset: number;
}

// Editor state interface for VS Code persistence
export interface EditorState {
    cursorPosition: CursorPosition | null;
    scrollTop: number;
    /** Absent while the user has never toggled the TOC (width decides). */
    tocPreference?: TocVisibilityPreference;
}

interface VscodeStateApi {
    setState(state: unknown): void;
    getState(): unknown;
}

/**
 * Retrieve stored editor state from VS Code's state API
 *
 * @param vscode VS Code API instance
 * @returns Stored editor state or null if none exists
 */
export function getStoredState(vscode: Pick<VscodeStateApi, 'getState'>): EditorState | null {
    return vscode.getState() as EditorState | null;
}

/**
 * Save cursor and scroll position, preserving any other stored fields (the TOC
 * preference is written on its own cadence and must survive an edit).
 *
 * @param vscode VS Code API instance
 * @param cursorPosition Current cursor position
 * @param scrollTop Current scroll position
 */
export function saveState(
    vscode: VscodeStateApi,
    cursorPosition: CursorPosition | null,
    scrollTop: number
): void {
    const state: EditorState = {
        ...getStoredState(vscode),
        cursorPosition,
        scrollTop
    };
    vscode.setState(state);
}

export function saveTocPreference(
    vscode: VscodeStateApi,
    tocPreference: TocVisibilityPreference
): void {
    const state: EditorState = {
        cursorPosition: null,
        scrollTop: 0,
        ...getStoredState(vscode),
        tocPreference
    };
    vscode.setState(state);
}
