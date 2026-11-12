/** Size labels: recognising, comparing and ordering them. */

const ALPHA = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL', 'XXXXXL'];
const SYSTEM = /^(?:SIZE|GR\.|GR|GRÖSSE|GROESSE|GRÖẞE|TAILLE|EU|EUR|INT|DE|IT|FR|UK|US)\s*:?\s+/;

/** Canonical form used for comparisons: "2xl" → "XXL", "W32 L34" → "32/34". */
export function canonicalSize(label: string): string {
  let s = label.trim().toUpperCase().replace(/\s+/g, ' ').replace(SYSTEM, '');
  const multi = s.match(/^([2-6])\s?X\s?([SL])$/);
  if (multi) s = 'X'.repeat(Number(multi[1])) + multi[2];
  const pair = s.match(/^W?\s?(\d{2})\s?(?:[X×/]|\s)\s?L?\s?(\d{2})$/);
  if (pair) s = `${pair[1]}/${pair[2]}`;
  const waist = s.match(/^W\s?(\d{2})$/);
  if (waist) s = waist[1];
  return s.replace(',', '.');
}

export const sameSize = (a: string, b: string) => canonicalSize(a) === canonicalSize(b);

const TOKEN = /^(?:X{0,5}[SL]|M|[2-6]\s?X\s?[SL]|\d{2,3}(?:[.,]5)?|W\s?\d{2}(?:\s?[X×/]?\s?L\s?\d{2})?|\d{2}\s?[X×/]\s?\d{2}|(?:X{0,4}[SL]|M)\s?[/-]\s?(?:X{0,4}[SL]|M)|ONE ?SIZE|OS|UNI|EINHEITSGR(?:Ö|OE)SSE)$/;

/** Does this text look like a single size label? Shop UI text is noisy. */
export function isSizeLabel(text: string): boolean {
  const s = text.trim().toUpperCase().replace(/\s+/g, ' ').replace(SYSTEM, '');
  return !!s && s.length <= 14 && TOKEN.test(s);
}

/** Position of a size on its own scale. Letter and number scales never mix. */
export function sizeRank(label: string): { scale: 'alpha' | 'number'; value: number } | null {
  const s = canonicalSize(label);
  const alpha = ALPHA.indexOf(s);
  if (alpha >= 0) return { scale: 'alpha', value: alpha };
  const range = s.match(/^(X{0,4}[SL]|M)\s?[-/]\s?(X{0,4}[SL]|M)$/);
  if (range && ALPHA.includes(range[1]) && ALPHA.includes(range[2])) {
    return { scale: 'alpha', value: (ALPHA.indexOf(range[1]) + ALPHA.indexOf(range[2])) / 2 };
  }
  const pair = s.match(/^(\d{2})\/(\d{2})$/);
  if (pair) return { scale: 'number', value: Number(pair[1]) + Number(pair[2]) / 100 };
  const number = s.match(/^(\d{2,3}(?:\.\d)?)$/);
  return number ? { scale: 'number', value: Number(number[1]) } : null;
}

/**
 * -1 when a is smaller than b, 1 when larger, 0 when equal, null when the
 * labels cannot be ordered. `order` is the list as published; shops list
 * sizes in ascending order, so it is a fallback for unusual labels.
 */
export function compareSizes(a: string, b: string, order: string[] = []): -1 | 0 | 1 | null {
  if (sameSize(a, b)) return 0;
  const ra = sizeRank(a), rb = sizeRank(b);
  if (ra && rb && ra.scale === rb.scale && ra.value !== rb.value) return ra.value < rb.value ? -1 : 1;
  const ia = order.findIndex(s => sameSize(s, a)), ib = order.findIndex(s => sameSize(s, b));
  if (ia >= 0 && ib >= 0 && ia !== ib) return ia < ib ? -1 : 1;
  return null;
}

/** A size named in a listing title: "Hoodie XL", "Jeans W32 L34", "Gr. 42". */
export function sizeFromTitle(title: string): string | null {
  const labelled = title.match(/\b(?:gr(?:ö|oe)sse|größe|gr\.|size|taille)\s*:?\s*([A-Za-z0-9/.]{1,8})/i);
  if (labelled && isSizeLabel(labelled[1])) return labelled[1].toUpperCase();
  const jeans = title.match(/\bW\s?(\d{2})\s?[/x×]?\s?L\s?(\d{2})\b/i);
  if (jeans) return `${jeans[1]}/${jeans[2]}`;
  const tokens = title.split(/[\s,;|()]+/).filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (/^(?:X{1,4}[SL]|[SML]|[2-5]XL)$/.test(tokens[i])) return tokens[i];
  }
  return null;
}
