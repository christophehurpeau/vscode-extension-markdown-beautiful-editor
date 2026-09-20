/**
 * Message protocol shared between the extension host and the webview.
 *
 * Single source of truth for the `type` strings and payload shapes exchanged
 * over `postMessage`, so a typo or a missing field on either side is a compile
 * error rather than a silent runtime no-op.
 *
 * Types only — kept free of any `vscode` / DOM dependency so both bundles can
 * import it. Consumers use `import type`, so nothing survives into the runtime
 * bundles.
 */

import type { EditorFontFamily } from './fontFamily';
import type { DiffPanelRestoreState } from './gitRefs';

/** Messages sent from the extension host to the webview. */
export type HostToWebviewMessage =
    | {
          type: 'init';
          content: string;
          originalContent: string;
          diffMode: boolean;
          originalVersionContent?: string;
          diffAvailable: boolean;
          fontFamily: EditorFontFamily;
          // Set for any document this extension cannot write back to -- in
          // practice a non-`file:` scheme such as the `git:` URIs VS Code
          // hands each side of a diff. The webview then makes the editor
          // non-editable and shows the read-only banner; the host drops any
          // `edit` message. See docs/TRIAGE.md #12.
          readOnly: boolean;
          // git HEAD content, for the always-on added/modified/deleted gutter
          // indicator (`webview/cm/lineNumberGutter.ts`). Distinct from
          // `originalVersionContent` above (git HEAD too, but only sent on a
          // `toggleDiff` and image-path-rewritten for the merge view) and
          // from `originalContent` (not git-related at all -- the current
          // document's own pre-image-rewrite text). `null` when the file
          // isn't in git or has no HEAD version (new/untracked file).
          headContent: string | null;
      }
    // The `fontFamily` setting changed; drops any temporary toolbar override.
    | { type: 'fontFamily'; fontFamily: EditorFontFamily }
    | {
          type: 'update';
          content: string;
          originalContent: string;
          diffAvailable: boolean;
          // See `init`'s `headContent` above.
          headContent: string | null;
      }
    | { type: 'focus' }
    | { type: 'toggleDiff'; originalVersionContent: string }
    // Sole message of the standalone diff panel (`src/editor/diffPanel.ts`),
    // which shares this bundle but not the editor bootstrap: it renders a
    // read-only `MergeView` and nothing else. Distinct from `toggleDiff`,
    // which overlays a diff on top of a live editing session.
    | {
          type: 'initDiff';
          original: string;
          modified: string;
          originalLabel: string;
          modifiedLabel: string;
          /** Staged / Unstaged / Untracked / Deleted -- what the pair means,
           *  next to the refs it names. `null` when comparing against a
           *  commit, which none of those words describes. */
          scopeLabel: string | null;
          /** The modified side is a file on disk, so the pane takes edits and
           *  offers revert controls. False when it is the index or a commit. */
          editable: boolean;
          fontFamily: EditorFontFamily;
          // Stashed via `setState` so the panel can be rebuilt by
          // `registerDiffPanelSerializer` after a window reload.
          restoreState: DiffPanelRestoreState;
      }
    // Scroll the editor to the heading whose slug matches (e.g. from a
    // `#fragment` link, including cross-file `other.md#heading` navigation).
    | { type: 'scrollToAnchor'; slug: string }
    // NOTE: no webview handler exists for this today — see suspected bug #3.
    | { type: 'imageResolved'; originalPath: string; resolvedUri: string };

/** Messages sent from the webview to the extension host. */
export type WebviewToHostMessage =
    | { type: 'ready' }
    | { type: 'edit'; content: string }
    | { type: 'openLink'; url: string }
    | { type: 'requestDiffToggle' }
    // The toggle was asked for but there was nothing to show. Reported so the
    // host can say why, rather than the click appearing to do nothing.
    | { type: 'diffSkipped'; reason: 'no-changes' }
    // From the read-only banner: open this file in the standalone diff panel,
    // which is what the user was after when they picked this editor for a diff.
    | { type: 'openBeautifulDiff' }
    // NOTE: never actually sent by the current webview — see suspected bug #3.
    | { type: 'resolveImage'; path: string };
