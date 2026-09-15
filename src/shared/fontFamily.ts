/**
 * Body font selection for the editor content.
 *
 * `normal` renders prose with the UI (proportional) font, `mono` with the
 * editor font. Code spans and fenced code blocks always render monospace,
 * regardless of this choice — that is enforced in CSS, not here.
 *
 * Pure (no DOM, no `vscode`) so both bundles can import it and it stays
 * unit-testable.
 */

export type EditorFontFamily = 'normal' | 'mono';

export const defaultEditorFontFamily: EditorFontFamily = 'normal';

/** Coerce an untrusted value (a workspace setting) to a known font choice. */
export function parseEditorFontFamily(value: unknown): EditorFontFamily {
    return value === 'mono' || value === 'normal' ? value : defaultEditorFontFamily;
}

interface ResolveEditorFontFamilyParams {
    setting: EditorFontFamily;
    /** The toolbar toggle's choice, or `null` while the setting applies. */
    override: EditorFontFamily | null;
}

export function resolveEditorFontFamily({ setting, override }: ResolveEditorFontFamilyParams): EditorFontFamily {
    return override ?? setting;
}

export function toggledEditorFontFamily(current: EditorFontFamily): EditorFontFamily {
    return current === 'mono' ? 'normal' : 'mono';
}

/** Class put on `<body>` to switch the content font; absent means `normal`. */
export const monoFontBodyClass = 'font-mono';
