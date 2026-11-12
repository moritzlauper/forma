import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, sizeScore, stepOf } from '../src/assess/decide';
import type { Judgement, Listing, Measure, Person, Reading, Reference, SizeReading } from '../src/core/types';

const person = (over: Partial<Person> = {}): Person => ({ height: 183, weight: 80, build: '', usual: { top: 'L', jeans: '', shoe: '' }, fit: 'relaxed', style: '', notes: '', body: {}, ...over });
const j = (verdict: Judgement['verdict'] = 'right', why = 'AI judgement.'): Judgement => ({ verdict, why });
const m = (dim: Measure['dim'], cm: number, source: Measure['source'] = 'chart', tol = 1): Measure => ({ dim, cm, tol, source });
const size = (label: string, measures: Measure[], verdicts: Partial<Record<'width' | 'length' | 'sleeves', Judgement>> = {}): SizeReading =>
  ({ label, available: true, measures, body: [], width: verdicts.width || j(), length: verdicts.length || j(), sleeves: verdicts.sleeves || j() });
const reading = (sizes: SizeReading[], kind: Reading['garment']['kind'] = 'hoodie', pick: string | null = null): Reading =>
  ({ garment: { kind, cut: 'boxy', stretch: 'some' }, sizes, cut: { score: 7, reason: 'Boxy suits a relaxed style.' }, pick, summary: 'AI summary.', evidence: [], unknowns: [], reader: 'ai', imagesUsed: 1 });
const listing = (labels: string[], over: Partial<Listing> = {}): Listing => ({ url: 'https://shop.test/products/hoodie', site: 'shop.test', marketplace: false, title: 'Hoodie', brand: '', breadcrumbs: [], attributes: [], sizes: labels.map(label => ({ label, available: true, selected: false })), description: '', facts: [], tables: [], images: [], kind: 'hoodie', product: true, signals: [], ...over });
const ref = (over: Partial<Reference>): Reference => ({ name: 'Carhartt Hoodie', url: 'https://other.test/products/c', kind: 'hoodie', size: 'L', liked: true, issue: '', note: '', measures: [], sameProduct: false, ...over });

test('Steps grow with the difference, small differences are the same', () => {
  assert.equal(stepOf(0.8, 'chest'), 0);
  assert.equal(stepOf(3.5, 'chest'), 1);
  assert.equal(stepOf(-4, 'length'), -1);
  assert.equal(stepOf(-12, 'length'), -2);
});

test('A marketplace hoodie is compared with a hoodie that fits, using estimated measurements', () => {
  const liked = ref({ measures: [m('chest', 61), m('length', 70), m('sleeve', 63)] });
  const d = decide(listing(['XL'], { marketplace: true }), reading([size('XL', [m('chest', 62, 'typical', 3), m('length', 65, 'typical', 3), m('sleeve', 63, 'typical', 3)])]), person(), [liked]);
  const xl = d.sizes[0];
  assert.deepEqual(xl.checks.map(c => [c.key, c.step, c.basis]), [['width', 0, 'your garments'], ['length', -1, 'your garments'], ['sleeves', 0, 'your garments']]);
  assert.match(xl.checks[1].text, /5 cm shorter than your Carhartt Hoodie \(L\)/);
  assert.equal(xl.checks[1].confidence, 'low', 'typical estimates never give high confidence');
  assert.equal(d.closest, 'XL');
  assert.match(d.headline, /^This XL/);
  assert.match(d.headline, /a bit short/);
  assert.ok(d.unknowns[0].startsWith('No published measurements'));
});

test('Feedback on this product excludes the tried size and smaller ones', () => {
  const tooTight = ref({ sameProduct: true, url: 'https://shop.test/products/hoodie', size: 'M', liked: false, issue: 'Too tight' });
  const d = decide(listing(['S', 'M', 'L', 'XL']), reading(['S', 'M', 'L', 'XL'].map(l => size(l, []))), person(), [tooTight]);
  assert.deepEqual(d.sizes.filter(s => s.excluded).map(s => s.label), ['S', 'M']);
  assert.ok(['L', 'XL'].includes(d.size!));
});

test('A size recorded as fitting this item is confirmed', () => {
  const fits = ref({ sameProduct: true, url: 'https://shop.test/products/hoodie', size: 'L' });
  const d = decide(listing(['M', 'L', 'XL']), reading(['M', 'L', 'XL'].map(l => size(l, [], { length: j('slightly_small') }))), person(), [fits]);
  assert.equal(d.level, 'confirmed');
  assert.equal(d.size, 'L');
  assert.equal(d.sizes.find(s => s.label === 'XL')!.checks[0].step, 1, 'one size up from a confirmed fit is roomier');
});

test('Body measurements set the room around the chest', () => {
  const d = decide(listing(['M', 'L']), reading([size('M', [m('chest', 55)]), size('L', [m('chest', 59)])], 'tshirt'), person({ fit: 'regular', body: { chest: 100 } }), []);
  const [mSize, lSize] = d.sizes;
  assert.equal(mSize.checks[0].step, 0, '10 cm of room is regular');
  assert.equal(lSize.checks[0].step, 0, '18 cm of room is still regular');
  assert.equal(mSize.checks[0].basis, 'your measurements');
});

test('Without any basis the AI judgement is used with low confidence', () => {
  const d = decide(listing(['M']), reading([size('M', [], { width: j('right'), length: j('right'), sleeves: j('unknown') })]), person(), []);
  assert.equal(d.sizes[0].checks[0].basis, 'estimate');
  assert.equal(d.confidence, 'low');
});

test('When every size is clearly wrong, FORMA recommends none', () => {
  const tooSmall = { width: j('much_too_small'), length: j('slightly_small') };
  const d = decide(listing(['XS', 'S']), reading([size('XS', [], tooSmall), size('S', [], tooSmall)]), person(), []);
  assert.equal(d.level, 'poor');
  assert.equal(d.size, null);
  assert.match(d.headline, /No size fits you well/);
});

test('One bad dimension cannot be averaged away', () => {
  const checks = [{ key: 'width', step: 0, basis: 'estimate', text: '', confidence: 'low' }, { key: 'length', step: -2, basis: 'estimate', text: '', confidence: 'low' }, { key: 'sleeves', step: 0, basis: 'estimate', text: '', confidence: 'low' }] as const;
  assert.equal(sizeScore([...checks], 'hoodie', 'regular'), 4.5);
});

test('Sold-out sizes are shown but not picked', () => {
  const l = listing(['M', 'L']); l.sizes[1].available = false;
  const d = decide(l, reading([size('M', [], { width: j('slightly_small') }), size('L', [])]), person(), []);
  assert.equal(d.size, 'M');
  assert.equal(d.sizes.find(s => s.label === 'L')!.available, false);
});

test('A garment reported too short elsewhere sets a lower bound for length', () => {
  const short = ref({ liked: false, issue: 'Too short', measures: [m('length', 68)] });
  const d = decide(listing(['L']), reading([size('L', [m('length', 67)])]), person(), [short]);
  assert.equal(d.sizes[0].checks[1].step, -1);
  assert.match(d.sizes[0].checks[1].text, /which you found too short/);
});
