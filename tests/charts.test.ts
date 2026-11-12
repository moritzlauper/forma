import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChart, parseFacts, headerDim } from '../src/assess/charts';

const cm = (sizes: ReturnType<typeof parseChart>, label: string, dim: string) => sizes.find(s => s.label === label)?.measures.find(m => m.dim === dim)?.cm;

test('A flat garment chart is read as is', () => {
  const sizes = parseChart({ caption: 'Measurements in cm, laid flat.', rows: [['Size', 'Chest', 'Length', 'Sleeve'], ['M', '61', '68', '60'], ['L', '64', '70', '62']] });
  assert.equal(cm(sizes, 'L', 'chest'), 64);
  assert.equal(cm(sizes, 'L', 'length'), 70);
  assert.equal(cm(sizes, 'L', 'sleeve'), 62);
  assert.equal(sizes[0].measures[0].source, 'chart');
});

test('Circumferences are halved, by label or by magnitude', () => {
  assert.equal(cm(parseChart({ caption: '', rows: [['Size', 'Chest circumference (cm)'], ['L', '120'], ['XL', '126']] }), 'L', 'chest'), 60);
  assert.equal(cm(parseChart({ caption: 'cm', rows: [['Grösse', 'Brust', 'Länge'], ['L', '118'], ['XL', '124']] }), 'L', 'chest'), 59);
  assert.equal(cm(parseChart({ caption: 'cm', rows: [['Grösse', 'Brustbreite'], ['L', '59'], ['XL', '62']] }), 'L', 'chest'), 59);
});

test('Inches are converted and transposed charts are turned around', () => {
  const inches = parseChart({ caption: 'All measurements in inches', rows: [['Size', 'Pit to pit', 'Length'], ['M', '22', '28'], ['L', '23', '29']] });
  assert.equal(cm(inches, 'M', 'chest'), 55.9);
  const transposed = parseChart({ caption: 'cm', rows: [['', 'S', 'M', 'L'], ['Waist across front', '40', '42', '44'], ['Inseam', '80', '81', '82']] });
  assert.equal(cm(transposed, 'M', 'waist'), 42);
  assert.equal(cm(transposed, 'L', 'inseam'), 82);
});

test('Body charts become body ranges, never garment measurements', () => {
  const sizes = parseChart({ caption: 'Body measurements (cm)', rows: [['Size', 'Chest', 'Waist'], ['M', '96-100', '80-84'], ['L', '100-104', '84-88']] });
  const l = sizes.find(s => s.label === 'L')!;
  assert.deepEqual(l.measures, []);
  assert.deepEqual(l.body.find(b => b.dim === 'chest'), { dim: 'chest', min: 100, max: 104 });
});

test('Size systems are ignored as measurements', () => {
  const sizes = parseChart({ caption: 'cm', rows: [['INT', 'EU', 'Chest'], ['M', '48', '58'], ['L', '50', '61']] });
  assert.deepEqual(sizes.find(s => s.label === 'L')!.measures.map(m => m.dim), ['chest']);
});

test('Seller text measurements are read with their convention', () => {
  const facts = parseFacts(['Masse: Brust 58 cm, Länge 72cm, Ärmel 64 cm', 'Brustumfang 116 cm']);
  assert.deepEqual(facts.map(f => [f.dim, f.cm, f.source]), [['chest', 58, 'seller'], ['length', 72, 'seller'], ['sleeve', 64, 'seller']]);
  assert.equal(parseFacts(['Brustumfang 116 cm'])[0].cm, 58);
  assert.equal(parseFacts(['Pit to pit 24"'])[0].cm, 61);
  assert.deepEqual(parseFacts(['Bundweite 41 cm flach, Schrittlänge 82 cm']).map(f => [f.dim, f.cm]), [['waist', 41], ['inseam', 82]]);
});

test('Headers map to the specific dimension first', () => {
  assert.equal(headerDim('Ärmellänge'), 'sleeve');
  assert.equal(headerDim('Schulterbreite'), 'shoulder');
  assert.equal(headerDim('Schrittlänge'), 'inseam');
  assert.equal(headerDim('Saumweite'), 'hem');
  assert.equal(headerDim('Gesamtlänge'), 'length');
});

test('The SCRT chart: sizes across the top, pit to pit and HPS length', () => {
  const sizes = parseChart({ caption: '', rows: [['', 'XS', 'S', 'M', 'L', 'XL'], ['PIT TO PIT (CM)', '59', '60.5', '61.75', '63', '64.2'], ['BODY LENGTH HPS* (CM)', '63.5', '66', '68', '70', '72']] });
  assert.equal(cm(sizes, 'L', 'chest'), 63);
  assert.equal(cm(sizes, 'L', 'length'), 70);
  assert.equal(cm(sizes, 'XS', 'chest'), 59);
});
