import { guessKind, isNotGarment } from '../core/garment';
import { canonicalSize, isSizeLabel, sameSize, sizeFromTitle } from '../core/sizes';
import { stableText } from '../core/identity';
import type { Attribute, Kind, Listing, SizeOption, Table } from '../core/types';

/**
 * Reads a product page into a Listing. Pure DOM reading: no network, no AI,
 * no clicks. Works on shop pages (JSON-LD, size selectors, size charts) and on
 * marketplace listings (attribute lists, seller text, one size).
 */

const SKIP = 'script,style,noscript,template,svg,nav,footer,header,iframe,#forma-fit-card,#forma-loading';
const NOISE = [
  'recommend', 'related', 'similar', 'upsell', 'cross-sell', 'crosssell', 'recently', 'product-card', 'productcard',
  'cookie', 'newsletter', 'consent', 'review', 'Review', 'rating',
].flatMap(word => [`[class*="${word}"]`, `[id*="${word}"]`]).concat('[data-product-card]').join(',');
const BLOCK = 'div,p,ul,ol,li,table,thead,tbody,tr,section,article,dl,dd,dt,h1,h2,h3,h4,h5,h6,form,fieldset,details,figure,header,footer,nav,main,aside,blockquote,pre';

const MARKETPLACES = /(^|\.)(ricardo\.ch|tutti\.ch|anibis\.ch|ebay\.[a-z.]+|kleinanzeigen\.de|willhaben\.at|vinted\.[a-z.]+|depop\.com|grailed\.com|vestiairecollective\.com|marktplaats\.nl|2dehands\.be|leboncoin\.fr|subito\.it|wallapop\.com|poshmark\.com|mercari\.com|thredup\.com|sellpy\.[a-z.]+|momox-fashion\.[a-z]+|kleiderkreisel\.de)$/i;

const ATTRIBUTE = /^(?:gr(?:ö|oe|o)(?:ss|ß)e|size|taille|tg\.?|marke|brand|hersteller|label|material(?:ien)?|stoff|zusammensetzung|composition|fabric|zustand|condition|schnitt|passform|fit|cut|style|stil|\w*typ|type|art|länge|length|farbe|colou?r|geschlecht(?: und altersgruppe)?|gender|department|kategorie|category|ma(?:ss|ß)e|measurements?|ärmel\w*|sleeve\w*|kragen|neckline|ausschnitt|weite|bundweite|bein\w*|leg\w*|inseam|schrittlänge|stretch|elasti\w*|modell|model)$/i;
const SIZE_WORD = /size|gr(?:ö|oe|o)(?:ss|ß)e|taille/i;
const UNAVAILABLE = /sold ?out|ausverkauft|nicht verfügbar|nicht vorrätig|out of stock|unavailable|vergriffen|épuisé/i;

const FACT_WORDS = /\b(?:model\w*|wears?|wearing|trägt|fits?|passform|schnitt|oversized?|cropped|boxy|slim|regular|relaxed|loose|baggy|straight|tapered|weit|locker|eng|tailliert|kurz|länge|length|ärmel\w*|sleeves?|achsel\w*|pit|brust\w*|chest|schulter\w*|shoulders?|bund\w*|waist|hüfte|hips?|schritt\w*|inseam|rise|leibhöhe|stretch\w*|elasti\w*|dehnbar|true to size|runs? (?:small|large|big)|fällt (?:klein|gross|groß|normal|kleiner|grösser|größer)|size (?:up|down)|nimm|take)\b/i;
const MEASURE_NUMBER = /\d+(?:[.,]\d+)?\s?(?:cm|mm|inch(?:es)?|zoll|")|\b\d\.\d{2}\s?m\b/i;

export const clean = (text: string | null | undefined) => (text || '').replace(/\s+/g, ' ').trim();

function within(el: Element, selector: string): boolean {
  try { return !!el.closest(selector); } catch { return false; }
}
const ignored = (el: Element) => within(el, SKIP) || within(el, NOISE);

/** Inside a link to another page: a card for a different product, a category, the seller. */
function foreignLink(el: Element): boolean {
  const a = el.closest('a[href]');
  if (!a) return false;
  try {
    const target = new URL(a.getAttribute('href')!, el.ownerDocument.URL);
    const here = new URL(el.ownerDocument.URL);
    if (/\.(?:jpe?g|png|webp|avif|gif)$/i.test(target.pathname)) return false;
    return target.origin === here.origin ? target.pathname.replace(/\/+$/, '') !== here.pathname.replace(/\/+$/, '') : true;
  } catch { return false; }
}

const PRICE = /(?:CHF|EUR|USD|GBP|SEK|[€$£])\s?\d|\d[\d'.,]*\s?(?:CHF|EUR|€|\.-)/;

/** A product card: a small block with a link to another page and a picture or a price. */
function inCard(el: Element): boolean {
  let p = el.parentElement;
  for (let i = 0; i < 6 && p && p.tagName !== 'MAIN' && p.tagName !== 'BODY'; i++, p = p.parentElement) {
    const text = p.textContent || '';
    if (text.length > 400) return false;
    if (!Array.from(p.querySelectorAll('a[href]')).some(a => foreignLink(a))) continue;
    if (p.querySelector('img,picture') || PRICE.test(text)) return true;
  }
  return false;
}

/** Text of a block without the text of links to other pages inside it. */
function ownText(el: Element): string {
  let text = textOf(el);
  for (const a of Array.from(el.querySelectorAll('a[href]'))) if (foreignLink(a)) text = text.replace(textOf(a), ' ');
  return clean(text);
}

/** Text of an element's own visible-ish content, with block children separated. */
function textOf(el: Element): string {
  return clean(el.textContent);
}

export function productRoot(doc: Document): Element {
  return doc.querySelector('main,[role="main"]') || doc.querySelector('[itemtype*="Product"]') || doc.body;
}

// ---------------------------------------------------------------- JSON-LD

type LdProduct = { name: string; brand: string; description: string; category: string; images: string[]; sizes: { label: string; available: boolean | null }[]; offer: boolean };

function ldNodes(doc: Document): { products: LdProduct[]; breadcrumbs: string[]; collection: boolean } {
  const products: LdProduct[] = []; const breadcrumbs: string[] = []; let collection = false;
  const str = (v: unknown) => typeof v === 'string' ? clean(v) : typeof (v as { name?: unknown })?.name === 'string' ? clean((v as { name: string }).name) : '';
  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    let data: unknown;
    try { data = JSON.parse(script.textContent || ''); } catch { continue; }
    let visited = 0;
    const walk = (v: any, depth = 0): void => {
      if (!v || typeof v !== 'object' || depth > 8 || ++visited > 800) return;
      if (Array.isArray(v)) { v.forEach(x => walk(x, depth + 1)); return; }
      const types = [v['@type']].flat().map(String);
      if (types.includes('ItemList') || types.includes('CollectionPage') || types.includes('SearchResultsPage')) { collection = true; return; }
      if (types.includes('BreadcrumbList') && Array.isArray(v.itemListElement)) {
        for (const item of v.itemListElement) { const name = str(item?.name) || str(item?.item); if (name) breadcrumbs.push(name); }
        return;
      }
      if (types.includes('Product') || types.includes('ProductGroup') || types.includes('IndividualProduct')) {
        const variants: any[] = Array.isArray(v.hasVariant) ? v.hasVariant.slice(0, 80) : [];
        const offers = [v.offers].flat().filter(Boolean);
        const availability = (o: any) => typeof o?.availability === 'string' ? !/OutOfStock|SoldOut|Discontinued/i.test(o.availability) : null;
        const sizes = [
          ...(str(v.size) ? [{ label: str(v.size), available: availability(offers[0]) }] : []),
          ...variants.map(x => ({ label: str(x?.size), available: availability([x?.offers].flat()[0]) })).filter(s => s.label),
        ];
        const images = [v.image].flat().map((i: any) => typeof i === 'string' ? i : i?.url || i?.contentUrl).filter((i: unknown): i is string => typeof i === 'string');
        products.push({ name: str(v.name), brand: str(v.brand), description: typeof v.description === 'string' ? clean(v.description).slice(0, 2500) : '', category: str(v.category), images, sizes, offer: offers.length > 0 || variants.length > 0 });
      }
      for (const [key, child] of Object.entries(v)) {
        if (!['itemListElement', 'isRelatedTo', 'isSimilarTo', 'hasVariant', 'review', 'aggregateRating'].includes(key) && typeof child === 'object') walk(child, depth + 1);
      }
    };
    walk(data);
  }
  return { products, breadcrumbs, collection };
}

// ---------------------------------------------------------------- Attributes

function readAttributes(doc: Document, root: Element): Attribute[] {
  const out: Attribute[] = [];
  const add = (rawName: string, rawValue: string) => {
    const name = clean(rawName).replace(/[:：]$/, '').trim();
    const value = clean(rawValue);
    if (!name || !value || name.length > 40 || value.length > 120 || name.toLowerCase() === value.toLowerCase()) return;
    if (!ATTRIBUTE.test(name)) return;
    if (!out.some(a => a.name === name && a.value === value)) out.push({ name, value });
  };
  for (const dt of Array.from(root.querySelectorAll('dt'))) {
    if (ignored(dt)) continue;
    const dd = dt.nextElementSibling;
    if (dd?.tagName === 'DD') add(textOf(dt), textOf(dd));
  }
  for (const tr of Array.from(root.querySelectorAll('tr'))) {
    if (ignored(tr)) continue;
    const cells = Array.from(tr.children).filter(c => c.tagName === 'TH' || c.tagName === 'TD');
    if (cells.length === 2) add(textOf(cells[0]), textOf(cells[1]));
  }
  // Label/value pairs as sibling elements: <div><p>Grösse</p><a>XL</a></div>
  for (const el of Array.from(root.querySelectorAll('div,li,p,span'))) {
    if (out.length >= 30) break;
    const kids = Array.from(el.children);
    if (kids.length === 2 && !ignored(el)) {
      const [a, b] = kids.map(textOf);
      if (a.length <= 40 && b.length <= 120 && ATTRIBUTE.test(a.replace(/[:：]$/, ''))) add(a, b);
      continue;
    }
    // "Material: 100% Baumwolle" in one element
    if (kids.length <= 2 && !el.querySelector(BLOCK)) {
      const match = textOf(el).match(/^([^:]{2,40}):\s*(.{1,120})$/);
      if (match && !ignored(el)) add(match[1], match[2]);
    }
  }
  return out.slice(0, 30);
}

// ---------------------------------------------------------------- Sizes

function sizeToken(text: string): string {
  const t = clean(text).replace(UNAVAILABLE, '').replace(/[-–(].*$/, '').replace(/\b(?:size|grösse|größe|gr\.)\b/i, '').trim();
  return t;
}

function unavailable(el: Element): boolean {
  const classes = (el.getAttribute('class') || '') + ' ' + (el.parentElement?.getAttribute('class') || '');
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || /disabled|unavailable|sold|out-of-stock|soldout|not-available|crossed|strike/i.test(classes)) return true;
  if (el.querySelector('s,del,strike') || UNAVAILABLE.test(el.getAttribute('aria-label') || '') || UNAVAILABLE.test(el.getAttribute('title') || '')) return true;
  const style = el.ownerDocument.defaultView?.getComputedStyle?.(el);
  return !!style && /line-through/.test(style.textDecorationLine || style.textDecoration || '');
}
function selected(el: Element): boolean {
  return ['aria-checked', 'aria-pressed', 'aria-selected', 'aria-current'].some(a => el.getAttribute(a) === 'true') || /\b(selected|active|is-checked|checked|current)\b/i.test(el.getAttribute('class') || '') || (el as HTMLInputElement).checked === true;
}

function readSizes(doc: Document, root: Element, ld: LdProduct | undefined, attributes: Attribute[], title: string, marketplace: boolean): SizeOption[] {
  const out: SizeOption[] = [];
  const add = (label: string, available: boolean | null, selected = false) => {
    const token = sizeToken(label);
    if (!token || !isSizeLabel(token)) return;
    const existing = out.find(s => sameSize(s.label, token));
    if (existing) { if (available === false) existing.available = false; existing.selected ||= selected; return; }
    out.push({ label: token, available, selected });
  };
  // Selects named or labelled as size
  for (const select of Array.from(doc.querySelectorAll('select'))) {
    if (ignored(select)) continue;
    const label = [select.getAttribute('name'), select.id, select.getAttribute('aria-label'), select.getAttribute('data-option-name'), select.closest('label,fieldset')?.textContent?.slice(0, 60)].join(' ');
    const options = Array.from(select.querySelectorAll('option'));
    const sizeLike = options.filter(o => isSizeLabel(sizeToken(o.textContent || ''))).length;
    if (!SIZE_WORD.test(label) && sizeLike < Math.max(2, options.length * 0.6)) continue;
    for (const option of options) add(option.textContent || '', option.hasAttribute('disabled') || UNAVAILABLE.test(option.textContent || '') ? false : true, option.hasAttribute('selected'));
  }
  // Buttons, radios and swatches inside a container that is about size
  const candidates = Array.from(doc.querySelectorAll('button,[role="radio"],[role="option"],label,li,a,span,input[type="radio"]'));
  for (const el of candidates) {
    if (ignored(el) || within(el, 'table,select,[role="table"]')) continue;
    const raw = el.tagName === 'INPUT' ? el.getAttribute('value') || '' : el.getAttribute('data-size') || el.getAttribute('data-value') || textOf(el);
    if (raw.length > 24 || !isSizeLabel(sizeToken(raw))) continue;
    let context = '';
    for (let p: Element | null = el, i = 0; p && i < 5; p = p.parentElement, i++) {
      context += ' ' + [p.getAttribute('class'), p.id, p.getAttribute('aria-label'), p.getAttribute('data-testid'), p.getAttribute('name'), p.getAttribute('data-option-name')].join(' ');
      const legend = Array.from(p.children).find(c => /^(LEGEND|LABEL|H2|H3|H4|H5|H6|SPAN|P|DIV|STRONG|B|DT)$/.test(c.tagName) && c !== el && !c.contains(el) && (c.textContent || '').length < 40);
      if (legend) context += ' ' + clean(legend.textContent).slice(0, 40);
    }
    if (!SIZE_WORD.test(context)) continue;
    add(raw, !unavailable(el), selected(el));
  }
  // A row of controls that are all size labels is a size picker, whatever it is called.
  if (!out.length) {
    for (const group of Array.from(root.querySelectorAll('div,ul,fieldset,form,section'))) {
      const items = Array.from(group.children);
      if (items.length < 2 || items.length > 16 || ignored(group) || within(group, 'table,select,[role="table"],nav,footer')) continue;
      const labels = items.map(i => i.getAttribute('data-value') || i.getAttribute('value') || textOf(i));
      if (!labels.every(l => l.length <= 12 && isSizeLabel(sizeToken(l)))) continue;
      if (items.some(i => foreignLink(i))) continue;
      items.forEach((item, i) => {
        const control = item.matches('button,input,label,a,[role="radio"],[role="option"]') ? item : item.querySelector('button,input,label,a,[role="radio"],[role="option"]') || item;
        add(labels[i], !unavailable(control) && !unavailable(item), selected(control));
      });
      if (out.length) break;
    }
  }
  for (const s of ld?.sizes || []) add(s.label, s.available);
  // Marketplaces: the size is an attribute or part of the title
  for (const a of attributes) if (SIZE_WORD.test(a.name)) add(a.value.split(/\s*[/|,]\s*/)[0], true, true);
  if (!out.length && marketplace) { const fromTitle = sizeFromTitle(title); if (fromTitle) add(fromTitle, true, true); }
  return out.slice(0, 40);
}

// ---------------------------------------------------------------- Text

function leafBlocks(root: Element, limit = 5000): Element[] {
  const out: Element[] = [];
  const all = root.querySelectorAll('h1,h2,h3,h4,h5,p,li,dt,dd,td,th,span,div,label,figcaption,small,strong,b,summary,article');
  for (let i = 0; i < all.length && i < limit; i++) {
    const el = all[i];
    if (el.querySelector(BLOCK) || ignored(el)) continue;
    out.push(el);
  }
  return out;
}

function readDescription(root: Element, ld: LdProduct | undefined): string {
  const selectors = ['[itemprop="description"]', '[class*="description"]', '[id*="description"]', '[name*="description"]', '[data-testid*="description"]', '[class*="Description"]', '[class*="product-details"]', '[class*="product__description"]', '[class*="productDescription"]', '[class*="product-info"]'];
  let best = '';
  for (const el of Array.from(root.querySelectorAll(selectors.join(',')))) {
    if (ignored(el)) continue;
    const parts = leafBlocks(el, 400).map(textOf).filter(Boolean);
    const text = (parts.length ? Array.from(new Set(parts)).join('\n') : textOf(el)).slice(0, 4000);
    if (text.length > best.length && text.length < 4000) best = text;
  }
  const combined = [ld?.description || '', best].filter(Boolean);
  const unique = combined.filter((t, i) => !combined.some((o, j) => j !== i && o.length > t.length && o.includes(t.slice(0, 80))));
  return stableText(unique.join('\n').slice(0, 3000));
}

function readFacts(root: Element, description: string): string[] {
  const out: string[] = []; let total = 0;
  for (const el of leafBlocks(root)) {
    if (foreignLink(el) || inCard(el)) continue;
    const text = stableText(ownText(el));
    if (text.length < 4 || text.length > 300) continue;
    if (!MEASURE_NUMBER.test(text) && !FACT_WORDS.test(text)) continue;
    if (/[€$£]|CHF|EUR|versand|shipping|lieferung|delivery|rückgabe|return|cookie|bewertung|review/i.test(text) && !MEASURE_NUMBER.test(text)) continue;
    if (description.includes(text) || out.some(o => o.includes(text))) continue;
    for (let i = out.length - 1; i >= 0; i--) if (text.includes(out[i])) out.splice(i, 1);
    out.push(text); total += text.length;
    if (out.length >= 30 || total > 3000) break;
  }
  return out;
}

// ---------------------------------------------------------------- Tables

const MEASURE_HEADER = /chest|brust|bust|pit|achsel|waist|taille|bund|hip|hüft|seat|length|länge|sleeve|ärmel|shoulder|schulter|inseam|innenbein|schritt|thigh|oberschenkel|rise|leibhöhe|hem|saum|foot|fuss|fuß|breite|width|weite|height|körpergr/i;

function isSizeTable(rows: string[][]): boolean {
  if (rows.length < 2 || rows[0].length < 2) return false;
  const firstRow = rows[0].slice(1).filter(c => isSizeLabel(c)).length;
  const firstCol = rows.slice(1).map(r => r[0] || '').filter(c => isSizeLabel(c)).length;
  const headers = rows[0].join(' ') + ' ' + rows.map(r => r[0] || '').join(' ');
  const numbers = rows.slice(1).some(r => r.slice(1).some(c => /\d/.test(c)));
  return numbers && (firstRow >= 2 || firstCol >= 2) && (MEASURE_HEADER.test(headers) || /^(?:EU|INT|UK|US|IT|FR|DE|JEANS)\b/i.test(headers));
}

function tableContext(el: Element, own: string): string {
  const container = el.closest('dialog,[role="dialog"],[role="tabpanel"],details,section,article') || el.parentElement;
  const caption = clean(el.querySelector('caption')?.textContent);
  const around = clean(container?.textContent).replace(own, ' ');
  const hints = around.match(/[^.]{0,80}\b(?:cm|inch|inches|zoll|flat|laid|flach|half|halbe|circumference|umfang|body|körper|garment|kleidungsst|product measurements|to fit)\b[^.]{0,80}/gi) || [];
  return stableText([caption, ...hints.slice(0, 3)].join(' ')).slice(0, 400);
}

export function readTables(doc: Document): Table[] {
  const out: Table[] = [];
  const cell = (c: Element) => clean(c.textContent).slice(0, 40);
  const push = (el: Element, rows: string[][]) => {
    rows = rows.filter(r => r.some(Boolean)).slice(0, 40).map(r => r.slice(0, 14));
    if (!isSizeTable(rows)) return;
    const key = JSON.stringify(rows);
    if (out.some(t => JSON.stringify(t.rows) === key)) return;
    out.push({ caption: tableContext(el, clean(el.textContent)), rows });
  };
  for (const table of Array.from(doc.querySelectorAll('table,[role="table"],[role="grid"]'))) {
    if (ignored(table) || out.length >= 6) continue;
    const rows = Array.from(table.querySelectorAll('tr,[role="row"]')).map(r => Array.from(r.querySelectorAll('th,td,[role="cell"],[role="gridcell"],[role="columnheader"],[role="rowheader"]')).map(cell));
    push(table, rows);
  }
  // CSS-grid charts built from divs: consistent rows of short cells, in the
  // product area or a size-guide dialog. Strict shape checks keep prose out.
  const scopes = [productRoot(doc), ...Array.from(doc.querySelectorAll('dialog,[role="dialog"],[aria-modal="true"]'))];
  const seen = new Set<Element>();
  for (const scope of scopes) {
    for (const container of [scope, ...Array.from(scope.querySelectorAll('div,section,ul,dl'))]) {
      if (out.length >= 6) break;
      if (seen.has(container) || container.children.length < 3 || container.children.length > 40) continue;
      seen.add(container);
      if (ignored(container) || within(container, 'table,[role="table"],[role="grid"]')) continue;
      const text = container.textContent || '';
      if (text.length > 2500 || !MEASURE_HEADER.test(text) || !/\d/.test(text)) continue;
      const rows = Array.from(container.children).map(row => {
        let cells: Element = row;
        for (let i = 0; i < 3 && cells.children.length === 1 && cells.children[0].children.length; i++) cells = cells.children[0];
        return cells.children.length ? Array.from(cells.children).map(cell) : [cell(cells)];
      });
      // A header row often has no element for the empty corner cell.
      const width = Math.max(...rows.map(r => r.length));
      if (rows[0].length === width - 1 && rows.slice(1).every(r => r.length === width)) rows[0] = ['', ...rows[0]];
      if (rows[0].length < 2 || !rows.every(r => r.length === width && r.every(c => c.length < 40))) continue;
      push(container, rows);
    }
  }
  return out;
}

// ---------------------------------------------------------------- Images

function imageKey(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname.replace(/\b(?:t_)?\d{2,4}x\d{2,4}\b|[_-]\d{2,4}x\d{0,4}\b|\bw_\d+|\bh_\d+|\b\d{3,4}w\b|_(?:small|medium|large|grande|master)\b/gi, '');
  } catch { return url; }
}

function readImages(doc: Document, root: Element, ld: LdProduct | undefined): string[] {
  const out: string[] = []; const keys: string[] = [];
  const add = (raw: string | null | undefined) => {
    if (!raw || raw.startsWith('data:') || /\.svg(\?|$)/i.test(raw)) return;
    try {
      const u = new URL(raw, doc.URL);
      if (u.protocol !== 'https:' || u.username || u.password) return;
      const key = imageKey(u.href);
      const i = keys.indexOf(key);
      if (i >= 0) { if (u.href.length >= out[i].length && /\d{3,4}x\d{3,4}|1800|2000|large|master/.test(u.href)) out[i] = u.href; return; }
      keys.push(key); out.push(u.href);
    } catch { /* ignore */ }
  };
  for (const image of ld?.images || []) add(image);
  for (const meta of Array.from(doc.querySelectorAll('meta[property="og:image:secure_url"],meta[property="og:image"],meta[name="twitter:image"]'))) add(meta.getAttribute('content'));
  const largest = (img: HTMLImageElement) => {
    const set = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
    const entries = set.split(',').map(s => s.trim().split(/\s+/)).filter(p => p[0]).map(p => ({ url: p[0], w: parseInt(p[1] || '0', 10) || 0 }));
    entries.sort((a, b) => b.w - a.w);
    return entries[0]?.url || img.currentSrc || img.getAttribute('data-src') || img.getAttribute('src');
  };
  const scored = Array.from(root.querySelectorAll<HTMLImageElement>('img')).filter(img => !ignored(img) && !foreignLink(img) && !/logo|icon|avatar|payment|flag|badge|sprite|rating|star/i.test((img.alt || '') + ' ' + (img.getAttribute('class') || '') + ' ' + (img.getAttribute('src') || ''))).map(img => {
    const box = typeof img.getBoundingClientRect === 'function' ? img.getBoundingClientRect() : { width: 0, height: 0 };
    const width = box.width || Number(img.getAttribute('width')) || img.naturalWidth || 0;
    const height = box.height || Number(img.getAttribute('height')) || img.naturalHeight || 0;
    const gallery = within(img, '[class*="gallery"],[id*="gallery"],[class*="carousel"],[class*="slider"],[class*="swiper"],[class*="product-media"],[class*="product__media"],[class*="ProductImage"],[class*="product-image"],[data-product-media],[class*="zoom"]');
    return { img, score: width * height + (gallery ? 1e6 : 0), ok: gallery || (width >= 200 && height >= 200) };
  }).filter(x => x.ok).sort((a, b) => b.score - a.score);
  for (const { img } of scored) { if (out.length >= 6) break; add(largest(img)); }
  return out.slice(0, 4);
}

// ---------------------------------------------------------------- Listing

export function readListing(doc: Document): Listing {
  const url = doc.URL;
  let site = ''; let path = '';
  try { const u = new URL(url); site = u.hostname.replace(/^www\./, ''); path = u.pathname; } catch { /* about:blank */ }
  const root = productRoot(doc);
  const ld = ldNodes(doc);
  const h1 = Array.from(root.querySelectorAll('h1')).find(h => !ignored(h)) || doc.querySelector('h1');
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
  const title = clean(h1?.textContent) || clean(ogTitle) || clean(doc.title);
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const product = ld.products.find(p => p.name && (norm(title).includes(norm(p.name)) || norm(p.name).includes(norm(title)))) || (ld.products.length === 1 ? ld.products[0] : undefined);

  const domCrumbs = Array.from(doc.querySelectorAll('[class*="breadcrumb"] a,[class*="breadcrumb"] li,[aria-label*="readcrumb"] a,[aria-label*="readcrumb"] li')).map(textOf).filter(t => t && t.length < 60);
  const breadcrumbs = Array.from(new Set((ld.breadcrumbs.length ? ld.breadcrumbs : domCrumbs).map(clean))).filter(b => b && norm(b) !== norm(title)).slice(0, 8);
  const attributes = readAttributes(doc, root);
  const conditionAttr = attributes.find(a => /zustand|condition/i.test(a.name));
  const auction = /\b(?:startgebot|gebote?|bieten|bids?|place bid|make offer|preis vorschlagen|sofort kaufen|zustand: gebraucht)\b/i.test(clean(root.textContent).slice(0, 20000));
  const marketplace = MARKETPLACES.test(site) || (!!conditionAttr && /gebraucht|used|getragen|worn|wie neu|like new|good|gut/i.test(conditionAttr.value)) || (auction && !product?.offer);

  const description = readDescription(root, product);
  const sizes = readSizes(doc, root, product, attributes, title, marketplace);
  const facts = readFacts(root, description);
  const tables = readTables(doc);
  // No picker found: the size chart still names the sizes the item comes in.
  if (!sizes.length) {
    for (const t of tables) {
      const header = t.rows[0].slice(1).filter(c => isSizeLabel(c));
      const column = t.rows.slice(1).map(r => r[0]).filter(c => isSizeLabel(c || ''));
      for (const label of header.length >= column.length ? header : column) if (!sizes.some(x => sameSize(x.label, label))) sizes.push({ label, available: null, selected: false });
      if (sizes.length) break;
    }
  }
  const images = readImages(doc, root, product);
  const brandAttr = attributes.find(a => /^(?:marke|brand|hersteller|label)$/i.test(a.name));
  const brand = product?.brand || brandAttr?.value || clean(doc.querySelector('[itemprop="brand"]')?.textContent).slice(0, 60) || '';

  const typeValues = attributes.filter(a => /typ|type|art|kategorie|category/i.test(a.name)).map(a => a.value);
  let kind: Kind | null = null;
  if (!isNotGarment(title)) {
    for (const text of [title, ...typeValues, ...breadcrumbs.slice().reverse(), product?.category || '', doc.querySelector('meta[property="product:category"]')?.getAttribute('content') || '', ogTitle]) {
      kind = guessKind(text);
      if (kind) break;
    }
    // Weak fallbacks for terse marketplace titles ("Levi's 501 W32 L34").
    if (!kind && sizes.some(x => /^\d{2}\/\d{2}$/.test(canonicalSize(x.label)))) kind = 'jeans';
    if (!kind) kind = guessKind(description.slice(0, 200));
  }

  const ogType = doc.querySelector('meta[property="og:type"]')?.getAttribute('content') || '';
  const text = clean(root.textContent).slice(0, 30000);
  const buy = Array.from(root.querySelectorAll('button,[role="button"],input[type="submit"],a')).some(el => !ignored(el) && /^(?:add to (?:bag|cart|basket)|in den warenkorb|zum warenkorb|in den einkaufswagen|buy now|jetzt kaufen|kaufen|sofort kaufen|bieten|place bid|make offer|preis vorschlagen|ajouter au panier|aggiungi al carrello|sold out|ausverkauft)$/i.test(clean(el.textContent || el.getAttribute('value'))));
  const price = !!product?.offer || !!doc.querySelector('[itemprop="price"],meta[property="product:price:amount"],meta[property="og:price:amount"]') || /(?:CHF|EUR|USD|GBP|SEK|[€$£])\s?\d|\d[\d'.,]*\s?(?:CHF|EUR|€|\.-)/.test(text);
  const productPath = /\/(?:products?|p|item|items|artikel|a|dp|produkt|produit|prodotto)\/[^/]+|[-_/]\d{6,}(?:[/.-]|$)|\.html$/i.test(path);
  const cards = doc.querySelectorAll('[class*="product-card"],[class*="productCard"],[class*="ProductCard"],[data-product-card],[class*="product-tile"],[class*="productTile"]').length;
  const catalogue = (/\/(?:collections|category|categories|kategorie|search|suche|s|c|shop)(?:\/|$)/i.test(path) && !productPath) || (ld.collection && !product) || (cards > 8 && !product && !productPath);
  const signals = [product ? 'product data' : '', /product/i.test(ogType) ? 'product metadata' : '', buy ? 'purchase control' : '', price ? 'price' : '', sizes.length ? 'sizes' : '', tables.length ? 'size chart' : '', marketplace ? 'marketplace' : '', catalogue ? 'catalogue' : ''].filter(Boolean);
  const isProduct = !catalogue && (!!product || /product/i.test(ogType) || (buy && (price || sizes.length > 0)) || (marketplace && price && productPath) || (productPath && price && sizes.length > 0));

  return { url, site, marketplace, title, brand, breadcrumbs, attributes, sizes, description, facts, tables, images, kind, product: isProduct, signals };
}

/** Signature of the stable fields. Countdowns, prices and seller ratings are not part of it. */
export function listingSignature(l: Listing): string {
  return JSON.stringify([l.title, l.kind, l.product, l.attributes, l.sizes.map(s => [s.label, s.available]), l.description.slice(0, 1500), l.facts, l.tables, l.images]);
}

/** What changes the assessment materially. Copy text that loads later does not. */
export function materialSignature(l: Listing): string {
  return JSON.stringify([l.title, l.kind, l.product, l.sizes.map(s => [s.label, s.available]), l.tables]);
}

export function hasMeasureTable(l: Listing): boolean {
  return l.tables.some(t => MEASURE_HEADER.test(t.rows[0].join(' ') + ' ' + t.rows.map(r => r[0]).join(' ')));
}
