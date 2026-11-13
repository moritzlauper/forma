import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openSizeGuide, findGuideControl } from '../src/page/guide';
import { readListing } from '../src/page/listing';
import { parseChart } from '../src/assess/charts';
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
