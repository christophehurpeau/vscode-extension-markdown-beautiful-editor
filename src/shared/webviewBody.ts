/**
 * Body markup of the webview.
 *
 * Shared by the extension host (`src/editor/webviewContent.ts`, which wraps
 * this in the CSP document) and the screenshot harness
 * (`screenshots/capture.ts`), which mounts the same markup in a headless
 * browser. Pure string building — no `vscode`, no DOM — so a chrome change
 * reaches the screenshots without anyone remembering to mirror it.
 */

/**
 * `editor` is the custom editor's full chrome; `diff` is the standalone diff
 * panel (`diffPanel.ts`), which shares the same bundle but mounts a read-only
 * `MergeView` and so must not ship toolbars, a TOC or a formatting popup that
 * would have nothing to act on.
 */
export type WebviewMode = 'editor' | 'diff';

function diffPanelBody(): string {
    return `    <div class="diff-panel-header">
        <span class="diff-panel-scope" id="diff-label-scope"></span>
        <span class="diff-panel-side" id="diff-label-original"></span>
        <span class="diff-panel-arrow">↔</span>
        <span class="diff-panel-side" id="diff-label-modified"></span>
    </div>

    <div class="editor-container">
        <div class="editor-main">
            <div id="editor"></div>
        </div>
    </div>`;
}

function editorBody(): string {
    return `    <!-- Top toolbar -->
    <!-- Table of contents toggle, pinned to the top-left corner -->
    <button type="button" id="toc-toggle-btn" class="toolbar-btn toc-toggle-btn" title="Toggle Table of Contents" aria-pressed="true">
        <span class="toolbar-btn-icon">☰</span>
    </button>

    <div id="toolbar" class="toolbar">
        <!-- Line type buttons (left-aligned) -->
        <div id="line-type-toolbar" class="toolbar-section">
            <!-- Content is generated dynamically from MENU_LINE_TYPES in main.ts -->
        </div>

        <!-- Spacer to push the right-aligned sections away from the line types -->
        <div class="toolbar-spacer"></div>

        <!-- Font toggle, kept apart from the editing buttons: it is a view
             preference for this panel only, not an edit. -->
        <div class="toolbar-section toolbar-section-separated">
            <button type="button" id="font-toggle-btn" class="toolbar-btn" title="Toggle monospace font (this panel only)" aria-pressed="false">
                <span class="toolbar-btn-icon">Aa</span>
            </button>
        </div>

        <!-- Diff buttons (right-aligned) -->
        <button type="button" id="diff-toggle-btn" class="toolbar-btn" title="Toggle Diff Mode" style="display: none;">
            <span class="toolbar-btn-icon">⇄</span>
            <span class="toolbar-btn-label">Diff</span>
        </button>
        <button type="button" id="diff-close-btn" class="toolbar-btn" title="Exit Diff Mode" style="display: none;">
            <span class="toolbar-btn-icon">✕</span>
            <span class="toolbar-btn-label">Close Diff</span>
        </button>
    </div>

    <!-- Shown only for a document this editor cannot write to, which in
         practice means one side of a diff VS Code opened with this editor.
         See docs/TRIAGE.md #12. -->
    <div id="readonly-banner" class="readonly-banner" style="display: none;">
        <span class="readonly-banner-text">This editor can't show a diff. It's read-only here.</span>
        <button type="button" id="readonly-banner-btn" class="readonly-banner-btn">Open Beautiful Diff</button>
    </div>

    <div class="editor-container">
        <nav class="toc-sidebar" id="toc"></nav>
        <div class="editor-main">
            <div id="editor"></div>
        </div>
    </div>

    <!-- Floating formatting toolbar (appears on text selection) -->
    <div id="formatting-toolbar" class="formatting-toolbar" style="display: none;">
        <button type="button" data-format="bold" title="Bold (⌘B)"><strong>B</strong></button>
        <button type="button" data-format="italic" title="Italic (⌘I)"><em>I</em></button>
        <button type="button" data-format="code" title="Code (⌘E)"><code>&lt;/&gt;</code></button>
        <button type="button" data-format="strikethrough" title="Strikethrough"><s>S</s></button>
        <button type="button" data-format="link" title="Link (⌘K)">🔗</button>
        <!-- Shown only when the cursor sits inside a link or image; does what
             ⌘/Ctrl+click on that target does. -->
        <button type="button" data-action="open-link" title="Open link (⌘Click)" style="display: none;">↗</button>
    </div>`;
}

export function webviewBodyHtml(mode: WebviewMode): string {
    return mode === 'diff' ? diffPanelBody() : editorBody();
}

/** Class the `<body>` element carries for `mode`; `main.ts` branches on it. */
export function webviewBodyClass(mode: WebviewMode): string {
    return mode === 'diff' ? 'diff-panel' : 'editor-panel';
}
