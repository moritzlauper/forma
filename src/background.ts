import { installReaderStartup } from './reader-startup';
import { createRequestBudget } from './request-budget';
import { productIdentity, sha256 } from './core/identity';
import { KINDS } from './core/types';
import type { Listing, PageState, Profile, Reading, LibraryEntry } from './core/types';
import { decide } from './assess/decide';
import { localSizes } from './assess/charts';
import { buildReferences, hasPersonalBasis, normaliseFeedback, normaliseGoodFits, normaliseLibrary, saveToLibrary, toPerson } from './assess/person';
import { providerOf } from './core/settings';
import { localReading, mergeLocal, READER_VERSION, ReaderError, readerInput, readWithAnthropic, readWithOllama, validateReading } from './assess/reader';

const ANTHROPIC_ORIGIN = 'https://api.anthropic.com/*';
const OLLAMA_ORIGIN = 'http://localhost:11434/*';
const CACHE_SIZE = 40;

let enabled = true;
const isEnabled = async () => enabled && (await chrome.storage.local.get('formaEnabled')).formaEnabled !== false;
const startActiveReaders = installReaderStartup(chrome, isEnabled);
const reserveRequest = createRequestBudget(chrome.storage.local);

chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ---------------------------------------------------------------- Listing guard

const s = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : '';
/** The content script runs on arbitrary pages; bound everything it sends. */
function sanitize(raw: any, senderUrl: string): Listing | null {
  if (!raw || typeof raw !== 'object') return null;
  // Chrome keeps the sender URL of the original document after client-side
  // navigation (history.pushState). The reader's own URL is current; accept it
  // when it belongs to the same site.
  let url = senderUrl;
  try { if (typeof raw.url === 'string' && new URL(raw.url).origin === new URL(senderUrl).origin) url = raw.url; } catch { /* keep sender URL */ }
  const strings = (v: unknown, n: number, max: number) => Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, n).map(x => x.slice(0, max)) : [];
  return {
    url, site: s(raw.site, 100), marketplace: raw.marketplace === true, title: s(raw.title, 200), brand: s(raw.brand, 80),
    breadcrumbs: strings(raw.breadcrumbs, 8, 60),
    attributes: (Array.isArray(raw.attributes) ? raw.attributes : []).filter((a: any) => typeof a?.name === 'string' && typeof a?.value === 'string').slice(0, 30).map((a: any) => ({ name: a.name.slice(0, 40), value: a.value.slice(0, 120) })),
    sizes: (Array.isArray(raw.sizes) ? raw.sizes : []).filter((x: any) => typeof x?.label === 'string').slice(0, 40).map((x: any) => ({ label: x.label.slice(0, 20), available: typeof x.available === 'boolean' ? x.available : null, selected: x.selected === true })),
    description: s(raw.description, 3000), facts: strings(raw.facts, 30, 300),
    tables: (Array.isArray(raw.tables) ? raw.tables : []).slice(0, 6).map((t: any) => ({ caption: s(t?.caption, 400), rows: (Array.isArray(t?.rows) ? t.rows : []).slice(0, 40).map((r: unknown) => strings(r, 14, 40)) })),
    images: strings(raw.images, 4, 600).filter(u => { try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !/^(localhost|127\.|10\.|192\.168\.)/.test(x.hostname); } catch { return false; } }),
    kind: KINDS.includes(raw.kind) ? raw.kind : null, product: raw.product === true, signals: strings(raw.signals, 10, 40),
  };
}

// ---------------------------------------------------------------- State

const generations = new Map<number, number>();
const flights = new Map<string, Promise<Reading>>();
const controllers = new Set<AbortController>();
let keepAlive: ReturnType<typeof setInterval> | undefined;

/** Long AI answers must not lose the worker. A trivial API call every 20 s keeps it alive. */
function track(controller: AbortController) {
  controllers.add(controller);
  keepAlive ??= setInterval(() => { void chrome.runtime.getPlatformInfo(); }, 20_000);
}
function untrack(controller: AbortController) {
  controllers.delete(controller);
  if (!controllers.size && keepAlive) { clearInterval(keepAlive); keepAlive = undefined; }
}

const slim = (state: PageState): PageState => ({ ...state, listing: undefined, reading: state.reading ? { ...state.reading, sizes: [] } : undefined });

async function publish(tab: number, state: PageState) {
  await chrome.storage.session.set({ ['page:' + tab]: state });
  chrome.tabs.sendMessage(tab, { type: 'forma-state', state: slim(state) }, { frameId: 0 }).catch(() => {});
}

async function personal() {
  const data = await chrome.storage.local.get(['profile', 'description', 'feedback', 'goodFits', 'formaLibrary', 'scanLibrary']);
  return {
    person: toPerson(data.profile as Profile | undefined, typeof data.description === 'string' ? data.description : ''),
    goodFits: normaliseGoodFits(data.goodFits),
    feedback: normaliseFeedback(data.feedback),
    library: normaliseLibrary(data.formaLibrary, data.scanLibrary),
  };
}

async function remember(listing: Listing, reading: Reading) {
  const { formaLibrary, scanLibrary } = await chrome.storage.local.get(['formaLibrary', 'scanLibrary']);
  const entry: LibraryEntry = { url: productIdentity(listing.url), name: listing.title, kind: reading.garment.kind, at: Date.now(), image: listing.images[0], sizes: reading.sizes.filter(x => x.measures.length).map(x => ({ label: x.label, measures: x.measures })) };
  if (entry.sizes.length) await chrome.storage.local.set({ formaLibrary: saveToLibrary(normaliseLibrary(formaLibrary, scanLibrary), entry) });
}

type Options = { manual: boolean; fresh: boolean };

async function assess(tab: number, listing: Listing, { manual, fresh }: Options) {
  const generation = (generations.get(tab) || 0) + 1;
  generations.set(tab, generation);
  const current = () => generations.get(tab) === generation;
  const base = { url: listing.url, identity: productIdentity(listing.url), title: listing.title, manual, listing, at: Date.now() };
  const done = async (state: Omit<PageState, 'url' | 'identity' | 'title' | 'at'>) => { if (current()) await publish(tab, { ...base, ...state, at: Date.now() }); };

  if (!await isEnabled()) return done({ status: 'blocked', code: 'paused', message: 'FORMA is off. Turn it on to assess this page.' });
  if (!manual && (!listing.product || !listing.kind)) return done({ status: 'other', message: listing.product ? 'This product does not look like clothing. Use “Analyse this page” to assess it anyway.' : 'No single clothing product on this page.' });
  await done({ status: 'assessing' });

  const { person, goodFits, feedback, library } = await personal();
  const refs = buildReferences(goodFits, feedback, library, listing.url, listing.kind);
  const { settings, apiKey } = await chrome.storage.local.get(['settings', 'apiKey']);
  const { mode, model } = providerOf(settings);
  const local = localReading(listing);

  let reading: Reading;
  let cached = false;
  if (mode === 'none') reading = local;
  else {
    const key = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (!hasPersonalBasis(person, refs)) return done({ status: 'blocked', code: 'profile', message: 'Add your height, usual sizes or a garment that fits you in “Your profile”.' });
    if (mode === 'anthropic' && !key) return done({ status: 'blocked', code: 'key', message: 'Add your Anthropic API key in Settings to start fit assessments.' });
    if (mode === 'ollama' && !model) return done({ status: 'blocked', code: 'key', message: 'Enter the name of your Ollama model in Settings.' });
    if (!await chrome.permissions.contains({ origins: [mode === 'ollama' ? OLLAMA_ORIGIN : ANTHROPIC_ORIGIN] })) return done({ status: 'blocked', code: 'permission', message: 'Allow the AI connection in Settings. No request has been sent.' });

    const images = mode === 'anthropic' ? listing.images.slice(0, 3) : [];
    const input = readerInput(listing, person, refs, images.length);
    const digest = await sha256([READER_VERSION, mode, model, JSON.stringify(input), images.join('|')].join('\n'));
    const cache = ((await chrome.storage.local.get('readingCache')).readingCache || {}) as Record<string, Reading>;
    if (!fresh && cache[digest]) { reading = cache[digest]; cached = true; }
    else {
      let flight = fresh ? undefined : flights.get(digest);
      if (!flight) {
        flight = (async () => {
          const budget = await reserveRequest();
          if (!budget.allowed) throw new ReaderError(await isEnabled() ? `You have used ${budget.used} of ${budget.limit} AI requests. Allow more in Settings.` : 'FORMA is off.');
          const controller = new AbortController(); track(controller);
          try {
            let raw: unknown; let used = images.length;
            if (mode === 'ollama') raw = await readWithOllama(input, model, controller.signal);
            else {
              try { raw = await readWithAnthropic(input, images, model, key, controller.signal); }
              catch (error) {
                if (!(error instanceof ReaderError) || !error.retryWithoutImages) throw error;
                if (!(await reserveRequest()).allowed) throw new ReaderError('The photos could not be loaded and the request limit prevents a retry without them.');
                used = 0;
                raw = await readWithAnthropic(readerInput(listing, person, refs, 0), [], model, key, controller.signal);
              }
            }
            const result: Reading = { ...validateReading(raw, listing), reader: 'ai', imagesUsed: used };
            const latest = ((await chrome.storage.local.get('readingCache')).readingCache || {}) as Record<string, Reading>;
            delete latest[digest]; latest[digest] = result;
            await chrome.storage.local.set({ readingCache: Object.fromEntries(Object.entries(latest).slice(-CACHE_SIZE)) });
            return result;
          } finally { untrack(controller); }
        })();
        flights.set(digest, flight);
        flight.catch(() => {}).finally(() => { if (flights.get(digest) === flight) flights.delete(digest); });
      }
      try { reading = await flight; }
      catch (error) {
        const message = error instanceof Error ? error.message : 'AI assessment failed.';
        const limit = /AI requests/.test(message);
        return done({ status: limit ? 'blocked' : 'error', code: limit ? 'limit' : undefined, message, model });
      }
    }
    reading = mergeLocal(reading, localSizes(listing));
  }
  const decision = decide(listing, reading, person, refs);
  if (!current()) return;
  await remember(listing, reading).catch(() => {});
  await done({ status: 'ready', reading, decision, model: mode === 'none' ? 'local' : model, cached });
}

/** Profile or feedback changed: recompute every open page locally, without a new AI request. */
async function recomputeOpenPages() {
  const { person, goodFits, feedback, library } = await personal();
  const all = await chrome.storage.session.get(null);
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith('page:')) continue;
    const state = value as PageState;
    const tab = Number(key.slice(5));
    if (state.status !== 'ready' || !state.reading || !state.listing) continue;
    const refs = buildReferences(goodFits, feedback, library, state.listing.url, state.listing.kind);
    await publish(tab, { ...state, decision: decide(state.listing, state.reading, person, refs), at: Date.now() });
  }
}

/** Settings, key or permission changed: retry pages that were waiting for exactly that. */
async function retryBlockedPages() {
  const all = await chrome.storage.session.get(null);
  for (const [key, value] of Object.entries(all)) {
    const state = value as PageState;
    if (!key.startsWith('page:') || state.status !== 'blocked' || !state.listing || !['key', 'permission', 'limit', 'profile'].includes(state.code || '')) continue;
    void assess(Number(key.slice(5)), state.listing, { manual: !!state.manual, fresh: false });
  }
}

// ---------------------------------------------------------------- Messages

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'forma-enabled?') { isEnabled().then(value => reply({ enabled: value })); return true; }
  const tab = sender.tab?.id;
  if (msg?.type === 'listing') {
    if (!tab || (sender.frameId ?? 0) !== 0 || !sender.url) return;
    const listing = sanitize(msg.listing, sender.url);
    if (!listing) { reply({ accepted: false }); return; }
    isEnabled().then(on => {
      reply(on ? { accepted: true } : { accepted: false, paused: true });
      if (on) void assess(tab, listing, { manual: msg.manual === true, fresh: msg.fresh === true }).catch(async () => {
        await publish(tab, { url: listing.url, identity: productIdentity(listing.url), title: listing.title, status: 'error', at: Date.now(), listing, message: 'The assessment could not run. Press Refresh to try again.' });
      });
    });
    return true;
  }
  if (msg?.type === 'open-panel') {
    if (!tab || !['details', 'good', 'bad'].includes(msg.kind)) return;
    // Open synchronously while Chrome still associates the message with the click.
    const opened = chrome.sidePanel.open({ tabId: tab });
    const intent = msg.kind === 'details' ? Promise.resolve() : chrome.storage.session.set({ ['fit-editor:' + tab]: { kind: msg.kind, url: sender.url, id: crypto.randomUUID() } });
    Promise.all([opened, intent]).then(() => reply({ ok: true })).catch(() => reply({ ok: false }));
    return true;
  }
});

chrome.tabs.onRemoved.addListener(tab => { generations.delete(tab); void chrome.storage.session.remove(['page:' + tab, 'fit-editor:' + tab]); });

chrome.permissions.onRemoved.addListener(async () => {
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  for (const script of scripts) if (!await chrome.permissions.contains({ origins: script.matches! })) await chrome.scripting.unregisterContentScripts({ ids: [script.id] });
});
chrome.permissions.onAdded.addListener(() => { void retryBlockedPages(); });

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  if (changes.formaEnabled) {
    enabled = changes.formaEnabled.newValue !== false;
    if (!enabled) { for (const c of controllers) c.abort(); flights.clear(); }
    else startActiveReaders();
    for (const t of await chrome.tabs.query({})) if (t.id) chrome.tabs.sendMessage(t.id, { type: 'forma-enabled', enabled }).catch(() => {});
    return;
  }
  if (!await isEnabled()) return;
  if (changes.profile || changes.description || changes.feedback || changes.goodFits) void recomputeOpenPages();
  if (changes.apiKey || changes.settings || changes.profile) void retryBlockedPages();
});
