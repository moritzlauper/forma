#!/usr/bin/env node
import { chmod, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!['darwin', 'linux'].includes(process.platform)) throw Error('The companion installer currently supports macOS and Linux.');
if (Number(process.versions.node.split('.')[0]) < 22) throw Error('Node.js 22 or newer is required.');
const ids = [...new Set(['iocnmncpcjmemcbbiokjddplbpgdajfg', ...process.argv.slice(2)])];
if (ids.some(id => !/^[a-p]{32}$/.test(id))) throw Error('Pass only Chrome extension IDs (32 letters a–p).');
const source = dirname(fileURLToPath(import.meta.url));
const root = join(homedir(), '.forma'), app = join(root, 'app'), bin = join(root, 'bin');
for (const dir of [root, app, bin]) await mkdir(dir, { recursive: true, mode: 0o700 });
for (const file of ['core.mjs', 'providers.mjs', 'state.mjs', 'native-host.mjs', 'cli.mjs']) await copyFile(join(source, file), join(app, file));
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
for (const [name, entry] of [['native-host', 'native-host.mjs'], ['forma', 'cli.mjs']]) {
  const path = join(bin, name);
  await writeFile(path, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(app, entry))} "$@"\n`, { mode: 0o700 });
  await chmod(path, 0o700);
}
const configDirs = process.platform === 'darwin' ? [join(homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts')] : [join(homedir(), '.config/google-chrome/NativeMessagingHosts'), join(homedir(), '.config/chromium/NativeMessagingHosts')];
for (const dir of configDirs) {
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'ch.angebunden.forma.json');
  const previous = await readFile(file, 'utf8').then(JSON.parse).catch(() => ({}));
  const allowed_origins = [...new Set([...(previous.allowed_origins || []), ...ids.map(id => `chrome-extension://${id}/`)])].filter(origin => /^chrome-extension:\/\/[a-p]{32}\/$/.test(origin));
  await writeFile(file, JSON.stringify({ name: 'ch.angebunden.forma', description: 'FORMA local fit assistant', path: join(bin, 'native-host'), type: 'stdio', allowed_origins }, null, 2), { mode: 0o600 });
}
const skill = (await readFile(join(source, 'SKILL.md'), 'utf8')).replaceAll('FORMA_COMMAND', quote(join(bin, 'forma')));
for (const dir of [join(homedir(), '.agents/skills/forma'), join(homedir(), '.claude/skills/forma')]) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), skill);
}
console.log('FORMA companion and assistant skills installed. In FORMA Settings choose Connect my fit profile.');
console.log(`Command: ${join(bin, 'forma')}`);
console.log('Codex/Claude Code may need a new conversation to discover the skill.');
