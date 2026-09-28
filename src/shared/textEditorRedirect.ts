/**
 * Decision logic for the experimental `replaceTextEditors` setting
 * (`src/editor/textEditorRedirect.ts`).
 *
 * VS Code never hands a custom editor the selection it was opened with -- a
 * Search view result, Go to Symbol, a Problems entry
 * (microsoft/vscode#289785). A text editor does get it, so the setting lets
 * the text editor open, reads its selection, then swaps it for this editor.
 *
 * Free of any `vscode` dependency so it can be unit-tested.
 */

/** Zero-based, as `vscode.Position` and the `revealSelection` message. */
export interface TextPosition {
    line: number;
    character: number;
}

export interface TextSelection {
    anchor: TextPosition;
    active: TextPosition;
}

export interface RedirectCandidate {
    scheme: string;
    path: string;
    /** The editor sits in a plain text tab: not a diff, merge or notebook editor. */
    isPlainTextTab: boolean;
}

/** Same files the `customEditors` selector in `package.json` claims. Only
 *  `file:` documents: anything else (`git:`, untitled) is read-only or has no
 *  path this editor can resolve images against. */
export function isRedirectCandidate({ scheme, path, isPlainTextTab }: RedirectCandidate): boolean {
    return isPlainTextTab && scheme === 'file' && path.toLowerCase().endsWith('.md');
}

function isDocumentStart({ line, character }: TextPosition): boolean {
    return line === 0 && character === 0;
}

/** A text editor opened without a selection reports a caret at the document
 *  start, which is also where this editor opens: nothing to reveal. */
export function selectionToReveal(selection: TextSelection): TextSelection | null {
    return isDocumentStart(selection.anchor) && isDocumentStart(selection.active) ? null : selection;
}

/**
 * Files whose text editors must be left alone because the user asked for
 * text: "Open as Text", or "Reopen Editor With… > Text Editor", which shows
 * up as this editor closing and a text editor for the same file appearing
 * right after. An exemption lasts until every text tab for the file closes.
 */
export interface RedirectExemptions {
    exempt(uri: string): void;
    /** Only for a pinned tab: a preview tab of this editor is also replaced
     *  by the next preview text tab -- clicking another search result in the
     *  same file -- which must still be redirected. */
    noteCustomEditorClosed(uri: string): void;
    noteTextTabsClosed(uri: string): void;
    /** A text editor appearing within `reopenWindowMs` of this editor
     *  closing turns into a lasting exemption here. */
    isExempt(uri: string): boolean;
}

export interface RedirectExemptionsOptions {
    now: () => number;
    reopenWindowMs: number;
}

export function createRedirectExemptions({ now, reopenWindowMs }: RedirectExemptionsOptions): RedirectExemptions {
    const exempted = new Set<string>();
    const customEditorClosedAt = new Map<string, number>();

    return {
        exempt: (uri) => {
            exempted.add(uri);
        },
        noteCustomEditorClosed: (uri) => {
            customEditorClosedAt.set(uri, now());
        },
        noteTextTabsClosed: (uri) => {
            exempted.delete(uri);
        },
        isExempt: (uri) => {
            const closedAt = customEditorClosedAt.get(uri);
            customEditorClosedAt.delete(uri);
            if (closedAt !== undefined && now() - closedAt <= reopenWindowMs) {
                exempted.add(uri);
            }
            return exempted.has(uri);
        },
    };
}
