import * as assert from 'assert';
import { EditorState } from '@codemirror/state';
import {
    hostEchoAnnotation,
    isHostEcho,
    computeExternalUpdateChanges,
    createEditQueue,
    createDebouncedTask,
    type DebounceClock,
} from '../../webview/cm/sync/hostSync';

/**
 * Unit tests for hostSync's pure/DOM-free pieces: annotation-based echo
 * discrimination and change computation are driven against a real
 * `EditorState`/`Transaction` (no `EditorView`, no DOM); the debounce queue
 * is driven with a fake clock instead of real timers.
 */
describe('hostSync', () => {
    describe('isHostEcho', () => {
        it('is false for a transaction without the host-echo annotation', () => {
            const state = EditorState.create({ doc: 'hello' });
            const tr = state.update({ changes: { from: 5, insert: '!' } });
            assert.strictEqual(isHostEcho([tr]), false);
        });

        it('is true for a transaction annotated as a host echo', () => {
            const state = EditorState.create({ doc: 'hello' });
            const tr = state.update({
                changes: { from: 0, to: 5, insert: 'world' },
                annotations: hostEchoAnnotation.of(true),
            });
            assert.strictEqual(isHostEcho([tr]), true);
        });

        it('is true if any transaction in the batch carries the annotation', () => {
            const state = EditorState.create({ doc: 'hello' });
            const userTr = state.update({ changes: { from: 5, insert: '?' } });
            const echoTr = state.update({
                changes: { from: 0, to: 5, insert: 'bye' },
                annotations: hostEchoAnnotation.of(true),
            });
            assert.strictEqual(isHostEcho([userTr, echoTr]), true);
        });

        it('is false for an empty transaction list', () => {
            assert.strictEqual(isHostEcho([]), false);
        });
    });

    describe('computeExternalUpdateChanges', () => {
        function applyTo(oldDoc: string, newDoc: string): string {
            const changes = computeExternalUpdateChanges(oldDoc, newDoc);
            if (!changes) {
                return oldDoc;
            }
            const state = EditorState.create({ doc: oldDoc });
            const tr = state.update({ changes });
            return tr.state.doc.toString();
        }

        it('returns null when the documents are already equal', () => {
            assert.strictEqual(computeExternalUpdateChanges('same', 'same'), null);
        });

        it('produces changes that turn oldDoc into newDoc: append at the end', () => {
            assert.strictEqual(applyTo('# Title\n\nBody', '# Title\n\nBody\n\nMore'), '# Title\n\nBody\n\nMore');
        });

        it('produces changes that turn oldDoc into newDoc: prepend at the start', () => {
            assert.strictEqual(applyTo('Body text', 'Intro\n\nBody text'), 'Intro\n\nBody text');
        });

        it('produces changes that turn oldDoc into newDoc: edit in the middle', () => {
            assert.strictEqual(applyTo('one two three', 'one TWO three'), 'one TWO three');
        });

        it('produces changes that turn oldDoc into newDoc: delete a chunk', () => {
            assert.strictEqual(applyTo('keep [drop this] keep', 'keep  keep'), 'keep  keep');
        });

        it('produces changes that turn oldDoc into newDoc: whole-document replace when nothing is shared', () => {
            assert.strictEqual(applyTo('abc', 'xyz'), 'xyz');
        });

        it('handles repetitive content where prefix and suffix scans could overlap', () => {
            assert.strictEqual(applyTo('aaa', 'aaaa'), 'aaaa');
            assert.strictEqual(applyTo('aaaa', 'aaa'), 'aaa');
            assert.strictEqual(applyTo('', 'abc'), 'abc');
            assert.strictEqual(applyTo('abc', ''), '');
        });

        it('stays fast on a wholesale replacement of a large document', () => {
            // Regression guard: the original diffChars implementation took
            // 3.3s for 100 lines, 13s for 200, and over two minutes for 500 --
            // a webview freeze on a branch switch or formatter run.
            const line = 'Some **bold** text with a [link](https://example.com) and `code`.\n';
            const oldDoc = line.repeat(2000);
            const newDoc = oldDoc.toUpperCase();

            const started = Date.now();
            const changes = computeExternalUpdateChanges(oldDoc, newDoc);
            const elapsed = Date.now() - started;

            assert.ok(changes, 'a wholesale replacement must still produce a change');
            assert.ok(elapsed < 1000, `took ${elapsed}ms; external updates must not block the webview`);
            assert.strictEqual(applyTo(oldDoc, newDoc), newDoc);
        });

        it('does not touch text outside the changed hunk (minimal-diff property)', () => {
            const oldDoc = 'alpha\nbeta\ngamma';
            const newDoc = 'alpha\nBETA\ngamma';
            const changes = computeExternalUpdateChanges(oldDoc, newDoc);
            assert.ok(changes);
            const state = EditorState.create({ doc: oldDoc });
            const tr = state.update({ changes: changes! });
            // A position inside the untouched "gamma" line should map to
            // itself (offset by the length delta), i.e. the change doesn't
            // span the whole document.
            const gammaPos = oldDoc.indexOf('gamma');
            const mapped = tr.changes.mapPos(gammaPos);
            assert.strictEqual(tr.state.doc.toString().slice(mapped, mapped + 5), 'gamma');
        });
    });

    describe('createEditQueue (fake clock)', () => {
        function createFakeClock(): { clock: DebounceClock; fire(): void; pendingCount(): number } {
            let nextId = 1;
            const pending = new Map<number, () => void>();
            return {
                clock: {
                    setTimeout: (handler) => {
                        const id = nextId++;
                        pending.set(id, handler);
                        return id as unknown as ReturnType<typeof setTimeout>;
                    },
                    clearTimeout: (id) => {
                        pending.delete(id as unknown as number);
                    },
                },
                fire(): void {
                    const ids = [...pending.keys()];
                    const id = ids[ids.length - 1];
                    const handler = pending.get(id);
                    pending.delete(id);
                    handler?.();
                },
                pendingCount: () => pending.size,
            };
        }

        it('sends the scheduled content once the debounce fires', () => {
            const sent: string[] = [];
            const { clock, fire } = createFakeClock();
            const queue = createEditQueue({ debounceMs: 300, clock, send: (c) => sent.push(c) });

            queue.schedule('hello');
            assert.deepStrictEqual(sent, []);
            fire();
            assert.deepStrictEqual(sent, ['hello']);
        });

        it('resets the timer on rapid re-scheduling (trailing debounce)', () => {
            const sent: string[] = [];
            const { clock, fire, pendingCount } = createFakeClock();
            const queue = createEditQueue({ debounceMs: 300, clock, send: (c) => sent.push(c) });

            queue.schedule('h');
            queue.schedule('he');
            queue.schedule('hel');
            assert.strictEqual(pendingCount(), 1);
            fire();
            assert.deepStrictEqual(sent, ['hel']);
        });

        it('flush sends immediately and cancels the pending timer', () => {
            const sent: string[] = [];
            const { clock, pendingCount } = createFakeClock();
            const queue = createEditQueue({ debounceMs: 300, clock, send: (c) => sent.push(c) });

            queue.schedule('final content');
            queue.flush();
            assert.deepStrictEqual(sent, ['final content']);
            assert.strictEqual(pendingCount(), 0);
        });

        it('flush is a no-op when nothing is pending', () => {
            const sent: string[] = [];
            const { clock } = createFakeClock();
            const queue = createEditQueue({ debounceMs: 300, clock, send: (c) => sent.push(c) });

            queue.flush();
            assert.deepStrictEqual(sent, []);
        });

        it('does not resend unchanged content', () => {
            const sent: string[] = [];
            const { clock, fire } = createFakeClock();
            const queue = createEditQueue({ debounceMs: 300, clock, send: (c) => sent.push(c) });

            queue.schedule('same');
            fire();
            queue.schedule('same');
            fire();
            assert.deepStrictEqual(sent, ['same']);
        });

        it('cancel drops pending content without sending', () => {
            const sent: string[] = [];
            const { clock, pendingCount } = createFakeClock();
            const queue = createEditQueue({ debounceMs: 300, clock, send: (c) => sent.push(c) });

            queue.schedule('typed');
            queue.cancel();
            assert.strictEqual(pendingCount(), 0);
            assert.deepStrictEqual(sent, []);
        });
    });

    describe('createDebouncedTask (fake clock)', () => {
        function fakeClock(): { clock: DebounceClock; fire(): void } {
            let nextId = 1;
            const pending = new Map<number, () => void>();
            return {
                clock: {
                    setTimeout: (handler) => {
                        const id = nextId++;
                        pending.set(id, handler);
                        return id as unknown as ReturnType<typeof setTimeout>;
                    },
                    clearTimeout: (id) => { pending.delete(id as unknown as number); },
                },
                fire(): void {
                    const ids = [...pending.keys()];
                    const id = ids[ids.length - 1];
                    const handler = pending.get(id);
                    pending.delete(id);
                    handler?.();
                },
            };
        }

        it('runs again on every later schedule, not just the first', () => {
            // The change gutter uses this. Reusing `createEditQueue` with a
            // constant argument made it fire exactly once and never again,
            // because that queue suppresses a repeat of the last content.
            let runs = 0;
            const { clock, fire } = fakeClock();
            const task = createDebouncedTask({ delayMs: 300, clock, run: () => { runs++; } });

            task.schedule();
            fire();
            task.schedule();
            fire();
            task.schedule();
            fire();

            assert.strictEqual(runs, 3);
        });

        it('collapses rapid schedules into a single run', () => {
            let runs = 0;
            const { clock, fire } = fakeClock();
            const task = createDebouncedTask({ delayMs: 300, clock, run: () => { runs++; } });

            task.schedule();
            task.schedule();
            task.schedule();
            fire();

            assert.strictEqual(runs, 1);
        });

        it('cancel drops a pending run', () => {
            let runs = 0;
            const { clock, fire } = fakeClock();
            const task = createDebouncedTask({ delayMs: 300, clock, run: () => { runs++; } });

            task.schedule();
            task.cancel();
            fire();

            assert.strictEqual(runs, 0);
        });
    });
});
