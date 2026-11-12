import { checkApplies, dimsFor, groupOf, isBottom, FLAT_DIMS } from '../core/garment';
import { compareSizes, sameSize } from '../core/sizes';
import type {
  BodyDim, Check, CheckKey, Confidence, Decision, Dim, Fit, Kind, Level, Listing, Measure, Person, Reading, Reference, SizeReading, SizeResult, Step, Verdict,
} from '../core/types';

/**
 * The verdict, computed locally and deterministically. Each size gets three
 * checks (width, length, sleeves). Each check takes the strongest available
 * basis, in this order:
 *   1. the person's feedback on this exact product
 *   2. measured comparison with garments the person wore (same garment group)
 *   3. the person's own body measurements
 *   4. body ranges published in the size chart
 *   5. the reader's judgement (AI estimate)
 */

/** Centimetres per step. A flat chest 2.5 cm wider is about one size up. */
const UNIT: Record<Dim, number> = { chest: 2.5, waist: 2, hip: 2.5, hem: 2.5, thigh: 2, shoulder: 2, sleeve: 2.5, length: 3, inseam: 2.5, rise: 1.5, foot: 0.5 };
const SLACK: Partial<Record<Dim, number>> = { foot: 0.3, rise: 0.5 };
const KEYS: CheckKey[] = ['width', 'length', 'sleeves'];
const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

const clampStep = (n: number): Step => Math.max(-2, Math.min(2, n)) as Step;
const round1 = (n: number) => Math.round(n * 10) / 10;
const minConfidence = (a: Confidence, b: Confidence): Confidence => RANK[a] <= RANK[b] ? a : b;

export function stepOf(delta: number, dim: Dim): Step {
  const slack = SLACK[dim] ?? 1;
  if (Math.abs(delta) <= slack) return 0;
  return clampStep(Math.round((delta - Math.sign(delta) * slack) / UNIT[dim]));
}

function confidenceOf(m: Measure, extraTol = 0): Confidence {
  if (m.source === 'typical' || m.source === 'photo') return 'low';
  const tol = m.tol + extraTol;
  return tol <= 2.5 ? 'high' : tol <= 5 ? 'medium' : 'low';
}

/** Which check a feedback label talks about, and in which direction. */
export function issueEffect(issue: string): { key: CheckKey; dir: -1 | 1 } | null {
  if (/sleeve.*short|ärmel.*kurz/i.test(issue)) return { key: 'sleeves', dir: -1 };
  if (/sleeve.*long|ärmel.*lang/i.test(issue)) return { key: 'sleeves', dir: 1 };
  if (/tight|small|eng|klein/i.test(issue)) return { key: 'width', dir: -1 };
  if (/wide|loose|big|large|weit|gross|groß/i.test(issue)) return { key: 'width', dir: 1 };
  if (/short|kurz/i.test(issue)) return { key: 'length', dir: -1 };
  if (/long|lang/i.test(issue)) return { key: 'length', dir: 1 };
  return null;
}

const VERDICT_STEP: Partial<Record<Verdict, Step>> = { much_too_small: -2, slightly_small: -1, right: 0, slightly_large: 1, much_too_large: 2 };

function describeDelta(delta: number, dim: Dim): string {
  const abs = Math.round(Math.abs(delta));
  const isLength = !FLAT_DIMS.includes(dim) && dim !== 'shoulder';
  if (abs < 1) return `About the same ${isLength ? 'length' : 'width'} as`;
  const word = isLength ? (delta > 0 ? 'longer' : 'shorter') : (delta > 0 ? 'wider' : 'narrower');
  return `${abs} cm ${word} than`;
}

type Context = { kind: Kind; person: Person; refs: Reference[]; order: string[] };

function measure(size: SizeReading, dim: Dim): Measure | undefined {
  return size.measures.find(m => m.dim === dim);
}

/** 1. Feedback on this product. */
function fromSameProduct(key: CheckKey, size: SizeReading, ctx: Context): Check | null {
  const same = ctx.refs.filter(r => r.sameProduct);
  for (const r of same.filter(r => sameSize(r.size, size.label))) {
    if (r.liked) return { key, step: 0, basis: 'your feedback', confidence: 'high', text: `You recorded ${r.size} as a good fit for this item.` };
    const effect = issueEffect(r.issue);
    if (effect?.key === key) return { key, step: effect.dir as Step, basis: 'your feedback', confidence: 'high', text: `You reported ${r.size} as "${r.issue.toLowerCase()}".` };
  }
  // A liked other size of the same product: one size up is roomier, one down is snugger.
  for (const r of same.filter(r => r.liked)) {
    const order = compareSizes(size.label, r.size, ctx.order);
    if (order === null || order === 0) continue;
    return { key, step: order as Step, basis: 'your feedback', confidence: 'medium', text: `${order > 0 ? 'One size larger' : 'One size smaller'} than the ${r.size} that fits you in this item.` };
  }
  return null;
}

/** 2. Measured comparison with worn garments of the same group. */
function fromGarments(key: CheckKey, size: SizeReading, ctx: Context): Check | null {
  const group = groupOf(ctx.kind);
  const others = ctx.refs.filter(r => !r.sameProduct && groupOf(r.kind) === group && r.measures.length);
  if (!others.length) return null;
  for (const dim of dimsFor(ctx.kind, key)) {
    const own = measure(size, dim);
    if (!own) continue;
    const liked = others.filter(r => r.liked).map(r => ({ r, m: r.measures.find(m => m.dim === dim) })).filter((x): x is { r: Reference; m: Measure } => !!x.m);
    const issues = others.filter(r => issueEffect(r.issue)?.key === key).map(r => ({ r, m: r.measures.find(m => m.dim === dim), effect: issueEffect(r.issue)! })).filter(x => !!x.m) as { r: Reference; m: Measure; effect: { key: CheckKey; dir: -1 | 1 } }[];
    if (!liked.length && !issues.length) continue;
    let check: Check | null = null;
    if (liked.length) {
      let weight = 0, sum = 0;
      for (const { m } of liked) { const w = 1 / (own.tol + m.tol + 0.5); weight += w; sum += (own.cm - m.cm) * w; }
      const delta = sum / weight;
      const best = liked.slice().sort((a, b) => a.m.tol - b.m.tol)[0];
      const more = liked.length > 1 ? ` (and ${liked.length - 1} more)` : '';
      const estimated = own.source === 'typical' || own.source === 'photo' ? ' This item\'s size is estimated.' : '';
      check = { key, step: stepOf(delta, dim), basis: 'your garments', confidence: confidenceOf(own, best.m.tol), text: `${describeDelta(delta, dim)} your ${best.r.name} (${best.r.size})${more}.${estimated}` };
    }
    for (const { r, m, effect } of issues) {
      const slack = SLACK[dim] ?? 1;
      const violates = effect.dir < 0 ? own.cm <= m.cm + slack : own.cm >= m.cm - slack;
      if (!violates) continue;
      const step = (effect.dir < 0 ? Math.min(check?.step ?? 0, -1) : Math.max(check?.step ?? 0, 1)) as Step;
      check = { key, step, basis: 'your garments', confidence: minConfidence(confidenceOf(own, m.tol), 'medium'), text: `${effect.dir < 0 ? 'No longer or wider' : 'No shorter or narrower'} than your ${r.name} (${r.size}), which you found ${r.issue.toLowerCase()}.` };
    }
    if (check) return check;
  }
  return null;
}

/** Comfortable room between body and garment, in cm of full circumference. */
const EASE: Record<Fit, [number, number]> = { close: [4, 10], regular: [10, 18], relaxed: [18, 28], oversized: [28, 45] };
const WAIST_EASE: Record<Fit, [number, number]> = { close: [-2, 2], regular: [0, 4], relaxed: [1, 6], oversized: [2, 8] };

function band(value: number, [lo, hi]: [number, number], below: number, above: number): Step {
  if (value < lo) return clampStep(-Math.ceil((lo - value) / below));
  if (value > hi) return clampStep(Math.ceil((value - hi) / above));
  return 0;
}

/** 3. The person's own measurements. */
function fromBody(key: CheckKey, size: SizeReading, ctx: Context): Check | null {
  const { kind, person } = ctx;
  const body = person.body;
  const mk = (step: Step, m: Measure, text: string): Check => ({ key, step, basis: 'your measurements', confidence: confidenceOf(m, 1), text });
  if (key === 'width') {
    if (isBottom(kind)) {
      const m = measure(size, 'waist');
      if (!m || !body.waist) return null;
      const ease = Math.round(m.cm * 2 - body.waist);
      return mk(band(ease, WAIST_EASE[person.fit], 3, 3), m, `Waist ${m.cm * 2} cm around, ${ease >= 0 ? ease + ' cm more' : -ease + ' cm less'} than your waist.`);
    }
    const m = measure(size, 'chest');
    if (!m || !body.chest || kind === 'shoes') return null;
    const shift = groupOf(kind) === 'outer' ? 6 : groupOf(kind) === 'sweat' ? 2 : 0;
    const [lo, hi] = EASE[person.fit];
    const ease = Math.round(m.cm * 2 - body.chest);
    return mk(band(ease, [lo + shift, hi + shift], 6, 8), m, `${ease} cm of room around your chest; for a ${person.fit} fit about ${lo + shift}–${hi + shift} cm suits you.`);
  }
  if (key === 'sleeves') {
    const m = measure(size, 'sleeve');
    if (!m || !body.arm) return null;
    const delta = Math.round(m.cm - body.arm);
    const target: [number, number] = groupOf(kind) === 'sweat' ? [0, 7] : [0, 5];
    return mk(band(delta, target, 3, 3), m, `Sleeve ${m.cm} cm against your ${body.arm} cm arm.`);
  }
  if (kind === 'shoes') {
    const m = measure(size, 'foot');
    if (!m || !body.foot) return null;
    const delta = round1(m.cm - body.foot);
    return mk(band(delta, [0.5, 1.8], 0.6, 0.6), m, `Inner length ${m.cm} cm for your ${body.foot} cm foot.`);
  }
  if (isBottom(kind) && kind !== 'shorts' && kind !== 'skirt') {
    const m = measure(size, 'inseam');
    if (!m || !body.inseam) return null;
    const delta = Math.round(m.cm - body.inseam);
    return mk(band(delta, [-3, 2], 3, 3), m, `Inseam ${m.cm} cm against your ${body.inseam} cm leg.`);
  }
  return null;
}

/** 4. Body ranges printed in the size chart. */
function fromChartBody(key: CheckKey, size: SizeReading, ctx: Context): Check | null {
  if (!size.body.length) return null;
  const { kind, person } = ctx;
  const value = (dim: BodyDim) => dim === 'height' ? person.height : dim === 'chest' ? person.body.chest : dim === 'waist' ? person.body.waist : dim === 'hip' ? person.body.hip : dim === 'inseam' ? person.body.inseam : person.body.foot;
  const dims: BodyDim[] = key === 'width' ? (isBottom(kind) ? ['waist', 'hip'] : ['chest', 'waist']) : key === 'length' ? (kind === 'shoes' ? ['foot'] : isBottom(kind) ? ['inseam', 'height'] : ['height']) : [];
  for (const dim of dims) {
    const range = size.body.find(b => b.dim === dim);
    const v = value(dim);
    if (!range || !v) continue;
    const per = dim === 'height' ? 6 : dim === 'foot' ? 0.6 : 4;
    const step: Step = v < range.min ? clampStep(Math.ceil((range.min - v) / per)) : v > range.max ? clampStep(-Math.ceil((v - range.max) / per)) : 0;
    const name = dim === 'height' ? 'height' : dim;
    return { key, step, basis: 'size chart', confidence: 'medium', text: `The size chart puts ${size.label} at ${name} ${range.min === range.max ? range.min : `${range.min}–${range.max}`} cm; yours is ${v} cm.` };
  }
  return null;
}

/** 5. The reader's judgement. */
function fromReading(key: CheckKey, size: SizeReading, ctx: Context): Check {
  const judgement = size[key];
  const step = VERDICT_STEP[judgement.verdict];
  const published = dimsFor(ctx.kind, key).some(d => { const m = measure(size, d); return m && (m.source === 'chart' || m.source === 'seller'); });
  return {
    key,
    step: step ?? null,
    basis: published ? 'size chart' : 'estimate',
    confidence: step === undefined ? 'low' : published ? 'medium' : 'low',
    text: judgement.why || (step === undefined ? 'Not enough information.' : ''),
  };
}

function checkFor(key: CheckKey, size: SizeReading, ctx: Context): Check {
  return fromSameProduct(key, size, ctx) || fromGarments(key, size, ctx) || fromBody(key, size, ctx) || fromChartBody(key, size, ctx) || fromReading(key, size, ctx);
}

export function checkScore(check: Check, kind: Kind, fit: Fit): number | null {
  const s = check.step;
  if (s === null) return null;
  if (s === 0) return 9.5;
  if (kind === 'shoes') return ({ [-2]: 1.5, [-1]: 4, 1: 6.5, 2: 2.5 } as Record<number, number>)[s];
  if (check.key === 'width') {
    const roomy = fit === 'relaxed' || fit === 'oversized';
    return ({ [-2]: 2, [-1]: fit === 'close' ? 6.5 : 5.5, 1: roomy ? 8 : fit === 'close' ? 5.5 : 7, 2: roomy ? 5 : 3 } as Record<number, number>)[s];
  }
  if (check.key === 'length') return ({ [-2]: 2, [-1]: 5, 1: 7, 2: 3.5 } as Record<number, number>)[s];
  return ({ [-2]: 2, [-1]: 5, 1: 7.5, 2: 4 } as Record<number, number>)[s];
}

const WEIGHT: Record<CheckKey, number> = { width: 3, length: 3, sleeves: 2 };

export function sizeScore(checks: Check[], kind: Kind, fit: Fit): number | null {
  const scored = checks.map(c => ({ c, s: checkScore(c, kind, fit) })).filter((x): x is { c: Check; s: number } => x.s !== null);
  if (!scored.length) return null;
  const weight = scored.reduce((sum, x) => sum + WEIGHT[x.c.key], 0);
  const average = scored.reduce((sum, x) => sum + x.s * WEIGHT[x.c.key], 0) / weight;
  // One clearly bad dimension cannot be averaged away.
  const cap = Math.min(...scored.map(x => x.s)) + 2.5;
  return round1(Math.min(average, cap));
}

const PHRASES: Record<CheckKey, Record<string, string>> = {
  width: { '-2': 'much too tight', '-1': 'a bit tight', '1': 'roomy', '2': 'much too wide' },
  length: { '-2': 'much too short', '-1': 'a bit short', '1': 'a bit long', '2': 'much too long' },
  sleeves: { '-2': 'sleeves much too short', '-1': 'sleeves a bit short', '1': 'sleeves a bit long', '2': 'sleeves much too long' },
};
const SHOE_PHRASES: Record<string, string> = { '-2': 'much too small', '-1': 'a bit small', '1': 'a bit large', '2': 'much too large' };

export function checkPhrase(check: Check, kind: Kind): string {
  if (check.step === null) return 'unknown';
  if (check.step === 0) return check.key === 'sleeves' ? 'sleeves right' : check.key === 'width' ? 'right width' : kind === 'shoes' ? 'right length' : 'right length';
  return (kind === 'shoes' && check.key === 'length' ? SHOE_PHRASES : PHRASES[check.key])[String(check.step)];
}

/** The check that hurts most, for the headline. */
function worst(checks: Check[], kind: Kind, fit: Fit): Check | undefined {
  return checks.filter(c => c.step !== null && c.step !== 0).sort((a, b) => (checkScore(a, kind, fit) ?? 10) - (checkScore(b, kind, fit) ?? 10))[0];
}

export const LEVEL_LABELS: Record<Level, string> = { confirmed: 'Your recorded fit', good: 'Good fit', ok: 'Should work', risky: 'Risky', poor: 'Poor fit', unknown: 'Not enough data' };

export function levelOf(score: number | null): Level {
  if (score === null) return 'unknown';
  return score >= 8 ? 'good' : score >= 6.5 ? 'ok' : score >= 5 ? 'risky' : 'poor';
}

export function decide(listing: Listing, reading: Reading, person: Person, refs: Reference[]): Decision {
  const kind = reading.garment.kind !== 'other' ? reading.garment.kind : listing.kind || 'other';
  const order = (listing.sizes.length ? listing.sizes.map(s => s.label) : reading.sizes.map(s => s.label));
  const ctx: Context = { kind, person, refs, order };
  const same = refs.filter(r => r.sameProduct);

  const sizes: SizeResult[] = reading.sizes.map(size => {
    const offered = listing.sizes.find(s => sameSize(s.label, size.label));
    const available = offered ? offered.available : size.available;
    const checks = KEYS.filter(k => checkApplies(kind, k)).map(k => checkFor(k, size, ctx));
    const result: SizeResult = { label: size.label, available, score: sizeScore(checks, kind, person.fit), checks, measures: size.measures };
    if (same.some(r => r.liked && sameSize(r.size, size.label))) result.confirmed = true;
    for (const r of same) {
      const effect = issueEffect(r.issue);
      if (!effect || effect.key === 'sleeves' && !checkApplies(kind, 'sleeves')) continue;
      const order = compareSizes(size.label, r.size, ctx.order);
      if (order === null) continue;
      if ((effect.dir < 0 && order <= 0) || (effect.dir > 0 && order >= 0)) result.excluded = `You found ${r.size} ${r.issue.toLowerCase()}.`;
    }
    return result;
  });

  const pickable = sizes.filter(s => !s.excluded && s.available !== false);
  const confirmed = pickable.find(s => s.confirmed);
  const steps = (s: SizeResult) => s.checks.reduce((sum, c) => sum + Math.abs(c.step ?? 0), 0);
  const ranked = pickable.filter(s => s.score !== null).sort((a, b) =>
    (b.score! - a.score!) || (Number(!!reading.pick && sameSize(b.label, reading.pick)) - Number(!!reading.pick && sameSize(a.label, reading.pick))) || (steps(a) - steps(b)));
  const best = confirmed || ranked[0] || (reading.pick ? pickable.find(s => sameSize(s.label, reading.pick!)) : undefined);

  const single = reading.sizes.length === 1;
  const level: Level = confirmed ? 'confirmed' : levelOf(best?.score ?? null);
  const recommended = best && level !== 'poor' && level !== 'unknown' ? best.label : null;
  const hurt = best ? worst(best.checks, kind, person.fit) : undefined;
  const phrase = hurt ? checkPhrase(hurt, kind) : '';
  const name = (label: string) => single ? `This ${label}` : `Size ${label}`;

  let headline: string;
  if (!best) headline = sizes.length && sizes.every(s => s.excluded || s.available === false) ? 'None of the offered sizes is left for you' : 'Not enough information to judge the fit';
  else if (level === 'confirmed') headline = `Size ${best.label}: your recorded fit`;
  else if (level === 'good') headline = `${name(best.label)} should fit you well`;
  else if (level === 'ok') headline = `${name(best.label)} should work${phrase ? `, ${phrase}` : ''}`;
  else if (level === 'risky') headline = `${name(best.label)} is a gamble${phrase ? `: ${phrase}` : ''}`;
  else if (level === 'poor') headline = single ? `This ${best.label} likely won't fit you${phrase ? `: ${phrase}` : ''}` : `No size fits you well${phrase ? `; even ${best.label} is ${phrase}` : ''}`;
  else headline = `Can't judge ${single ? 'this ' + best.label : 'the sizes'} yet`;

  const known = best?.checks.filter(c => c.step !== null) || [];
  let confidence: Confidence = known.length ? known.map(c => c.confidence).reduce(minConfidence) : 'low';
  const missing = (best?.checks.length || 0) - known.length;
  if (missing === 1) confidence = minConfidence(confidence, 'medium');
  if (missing > 1) confidence = 'low';
  if (level === 'confirmed') confidence = 'high';

  const evidence = [
    ...(best ? best.checks.filter(c => c.text).map(c => `${c.key === 'width' ? 'Width' : c.key === 'length' ? 'Length' : 'Sleeves'}: ${c.text}`) : []),
    ...reading.evidence.slice(0, 3),
  ];
  const unknowns = [...reading.unknowns];
  if (best && best.measures.length && best.measures.every(m => m.source === 'typical' || m.source === 'photo')) unknowns.unshift('No published measurements: widths and lengths are estimates for this type and size.');
  if (best && !best.measures.length && reading.reader === 'local') unknowns.unshift('No measurements could be read for this size.');

  const usedRefs = Array.from(new Set((best?.checks || []).filter(c => c.basis === 'your garments' || c.basis === 'your feedback').map(c => c.text.match(/your (.+?) \(/)?.[1]).filter((n): n is string => !!n)));

  return {
    level, size: recommended, closest: best?.label ?? null, score: best?.score ?? null, confidence, headline,
    summary: reading.summary || (best ? `Compared using ${known.map(c => c.basis).filter((b, i, a) => a.indexOf(b) === i).join(', ') || 'the information on the page'}.` : 'FORMA could not read sizes or measurements on this page.'),
    sizes, cut: reading.cut, evidence: Array.from(new Set(evidence)).slice(0, 8), unknowns: Array.from(new Set(unknowns)).slice(0, 4), kind, references: usedRefs,
  };
}
