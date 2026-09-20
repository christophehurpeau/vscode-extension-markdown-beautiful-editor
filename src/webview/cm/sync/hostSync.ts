/**
 * Host <-> webview sync. Owns the debounced `edit` send and the application
 * of an incoming host `update` to the CM6 document.
 *
 * Echo suppression is annotation-based, not the old `lastSentContent` string
 * comparison: `applyExternalUpdate` tags its own transaction with
 * `hostEchoAnnotation`, and the `updateListener` this module installs skips
 * sending an `edit` for any transaction carrying it. Unlike a boolean
 * re-entrancy guard (docs/TRIAGE.md #7 -- `isExternalUpdate` could get stuck
 * `true` on a render throw and silently swallow all later typing), an
 * annotation is per-transaction: there is no shared flag to strand, so a
 * throw anywhere downstream can never wedge future edits.
 *
 * `applyExternalUpdate` narrows the incoming content to the single region
 * between the common prefix and suffix and dispatches that as a `ChangeSpec`,
 * rather than a whole-document replace -- so the user's selection and scroll
 * position survive a localized external edit. See
 * `computeExternalUpdateChanges` for why this is not a real diff.
 *
 * TODO: the outgoing `edit` message still carries the full document string
 * (`WebviewToHostMessage` only has `content: string`), and the host
 * (`src/editor/customEditorProvider.ts`) still applies it as a whole-document
 * `WorkspaceEdit`. Converting the webview's own `ChangeSet` into precise
 * `WorkspaceEdit` ranges is a deliberate follow-up -- it touches the host and
 * `src/shared/messages.ts`, both out of scope here.
 */
import { Annotation, StateEffect, type ChangeSpec, type Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { WebviewToHostMessage } from '../../../shared/messages';

const DEFAULT_DEBOUNCE_MS = 300;

/** Marks a transaction as applying a host-originated `update` rather than a
 * user edit, so the `edit`-sending listener can recognize its own echo. */
export const hostEchoAnnotation = Annotation.define<boolean>();

export function isHostEcho(transactions: readonly Transaction[]): boolean {
    return transactions.some((tr) => tr.annotation(hostEchoAnnotation) === true);
}

/**
 * Minimal `ChangeSpec` turning `oldDoc` into `newDoc`: one hunk spanning the
 * region between the common prefix and the common suffix. `null` when the
 * documents are already equal.
 *
 * Deliberately NOT a real diff. `diff.diffChars` was measured at 3.3s for a
 * 100-line wholesale replacement, 13s for 200 lines, and over two minutes for
 * 500 -- Myers is O(N*D), and D is the whole document when the content is
 * replaced outright (a git branch switch, a formatter run, an undo in another
 * editor). That freezes the webview. Prefix/suffix trimming is O(N) and gives
 * the same answer for the case that actually matters: a localized external
 * edit produces one tight hunk, so the selection and scroll position outside
 * it survive. A wholesale replacement collapses to a single full-width change,
 * which is what a whole-document replace would have done anyway.
 */
export function computeExternalUpdateChanges(oldDoc: string, newDoc: string): ChangeSpec | null {
    if (oldDoc === newDoc) {
        return null;
    }

    let prefix = 0;
    const maxPrefix = Math.min(oldDoc.length, newDoc.length);
    while (prefix < maxPrefix && oldDoc.charCodeAt(prefix) === newDoc.charCodeAt(prefix)) {
        prefix++;
    }

    // Stop the suffix scan at `prefix` so the two regions cannot overlap on
    // repetitive content (e.g. "aaa" -> "aaaa").
    let suffix = 0;
    const maxSuffix = Math.min(oldDoc.length, newDoc.length) - prefix;
    while (
        suffix < maxSuffix &&
        oldDoc.charCodeAt(oldDoc.length - 1 - suffix) === newDoc.charCodeAt(newDoc.length - 1 - suffix)
    ) {
        suffix++;
    }

    return {
        from: prefix,
        to: oldDoc.length - suffix,
        insert: newDoc.slice(prefix, newDoc.length - suffix),
    };
}

/** The subset of the timer API `EditQueue` needs, injectable so tests can
 * drive the debounce with a fake clock instead of real waits. */
export interface DebounceClock {
    setTimeout: (handler: () => void, timeoutMs: number) => ReturnType<typeof setTimeout>;
    clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
}

const realClock: DebounceClock = {
    setTimeout: (handler, timeoutMs) => setTimeout(handler, timeoutMs),
    clearTimeout: (id) => clearTimeout(id),
};

export interface EditQueue {
    /** Debounce-schedule `content` for sending. */
    schedule(content: string): void;
    /** Send the pending edit now, if any, bypassing the debounce. */
    flush(): void;
    /** Drop any pending edit without sending it. */
    cancel(): void;
}

interface EditQueueOptions {
    debounceMs: number;
    clock: DebounceClock;
    send: (content: string) => void;
}

export interface DebouncedTask {
    /** Schedule `run` to fire once the delay elapses with no further calls. */
    schedule(): void;
    cancel(): void;
}

/**
 * Trailing debounce for a task with no payload.
 *
 * Deliberately NOT `createEditQueue` with a constant argument: that queue
 * suppresses a send whose content equals the last one sent, which is right for
 * outgoing edits and silently wrong here — a caller passing the same value
 * every time would fire exactly once and never again. This has no dedupe,
 * because whether the work is needed depends on state the queue cannot see
 * (the document AND the git HEAD text it is compared against).
 */
export function createDebouncedTask({ delayMs, clock, run }: { delayMs: number; clock: DebounceClock; run: () => void }): DebouncedTask {
    let timer: ReturnType<typeof setTimeout> | null = null;

    function cancel(): void {
        if (timer !== null) {
            clock.clearTimeout(timer);
            timer = null;
        }
    }

    return {
        schedule(): void {
            cancel();
            timer = clock.setTimeout(() => {
                timer = null;
                run();
            }, delayMs);
        },
        cancel,
    };
}

/** Trailing-debounce queue for outgoing `edit` sends. Kept separate from
 * `EditorView` wiring so it is unit-testable with a fake clock. */
export function createEditQueue({ debounceMs, clock, send }: EditQueueOptions): EditQueue {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: string | null = null;
    let lastSent: string | null = null;

    function clearTimer(): void {
        if (timer !== null) {
            clock.clearTimeout(timer);
            timer = null;
        }
    }

    function flush(): void {
        clearTimer();
        const content = pending;
        pending = null;
        if (content === null || content === lastSent) {
            return;
        }
        lastSent = content;
        send(content);
    }

    function schedule(content: string): void {
        pending = content;
        clearTimer();
        timer = clock.setTimeout(flush, debounceMs);
    }

    function cancel(): void {
        clearTimer();
        pending = null;
    }

    return { schedule, flush, cancel };
}

export interface HostSyncOptions {
    view: EditorView;
    postToHost: (message: WebviewToHostMessage) => void;
    debounceMs?: number;
    /** Injectable timer, for tests. Defaults to real `setTimeout`. */
    clock?: DebounceClock;
}

export interface HostSync {
    /** Apply externally-changed content (a host `update` message) to the view. */
    applyExternalUpdate(content: string): void;
    /**
     * Send any debounced edit now. `destroy` *drops* the pending edit rather
     * than sending it, so a caller tearing a sync down over a still-live
     * document must flush first — same loss TRIAGE #8 covered for disposal,
     * reached instead by handing the document from one view to another.
     */
    flush(): void;
    destroy(): void;
}

export function createHostSync({ view, postToHost, debounceMs = DEFAULT_DEBOUNCE_MS, clock = realClock }: HostSyncOptions): HostSync {
    const editQueue = createEditQueue({
        debounceMs,
        clock,
        send: (content) => postToHost({ type: 'edit', content }),
    });

    // Installed via `appendConfig` rather than passed into `createEditorView`
    // (src/webview/cm/editorView.ts) -- that file is owned by another
    // package this wave, so the sync module attaches to the already-built
    // view instead of requiring a constructor hook.
    view.dispatch({
        effects: StateEffect.appendConfig.of(
            EditorView.updateListener.of((update) => {
                if (!update.docChanged || isHostEcho(update.transactions)) {
                    return;
                }
                editQueue.schedule(update.state.doc.toString());
            }),
        ),
    });

    // TRIAGE #8: edits inside the debounce window were lost if the webview
    // was disposed before the timer fired. Flush synchronously on blur and
    // on the tab/panel going hidden.
    const flushPending = (): void => editQueue.flush();
    window.addEventListener('blur', flushPending);
    const onVisibilityChange = (): void => {
        if (document.hidden) {
            flushPending();
        }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    function applyExternalUpdate(content: string): void {
        const changes = computeExternalUpdateChanges(view.state.doc.toString(), content);
        if (!changes) {
            return;
        }
        view.dispatch({ changes, annotations: hostEchoAnnotation.of(true) });
    }

    function destroy(): void {
        editQueue.cancel();
        window.removeEventListener('blur', flushPending);
        document.removeEventListener('visibilitychange', onVisibilityChange);
    }

    return { applyExternalUpdate, flush: flushPending, destroy };
}
