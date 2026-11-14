import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess, listingFrom, prepare } from '../companion/core';
import { decide } from '../src/assess/decide';
import { localReading } from '../src/assess/reader';
import { toPerson } from '../src/assess/person';
import { providerOf } from '../src/core/settings';

const context = { person: toPerson({ name: 'Private name', mode: 'body', category: 'top', fit: 'regular', measures: { chest: { value: 100, uncertainty: 1 } }, context: { height: 180, weight: 75, waistLabel: '', topSize: 'M', bodyShape: '', style: '', concerns: [] } }), goodFits: [], feedback: [], library: [] };
const listing = listingFrom({ url: 'https://shop.test/jacket', title: 'Jacket', kind: 'jacket', sizes: [{ label: 'M', available: true }, { label: 'L', available: false }], tables: [{ caption: 'cm garment flat', rows: [['Size', 'Chest', 'Length', 'Sleeve'], ['M', '56', '67', '64'], ['L', '59', '70', '66']] }], facts: [] });

test('assistant uses the exact extension decision engine and chart measurements', () => {
  assert.deepEqual(assess(context, listing).decision, decide(listing, localReading(listing), context.person, []));
  const raw = localReading(listing);
  raw.sizes[0].measures[0].cm = 80;
  raw.sizes[1].available = true;
  const result = assess(context, listing, raw);
  assert.equal(result.reading.sizes[0].measures.find(m => m.dim === 'chest')?.cm, 56);
  assert.equal(result.decision.sizes.find(s => s.label === 'L')?.available, false);
});
test('assistant input has no profile label and has no fabricated photos', () => {
  const request = prepare(context, listing);
  assert.equal(request.input.listing.photos, 0);
  assert.doesNotMatch(JSON.stringify(request), /Private name/);
});
test('reject broken listings and missing profile basis', () => {
  assert.throws(() => listingFrom({ url: 'file:///etc/passwd', title: 'x' }), /HTTP/);
  assert.throws(() => listingFrom({ url: 'https://shop.test', title: 'x', tables: [{}] }), /Invalid/);
  assert.throws(() => prepare({ ...context, person: toPerson(null) }, listing), /profile/);
});
test('local CLI providers survive stored settings without inheriting API model IDs', () => {
  assert.deepEqual(providerOf({ mode: 'codex', model: 'claude-haiku-5-5' }), { mode: 'codex', model: '' });
  assert.deepEqual(providerOf({ mode: 'claude' }), { mode: 'claude', model: '' });
});

test('assistant cannot invent an extra offered size', () => {
  const raw = localReading(listing);
  raw.sizes.push({ ...raw.sizes[0], label: 'XXL' });
  assert.deepEqual(assess(context, listing, raw).reading.sizes.map(s => s.label), ['M', 'L']);
});
