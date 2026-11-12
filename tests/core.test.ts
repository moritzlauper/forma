import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSize, compareSizes, isSizeLabel, sameSize, sizeFromTitle } from '../src/core/sizes';
import { guessKind, groupOf } from '../src/core/garment';
import { productIdentity, stableText } from '../src/core/identity';

test('Size labels are recognised and normalised', () => {
  for (const label of ['S', 'XL', '2XL', 'XXL', '42', '44.5', 'W32 L34', '32/34', 'S/M', 'One Size', 'EU 42']) assert.ok(isSizeLabel(label), label);
  for (const label of ['Add to cart', 'CHF 35', '35.00', 'Small print', '2026']) assert.ok(!isSizeLabel(label), label);
  assert.equal(canonicalSize('2xl'), 'XXL');
  assert.equal(canonicalSize('W32 L34'), '32/34');
  assert.ok(sameSize('32 x 34', 'W32/L34'));
});

test('Sizes are ordered within their own scale', () => {
  assert.equal(compareSizes('M', 'L'), -1);
  assert.equal(compareSizes('XXL', 'XL'), 1);
  assert.equal(compareSizes('32/34', '33/34'), -1);
  assert.equal(compareSizes('M', '42'), null);
  assert.equal(compareSizes('Regular', 'Long', ['Short', 'Regular', 'Long']), -1);
});

test('A size is found in a listing title', () => {
  assert.equal(sizeFromTitle('WRSTBHVR Hoodie XL'), 'XL');
  assert.equal(sizeFromTitle('Levi\'s 501 W32 L34 blau'), '32/34');
  assert.equal(sizeFromTitle('Wintermantel Grösse M, wie neu'), 'M');
  assert.equal(sizeFromTitle('Hoodie schwarz'), null);
});

test('Garment kinds come from German and English names', () => {
  const cases: [string, string | null][] = [
    ['WRSTBHVR Kapuzenpulli', 'hoodie'], ['Heavy Box Hoodie', 'hoodie'], ['Basic T-Shirt weiss', 'tshirt'],
    ['Jeansjacke Levis', 'jacket'], ['Levi\'s 501 Jeans', 'jeans'], ['Latzhose Dickies', 'jumpsuit'],
    ['Cargohose', 'trousers'], ['Sommerkleid', 'dress'], ['Strickpullover Wolle', 'knit'],
    ['Nike Air Max Sneaker', 'shoes'], ['Oxford Hemd', 'shirt'], ['Sweatshirt Crewneck', 'sweatshirt'],
    ['Top Zustand Lampe', null], ['Kleidung & Accessoires', null],
  ];
  for (const [text, kind] of cases) assert.equal(guessKind(text), kind, text);
  assert.equal(groupOf('hoodie'), groupOf('knit'));
  assert.notEqual(groupOf('hoodie'), groupOf('tshirt'));
});

test('Identity ignores tracking and collection paths, countdowns are removed', () => {
  assert.equal(productIdentity('https://shop.test/collections/new/products/hoodie?utm_source=x&variant=4'), 'https://shop.test/products/hoodie');
  assert.equal(productIdentity('https://www.ricardo.ch/de/a/hoodie-1/'), 'https://www.ricardo.ch/de/a/hoodie-1');
  assert.equal(stableText('Endet in 22 Min 53 Sek | 12. Nov. 2026, 10:43 Uhr'), '| 12. Nov. 2026,');
  assert.equal(stableText('Model 1.85 m wears M'), 'Model 1.85 m wears M');
});
