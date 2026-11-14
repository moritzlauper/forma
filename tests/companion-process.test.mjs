import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, stat, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProvider } from '../companion/providers.mjs';

test('native framing accepts split messages; sync persists only context and forget deletes it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forma-test-'));
  async function request(message) {
    const child = spawn(process.execPath, ['companion-dist/native-host.mjs'], { env: { ...process.env, FORMA_DATA_DIR: dir }, stdio: ['pipe', 'pipe', 'pipe'] });
    const packet = Buffer.from(JSON.stringify(message)), header = Buffer.alloc(4); header.writeUInt32LE(packet.length);
    const response = new Promise((resolve, reject) => {
      let data = Buffer.alloc(0);
      child.on('error', reject);
      child.stdout.on('data', part => { data = Buffer.concat([data, part]); if (data.length >= 4 && data.length >= data.readUInt32LE(0) + 4) { resolve(JSON.parse(data.subarray(4).toString())); child.stdin.end(); } });
    });
    child.stdin.write(header.subarray(0, 2)); child.stdin.write(Buffer.concat([header.subarray(2), packet]));
    return response;
  }
  try {
    const context = { person: { height: 180, name: 'Secret name', notes: '', body: {}, usual: {}, fit: 'regular' }, goodFits: [], feedback: [], library: [], apiKey: 'DO_NOT_EXPORT' };
    assert.equal((await request({ type: 'sync', context })).ok, true);
    const saved = await readFile(join(dir, 'context.json'), 'utf8');
    assert.doesNotMatch(saved, /DO_NOT_EXPORT|Secret name/);
    assert.equal((await stat(join(dir, 'context.json'))).mode & 0o777, 0o600);
    assert.equal((await request({ type: 'execute', command: 'anything' })).ok, false);
    assert.equal((await request({ type: 'forget' })).ok, true);
    await assert.rejects(readFile(join(dir, 'context.json')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('provider subprocess uses stdin, parses structured responses and cancels', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forma-fake-'));
  const fake = join(dir, 'cli');
  const prior = process.env.FORMA_CLAUDE_BIN;
  try {
    await writeFile(fake, '#!/usr/bin/env node\nprocess.stdin.resume(); process.stdin.on("end",()=>console.log(JSON.stringify({subtype:"success",structured_output:{valid:true}})));', { mode: 0o700 });
    process.env.FORMA_CLAUDE_BIN = fake;
    assert.deepEqual(await runProvider('claude', { listing: 'untrusted $(touch bad)' }, 'Read only', {}), { valid: true });
    const controller = new AbortController(); controller.abort();
    await assert.rejects(runProvider('claude', {}, '', {}, controller.signal), /Cancelled/);
    await assert.rejects(runProvider('invalid', {}, '', {}), /Choose/);
  } finally { if (prior === undefined) delete process.env.FORMA_CLAUDE_BIN; else process.env.FORMA_CLAUDE_BIN = prior; await rm(dir, { recursive: true, force: true }); }
});
