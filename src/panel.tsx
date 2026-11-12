import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { applyProfileUpdate, profileFeedbackUpdate } from './profile-update';
import { consolidateFitNotes, migrateProfile } from './profile-migration';
import { DEFAULT_REQUEST_LIMIT, requestLimit, additionalRequests, hasNoRequestCap } from './request-budget';
import { createPageConnector, type Connection } from './page-connection';
import { automaticDetectionEnabled, enableAutomaticDetection } from './automatic-detection';
import { FitDetailsForm, type FitDetails } from './fit-details-form';
import { ProfileNotes } from './profile-notes';
import { productIdentity } from './core/identity';
import { providerOf, type Mode } from './core/settings';
import { guessKind, KIND_LABELS } from './core/garment';
import { DEFAULT_MODEL, MODELS } from './assess/reader';
import { DEFAULT_PROFILE, normaliseFeedback, normaliseGoodFits } from './assess/person';
import { ListingInfo, Verdict } from './ui/verdict';
import { ProfileEditor } from './ui/profile';
import type { Feedback, GoodFit, PageState, Profile } from './core/types';

const extension = typeof chrome !== 'undefined' && !!chrome.storage;
const connectPage = extension ? createPageConnector() : null;
const ALL_SITES = ['https://*/*', 'http://*/*'];
const ANSWER_MS = 110_000;

const store = {
  async get(key: string): Promise<any> { return extension ? (await chrome.storage.local.get(key))[key] : JSON.parse(localStorage.getItem(key) || 'null'); },
  async set(key: string, value: unknown) { if (extension) await chrome.storage.local.set({ [key]: value }); else localStorage.setItem(key, JSON.stringify(value)); },
};

/** 1.x profiles carried automatic estimates; FORMA 2 only keeps measured values. */
function cleanProfile(raw: any): Profile {
  const p = migrateProfile({ ...DEFAULT_PROFILE, ...(raw || {}) });
  const measures = Object.fromEntries(Object.entries(p.measures || {}).filter(([, m]) => m && !m.estimated));
  return { ...p, measures, context: { ...DEFAULT_PROFILE.context!, ...p.context } };
}

type Intent = { kind: 'good' | 'bad'; url: string; id: string };

function App() {
  const [step, setStep] = useState<'fit' | 'profile' | 'settings'>('fit');
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [dark, setDark] = useState(false);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<number>();
  const [tabUrl, setTabUrl] = useState('');
  const [page, setPage] = useState<PageState | null>(null);
  const [connection, setConnection] = useState<Connection>({ status: 'checking', message: 'Connecting to this page…', at: Date.now() });
  const [now, setNow] = useState(Date.now());
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [notes, setNotes] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [goodFits, setGoodFits] = useState<GoodFit[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [mode, setMode] = useState<Mode>('anthropic');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [key, setKey] = useState('');
  const [count, setCount] = useState(0);
  const [limit, setLimit] = useState(DEFAULT_REQUEST_LIMIT);
  const [unlimited, setUnlimited] = useState(false);
  const [limitDraft, setLimitDraft] = useState(String(DEFAULT_REQUEST_LIMIT));
  const [unlimitedDraft, setUnlimitedDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoMessage, setAutoMessage] = useState('');
  const [apiAllowed, setApiAllowed] = useState(true);
  const notesWrites = useRef<Promise<void>>(Promise.resolve());

  const run = (work: () => void | Promise<void>) => async () => { setNotice(''); try { await work(); } catch (e) { setNotice(e instanceof Error ? e.message : String(e)); } };

  // Load everything once.
  useEffect(() => {
    (async () => {
      const [p, d, g, f, s, c, on, k] = await Promise.all(['profile', 'description', 'goodFits', 'feedback', 'settings', 'aiCount', 'formaEnabled', 'apiKey'].map(store.get));
      const merged = consolidateFitNotes(cleanProfile(p), typeof d === 'string' ? d : '');
      if (merged.description !== (d || '')) await store.set('description', merged.description);
      setProfile(merged.profile); setNotes(merged.description);
      setGoodFits(normaliseGoodFits(g)); setFeedback(normaliseFeedback(f));
      const provider = providerOf(s); setMode(provider.mode); setModel(provider.model || DEFAULT_MODEL);
      setCount(Number(c) || 0); setLimit(requestLimit(s)); setLimitDraft(String(requestLimit(s))); setUnlimited(hasNoRequestCap(s)); setUnlimitedDraft(hasNoRequestCap(s));
      setEnabled(on !== false); setKey(typeof k === 'string' ? k : '');
      if (extension) {
        setApiAllowed(await chrome.permissions.contains({ origins: ['https://api.anthropic.com/*'] }));
        setAutoEnabled(await automaticDetectionEnabled().catch(() => false));
      }
      setReady(true);
    })().catch(() => setNotice('Could not load your saved data. Reload the FORMA panel.'));
  }, []);

  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Follow the active tab and its page state.
  useEffect(() => {
    if (!extension) return;
    let revision = 0;
    const refresh = async () => {
      const own = ++revision;
      const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (own !== revision) return;
      setTab(t?.id); setTabUrl(t?.url || '');
      if (!t?.id) { setPage(null); return; }
      const data = await chrome.storage.session.get(['page:' + t.id, 'fit-editor:' + t.id]);
      if (own !== revision) return;
      const state = data['page:' + t.id] as PageState | undefined;
      const current = state && t.url && state.identity === productIdentity(t.url) ? state : null;
      setPage(current);
      const want = data['fit-editor:' + t.id] as Intent | undefined;
      setIntent(want && current && productIdentity(want.url) === current.identity ? want : null);
    };
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session') void refresh();
      if (area !== 'local') return;
      if (changes.formaEnabled) setEnabled(changes.formaEnabled.newValue !== false);
      if (changes.aiCount) setCount(Number(changes.aiCount.newValue) || 0);
      if (changes.goodFits) setGoodFits(normaliseGoodFits(changes.goodFits.newValue));
      if (changes.feedback) setFeedback(normaliseFeedback(changes.feedback.newValue));
      if (changes.settings) { const v = changes.settings.newValue; setLimit(requestLimit(v)); setUnlimited(hasNoRequestCap(v)); }
    };
    const updated = (_id: number, change: chrome.tabs.OnUpdatedInfo) => { if (change.url || change.status === 'complete') void refresh(); };
    const activated = () => { setPage(null); void refresh(); };
    void refresh();
    chrome.storage.onChanged.addListener(changed); chrome.tabs.onUpdated.addListener(updated); chrome.tabs.onActivated.addListener(activated);
    return () => { revision++; chrome.storage.onChanged.removeListener(changed); chrome.tabs.onUpdated.removeListener(updated); chrome.tabs.onActivated.removeListener(activated); };
  }, []);

  // Make sure the active page has a reader. A live reader is reused without a new scan.
  useEffect(() => {
    if (!extension || !connectPage || !ready || !enabled) return;
    let revision = 0;
    const attach = async () => {
      const own = ++revision;
      const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (own !== revision || t?.status === 'loading') return;
      setConnection({ status: 'checking', message: 'Connecting to this page…', at: Date.now() });
      const state = await connectPage(t || {});
      if (own === revision) setConnection(state);
    };
    const fail = () => setConnection({ status: 'error', message: 'Could not connect. Press Refresh to try again.', at: Date.now() });
    const activate = () => { attach().catch(fail); };
    const updated = (_id: number, change: chrome.tabs.OnUpdatedInfo) => { if (change.status === 'complete') activate(); };
    activate();
    chrome.tabs.onActivated.addListener(activate); chrome.tabs.onUpdated.addListener(updated); chrome.permissions.onAdded.addListener(activate);
    return () => { revision++; chrome.tabs.onActivated.removeListener(activate); chrome.tabs.onUpdated.removeListener(updated); chrome.permissions.onAdded.removeListener(activate); };
  }, [ready, enabled]);

  useEffect(() => { if (intent) { setStep('fit'); setTimeout(() => document.getElementById('fit-editor')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150); } }, [intent?.id]);

  // ------------------------------------------------------------ actions

  async function connect(options: { force?: boolean; retry?: boolean; fresh?: boolean }) {
    if (!connectPage || !extension) return;
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    setConnection({ status: 'checking', message: 'Connecting to this page…', at: Date.now() });
    const state = await connectPage(t || {}, options);
    setConnection(state);
    if (state.status !== 'connected') throw Error(state.message);
  }

  async function register(origins: string[], id: string) {
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    if (scripts.some(s => s.id === id)) await chrome.scripting.updateContentScripts([{ id, matches: origins, js: ['content.js'], runAt: 'document_idle' }]);
    else await chrome.scripting.registerContentScripts([{ id, matches: origins, js: ['content.js'], runAt: 'document_idle' }]);
  }

  /** Manual activation: connect this shop and assess the page even if it was not recognised. */
  async function analyseThisPage() {
    if (!extension) throw Error('Load FORMA as a Chrome extension first.');
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!t?.url || !/^https?:/.test(t.url)) throw Error('Switch to a shop tab. Chrome pages cannot be analysed.');
    const origins = [new URL(t.url).origin + '/*'];
    const wanted = mode === 'anthropic' ? [...origins, 'https://api.anthropic.com/*'] : mode === 'ollama' ? [...origins, 'http://localhost:11434/*'] : origins;
    if (!await chrome.permissions.request({ origins: wanted })) throw Error('Website access was not granted.');
    setApiAllowed(await chrome.permissions.contains({ origins: ['https://api.anthropic.com/*'] }));
    if (!autoEnabled) await register(origins, 'shop-' + new URL(t.url).hostname.replace(/[^a-z0-9]/gi, '-'));
    await connect({ force: true, retry: true });
  }

  async function startSetup() {
    if (!extension) throw Error('Load FORMA as a Chrome extension first.');
    if (!key.trim()) throw Error('Enter your Anthropic API key first.');
    if (!await chrome.permissions.request({ origins: [...ALL_SITES, 'https://api.anthropic.com/*'] })) throw Error('Chrome did not grant access. FORMA needs it to read shop pages and reach Anthropic.');
    const settings = await store.get('settings');
    await chrome.storage.local.set({ apiKey: key.trim(), settings: { ...settings, mode: 'anthropic', model, limit: requestLimit(settings), limitVersion: 1 } });
    await enableAutomaticDetection(chrome, async t => { await connect({}).catch(() => {}); void t; });
    setAutoEnabled(true); setApiAllowed(true); setMode('anthropic');
    setNotice('Ready. Open any clothing product page; FORMA checks it automatically.');
  }

  async function saveSettings(next: { mode?: Mode; model?: string }) {
    const settings = await store.get('settings');
    const merged = { ...settings, mode: next.mode ?? mode, model: next.model ?? model, limit: requestLimit(settings), limitVersion: 1 };
    await store.set('settings', merged);
    if (next.mode) setMode(next.mode);
    if (next.model !== undefined) setModel(next.model);
  }

  async function saveBudget(addMore = false) {
    const [settings, used] = await Promise.all([store.get('settings'), store.get('aiCount')]);
    const next = addMore ? additionalRequests(requestLimit(settings), Number(used || 0)) : unlimitedDraft ? requestLimit(settings) : Number(limitDraft);
    if (!Number.isSafeInteger(next) || next < 0) throw Error('Enter a whole number of requests, zero or higher.');
    const uncapped = addMore ? false : unlimitedDraft;
    await store.set('settings', { ...settings, limit: next, limitVersion: 1, unlimited: uncapped });
    setLimit(next); setLimitDraft(String(next)); setUnlimited(uncapped); setUnlimitedDraft(uncapped);
    setNotice(uncapped ? 'No request cap. Usage is still counted.' : `Request limit: ${next}.`);
  }

  async function toggleEnabled() {
    const next = !enabled;
    await store.set('formaEnabled', next); setEnabled(next);
  }

  async function saveProfile(next: Profile) { await store.set('profile', next); setProfile(next); }

  function saveNotes(value: string) {
    const job = notesWrites.current.catch(() => {}).then(() => store.set('description', value)).then(() => setNotes(value));
    notesWrites.current = job; return job;
  }

  /** Notes changed what the AI should know: reassess this page. */
  async function applyNotes() {
    await notesWrites.current;
    if (!page) throw Error('Notes are saved. Open a product to assess it.');
    await connect({ retry: true });
    setStep('fit');
  }

  const defaultSize = () => page?.decision?.size || page?.decision?.closest || page?.listing?.sizes.find(s => s.selected)?.label || (page?.listing?.sizes.length === 1 ? page.listing.sizes[0].label : '');

  async function closeIntent() { setIntent(null); if (extension && tab) await chrome.storage.session.remove('fit-editor:' + tab); }

  async function saveGoodFit(details: FitDetails) {
    if (!page) throw Error('Open a product page first.');
    const size = details.size.trim();
    const measures = page.reading?.sizes.find(s => s.label === size)?.measures;
    const entry: GoodFit = { url: page.url, name: page.title, kind: page.decision?.kind || page.listing?.kind || guessKind(page.title), size, reason: details.note, savedAt: Date.now(), measures: measures?.length ? measures : undefined, image: page.listing?.images[0] };
    const next = [entry, ...goodFits.filter(g => productIdentity(g.url) !== page.identity)].slice(0, 60);
    await store.set('goodFits', next); setGoodFits(next);
    setNotice(size ? `Saved: ${size} fits you. FORMA compares future ${KIND_LABELS[entry.kind || 'other'].toLowerCase()}s with it.` : 'Saved. Add the size you wear so FORMA can compare measurements.');
    await closeIntent();
  }

  async function saveFeedback(details: FitDetails) {
    if (!page || !details.size) throw Error('Add the size you tried.');
    const entry: Feedback = { name: page.title, url: page.url, size: details.size, value: details.issue || 'Fit note', note: details.note };
    const next = [entry, ...feedback.filter(f => !(f.url && productIdentity(f.url) === page.identity && f.size === details.size))].slice(0, 100);
    await store.set('feedback', next); setFeedback(next);
    setNotice('Feedback saved. FORMA uses it for this item and similar garments.');
    await closeIntent();
  }

  async function editFeedback(entry: Feedback, original: Feedback) {
    const next = [entry, ...feedback.filter(f => f !== original)].slice(0, 100);
    await store.set('feedback', next); setFeedback(next);
  }
  async function removeFeedback(original: Feedback) {
    const next = feedback.filter(f => f !== original);
    await store.set('feedback', next); setFeedback(next);
  }
  async function editGoodFit(entry: GoodFit, details: FitDetails) {
    const next = goodFits.map(g => g === entry ? { ...g, size: details.size, reason: details.note } : g);
    await store.set('goodFits', next); setGoodFits(next);
  }
  async function removeGoodFit(entry: GoodFit) {
    const next = goodFits.filter(g => g !== entry);
    await store.set('goodFits', next); setGoodFits(next);
  }

  async function showOnPage() {
    if (!extension || !tab || !page) throw Error('Open a product page first.');
    const response = await chrome.tabs.sendMessage(tab, { type: 'show-result', state: { ...page, listing: undefined } }).catch(() => null);
    if (!response?.shown) throw Error('The page reader is disconnected. Reload the shop page.');
  }

  async function importProfile(file: File) {
    const imported = JSON.parse(await file.text());
    if (imported.kind === 'forma-profile-update') {
      const next = applyProfileUpdate(profile, imported);
      const nextFeedback = profileFeedbackUpdate(imported, feedback);
      if (imported.fitNotes && !notes.includes(imported.fitNotes)) await saveNotes([notes.trim(), imported.fitNotes.trim()].filter(Boolean).join('\n\n').slice(0, 6000));
      await store.set('feedback', nextFeedback); setFeedback(nextFeedback);
      await saveProfile(next);
      setNotice('Profile updated. Measurements, notes and saved clothes are kept.');
      return;
    }
    const { fitDescription, ...p } = imported;
    if (!p || typeof p !== 'object' || typeof p.name !== 'string' || !['close', 'regular', 'relaxed', 'oversized'].includes(p.fit)) throw Error('This is not a FORMA profile.');
    await saveProfile(cleanProfile(p));
    if (typeof fitDescription === 'string') await saveNotes(fitDescription.slice(0, 6000));
    setNotice('Profile imported.');
  }

  // ------------------------------------------------------------ view

  const status = page?.status;
  const waitingTooLong = status === 'assessing' && now - (page?.at || now) > ANSWER_MS;
  const savedHere = page ? goodFits.find(g => productIdentity(g.url) === page.identity) : undefined;
  const setupNeeded = ready && mode === 'anthropic' && (!key || !apiAllowed);
  const overLimit = mode !== 'none' && !unlimited && count >= limit;

  function statusBlock() {
    if (!enabled) return <div className="verdict"><h2>FORMA is off</h2><p>No pages are read and no AI requests are sent. Saved results stay available.</p></div>;
    if (!page) {
      const title = connection.status === 'permission' ? 'Connect this shop' : connection.status === 'unsupported' ? 'Open a product page' : connection.status === 'error' ? 'Page connection failed' : 'Reading the page…';
      return <div className="verdict"><h2>{title}</h2><p>{connection.status === 'connected' ? 'FORMA is reading the product. Nothing was sent to an AI yet.' : connection.message}</p></div>;
    }
    if (status === 'other') return <div className="verdict"><span className="eyebrow">LOCAL CHECK · NO AI USED</span><h2>No clothing product here</h2><p>{page.message}</p></div>;
    if (status === 'assessing') return <div className="verdict"><span className="eyebrow">{mode === 'none' ? 'LOCAL COMPARISON' : 'AI ASSESSMENT'}</span><h2>{waitingTooLong ? 'No answer yet' : 'Checking the fit…'}</h2><p>{waitingTooLong ? 'The request is taking unusually long. Press Refresh to try again.' : `Reading sizes, measurements and photos (${Math.round((now - page.at) / 1000)} s).`}</p></div>;
    if (status === 'blocked' || status === 'error') return <div className="verdict"><span className="eyebrow">{status === 'error' ? 'ASSESSMENT FAILED' : 'NEEDS ATTENTION'}</span><h2>{status === 'error' ? 'Could not assess this page' : page.code === 'limit' ? 'Request limit reached' : page.code === 'profile' ? 'Tell FORMA about you' : 'Set up the AI connection'}</h2><p>{page.message}</p>
      {page.code === 'profile' && <button onClick={() => setStep('profile')}>Open your profile</button>}
      {(page.code === 'key' || page.code === 'permission') && <button onClick={() => setStep('settings')}>Open settings</button>}
      {page.code === 'limit' && <button className="primary" onClick={run(() => saveBudget(true))}>Allow 100 more requests</button>}
    </div>;
    if (status === 'ready' && page.decision) return <Verdict state={page} />;
    return null;
  }

  return <>
    <header>
      <div className="wordmark" aria-label="FORMA">forma<span className="brand-dot" aria-hidden="true">.</span></div>
      <button className="power-switch" role="switch" aria-label="FORMA enabled" aria-checked={enabled} disabled={!ready} onClick={run(toggleEnabled)}><span>{enabled ? 'On' : 'Off'}</span><span className="switch-track" aria-hidden="true"><span /></span></button>
      <button className="theme" onClick={() => setDark(!dark)} aria-label="Toggle colour theme">{dark ? '☀' : '◐'}</button>
    </header>
    <div className="shell">
      <aside><nav>{([['fit', '01', 'Your fit'], ['profile', '02', 'Your profile'], ['settings', '03', 'Settings']] as const).map(([s, n, t]) => <button key={s} onClick={() => setStep(s)} aria-current={s === step ? 'step' : undefined}><span>{n}</span>{t}</button>)}</nav></aside>
      <main>
        {notice && <div className="notice" role="status">{notice}</div>}

        {step === 'fit' && <section>
          <div className="bar">01 / YOUR FIT</div>
          {setupNeeded && <div className="card setup"><h2>Start with your key</h2><p className="small">FORMA uses Claude to read garments and estimate measurements. Your key stays on this device.</p>
            <label>Anthropic API key<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} /></label>
            <button className="primary" disabled={!key.trim()} onClick={run(startSetup)}>Enable FORMA on shop pages</button>
            <p className="small">Chrome asks once for access to websites and to api.anthropic.com. Prefer no AI? Choose “No AI” in Settings.</p></div>}
          <h1>{page?.title || 'Browse. Find your fit.'}</h1>
          <div className="actions">
            <button className={page?.status === 'ready' ? undefined : 'primary'} disabled={!enabled || busy} onClick={run(async () => { setBusy(true); try { await analyseThisPage(); } finally { setBusy(false); } })}>{page?.manual ? 'Analyse again' : 'Analyse this page'}</button>
            <button disabled={!enabled || busy || !tabUrl.startsWith('http')} onClick={run(() => connect({ retry: true, fresh: true }))}>Refresh</button>
            {page?.status === 'ready' && <button onClick={run(showOnPage)}>Show on page</button>}
          </div>
          {statusBlock()}
          {overLimit && status !== 'blocked' && <div className="notice"><strong>{count} / {limit} AI requests used.</strong> Saved results still work. <button onClick={run(() => saveBudget(true))}>Allow 100 more</button></div>}

          {page && (status === 'ready' || status === 'error' || status === 'blocked') && <div className="card" id="fit-editor">
            <h2>Have you worn it?</h2>
            {intent?.kind !== 'bad' && <>
              <p className="small">{savedHere ? `Saved as a good fit${savedHere.size ? ` in ${savedHere.size}` : ''}. Update it below.` : 'Save it as a good fit. FORMA then compares new garments of this type with its measurements.'}</p>
              <FitDetailsForm key={'good' + (intent?.id || '') + page.identity} initial={{ size: savedHere?.size || (intent?.kind === 'good' ? defaultSize() : ''), note: savedHere?.reason || '', issue: '' }} save={saveGoodFit} />
            </>}
            {intent?.kind === 'bad' ? <>
              <p className="small">Which size did you try, and what was wrong?</p>
              <FitDetailsForm key={'bad' + intent.id} initial={{ size: defaultSize(), note: '', issue: '' }} sizeRequired allowIssues save={saveFeedback} />
              <button onClick={run(closeIntent)}>Cancel</button>
            </> : <button onClick={() => page && setIntent({ kind: 'bad', url: page.url, id: crypto.randomUUID() })}>It didn't fit</button>}
          </div>}
          {page?.listing && <ListingInfo listing={page.listing} />}
          <p className="small">Refresh rereads the page and asks the AI again. Opening a page you already checked reuses the saved assessment.</p>
        </section>}

        {step === 'profile' && <section>
          <div className="bar">02 / YOUR PROFILE</div>
          <h1>Your profile.</h1>
          <ProfileEditor profile={profile} save={saveProfile} />
          <h2>Fit notes</h2>
          <p className="muted">What feels right, what bothers you, exceptions per garment type. English or German.</p>
          <ProfileNotes draft={notesDraft} Draft={setNotesDraft} saved={notes} ready={ready} save={saveNotes} apply={applyNotes} canApply={!!page} />
          <div className="card"><h2>Clothes that fit you</h2>
            <p className="small">The strongest evidence FORMA has: garments you own and like, with the size you wear. Save them from their product page.</p>
            {goodFits.length ? goodFits.map((g, i) => <details key={g.url + i}><summary>{g.name}{g.size ? ` · ${g.size}` : ' · size missing'}</summary>
              <p className="small">{g.kind ? KIND_LABELS[g.kind] : 'Garment'} · {g.measures?.length ? `${g.measures.length} measurements saved` : 'no measurements saved'} · <a href={g.url} target="_blank" rel="noreferrer">product page</a></p>
              <FitDetailsForm initial={{ size: g.size, note: g.reason, issue: '' }} save={d => editGoodFit(g, d)} remove={() => removeGoodFit(g)} />
            </details>) : <p className="small">Nothing saved yet. Open a product you own and use “Fits me”.</p>}
          </div>
          <div className="card"><h2>Fit feedback</h2>
            {feedback.length ? feedback.map((f, i) => <details key={(f.url || f.name) + f.size + i}><summary>{f.name} · {f.size} · {f.value}</summary>
              <FitDetailsForm initial={{ size: f.size, note: f.note || '', issue: f.value === 'Fit note' ? '' : f.value }} sizeRequired allowIssues save={d => editFeedback({ ...f, size: d.size, note: d.note, value: d.issue || 'Fit note' }, f)} remove={() => removeFeedback(f)} />
            </details>) : <p className="small">No feedback yet.</p>}
          </div>
          <details><summary>Move your profile to another computer</summary>
            <button onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify({ ...profile, fitDescription: notes })], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'forma-profile.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Export profile</button>
            <label>Import profile<input type="file" accept="application/json" onChange={e => { const file = e.target.files?.[0]; if (file) void run(() => importProfile(file))(); }} /></label>
          </details>
        </section>}

        {step === 'settings' && <section>
          <div className="bar">03 / SETTINGS</div>
          <h1>Settings.</h1>
          <label>Assessment<select value={mode} onChange={e => void run(() => saveSettings({ mode: e.target.value as Mode, model: e.target.value === 'anthropic' ? DEFAULT_MODEL : e.target.value === 'ollama' ? '' : '' }))()}>
            <option value="anthropic">Anthropic · my API key</option><option value="ollama">Ollama · this computer</option><option value="none">No AI · compare published measurements only</option>
          </select></label>
          {mode === 'anthropic' && <>
            <label>Model<select value={model} onChange={e => void run(() => saveSettings({ model: e.target.value }))()}>{MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
            <label>API key · stored on this device<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} onBlur={() => { if (extension) void chrome.storage.local.set({ apiKey: key.trim() }); }} /></label>
            <div className="actions">
              <button onClick={run(async () => { if (await chrome.permissions.request({ origins: ['https://api.anthropic.com/*'] })) { setApiAllowed(true); setNotice('Connection to Anthropic allowed.'); } })} disabled={apiAllowed}>{apiAllowed ? '✓ Connection allowed' : 'Allow connection'}</button>
              <button onClick={run(async () => { setKey(''); await chrome.storage.local.remove('apiKey'); setNotice('API key removed from this device.'); })}>Forget API key</button>
            </div>
            <p className="small">The key is kept in this extension's storage, not in profile exports. Browser storage is not an encrypted vault.</p>
          </>}
          {mode === 'ollama' && <><label>Installed Ollama model<input value={model} onChange={e => setModel(e.target.value)} onBlur={() => void saveSettings({ model })} placeholder="e.g. llama3.2" /></label>
            <p className="small">Start Ollama with OLLAMA_ORIGINS set to this extension's origin. Photos are not sent to local models.</p>
            <button onClick={run(async () => { if (await chrome.permissions.request({ origins: ['http://localhost:11434/*'] })) setNotice('Connection to Ollama allowed.'); })}>Allow connection</button></>}
          {mode === 'none' && <p className="small">FORMA compares published measurements and seller measurements with your clothes and body measurements. Without AI, pages without measurements cannot be judged.</p>}

          <h2>Shops</h2>
          <button disabled={autoEnabled} onClick={async () => { setAutoMessage('Waiting for Chrome…'); try { await enableAutomaticDetection(chrome, async () => { await connect({}).catch(() => {}); }); setAutoEnabled(true); setAutoMessage('Active on all shops.'); } catch (e) { setAutoMessage(e instanceof Error ? e.message : 'Could not enable.'); } }}>{autoEnabled ? '✓ Automatic on all shops' : 'Enable on all shops'}</button>
          <p className="small" role="status">{autoMessage || 'Product pages are recognised locally. Only clothing products are sent for assessment.'}</p>

          {mode !== 'none' && <>
            <h2>Requests</h2>
            <p><strong>{unlimited ? `${count} used · no cap` : `${count} / ${limit} used · ${Math.max(0, limit - count)} left`}</strong></p>
            <div className="grid">
              <label>Cap<select value={unlimitedDraft ? 'unlimited' : 'limited'} onChange={e => setUnlimitedDraft(e.target.value === 'unlimited')}><option value="limited">Limit total requests</option><option value="unlimited">No cap</option></select></label>
              <label>Limit<input type="number" min="0" step="1" disabled={unlimitedDraft} value={limitDraft} onChange={e => setLimitDraft(e.target.value)} /></label>
            </div>
            <div className="actions"><button disabled={limitDraft === String(limit) && unlimitedDraft === unlimited} onClick={run(() => saveBudget())}>Save limit</button><button onClick={run(() => saveBudget(true))}>Allow 100 more</button></div>
            <p className="small">One request per product. Opening it again uses the saved answer; Refresh asks again. Failed attempts count. Sent to the provider: the product page's text, sizes, tables and up to three photos, plus your profile (no name), notes and the clothes you saved.</p>
          </>}
        </section>}
      </main>
    </div>
    <footer><span>FORMA · FIT WITH REASONS</span><span>STORED LOCALLY</span></footer>
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
