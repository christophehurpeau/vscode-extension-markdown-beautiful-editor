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
 * `applyExternalUpdate` dispatches the incoming content as line-level hunks
 * rather than a whole-document replace, so the user's selection and scroll
 * position survive an external edit. See `computeExternalUpdateChanges`.
 *
 * TODO: the outgoing `edit` message still carries the full document string
 * (`WebviewToHostMessage` only has `content: string`), and the host
 * (`src/editor/customEditorProvider.ts`) still applies it as a whole-document
 * `WorkspaceEdit`. Converting the webview's own `ChangeSet` into precise
 * `WorkspaceEdit` ranges is a deliberate follow-up -- it touches the host and
 * `src/shared/messages.ts`, both out of scope here.
 */
import { diff } from '@codemirror/merge';
import { Annotation, StateEffect, type Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { WebviewToHostMessage } from '../../../shared/messages';

const DEFAULT_DEBOUNCE_MS = 300;

/** Marks a transaction as applying a host-originated `update` rather than a
 * user edit, so the `edit`-sending listener can recognize its own echo. */
export const hostEchoAnnotation = Annotation.define<boolean>();

export function isHostEcho(transactions: readonly Transaction[]): boolean {
    return transactions.some((tr) => tr.annotation(hostEchoAnnotation) === true);
}

export interface ExternalUpdateChange {
    from: number;
    to: number;
    insert: string;
}

const LINE_DIFF_TIMEOUT_MS = 50;
// Line ids are encoded as UTF-16 code units, kept below the surrogate range so
// `diff` never sees a pair. Past this many distinct lines two lines would share
// a code unit and the diff would silently corrupt the document.
const MAX_ENCODABLE_LINES = 0xd800;

function splitLinesKeepingBreaks(text: string): string[] {
    const lines: string[] = [];
    let start = 0;
    while (start < text.length) {
        const newline = text.indexOf('\n', start);
        const end = newline === -1 ? text.length : newline + 1;
        lines.push(text.slice(start, end));
        start = end;
    }
    return lines;
}

function lineOffsets(lines: readonly string[]): number[] {
    const offsets = [0];
    for (const line of lines) {
        offsets.push(offsets[offsets.length - 1] + line.length);
    }
    return offsets;
}

function encodeLines({
    oldLines,
    newLines,
}: {
    oldLines: readonly string[];
    newLines: readonly string[];
}): [string, string] | null {
    const ids = new Map<string, string>();
    const encode = (lines: readonly string[]): string | null => {
        let encoded = '';
        for (const line of lines) {
            let id = ids.get(line);
            if (id === undefined) {
                if (ids.size >= MAX_ENCODABLE_LINES) {
                    return null;
                }
                id = String.fromCharCode(ids.size);
                ids.set(line, id);
            }
            encoded += id;
        }
        return encoded;
    };
    const oldEncoded = encode(oldLines);
    const newEncoded = oldEncoded === null ? null : encode(newLines);
    return oldEncoded === null || newEncoded === null ? null : [oldEncoded, newEncoded];
}

/**
 * Line-level hunks turning `oldDoc` into `newDoc`, in `oldDoc` coordinates.
 * `null` when the documents are already equal.
 *
 * Unchanged lines must stay outside every hunk: CodeMirror keeps the viewport
 * still by mapping its scroll anchor (the top visible line) through the
 * change, and an anchor inside a replaced range lands at the range start. A
 * single prefix/suffix hunk spans from the first difference to the last, so an
 * agent touching a line near the top and one near the bottom scrolled the
 * reader to the top.
 *
 * The common prefix and suffix are trimmed first in O(N), so a single
 * localized edit stays one character-tight hunk without diffing. The rest is
 * diffed per line -- each distinct line encoded as one character for
 * `@codemirror/merge`'s `diff` -- under a timeout: Myers is O(N*D), and a
 * character-level diff of a wholesale replacement froze the webview for
 * minutes. On timeout `diff` returns coarser hunks, never wrong ones.
 */
export function computeExternalUpdateChanges(oldDoc: string, newDoc: string): ExternalUpdateChange[] | null {
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

    const oldMiddle = oldDoc.slice(prefix, oldDoc.length - suffix);
    const newMiddle = newDoc.slice(prefix, newDoc.length - suffix);
    const singleHunk = [{ from: prefix, to: oldDoc.length - suffix, insert: newMiddle }];

    const oldLines = splitLinesKeepingBreaks(oldMiddle);
    const newLines = splitLinesKeepingBreaks(newMiddle);
    if (oldLines.length <= 1 || newLines.length <= 1) {
        return singleHunk;
    }
    const encoded = encodeLines({ oldLines, newLines });
    if (!encoded) {
        return singleHunk;
    }

    const oldOffsets = lineOffsets(oldLines);
    const newOffsets = lineOffsets(newLines);
    return diff(encoded[0], encoded[1], { timeout: LINE_DIFF_TIMEOUT_MS }).map((change) => ({
        from: prefix + oldOffsets[change.fromA],
        to: prefix + oldOffsets[change.toA],
        insert: newMiddle.slice(newOffsets[change.fromB], newOffsets[change.toB]),
    }));
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
export function createDebouncedTask({
    delayMs,
    clock,
    run,
}: {
    delayMs: number;
    clock: DebounceClock;
    run: () => void;
}): DebouncedTask {
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

export function createHostSync({
    view,
    postToHost,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    clock = realClock,
}: HostSyncOptions): HostSync {
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
            })
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
        // The doc holds `\n` only; a CRLF file diffed raw differs on every line.
        const normalizedContent = view.state.toText(content).toString();
        const changes = computeExternalUpdateChanges(view.state.doc.toString(), normalizedContent);
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
