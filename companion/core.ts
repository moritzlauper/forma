import { decide } from '../src/assess/decide';
import { localSizes } from '../src/assess/charts';
import { buildReferences, hasPersonalBasis } from '../src/assess/person';
import { localReading, mergeLocal, readerInput, READER_PROMPT, READING_SCHEMA, validateReading } from '../src/assess/reader';
import type { Feedback, GoodFit, LibraryEntry, Listing, Person, Reading } from '../src/core/types';

export type Context = { person: Person; goodFits: GoodFit[]; feedback: Feedback[]; library: LibraryEntry[] };
export { READER_PROMPT, READING_SCHEMA };

export function listingFrom(raw: any): Listing {
  if (!raw || typeof raw !== 'object' || typeof raw.url !== 'string' || typeof raw.title !== 'string') throw Error('Provide a listing with a product URL and title.');
  if (!/^https?:$/.test(new URL(raw.url).protocol)) throw Error('Use an HTTP(S) product URL.');
  if (JSON.stringify(raw).length > 150_000) throw Error('Listing is too large.');
  for (const field of ['sizes', 'tables', 'attributes', 'facts', 'breadcrumbs', 'images', 'signals']) {
    if (raw[field] !== undefined && !Array.isArray(raw[field])) throw Error(`Listing ${field} must be an array.`);
  }
  const listing: Listing = { site: new URL(raw.url).hostname, marketplace: false, brand: '', breadcrumbs: [], attributes: [], sizes: [], description: '', facts: [], tables: [], images: [], kind: null, product: true, signals: [], ...raw };
  if (listing.sizes.some(s => typeof s?.label !== 'string') || listing.tables.some(t => !Array.isArray(t?.rows) || t.rows.some(r => !Array.isArray(r) || r.some(c => typeof c !== 'string')))) throw Error('Invalid sizes or table rows.');
  return listing;
}

export function prepare(context: Context, listing: Listing) {
  const refs = buildReferences(context.goodFits, context.feedback, context.library, listing.url, listing.kind);
  if (!hasPersonalBasis(context.person, refs)) throw Error('Connect a fit profile with measurements, usual sizes or saved clothes first.');
  return { prompt: READER_PROMPT, schema: READING_SCHEMA, input: readerInput(listing, context.person, refs, 0) };
}

export function assess(context: Context, listing: Listing, raw?: unknown) {
  const refs = buildReferences(context.goodFits, context.feedback, context.library, listing.url, listing.kind);
  prepare(context, listing);
  const reading: Reading = raw === undefined ? localReading(listing) : mergeLocal({ ...validateReading(raw, listing), reader: 'ai', imagesUsed: 0 }, localSizes(listing));
  return { url: listing.url, title: listing.title, decision: decide(listing, reading, context.person, refs), reading };
}
