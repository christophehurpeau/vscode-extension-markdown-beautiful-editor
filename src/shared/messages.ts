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

/** Messages sent from the extension host to the webview. */
export type HostToWebviewMessage =
    | {
          type: 'init';
          content: string;
          originalContent: string;
          diffMode: boolean;
          originalVersionContent?: string;
          diffAvailable: boolean;
      }
    | {
          type: 'update';
          content: string;
          originalContent: string;
          diffAvailable: boolean;
      }
    | { type: 'focus' }
    | { type: 'toggleDiff'; originalVersionContent: string }
    // NOTE: no webview handler exists for this today — see suspected bug #3.
    | { type: 'imageResolved'; originalPath: string; resolvedUri: string };

/** Messages sent from the webview to the extension host. */
export type WebviewToHostMessage =
    | { type: 'ready' }
    | { type: 'edit'; content: string }
    | { type: 'openLink'; url: string }
    | { type: 'requestDiffToggle' }
    // NOTE: never actually sent by the current webview — see suspected bug #3.
    | { type: 'resolveImage'; path: string };
