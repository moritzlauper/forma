import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeRequest } from '../src/native';

test('native reader forwards only its message and handles success, errors and cancellation', async () => {
  const original = globalThis.chrome;
  let message: any, reply: any, disconnected: any, closed = 0;
  globalThis.chrome = { runtime: { connectNative: (name: string) => {
    assert.equal(name, 'ch.angebunden.forma');
    return { postMessage: (value: unknown) => { message = value; }, disconnect: () => { closed++; }, onMessage: { addListener: (fn: any) => { reply = fn; } }, onDisconnect: { addListener: (fn: any) => { disconnected = fn; } } };
  } } } as any;
  try {
    const success = nativeRequest({ type: 'status' });
    assert.deepEqual(message, { type: 'status' });
    reply({ ok: true, result: { codex: true } });
    assert.deepEqual(await success, { codex: true });
    const failure = nativeRequest({ type: 'read' });
    reply({ ok: false, error: 'Sign in first' });
    await assert.rejects(failure, /Sign in first/);
    const controller = new AbortController();
    const pending = nativeRequest({ type: 'read' }, controller.signal);
    controller.abort();
    await assert.rejects(pending, /Cancelled/);
    const gone = nativeRequest({ type: 'status' });
    disconnected();
    await assert.rejects(gone, /disconnected/);
    assert.equal(closed, 4);
  } finally { globalThis.chrome = original; }
});
