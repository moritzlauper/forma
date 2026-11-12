import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localReading, mergeLocal, READING_SCHEMA, readerInput, validateReading } from '../src/assess/reader';
import { buildReferences, normaliseGoodFits, normaliseLibrary, toPerson } from '../src/assess/person';
import { localSizes } from '../src/assess/charts';
import type { Listing } from '../src/core/types';

const listing: Listing = {
  url: 'https://shop.test/products/hoodie', site: 'shop.test', marketplace: false, title: 'Heavy Box Hoodie', brand: 'Northcut', breadcrumbs: [], attributes: [],
  sizes: [{ label: 'M', available: true, selected: false }, { label: 'L', available: false, selected: false }],
  description: 'Boxy.', facts: [], tables: [{ caption: 'cm, laid flat', rows: [['Size', 'Chest', 'Length'], ['M', '61', '68'], ['L', '64', '70']] }], images: [], kind: 'hoodie', product: true, signals: [],
};

test('The provider schema uses no unsupported numeric constraints', () => {
  assert.doesNotMatch(JSON.stringify(READING_SCHEMA), /minimum|maximum|minLength|minItems/);
});

test('AI readings are repaired where harmless and keep shop availability', () => {
  const raw = {
    garment: { kind: 'hoodie', cut: 'boxy', stretch: 'weird' },
    sizes: [
      { label: 'm', available: true, measures: [{ dim: 'chest', cm: 60, tol: 2, source: 'chart' }, { dim: 'nose', cm: 3, tol: 1, source: 'chart' }], body: [], width: { verdict: 'right', why: 'ok' }, length: { verdict: 'nonsense', why: '' }, sleeves: { verdict: 'right', why: '' } },
      { label: 'L', available: true, measures: [], body: [], width: { verdict: 'slightly_large', why: '' }, length: { verdict: 'right', why: '' }, sleeves: { verdict: 'right', why: '' } },
      { label: 'L', available: true, measures: [], body: [], width: {}, length: {}, sleeves: {} },
    ],
    cut: { score: 14, reason: 'Fine.' }, pick: 'XXL', summary: 'Try M.', evidence: ['a', 'b'], unknowns: [],
  };
  const r = validateReading(raw, listing);
  assert.deepEqual(r.sizes.map(s => s.label), ['M', 'L'], 'labels follow the shop, duplicates dropped');
  assert.equal(r.sizes[1].available, false, 'availability comes from the page');
  assert.deepEqual(r.sizes[0].measures.map(x => x.dim), ['chest']);
  assert.equal(r.sizes[0].length.verdict, 'unknown');
  assert.equal(r.garment.stretch, 'unknown');
  assert.equal(r.cut.score, 10);
  assert.equal(r.pick, null, 'a size that is not offered is never picked');
  assert.throws(() => validateReading({ nope: true }, listing), /unexpected shape/);
});

test('Locally parsed chart values override the model numbers', () => {
  const ai = { ...validateReading({ garment: { kind: 'hoodie', cut: '', stretch: 'none' }, sizes: [{ label: 'M', available: true, measures: [{ dim: 'chest', cm: 58, tol: 1, source: 'chart' }, { dim: 'sleeve', cm: 60, tol: 3, source: 'typical' }], body: [], width: {}, length: {}, sleeves: {} }], cut: { score: null, reason: '' }, pick: 'M', summary: '', evidence: [], unknowns: [] }, listing), reader: 'ai' as const, imagesUsed: 0 };
  const merged = mergeLocal(ai, localSizes(listing));
  const mSize = merged.sizes[0].measures;
  assert.equal(mSize.find(x => x.dim === 'chest')!.cm, 61);
  assert.equal(mSize.find(x => x.dim === 'length')!.cm, 68);
  assert.equal(mSize.find(x => x.dim === 'sleeve')!.source, 'typical');
});

test('No-AI mode reads only what the page states', () => {
  const r = localReading(listing);
  assert.equal(r.reader, 'local');
  assert.deepEqual(r.sizes.map(s => [s.label, s.measures.length]), [['M', 2], ['L', 2]]);
  assert.equal(r.sizes[0].width.verdict, 'unknown');
});

test('The AI input carries the person and worn garments but no URLs of them', () => {
  const p = toPerson({ name: 'Moritz', mode: 'body', category: 'top', fit: 'relaxed', measures: { chest: { value: 104, uncertainty: 1 }, waist: { value: 90, uncertainty: 14, estimated: true }, sleeve: { value: 64, uncertainty: 1 } }, context: { height: 183, weight: 82, waistLabel: 'W33', topSize: 'L', style: '', concerns: ['Sleeves often too short'] } }, 'Hoodies must cover the belt.');
  assert.deepEqual(p.body, { chest: 104, arm: 64 }, 'estimates are dropped; the 1.x sleeve value is the arm');
  assert.match(p.notes, /Sleeves often too short/);
  const refs = buildReferences(normaliseGoodFits([{ url: 'https://a.test/products/h', name: 'Carhartt Hoodie', size: 'L', reason: 'Perfect length', savedAt: 1 }]), [], [], listing.url, 'hoodie');
  const input = readerInput(listing, p, refs, 2);
  assert.equal(input.listing.photos, 2);
  assert.equal(input.wornGarments[0].verdict, 'fits well');
  assert.doesNotMatch(JSON.stringify(input), /a\.test|Moritz/);
});

test('1.x saved fits and scans keep their measurements', () => {
  const [fit] = normaliseGoodFits([{ url: 'https://a.test/products/h', name: 'Old Hoodie', size: 'L', reason: '', savedAt: 1, category: 'top', product: { measurementType: 'garment', unit: 'cm', flat: false, sizes: [{ label: 'L', measures: { chest: 122, length: 71 } }] } }]);
  assert.equal(fit.kind, 'hoodie');
  assert.deepEqual(fit.measures!.map(x => [x.dim, x.cm]), [['chest', 61], ['length', 71]]);
  const library = normaliseLibrary([], [{ url: 'https://b.test/products/t?x=1', name: 'Tee', observedAt: 2, measurements: [{ size: 'M', key: 'chest', cm: [110, 110], subject: 'garment' }, { size: 'M', key: 'chest', cm: [96, 100], subject: 'body' }] }]);
  assert.deepEqual(library[0].sizes[0].measures.map(x => [x.dim, x.cm]), [['chest', 55]]);
});

test('Only garments of the same group are references, the same product always', () => {
  const refs = buildReferences(
    normaliseGoodFits([{ url: 'https://a.test/products/t', name: 'Basic T-Shirt', size: 'L', reason: '', savedAt: 1 }, { url: 'https://a.test/products/k', name: 'Wool Pullover', size: 'L', reason: '', savedAt: 1 }]),
    [{ name: 'Heavy Box Hoodie', url: 'https://shop.test/products/hoodie?utm=1', size: 'M', value: 'Too short' }], [], listing.url, 'hoodie');
  assert.deepEqual(refs.map(r => [r.name, r.sameProduct]), [['Wool Pullover', false], ['Heavy Box Hoodie', true]]);
});
