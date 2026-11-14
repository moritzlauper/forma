import { runProvider, executable } from './providers.mjs';
import { READER_PROMPT, READING_SCHEMA } from './core.mjs';
import { saveContext, forgetContext } from './state.mjs';

const controller = new AbortController();
let buffer = Buffer.alloc(0), handled = false;
function reply(value) {
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
  process.stdout.write(Buffer.concat([header, body]));
}
async function handle(message) {
  switch (message?.type) {
    case 'status': return Object.fromEntries(await Promise.all(['codex', 'claude'].map(async name => [name, !!await executable(name).catch(() => null)])));
    case 'sync': return saveContext(message.context);
    case 'forget': return forgetContext();
    case 'read':
      if (!message.input?.listing || !message.input?.person) throw Error('Missing product or profile.');
      return runProvider(message.provider, message.input, READER_PROMPT, READING_SCHEMA, controller.signal);
    default: throw Error('Unknown companion operation.');
  }
}
process.stdin.on('data', chunk => {
  if (handled) return;
  buffer = Buffer.concat([buffer, chunk]);
  if (buffer.length < 4) return;
  const size = buffer.readUInt32LE(0);
  if (size > 900_000) { handled = true; reply({ ok: false, error: 'Message too large.' }); return; }
  if (buffer.length < size + 4) return;
  handled = true;
  Promise.resolve().then(() => handle(JSON.parse(buffer.subarray(4, size + 4).toString()))).then(result => reply({ ok: true, result })).catch(e => reply({ ok: false, error: e.message }));
});
process.stdin.on('end', () => controller.abort());
process.on('SIGTERM', () => { controller.abort(); process.exitCode = 1; });
