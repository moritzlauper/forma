import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
export const stateDir = process.env.FORMA_DATA_DIR || join(homedir(), '.forma');
export async function saveContext(raw) {
  if (!raw?.person || !Array.isArray(raw.goodFits) || !Array.isArray(raw.feedback) || !Array.isArray(raw.library)) throw Error('Invalid fit profile.');
  // Explicit allowlist, never persist extension settings, names or API keys.
  const { height, weight, build, usual, fit, style, notes, body } = raw.person;
  const snapshot = { at: new Date().toISOString(), person: { height, weight, build, usual, fit, style, notes, body }, goodFits: raw.goodFits, feedback: raw.feedback, library: raw.library };
  const data = JSON.stringify(snapshot);
  if (Buffer.byteLength(data) > 800_000) throw Error('Fit profile is too large.');
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await chmod(stateDir, 0o700);
  const temp = join(stateDir, `context-${randomUUID()}.tmp`);
  await writeFile(temp, data, { mode: 0o600 });
  await rename(temp, join(stateDir, 'context.json'));
  return { syncedAt: snapshot.at };
}
export async function loadContext() {
  try { return JSON.parse(await readFile(join(stateDir, 'context.json'), 'utf8')); }
  catch { throw Error('No synced profile. In FORMA Settings, choose Connect my fit profile.'); }
}
export async function forgetContext() { await rm(join(stateDir, 'context.json'), { force: true }); return { deleted: true }; }
