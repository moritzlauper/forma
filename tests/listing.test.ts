import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { readListing, listingSignature, hasMeasureTable } from '../src/page/listing';

export function page(body: string, url: string, head = '') {
  const { document } = parseHTML(`<!doctype html><html><head>${head}</head><body>${body}</body></html>`);
  Object.defineProperty(document, 'URL', { value: url });
  return document as unknown as Document;
}

/** Structure observed on a live ricardo.ch listing on 12 Nov 2026. */
export function ricardo(countdown = '22 Min 53 Sek') {
  return page(`
  <header><nav><a>Angebot erstellen</a><a>Favoriten</a></nav></header>
  <div class="breadcrumb"><a>Ricardo</a><a>Kleidung &amp; Accessoires</a><a>Herrenmode</a><a>Pullover &amp; Sweatshirts</a></div>
  <div class="gallery"><img src="https://img.ricardostatic.ch/images/ce3ee0b1/t_1000x750/wrstbhvr-hoodie-xl" width="354" height="472"><img src="https://img.ricardostatic.ch/images/ce3ee0b1/t_1800x1350/wrstbhvr-hoodie-xl" width="900" height="1200"><img src="https://img.ricardostatic.ch/images/7245af90/t_1800x1350/wrstbhvr-hoodie-xl" width="900" height="1200"></div>
  <div><h1>WRSTBHVR Hoodie XL</h1><p><span>${countdown}</span> | 12. Nov. 2026, 10:43 Uhr</p>
  <p>Startgebot</p><p>35.00</p><button>Bieten</button><button>Zu Favoriten hinzufügen</button>
  <p>Lieferung</p><p>Paket B-Post, CHF 9.00</p></div>
  <section><div>
    <div><p>Geschlecht und Altersgruppe</p><a>Herren</a></div>
    <div><p>Vermeidet ~</p><span><span>6 kg CO₂e</span></span></div>
    <div><p>Grösse</p><a>XL</a></div>
    <div><p>Pullovertyp</p><a>Kapuzenpullover</a></div>
    <div><p>Zustand</p><p>Gebraucht</p></div>
  </div><hr><div name="description-panel"><div><article><p>WRSTBHVR Kapuzenpulli Grösse XL</p><p>guter Zustand</p></article></div></div></section>
  <footer>Impressum</footer>`, 'https://www.ricardo.ch/de/a/wrstbhvr-hoodie-xl-1334615952/',
  `<meta property="og:image" content="https://img.ricardostatic.ch/images/ce3ee0b1/t_1800x1350/wrstbhvr-hoodie-xl">
   <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"WRSTBHVR Hoodie XL"},{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Ricardo"},{"@type":"ListItem","position":2,"name":"Kleidung & Accessoires"},{"@type":"ListItem","position":3,"name":"Herrenmode"},{"@type":"ListItem","position":4,"name":"Pullover & Sweatshirts"}]}]}</script>`);
}

test('A Ricardo listing is read as a single-size marketplace hoodie', () => {
  const l = readListing(ricardo());
  assert.equal(l.title, 'WRSTBHVR Hoodie XL');
  assert.equal(l.marketplace, true);
  assert.equal(l.product, true);
  assert.equal(l.kind, 'hoodie');
  assert.deepEqual(l.sizes.map(s => s.label), ['XL']);
  assert.ok(l.attributes.some(a => a.name === 'Grösse' && a.value === 'XL'));
  assert.ok(l.attributes.some(a => a.name === 'Zustand' && a.value === 'Gebraucht'));
  assert.ok(!l.attributes.some(a => /Vermeidet/.test(a.name)));
  assert.match(l.description, /guter Zustand/);
  assert.deepEqual(l.breadcrumbs, ['Ricardo', 'Kleidung & Accessoires', 'Herrenmode', 'Pullover & Sweatshirts']);
  assert.equal(l.images.length, 2, 'two photos, the same photo in two resolutions counts once');
  assert.ok(l.images.every(i => i.includes('t_1800x1350')));
});

test('A ticking auction countdown does not change what FORMA sends', () => {
  assert.equal(listingSignature(readListing(ricardo('22 Min 53 Sek'))), listingSignature(readListing(ricardo('22 Min 52 Sek'))));
  assert.equal(listingSignature(readListing(ricardo('22 Min 53 Sek'))), listingSignature(readListing(ricardo('Noch 2 Tg. 13 Std.'))));
});

const shopHead = `<meta property="og:type" content="product"><script type="application/ld+json">{"@type":"Product","name":"Heavy Box Hoodie","brand":{"@type":"Brand","name":"Northcut"},"description":"Boxy hoodie in 450 gsm cotton.","image":"https://cdn.shop.test/hoodie-front.jpg","offers":{"@type":"Offer","price":"89","priceCurrency":"CHF","availability":"https://schema.org/InStock"}}</script>`;
const shopBody = `<main>
  <h1>Heavy Box Hoodie</h1><span>CHF 89.00</span>
  <fieldset class="product-form__sizes"><legend>Size</legend>
    <label>S</label><label>M</label><label>L</label><label class="is-disabled sold-out">XL</label>
  </fieldset>
  <button name="add">Add to cart</button>
  <div class="product__description"><p>Boxy fit with dropped shoulders and a ribbed hem.</p><p>Model is 185 cm and wears size M.</p></div>
  <details><summary>Size chart</summary><p>Measurements in cm, laid flat.</p>
    <table><tr><th>Size</th><th>Chest</th><th>Length</th><th>Sleeve</th></tr>
    <tr><td>S</td><td>58</td><td>66</td><td>58</td></tr><tr><td>M</td><td>61</td><td>68</td><td>60</td></tr>
    <tr><td>L</td><td>64</td><td>70</td><td>62</td></tr><tr><td>XL</td><td>67</td><td>72</td><td>64</td></tr></table>
  </details>
  <div class="product-reviews"><p>Runs small, size up.</p></div>
  <div class="related-products"><div class="product-card"><h3>Other hoodie</h3><img src="https://cdn.shop.test/other.jpg" width="400" height="400"></div></div>
</main>`;

test('Document-level consent state does not hide product sizes and measurements', () => {
  for (const root of ['html', 'body']) {
    const doc = page(shopBody + '<div class="cookie-consent"><p>Chest 999 cm</p></div>', 'https://shop.test/products/heavy-box-hoodie', shopHead);
    doc.querySelector(root)!.classList.add('scrt-consent-open');
    const listing = readListing(doc);
    assert.deepEqual(listing.sizes.map(s => [s.label, s.available]), [['S', true], ['M', true], ['L', true], ['XL', false]]);
    assert.equal(listing.tables.length, 1);
    assert.ok(listing.facts.some(f => /Model is 185 cm/.test(f)) || /Model is 185 cm/.test(listing.description));
    assert.ok(!listing.facts.some(f => /999|Runs small/.test(f)), 'the cookie banner and reviews themselves still stay excluded');
  }
});

test('A shop page yields sizes, availability, the chart and model facts', () => {
  const l = readListing(page(shopBody, 'https://shop.test/products/heavy-box-hoodie', shopHead));
  assert.equal(l.marketplace, false);
  assert.equal(l.product, true);
  assert.equal(l.kind, 'hoodie');
  assert.equal(l.brand, 'Northcut');
  assert.deepEqual(l.sizes.map(s => [s.label, s.available]), [['S', true], ['M', true], ['L', true], ['XL', false]]);
  assert.equal(l.tables.length, 1);
  assert.ok(hasMeasureTable(l));
  assert.match(l.tables[0].caption, /laid flat/);
  assert.ok(l.facts.some(f => /Model is 185 cm/.test(f)) || /Model is 185 cm/.test(l.description));
  assert.ok(!l.facts.some(f => /Runs small/.test(f)), 'reviews load lazily and stay out of the signature');
  assert.deepEqual(l.images, ['https://cdn.shop.test/hoodie-front.jpg']);
});

test('Catalogue and search pages are not products', () => {
  const cards = Array.from({ length: 12 }, (_, i) => `<div class="product-card"><a href="/products/h${i}">Hoodie ${i}</a><span>CHF 49</span></div>`).join('');
  assert.equal(readListing(page(`<main><h1>Hoodies</h1>${cards}</main>`, 'https://shop.test/collections/hoodies')).product, false);
  assert.equal(readListing(page(`<h1>Wrstbhvr Hoodie</h1>${cards}`, 'https://www.ricardo.ch/de/s/WRSTBHVR%20Hoodie/')).product, false);
});

test('Non-garments on marketplaces are not assessed', () => {
  const l = readListing(page('<h1>Kleiderbügel Holz 20 Stück</h1><p>CHF 10.00</p><button>Bieten</button>', 'https://www.ricardo.ch/de/a/kleiderbuegel-1234567890/'));
  assert.equal(l.kind, null);
});

test('Seller measurements in marketplace text are kept as facts', () => {
  const l = readListing(page('<h1>Vintage Levi\'s 501 W32 L34</h1><p>CHF 40.00</p><button>Bieten</button><div class="description"><p>Bundweite 41 cm flach, Schrittlänge 82 cm.</p></div>', 'https://www.ricardo.ch/de/a/levis-501-1234567890/'));
  assert.equal(l.kind, 'jeans');
  assert.deepEqual(l.sizes.map(s => s.label), ['32/34']);
  assert.match(l.description + l.facts.join(' '), /Schrittlänge 82 cm/);
});

test('Cards for other products are not facts or photos of this product', () => {
  const l = readListing(page(`<h1>Blue Hoodie L</h1><p>CHF 35.00</p><button>Bieten</button>
    <div><p>Grösse</p><a href="/de/c/l">L</a></div>
    <div role="region"><a href="/de/a/sport-leggings-1234567890/"><img src="https://img.test/other.jpg" width="300" height="300"><span>Sport Leggings grau hoher Bund</span></a></div>`, 'https://www.ricardo.ch/de/a/blue-hoodie-1333590994/'));
  assert.ok(!l.facts.some(f => /Leggings/.test(f)));
  assert.deepEqual(l.images, []);
  assert.ok(l.attributes.some(a => a.name === 'Grösse' && a.value === 'L'), 'attribute values that are links stay');
});

/** Layout as in the SCRT screenshot: unnamed size buttons, a div-built chart with an empty corner. */
test('Unnamed size buttons and a div-built chart are read', () => {
  const l = readListing(page(`<main><h1>Terlingua Thermal Sweat - Washed Grey</h1><span>CHF 108.00</span>
    <div class="tabs"><a href="#d">Details</a><a href="#s">Sizing</a></div>
    <div class="grid-chart"><div><span>XS</span><span>S</span><span>M</span><span>L</span><span>XL</span></div>
      <div><span>PIT TO PIT (CM)</span><span>59</span><span>60.5</span><span>61.75</span><span>63</span><span>64.2</span></div>
      <div><span>BODY LENGTH HPS* (CM)</span><span>63.5</span><span>66</span><span>68</span><span>70</span><span>72</span></div></div>
    <div class="variant-picker"><div class="label">Size:</div><div class="options"><button>XS</button><button>S</button><button class="is-unavailable">M</button><button class="is-unavailable">L</button><button>XL</button><button class="is-unavailable">XXL</button></div></div>
    <button>Add to cart</button></main>`, 'https://shop.test/products/terlingua-thermal-sweat'));
  assert.deepEqual(l.sizes.map(s => [s.label, s.available]), [['XS', true], ['S', true], ['M', false], ['L', false], ['XL', true], ['XXL', false]]);
  assert.equal(l.tables.length, 1);
  assert.deepEqual(l.tables[0].rows[0], ['', 'XS', 'S', 'M', 'L', 'XL']);
});

test('Without a size picker the chart labels are the sizes', () => {
  const l = readListing(page(`<main><h1>Box Tee</h1><span>CHF 40.00</span><button>Add to cart</button>
    <table><tr><th></th><th>S</th><th>M</th><th>L</th></tr><tr><td>Chest (cm)</td><td>52</td><td>55</td><td>58</td></tr></table></main>`, 'https://shop.test/products/box-tee'));
  assert.deepEqual(l.sizes.map(s => s.label), ['S', 'M', 'L']);
});

test('Recommendation cards whose titles sit outside the link are ignored (COS layout)', () => {
  const card = (name: string) => `<div class="tile"><a href="/en-ch/men/product/${name.replace(/ /g, '-')}-123456789"><img src="https://img.test/${name.length}.jpg" width="300" height="400"></a><p>${name}</p><span>CHF 89</span></div>`;
  const l = readListing(page(`<main><h1>RELAXED STRIPED COTTON SHIRT</h1><span>CHF 89.00</span>
    <div class="size-selector"><button>XS</button><button>S</button><button>M</button><button>L</button><button>XL</button></div><button>Add to bag</button>
    <div class="details"><p>Relaxed fit</p><p>Back length of size M is 77cm / Model wears a size M</p></div>
    <div class="you-may-like">${card('Relaxed twill shirt')}${card('Buckled denim relaxed-fit barrel-leg trousers')}</div></main>`,
    'https://www.cos.com/en-ch/men/menswear/shirts/cottonshirts/product/relaxed-striped-cotton-shirt-blue-striped-1358972002'));
  assert.equal(l.kind, 'shirt');
  assert.ok(l.facts.some(f => /Back length of size M is 77cm/.test(f)) || /77cm/.test(l.description));
  assert.ok(!l.facts.some(f => /twill|barrel-leg/.test(f)), l.facts.join(' | '));
  assert.equal(l.images.length, 0);
});
