// End-to-end check of the built extension in an isolated Chromium with a simulated AI.
// Run: npx playwright install chromium && npm run build && npm run test:browser
import { chromium } from 'playwright';
import { cp, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const temp = await mkdtemp(join(tmpdir(), 'forma-e2e-'));
const extension = join(temp, 'extension');
await cp(fileURLToPath(new URL('../dist', import.meta.url)), extension, { recursive: true });
const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
// Only this test copy has pre-granted permissions; the shipped manifest asks the user.
manifest.host_permissions = ['http://*/*', 'https://*/*'];
await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));

const shop = `<!doctype html><html><head><title>Terlingua Thermal Sweat - Washed Grey</title>
<meta property="og:type" content="product"><meta property="og:image" content="https://shop.test/img/sweat.jpg">
<script type="application/ld+json">{"@type":"Product","name":"Terlingua Thermal Sweat - Washed Grey","offers":{"@type":"Offer","price":"108","priceCurrency":"CHF"}}</script></head>
<body><header><a>Collections</a><a>Cart (1)</a></header><main>
<h1>Terlingua Thermal Sweat - Washed Grey</h1>
<nav class="breadcrumb"><a>Home</a> › <a>SS26</a></nav>
<div class="tabs"><button role="tab" aria-selected="true">Details</button><button role="tab" aria-controls="sizing">Sizing</button></div>
<div class="panel"><ul><li>Raglan sleeves</li><li>Ribbed cuffs</li></ul><p>Made from a 450gsm super-heavy waffle cotton. Boxy fit.</p></div>
<div id="sizing" role="tabpanel" hidden><p>Garment measurements in cm, laid flat.</p><table>
<tr><th>Size</th><th>Chest</th><th>Length</th><th>Sleeve</th></tr>
<tr><td>S</td><td>57</td><td>66</td><td>78</td></tr><tr><td>M</td><td>60</td><td>68</td><td>80</td></tr>
<tr><td>L</td><td>63</td><td>70</td><td>82</td></tr><tr><td>XL</td><td>66</td><td>72</td><td>84</td></tr></table></div>
<p>Size:</p><div class="product-form__sizes"><button>S</button><button disabled><s>M</s></button><button>L</button><button>XL</button></div>
<img src="/img/sweat.jpg" width="600" height="700" alt="Sweat">
<button name="add">Add to cart</button><span>CHF 108.00</span>
</main></body></html>`;

const auction = `<!doctype html><html><head><title>WRSTBHVR Hoodie XL</title></head><body>
<header><nav><a>Angebot erstellen</a></nav></header>
<div><h1>WRSTBHVR Hoodie XL</h1><p><span id="clock">22 Min 53 Sek</span></p><p>Startgebot</p><p>35.00</p><button>Bieten</button><p>Paket B-Post, CHF 9.00</p></div>
<img src="https://img.ricardostatic.test/hoodie.jpg" width="900" height="1200">
<section><div><div><p>Grösse</p><a href="/de/c/xl">XL</a></div><div><p>Pullovertyp</p><a href="/de/c/kapuzen">Kapuzenpullover</a></div><div><p>Zustand</p><p>Gebraucht</p></div></div>
<div name="description-panel"><article><p>WRSTBHVR Kapuzenpulli Grösse XL</p><p>guter Zustand</p></article></div></section>
<script>let s=53;setInterval(()=>{s=(s+59)%60;document.getElementById('clock').textContent='22 Min '+s+' Sek';},200);</script>
</body></html>`;

const context = await chromium.launchPersistentContext(join(temp, 'profile'), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
let failed = false;
try {
  await context.route('https://shop.test/**', route => /\.jpg$/.test(route.request().url()) ? route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.alloc(10) }) : route.fulfill({ status: 200, contentType: 'text/html', body: shop }));
  await context.route('https://www.ricardo.test/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: auction }));
  await context.route('https://img.ricardostatic.test/**', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.alloc(10) }));

  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(async () => {
    globalThis.aiRequests = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      if (!String(url).startsWith('https://api.anthropic.com')) return realFetch(url, options);
      const body = JSON.parse(options.body);
      globalThis.aiRequests.push(body);
      const content = body.messages[0].content;
      const input = JSON.parse(content.find(c => c.type === 'text').text);
      const labels = input.listing.sizes.length ? input.listing.sizes.map(s => s.label) : ['Item'];
      const reading = {
        garment: { kind: input.listing.kind || 'other', cut: 'boxy', stretch: 'some' },
        sizes: labels.map(label => ({ label, available: true, measures: [{ dim: 'chest', cm: 62, tol: 3, source: 'typical' }, { dim: 'length', cm: 68, tol: 3, source: 'typical' }], body: [],
          width: { verdict: 'right', why: 'Simulated.' }, length: { verdict: label === 'S' ? 'slightly_small' : 'right', why: 'Simulated.' }, sleeves: { verdict: 'right', why: 'Simulated.' } })),
        cut: { score: 7, reason: 'Simulated cut.' }, pick: labels.at(-1), summary: 'Simulated summary.', evidence: ['Simulated evidence.'], unknowns: [],
      };
      const events = [
        ['message_start', { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }],
        ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
        ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: JSON.stringify(reading) } }],
        ['content_block_stop', { type: 'content_block_stop', index: 0 }],
        ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 100 } }],
        ['message_stop', { type: 'message_stop' }],
      ];
      const text = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
      await new Promise(resolve => setTimeout(resolve, 300));
      return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
    await chrome.storage.local.set({
      apiKey: 'test-key', settings: { mode: 'anthropic', model: 'claude-haiku-5-5', limit: 100, limitVersion: 1 },
      profile: { name: 'Test', mode: 'body', category: 'top', fit: 'relaxed', measures: {}, context: { height: 183, weight: 80, waistLabel: '', topSize: 'L', style: '', concerns: [] } },
      goodFits: [{ url: 'https://other.test/products/sweat', name: 'Heavy Crewneck Sweat', kind: 'sweatshirt', size: 'L', reason: 'Great length', savedAt: 1, measures: [{ dim: 'chest', cm: 62, tol: 1, source: 'chart' }, { dim: 'length', cm: 71, tol: 1, source: 'chart' }] }],
    });
    // What "Enable on all shops" registers.
    await chrome.scripting.registerContentScripts([{ id: 'all-shops', matches: ['https://*/*', 'http://*/*'], js: ['content.js'], runAt: 'document_idle' }]);
  });
  const requests = () => worker.evaluate(() => globalThis.aiRequests.length);
  const state = (page) => worker.evaluate(async url => { const all = await chrome.storage.session.get(null); return Object.values(all).find(s => s?.url === url) || null; }, page.url());
  const waitFor = async (check, ms, label) => { const end = Date.now() + ms; while (Date.now() < end) { if (await check()) return; await new Promise(r => setTimeout(r, 200)); } throw Error('Timed out: ' + label); };

  // 1. A shop product page is assessed automatically, once.
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('https://shop.test/products/terlingua-thermal-sweat');
  await waitFor(async () => (await state(page))?.status === 'ready', 20000, 'shop assessment');
  const shopState = await state(page);
  assert.equal(await requests(), 1, 'one AI request for the shop page');
  assert.equal(shopState.listing.kind, 'sweatshirt');
  assert.deepEqual(shopState.listing.sizes.map(s => [s.label, s.available]), [['S', true], ['M', false], ['L', true], ['XL', true]]);
  assert.equal(shopState.listing.tables.length, 1, 'the closed sizing tab is read');
  const l = shopState.reading.sizes.find(s => s.label === 'L');
  assert.equal(l.measures.find(m => m.dim === 'chest').cm, 63, 'chart values override the simulated estimate');
  assert.equal(l.measures.find(m => m.dim === 'chest').source, 'chart');
  const lCheck = shopState.decision.sizes.find(s => s.label === 'L').checks.find(c => c.key === 'width');
  assert.equal(lCheck.basis, 'your garments', 'compared with the saved crewneck');
  assert.notEqual(shopState.decision.size, 'M', 'sold out size is never picked');
  const sent = await worker.evaluate(() => globalThis.aiRequests[0]);
  assert.equal(sent.stream, true, 'the request streams');
  assert.equal(sent.output_config.format.type, 'json_schema');
  assert.doesNotMatch(JSON.stringify(sent), /other\.test/, 'URLs of saved clothes are not sent');
  await waitFor(() => page.evaluate(() => !!document.getElementById('forma-fit-card')), 5000, 'card on page');
  console.log('✓ shop page assessed automatically with one request:', shopState.decision.headline);

  // 2. Reopening uses the saved assessment.
  await page.reload();
  await waitFor(async () => (await state(page))?.status === 'ready' && (await state(page)).cached, 15000, 'cached reload');
  assert.equal(await requests(), 1, 'reload makes no new request');
  console.log('✓ reload reuses the saved assessment');

  // 3. A ticking auction countdown does not trigger repeated requests.
  const listing = await context.newPage();
  listing.on('pageerror', e => errors.push(e.message));
  await listing.goto('https://www.ricardo.test/de/a/wrstbhvr-hoodie-xl-1334615952/');
  await waitFor(async () => (await state(listing))?.status === 'ready', 20000, 'auction assessment');
  await listing.waitForTimeout(8000);
  assert.equal(await requests(), 2, 'exactly one request for the auction despite the countdown');
  const auctionState = await state(listing);
  assert.equal(auctionState.listing.marketplace, true);
  assert.deepEqual(auctionState.listing.sizes.map(s => s.label), ['XL']);
  assert.equal(auctionState.decision.closest, 'XL');
  console.log('✓ marketplace listing assessed once while the countdown ticks:', auctionState.decision.headline);

  // 4. Saving feedback recomputes locally, without a request.
  await worker.evaluate(async () => { await chrome.storage.local.set({ feedback: [{ name: 'WRSTBHVR Hoodie XL', url: 'https://www.ricardo.test/de/a/wrstbhvr-hoodie-xl-1334615952/', size: 'XL', value: 'Fits', note: '' }] }); });
  await waitFor(async () => (await state(listing))?.decision?.level === 'confirmed', 5000, 'local recompute');
  assert.equal(await requests(), 2);
  console.log('✓ feedback updates the verdict without an AI request');

  // 5. Pausing stops everything.
  await worker.evaluate(() => chrome.storage.local.set({ formaEnabled: false }));
  await page.reload(); await page.waitForTimeout(3000);
  assert.equal(await requests(), 2);
  assert.equal(await page.evaluate(() => !!document.getElementById('forma-loading')), false);
  console.log('✓ the off switch stops reading and requests');

  assert.deepEqual(errors, [], 'no page errors');
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await context.close();
  await rm(temp, { recursive: true, force: true });
}
if (failed) process.exit(1);
