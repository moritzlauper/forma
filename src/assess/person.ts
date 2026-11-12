import { guessKind, groupOf } from '../core/garment';
import { productIdentity } from '../core/identity';
import { sameSize } from '../core/sizes';
import { DIMS, KINDS, SOURCES } from '../core/types';
import type { Dim, Feedback, GoodFit, Kind, LibraryEntry, Measure, Person, PersonDim, Profile, Reference } from '../core/types';

export const DEFAULT_PROFILE: Profile = { name: 'My fit', mode: 'body', category: 'top', fit: 'regular', measures: {}, context: { height: 0, weight: 0, waistLabel: '', topSize: '', shoeSizeEU: '', bodyShape: '', style: '', concerns: [] } };

/** Profile measure keys mapped to Person measurements. 1.x stored the arm as "sleeve". */
const BODY_KEYS: Record<PersonDim, string[]> = { chest: ['chest'], waist: ['waist'], hip: ['hip'], arm: ['arm', 'sleeve'], inseam: ['inseam'], foot: ['foot'] };

export function toPerson(profile: Profile | null | undefined, notes = ''): Person {
  const p = profile || DEFAULT_PROFILE;
  const c = p.context;
  const body: Person['body'] = {};
  for (const [dim, keys] of Object.entries(BODY_KEYS) as [PersonDim, string[]][]) {
    for (const key of keys) {
      const m = p.measures?.[key];
      // Automatic estimates from height and weight are not measurements.
      if (m && !m.estimated && Number.isFinite(m.value) && m.value > 0) { body[dim] = m.value; break; }
    }
  }
  const valid = (n: unknown, lo: number, hi: number) => typeof n === 'number' && n >= lo && n <= hi ? n : null;
  return {
    height: valid(c?.height, 120, 230),
    weight: valid(c?.weight, 30, 250),
    build: (c?.bodyShape || '').trim().slice(0, 600),
    usual: { top: (c?.topSize || '').trim(), jeans: (c?.waistLabel || '').trim(), shoe: (c?.shoeSizeEU || '').trim() },
    fit: ['close', 'regular', 'relaxed', 'oversized'].includes(p.fit) ? p.fit : 'regular',
    style: (c?.style || '').trim().slice(0, 200),
    notes: [notes.trim(), ...(c?.concerns || [])].filter(Boolean).join('\n').slice(0, 6000),
    body,
  };
}

/** Enough personal information for a meaningful assessment. */
export function hasPersonalBasis(person: Person, references: Reference[]): boolean {
  return !!person.height || Object.keys(person.body).length > 0 || references.length > 0 || !!person.usual.top || !!person.usual.jeans || !!person.usual.shoe || person.notes.length > 10;
}

function validMeasures(value: unknown): Measure[] {
  if (!Array.isArray(value)) return [];
  return value.filter((m: any) => m && DIMS.includes(m.dim) && Number.isFinite(m.cm) && m.cm > 0 && m.cm < 300 && SOURCES.includes(m.source)).map((m: any) => ({ dim: m.dim, cm: m.cm, tol: Number.isFinite(m.tol) ? m.tol : 2, source: m.source }));
}

/** 1.x stored a parsed chart; extract the worn size as flat garment measurements. */
function fromOldProduct(product: any, size: string): Measure[] {
  if (!product || product.measurementType !== 'garment' || !Array.isArray(product.sizes) || !size) return [];
  const row = product.sizes.find((s: any) => typeof s?.label === 'string' && sameSize(s.label, size));
  if (!row?.measures) return [];
  const factor = product.unit === 'in' ? 2.54 : 1;
  const out: Measure[] = [];
  for (const [key, raw] of Object.entries(row.measures)) {
    const dim = key as Dim;
    if (!DIMS.includes(dim)) continue;
    const values = [raw].flat().filter((n): n is number => typeof n === 'number');
    if (!values.length) continue;
    let cm = (values.reduce((a, b) => a + b, 0) / values.length) * factor;
    if (['chest', 'waist', 'hip'].includes(dim) && !product.flat) cm /= 2;
    out.push({ dim, cm: Math.round(cm * 10) / 10, tol: 1, source: 'chart' });
  }
  return out;
}

export function normaliseGoodFits(raw: unknown): GoodFit[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e: any) => e && typeof e.url === 'string' && typeof e.name === 'string').map((e: any) => {
    const kind: Kind | null = KINDS.includes(e.kind) ? e.kind : guessKind(e.name);
    const size = typeof e.size === 'string' ? e.size : '';
    const measures = validMeasures(e.measures);
    return {
      url: e.url, name: e.name.slice(0, 200), kind, size, reason: typeof e.reason === 'string' ? e.reason.slice(0, 1200) : '',
      savedAt: Number.isFinite(e.savedAt) ? e.savedAt : 0,
      measures: measures.length ? measures : fromOldProduct(e.product, size),
      image: typeof e.image === 'string' ? e.image : Array.isArray(e.images) && typeof e.images[0] === 'string' ? e.images[0] : undefined,
    };
  }).slice(0, 60);
}

export function normaliseFeedback(raw: unknown): Feedback[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((f: any) => f && typeof f.name === 'string' && typeof f.size === 'string' && typeof f.value === 'string').slice(0, 100);
}

/** 1.x scanLibrary entries kept measurements as circumferences; convert them once. */
export function normaliseLibrary(raw: unknown, legacy: unknown): LibraryEntry[] {
  const out: LibraryEntry[] = Array.isArray(raw) ? raw.filter((e: any) => e && typeof e.url === 'string' && Array.isArray(e.sizes)) : [];
  if (Array.isArray(legacy)) {
    for (const scan of legacy as any[]) {
      if (!scan || typeof scan.url !== 'string' || out.some(e => e.url === productIdentity(scan.url))) continue;
      const sizes: LibraryEntry['sizes'] = [];
      for (const m of Array.isArray(scan.measurements) ? scan.measurements : []) {
        if (m?.subject !== 'garment' || !DIMS.includes(m.key) || !Array.isArray(m.cm)) continue;
        let cm = (m.cm[0] + m.cm[1]) / 2;
        if (['chest', 'waist', 'hip'].includes(m.key)) cm /= 2;
        let size = sizes.find(s => s.label === m.size);
        if (!size) sizes.push(size = { label: m.size, measures: [] });
        if (!size.measures.some(x => x.dim === m.key)) size.measures.push({ dim: m.key, cm: Math.round(cm * 10) / 10, tol: 1, source: 'chart' });
      }
      if (sizes.length) out.push({ url: productIdentity(scan.url), name: String(scan.name || ''), kind: guessKind(String(scan.name || '')) || 'other', at: Number(scan.observedAt) || 0, sizes });
    }
  }
  return out.slice(0, 80);
}

export function saveToLibrary(library: LibraryEntry[], entry: LibraryEntry): LibraryEntry[] {
  return [entry, ...library.filter(e => e.url !== entry.url)].slice(0, 80);
}

function libraryMeasures(library: LibraryEntry[], url: string, size: string): Measure[] {
  const entry = library.find(e => e.url === productIdentity(url));
  return entry?.sizes.find(s => sameSize(s.label, size))?.measures || [];
}

/**
 * Every garment the person has worn, as comparison material. Same-product
 * entries are always kept; others only when they share the garment group.
 */
export function buildReferences(goodFits: GoodFit[], feedback: Feedback[], library: LibraryEntry[], url: string, kind: Kind | null): Reference[] {
  const identity = productIdentity(url);
  const group = groupOf(kind);
  const out: Reference[] = [];
  for (const g of goodFits) {
    if (!g.size) continue;
    const same = productIdentity(g.url) === identity;
    // An explicit report on the same product and size replaces the bookmark.
    if (feedback.some(f => f.url && productIdentity(f.url) === productIdentity(g.url) && sameSize(f.size, g.size))) continue;
    const measures = g.measures?.length ? g.measures : libraryMeasures(library, g.url, g.size);
    out.push({ name: g.name, url: g.url, kind: g.kind, size: g.size, liked: true, issue: '', note: g.reason, measures, sameProduct: same });
  }
  for (const f of feedback) {
    const fUrl = f.url || '';
    const same = fUrl ? productIdentity(fUrl) === identity : false;
    const liked = /^fits$/i.test(f.value.trim());
    const issue = liked || f.value === 'Fit note' ? '' : f.value;
    const fitKind = guessKind(f.name);
    const measures = fUrl ? libraryMeasures(library, fUrl, f.size) : [];
    out.push({ name: f.name, url: fUrl, kind: fitKind, size: f.size, liked, issue, note: (f.note || '').slice(0, 800), measures, sameProduct: same });
  }
  return out.filter(r => r.sameProduct || (group !== 'other' && groupOf(r.kind) === group)).slice(0, 12);
}
