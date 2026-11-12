import { FLAT_DIMS } from '../core/garment';
import { isSizeLabel, sameSize } from '../core/sizes';
import type { BodyDim, BodyRange, Dim, Listing, Measure, Table } from '../core/types';

/**
 * Local, deterministic reading of size charts and seller measurements.
 * Results are in cm; garment widths are laid flat (half circumference).
 * Anything ambiguous is left out rather than guessed.
 */

export type ChartSize = { label: string; measures: Measure[]; body: BodyRange[] };

const SYSTEMS = /^(?:EU|EUR|INT|INTERNATIONAL|UK|US|USA|IT|FR|DE|JP|CN|MEX|AU|BR|JEANS|W|L|LETTER|ALPHA)(?:\s*(?:SIZE|GR(?:Ö|OE)SSE))?$/i;
const SIZE_HEADER = /^(?:size|grösse|größe|groesse|gr\.?|taille|tg\.?|int|international|standardgr(?:ö|oe)sse)$/i;

/** Garment dimension named by a header. Order matters: specific before generic. */
export function headerDim(header: string): Dim | null {
  const h = header.toLowerCase();
  if (/inseam|innenbein|schrittlänge|schritt|inside leg|leg length|beinlänge/.test(h)) return 'inseam';
  if (/sleeve|ärmel|arm length|armlänge|manche/.test(h)) return 'sleeve';
  if (/shoulder|schulter|épaule/.test(h)) return 'shoulder';
  if (/\bhem\b|saum|bottom width|bündchen/.test(h)) return 'hem';
  if (/thigh|oberschenkel|leg opening|beinweite/.test(h)) return 'thigh';
  if (/\brise\b|leibhöhe|bundhöhe|front rise/.test(h)) return 'rise';
  if (/waist|taille|bund/.test(h)) return 'waist';
  if (/hip|hüft|seat|gesäss|gesäß/.test(h)) return 'hip';
  if (/foot|fuss|fuß|insole|innensohle|sohle/.test(h)) return 'foot';
  if (/chest|brust|bust|pit|achsel|poitrine|width|breite|weite/.test(h)) return 'chest';
  if (/length|länge|\blang|höhe|longueur|lunghezza|back|rücken/.test(h)) return 'length';
  return null;
}

function bodyDim(header: string): BodyDim | null {
  const h = header.toLowerCase();
  if (/height|körpergr(?:ö|oe)sse|körperhöhe|taille \(cm\)|stature/.test(h)) return 'height';
  const dim = headerDim(h);
  return dim === 'chest' || dim === 'waist' || dim === 'hip' || dim === 'inseam' || dim === 'foot' ? dim : null;
}

function numbers(cell: string): [number, number] | null {
  const m = cell.replace(/,/g, '.').match(/(\d{1,3}(?:\.\d+)?)(?:\s*(?:-|–|—|\/|bis|to)\s*(\d{1,3}(?:\.\d+)?))?/);
  if (!m) return null;
  const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
  return a > 0 && b > 0 ? [Math.min(a, b), Math.max(a, b)] : null;
}

type Convention = 'flat' | 'full' | null;
function convention(text: string): Convention {
  if (/flat|laid|half|halbe|½|1\/2|across|pit[\s-]?to[\s-]?pit|achsel zu achsel|flach|breite/i.test(text)) return 'flat';
  if (/circumference|umfang|around|\brund|full/i.test(text)) return 'full';
  return null;
}

/** Garment widths without a stated convention: decide from magnitude. */
function looksFull(dim: Dim, cm: number): boolean {
  const limit: Partial<Record<Dim, number>> = { chest: 80, waist: 62, hip: 75, hem: 75, thigh: 45 };
  return cm > (limit[dim] ?? 999);
}

function unitOf(text: string): 'cm' | 'in' | null {
  const cm = /\bcm\b|centimet|zentimeter/i.test(text), inch = /\binch(?:es)?\b|\bzoll\b|\(in\)|"/i.test(text);
  return cm && !inch ? 'cm' : inch && !cm ? 'in' : null;
}

/** Orient a chart so the first row holds headers and the first data column holds sizes. */
function orient(rows: string[][]): string[][] {
  const firstRow = rows[0].slice(1).filter(isSizeLabel).length;
  const firstCol = rows.slice(1).map(r => r[0] || '').filter(isSizeLabel).length;
  if (firstRow >= 2 && firstRow >= firstCol && rows.slice(1).some(r => headerDim(r[0] || '') || bodyDim(r[0] || ''))) {
    const width = Math.max(...rows.map(r => r.length));
    return Array.from({ length: width }, (_, i) => rows.map(r => r[i] ?? ''));
  }
  return rows;
}

export function parseChart(table: Table): ChartSize[] {
  if (table.rows.length < 2) return [];
  const rows = orient(table.rows.map(r => r.map(c => c.trim())));
  const header = rows[0];
  const caption = table.caption + ' ' + header.join(' ');
  // "Body length HPS" is a garment length; only explicit body-size wording makes a body chart.
  const body = /body (?:measurements?|sizes?)|\bbody\b(?!\s*(?:length|width|len))|körper|to fit|koerperma|your measurements|deine ma(?:ss|ß)e|ihre ma(?:ss|ß)e/i.test(caption)
    && !/garment|product measurements|kleidungsst|produktma|pit[\s-]?to[\s-]?pit|\bhps\b|laid flat|flach/i.test(caption);
  // Pick the size column: a named size column, else INT, else the first column of size labels.
  let label = header.findIndex(h => SIZE_HEADER.test(h.trim()));
  if (label < 0) label = header.findIndex(h => /^INT/i.test(h.trim()));
  if (label < 0) label = header.findIndex((_, i) => rows.slice(1).filter(r => isSizeLabel(r[i] || '')).length >= Math.max(2, (rows.length - 1) * 0.6));
  if (label < 0) return [];
  const tableUnit = unitOf(caption);
  const out: ChartSize[] = [];
  for (const row of rows.slice(1)) {
    const size = (row[label] || '').trim();
    if (!size || !isSizeLabel(size)) continue;
    const entry: ChartSize = { label: size, measures: [], body: [] };
    header.forEach((h, i) => {
      if (i === label || SYSTEMS.test(h.trim()) || !row[i]) return;
      const range = numbers(row[i]);
      if (!range) return;
      const unit = unitOf(h) || tableUnit;
      const factor = (unit ?? 'cm') === 'in' ? 2.54 : 1;
      let [lo, hi] = [range[0] * factor, range[1] * factor];
      if (body) {
        const dim = bodyDim(h);
        if (dim) entry.body.push({ dim, min: round(lo), max: round(hi) });
        return;
      }
      const dim = headerDim(h);
      if (!dim) return;
      let tol = unit ? 1 : 1.5;
      if (FLAT_DIMS.includes(dim)) {
        const stated = convention(h) || convention(table.caption);
        const full = stated ? stated === 'full' : looksFull(dim, lo);
        if (!stated) tol += 0.5;
        if (full) { lo /= 2; hi /= 2; }
      }
      const mid = (lo + hi) / 2;
      if (mid < 5 || mid > 200) return;
      if (!entry.measures.some(m => m.dim === dim)) entry.measures.push({ dim, cm: round(mid), tol: round(Math.max(tol, (hi - lo) / 2)), source: 'chart' });
    });
    if (entry.measures.length || entry.body.length) {
      const existing = out.find(o => sameSize(o.label, size));
      if (existing) {
        // Repeated labels describe a range of bodies; widen it.
        for (const r of entry.body) {
          const e = existing.body.find(b => b.dim === r.dim);
          if (e) { e.min = Math.min(e.min, r.min); e.max = Math.max(e.max, r.max); } else existing.body.push(r);
        }
      } else out.push(entry);
    }
  }
  return out;
}

const FACT = /(pit[\s-]?to[\s-]?pit|achsel(?:\s*zu\s*achsel)?|brust(?:umfang|breite|weite)?|chest(?: width)?|breite|schulter(?:breite)?|shoulders?|ärmel(?:länge)?|sleeves?(?: length)?|(?:gesamt|rücken)?länge|(?:total |body |back )?length|lang|bund(?:weite)?|taille|waist|hüfte|hips?|schrittlänge|innenbeinlänge|inseam|oberschenkel|thigh|saum|hem|leibhöhe|rise)\s*(?:\([^)]{0,20}\))?\s*[:=]?\s*(?:ca\.?|ungefähr|approx\.?|~)?\s*(\d{2,3}(?:[.,]\d)?)\s*(cm|inch|in|")?/gi;

/** Measurements written in seller text: "Brust 58 cm, Länge 72 cm". */
export function parseFacts(lines: string[]): Measure[] {
  const out: Measure[] = [];
  for (const line of lines) {
    for (const m of line.matchAll(FACT)) {
      const label = m[1].toLowerCase();
      const dim = /pit|achsel/.test(label) ? 'chest' : headerDim(label);
      if (!dim || out.some(o => o.dim === dim)) continue;
      let cm = Number(m[2].replace(',', '.')) * (m[3] && /in|"/.test(m[3]) && m[3] !== 'cm' ? 2.54 : 1);
      if (FLAT_DIMS.includes(dim)) {
        const stated = convention(label) || convention(line);
        if (stated === 'full' || (!stated && looksFull(dim, cm)) || /umfang/.test(label)) cm /= 2;
      }
      if (cm < 5 || cm > 200) continue;
      out.push({ dim, cm: round(cm), tol: 1.5, source: 'seller' });
    }
  }
  return out;
}

/** Everything FORMA can read without AI, per size label. */
export function localSizes(listing: Listing): ChartSize[] {
  const sizes: ChartSize[] = [];
  for (const table of listing.tables) {
    for (const parsed of parseChart(table)) {
      const existing = sizes.find(s => sameSize(s.label, parsed.label));
      if (!existing) { sizes.push(parsed); continue; }
      for (const m of parsed.measures) if (!existing.measures.some(e => e.dim === m.dim)) existing.measures.push(m);
      for (const b of parsed.body) if (!existing.body.some(e => e.dim === b.dim)) existing.body.push(b);
    }
  }
  // A single-item listing: seller measurements describe that item.
  const offered = listing.sizes;
  if (listing.marketplace || offered.length <= 1) {
    const seller = parseFacts([listing.description, ...listing.facts]);
    if (seller.length) {
      const label = offered[0]?.label || sizes[0]?.label || 'Item';
      const existing = sizes.find(s => sameSize(s.label, label));
      if (existing) { for (const m of seller) existing.measures = [m, ...existing.measures.filter(e => e.dim !== m.dim)]; }
      else sizes.push({ label, measures: seller, body: [] });
    }
  }
  return sizes;
}

const round = (n: number) => Math.round(n * 10) / 10;
