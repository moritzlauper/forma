import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openSizeGuide, findGuideControl } from '../src/page/guide';
import { readListing } from '../src/page/listing';
import { chartFor, parseChart } from '../src/assess/charts';
import { page } from './listing.test';
import { Event as DomEvent } from 'linkedom';

// linkedom has no KeyboardEvent; closeDialog falls back to an Escape keydown.
(globalThis as any).KeyboardEvent ??= class extends (DomEvent as unknown as typeof Event) {
  key: string;
  constructor(type: string, init: KeyboardEventInit = {}) { super(type, init); this.key = init.key ?? ''; }
};

/** Body chart and its tab panel as seen on cos.com/de-ch on 13 Nov 2026. */
const COS_DIALOG = `<div role="dialog" aria-modal="true">
  <div role="tablist"><button role="tab" aria-selected="true">Größenratgeber</button><button role="tab" aria-selected="false">Produktabmessungen</button></div>
  <div role="tabpanel"><p>GRÖSSE AUSWÄHLEN : XS</p><p>ZENTIMETER ZOLL</p>
    <table><tr><th>Größe</th><th>EU</th><th>Brustkorb</th><th>Armlänge</th><th>Taille</th></tr>
      <tr><td rowspan="2">S</td><td>44</td><td>88</td><td>62.5</td><td>76</td></tr><tr><td>46</td><td>92</td><td>63</td><td>80</td></tr>
      <tr><td rowspan="2">M</td><td>48</td><td>96</td><td>63.5</td><td>84</td></tr><tr><td>50</td><td>100</td><td>64</td><td>88</td></tr>
      <tr><td rowspan="2">L</td><td>52</td><td>104</td><td>64.5</td><td>92</td></tr><tr><td>54</td><td>108</td><td>65</td><td>96</td></tr></table>
    <h3>Brustkorb</h3><p>Vermessen Sie die breiteste Stelle Ihrer Brust und halten Sie das Maßband dabei waagerecht.</p>
    <h3>Taille</h3><p>Vermessen Sie Ihre natürliche Taille an der schmalsten Stelle.</p></div>
</div>`;

function cos() {
  const doc = page(`<header><nav><a href="/de-ch/fit-guide">GRÖSSENRATGEBER</a></nav></header>
    <main><h1>Wattierte Daunenjacke mit Trichterkragen</h1>
      <div><nav><button type="button">Im Store finden</button><button type="button">Lieferung &amp; Rücksendung</button><button type="button">Größenratgeber</button></nav></div>
    </main>`, 'https://www.cos.com/de-ch/men/menswear/coatsjackets/jackets/product/padded-funnel-neck-down-jacket-black-1293490003');
  const button = Array.from(doc.querySelectorAll('button')).find(b => b.textContent === 'Größenratgeber')!;
  button.addEventListener('click', () => doc.body.insertAdjacentHTML('beforeend', COS_DIALOG));
  doc.addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Escape') doc.querySelector('[role="dialog"]')?.remove(); });
  return { doc, button };
}

test('The size guide button inside a product <nav> is found, the site menu link is not', () => {
  const { doc, button } = cos();
  assert.equal(findGuideControl(doc, new Set()), button);
});

test('Opening the COS guide yields the chart before the dialog is closed', async () => {
  const { doc } = cos();
  const close = await openSizeGuide(doc, async () => {});
  assert.ok(close);
  const listing = readListing(doc);
  close!();
  assert.equal(doc.querySelector('[role="dialog"]'), null);
  assert.equal(listing.tables.length, 1);
  const chart = parseChart(listing.tables[0]);
  // Two EU rows per letter size widen into one body range.
  assert.deepEqual(chart.map(s => s.label), ['S', 'M', 'L']);
  const m = chart.find(s => s.label === 'M')!;
  assert.deepEqual(m.measures, [], 'body measures must not become garment widths');
  assert.deepEqual(m.body.find(b => b.dim === 'chest'), { dim: 'chest', min: 96, max: 100 });
  assert.deepEqual(m.body.find(b => b.dim === 'waist'), { dim: 'waist', min: 84, max: 88 });
});

/** Jeans chart as seen on cos.com/de-ch on 14 Nov 2026: every cell spans two columns. */
const COS_JEANS_ROWS = [[30, 80.5, 94.5, 81.5], [31, 83, 97, 82], [32, 85.5, 99.5, 82.5], [33, 88, 102, 83], [34, 90.5, 104.5, 83.5], [35, 93, 107, 84], [36, 95.5, 109.5, 84.5]];
const COS_JEANS_DIALOG = `<div role="dialog" aria-modal="true">
  <div role="tablist"><button role="tab" aria-selected="true">Größenratgeber</button></div>
  <div role="tabpanel"><div><label>Größe auswählen</label><span>:</span><span>27</span></div>
    <table><thead><tr><th colspan="2">Jeansgröße (in)</th><th colspan="2">Taille</th><th colspan="2">Hüfte</th><th colspan="2">Innenbein</th></tr></thead>
      <tbody>${COS_JEANS_ROWS.map(r => `<tr>${r.map(c => `<td colspan="2">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <div role="radiogroup"><button type="button"><p>ZENTIMETER</p></button><button type="button"><p>ZOLL</p></button></div>
    <ul><li><h4>Taille</h4><p>Vermessen Sie Ihre natürliche Taille an der schmalsten Stelle.</p></li>
      <li><h4>Hüfte</h4><p>Stellen Sie die Füße zusammen und vermessen Sie die breiteste Stelle Ihrer Hüfte.</p></li></ul></div>
</div>`;

test('A COS jeans chart by waist size gives W/L sizes their waist and hip ranges', () => {
  const doc = page(`<main><h1>Signature beflockte Jeans mit geradem Bein</h1>${COS_JEANS_DIALOG}</main>`, 'https://www.cos.com/de-ch/men/menswear/jeans/regular-fit/product/signature-flocked-straight-leg-jeans-black-1362059001');
  const listing = readListing(doc);
  assert.equal(listing.tables.length, 1);
  assert.deepEqual(listing.tables[0].rows[0], ['Jeansgröße (in)', 'Taille', 'Hüfte', 'Innenbein'], 'spanned columns are read once');
  const chart = parseChart(listing.tables[0]);
  // "Taille" is the waist here, and "(in)" belongs to the size labels: values stay in cm.
  assert.deepEqual(chart.map(s => s.label), ['30', '31', '32', '33', '34', '35', '36']);
  const w36 = chartFor(chart, '36/34')!;
  assert.ok(w36, 'a W/L size finds its waist row');
  assert.deepEqual(w36.body.find(b => b.dim === 'waist'), { dim: 'waist', min: 94.3, max: 96.8 });
  assert.deepEqual(w36.body.find(b => b.dim === 'hip'), { dim: 'hip', min: 108.3, max: 110.8 });
  assert.equal(w36.body.find(b => b.dim === 'inseam'), undefined, 'the inseam row follows the waist, the L number decides the length');
  assert.equal(chartFor(chart, '37/34'), undefined);
});

test('A German "Taille" column is not taken for the size column', () => {
  const chart = parseChart({ caption: 'Körpermasse in cm', rows: [['Größe', 'Taille', 'Hüfte'], ['S', '76', '92'], ['M', '82', '98']] });
  assert.deepEqual(chart.map(s => s.label), ['S', 'M']);
  assert.deepEqual(chart[1].body.find(b => b.dim === 'waist'), { dim: 'waist', min: 79, max: 85 });
});

/** Size guide as seen on carhartt-wip.com/de-ch on 14 Nov 2026 (React Aria dialog). */
function carhartt() {
  const doc = page(`<main><h1>Ardon Jacket</h1>
      <details><summary>Größe &amp; Passform</summary><p>Regular Fit</p></details>
      <button type="button">Größentabelle öffnen</button>
    </main>`, 'https://www.carhartt-wip.com/de-ch/p/ardon-jacket-shungite-black-430');
  const chart = `<table><tr><th>Größe</th><th>Brustweite</th><th>Ärmellänge</th><th>Rückenlänge</th></tr>
    <tr><td>S</td><td>60 cm</td><td>68 cm</td><td>70 cm</td></tr><tr><td>M</td><td>63 cm</td><td>69 cm</td><td>72 cm</td></tr><tr><td>L</td><td>66 cm</td><td>70 cm</td><td>74 cm</td></tr></table>`;
  const open = Array.from(doc.querySelectorAll('button')).find(b => b.textContent === 'Größentabelle öffnen')!;
  open.addEventListener('click', () => {
    doc.body.insertAdjacentHTML('beforeend', `<section role="dialog"><div role="tablist">
        <div role="tab" aria-selected="true">Produktmaße</div><div role="tab" aria-selected="false">Größentabelle</div></div>
      <div role="tabpanel"><p>Bitte wählen Sie eine Größe, um die Maße zu sehen.</p></div></section>`);
    const dialog = doc.querySelector('[role="dialog"]')!;
    // React Aria handles Escape inside the dialog only.
    dialog.addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Escape') dialog.remove(); });
    const tab = Array.from(dialog.querySelectorAll('[role="tab"]')).find(t => t.textContent === 'Größentabelle')!;
    tab.addEventListener('click', () => { tab.setAttribute('aria-selected', 'true'); dialog.querySelector('[role="tabpanel"]')!.innerHTML = chart; });
  });
  return doc;
}

test('A guide that opens on another tab is switched to its chart and closed again', async () => {
  const doc = carhartt();
  const close = await openSizeGuide(doc, async () => {});
  assert.ok(close, 'the accordion, the button and the chart tab fit in three tries');
  const tables = readListing(doc).tables;
  close!();
  assert.equal(doc.querySelector('[role="dialog"]'), null);
  const m = parseChart(tables[0]).find(s => s.label === 'M')!;
  assert.deepEqual(m.measures.map(x => [x.dim, x.cm]), [['chest', 63], ['sleeve', 69], ['length', 72]]);
});
