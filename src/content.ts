import { createLoadingIndicator } from './loading-indicator';
import { watchRuntimeInvalidation } from './runtime-lifecycle';
import { createRuntimeMessenger } from './runtime-messaging';
import { READER_PROTOCOL } from './page-connection';
import { productIdentity } from './core/identity';
import { hasMeasureTable, listingSignature, materialSignature, readListing } from './page/listing';
import { openSizeGuide } from './page/guide';
import { createCard } from './page/card';
import type { Listing, PageState } from './core/types';

/**
 * Page reader. Reads the product once the page has settled, sends it to the
 * service worker and shows the result. It does not keep re-reading: live
 * elements such as auction countdowns must never cause new assessments.
 */
(() => {
  const w = window as unknown as { formaReader?: { protocol: string; dispose: () => void } };
  if (w.formaReader?.protocol === READER_PROTOCOL) return;
  try { w.formaReader?.dispose(); } catch { /* old reader from a previous extension version */ }

  const SETTLE_MS = 900;          // pause between settle reads
  const SETTLE_TRIES = 5;         // stop waiting for a quiet page after this many reads
  const WATCH_MS = 12_000;        // late-loading size guides are picked up within this window
  const THROTTLE_MS = 3_000;
  const ANSWER_MS = 110_000;      // after this the chip says that no answer arrived

  let disposed = false, enabled = true, manual = false, guideTried = false;
  let identity = productIdentity(location.href);
  let sent = '', busy = false, queued: { fresh: boolean } | null = null;
  let watchUntil = 0, lastRead = 0, throttle: ReturnType<typeof setTimeout> | undefined;
  let waiting = false, answerTimer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  const messenger = createRuntimeMessenger(chrome.runtime, () => dispose());
  watchRuntimeInvalidation(window, chrome.runtime, () => dispose());

  const dismissKey = 'forma-dismissed';
  const dismissed = () => { try { return (JSON.parse(sessionStorage.getItem(dismissKey) || '[]') as string[]).includes(identity); } catch { return false; } };
  const setDismissed = (value: boolean) => {
    try {
      const list = (JSON.parse(sessionStorage.getItem(dismissKey) || '[]') as string[]).filter(u => u !== identity);
      if (value) list.push(identity);
      sessionStorage.setItem(dismissKey, JSON.stringify(list.slice(-50)));
    } catch { /* storage blocked */ }
  };

  const loading = createLoadingIndicator(() => { setDismissed(true); stopWaiting(); });
  const card = createCard({
    open: async kind => !!(await messenger.send({ type: 'open-panel', kind }).catch(() => null))?.ok,
    close: () => setDismissed(true),
  });

  function stopWaiting() { waiting = false; clearTimeout(answerTimer); loading.stop(); }
  function startWaiting() {
    const already = waiting;
    waiting = true; clearTimeout(answerTimer);
    if (dismissed()) return;
    if (!already) loading.start('FORMA · Reading the product…');
    answerTimer = setTimeout(() => { if (waiting && !disposed) loading.fail('FORMA got no answer. Open FORMA and press Refresh.'); }, ANSWER_MS);
  }

  const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
  const relevant = (l: Listing) => manual || (l.product && !!l.kind);

  /** Read until two consecutive reads agree, so hydration does not cause two requests. */
  async function settledListing(own: number): Promise<Listing | null> {
    let listing = readListing(document);
    for (let i = 0; i < SETTLE_TRIES; i++) {
      await wait(SETTLE_MS);
      if (disposed || own !== generation) return null;
      const next = readListing(document);
      if (listingSignature(next) === listingSignature(listing)) return next;
      listing = next;
    }
    return listing;
  }

  async function read(fresh = false, settle = false) {
    if (disposed || !enabled) return;
    if (busy) { queued = { fresh: !!queued?.fresh || fresh }; return; }
    busy = true; lastRead = Date.now();
    const own = generation;
    try {
      let listing = settle ? await settledListing(own) : readListing(document);
      if (!listing || disposed || own !== generation) return;
      if (relevant(listing) && !listing.marketplace && !hasMeasureTable(listing) && !guideTried) {
        guideTried = true;
        if (await openSizeGuide(document)) listing = readListing(document);
        if (disposed || own !== generation) return;
      }
      // The first send uses the full, settled listing. After that, only material
      // changes (sizes, availability, charts) justify a new assessment.
      const signature = materialSignature(listing) + (manual ? '|manual' : '');
      if (signature === sent && !fresh) return;
      sent = signature;
      if (relevant(listing)) startWaiting(); else { stopWaiting(); card.hide(); }
      const ack = await messenger.send({ type: 'listing', listing, manual, fresh });
      if (!ack?.accepted && relevant(listing)) loading.fail(ack?.paused ? 'FORMA is off.' : 'FORMA could not start. Open FORMA and press Refresh.');
    } catch {
      if (!disposed) loading.fail('FORMA could not read this page. Open FORMA and press Refresh.');
    } finally {
      busy = false;
      if (queued) { const q = queued; queued = null; void read(q.fresh); }
    }
  }

  function show(state: PageState) {
    if (state.identity !== identity) return;
    if (state.status === 'assessing') { if (waiting && !dismissed()) loading.update('FORMA · Checking your fit…'); return; }
    stopWaiting();
    if (state.status === 'other') { card.hide(); return; }
    if (dismissed()) return;
    if (state.status === 'blocked' && state.code === 'paused') { card.hide(); return; }
    card.render(state);
  }

  // Only a short window after load or refresh reacts to DOM changes.
  const observer = new MutationObserver(records => {
    if (Date.now() > watchUntil || busy) return;
    if (records.every(r => card.host.contains(r.target) || loading.host.contains(r.target) || r.target === document.documentElement)) return;
    clearTimeout(throttle);
    throttle = setTimeout(() => { if (Date.now() <= watchUntil) void read(); }, Math.max(400, THROTTLE_MS - (Date.now() - lastRead)));
  });
  function watch() {
    watchUntil = Date.now() + WATCH_MS;
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'aria-expanded', 'open', 'disabled', 'aria-disabled'] });
    setTimeout(() => { if (Date.now() > watchUntil) observer.disconnect(); }, WATCH_MS + 200);
  }

  function restart(fresh = false) {
    generation++;
    identity = productIdentity(location.href);
    sent = ''; guideTried = false;
    void read(fresh, true);
    watch();
  }

  // Client-side navigation in single-page shops.
  let lastURL = location.href;
  const interval = setInterval(() => {
    if (!messenger.alive()) return;
    if (location.href === lastURL) return;
    lastURL = location.href;
    if (productIdentity(location.href) === identity) return;
    manual = false; stopWaiting(); card.hide();
    restart();
  }, 800);

  const onMessage = (m: any, _sender: chrome.runtime.MessageSender, reply: (r: unknown) => void) => {
    if (disposed) return;
    try {
      if (m?.type === 'forma-ping') { reply({ protocol: READER_PROTOCOL, url: location.href }); return; }
      if (m?.type === 'forma-enabled') {
        enabled = m.enabled !== false;
        if (!enabled) { stopWaiting(); card.hide(); generation++; } else restart();
        reply({ accepted: true }); return;
      }
      if (!enabled) { reply({ paused: true }); return; }
      if (m?.type === 'refresh') {
        if (m.force === true) manual = true;
        if (m.force || m.fresh) setDismissed(false);
        reply({ accepted: true, url: location.href });
        if (m.force || m.fresh || m.retry) { generation++; sent = ''; guideTried = false; void read(true); watch(); }
        else void read(false);
        return;
      }
      if (m?.type === 'forma-state' && m.state) { show(m.state as PageState); reply({ shown: true }); return; }
      if (m?.type === 'show-result' && m.state) { setDismissed(false); show(m.state as PageState); reply({ shown: true }); return; }
    } catch { dispose(); }
  };
  chrome.runtime.onMessage.addListener(onMessage);

  function dispose() {
    if (disposed) return;
    disposed = true; generation++;
    messenger.close();
    for (const cleanup of [() => observer.disconnect(), () => clearInterval(interval), () => clearTimeout(throttle), stopWaiting, card.hide, () => chrome.runtime.onMessage.removeListener(onMessage)]) {
      try { cleanup(); } catch { /* already gone */ }
    }
  }
  w.formaReader = { protocol: READER_PROTOCOL, dispose };

  void messenger.send({ type: 'forma-enabled?' }).then(state => {
    enabled = state?.enabled !== false;
    if (enabled) restart();
  }).catch(() => dispose());
})();
