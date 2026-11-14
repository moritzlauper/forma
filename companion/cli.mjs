#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { assess, listingFrom, prepare, READING_SCHEMA } from './core.mjs';
import { loadContext, forgetContext } from './state.mjs';
import { executable, runProvider } from './providers.mjs';
const [command, file, ...options] = process.argv.slice(2);
try {
  let result;
  if (command === 'status') result = { profile: await loadContext().then(c => ({ syncedAt: c.at })).catch(() => null), codex: !!await executable('codex').catch(() => null), claude: !!await executable('claude').catch(() => null) };
  else if (command === 'context') result = await loadContext();
  else if (command === 'forget') result = await forgetContext();
  else if (command === 'schema') result = READING_SCHEMA;
  else if (command === 'prepare' || command === 'assess') {
    if (!file) throw Error('Pass a JSON file containing { listing, reading? }.');
    const data = JSON.parse(await readFile(file, 'utf8'));
    const listing = listingFrom(data.listing || data), context = await loadContext();
    const request = prepare(context, listing);
    if (command === 'prepare') result = request;
    else {
      const at = options.indexOf('--provider'), provider = at < 0 ? undefined : options[at + 1];
      if (at >= 0 && !['codex', 'claude'].includes(provider)) throw Error('Use --provider codex or --provider claude.');
      const raw = provider ? await runProvider(provider, request.input, request.prompt, request.schema) : data.reading;
      result = { ...assess(context, listing, raw), profileSyncedAt: context.at, source: provider || (raw ? 'assistant' : 'published measurements') };
    }
  } else result = { usage: ['forma status', 'forma context', 'forma prepare product.json', 'forma assess product.json [--provider codex|claude]', 'forma forget'], notes: 'Without --provider, assess uses a supplied reading or only published measurements. No AI request is made. prepare returns the prompt, schema and personal context for the current assistant.' };
  console.log(JSON.stringify(result, null, 2));
} catch (e) { console.error(e.message); process.exitCode = 1; }
