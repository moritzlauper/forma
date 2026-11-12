import type { Kind, Dim, CheckKey } from './types';

/**
 * Garments are only compared within a group: a hoodie that fits says a lot
 * about another hoodie and very little about a T-shirt.
 */
export type Group = 'tee' | 'sweat' | 'shirt' | 'outer' | 'pants' | 'shorts' | 'dress' | 'shoes' | 'other';

const GROUPS: Record<Kind, Group> = {
  tshirt: 'tee', top: 'tee', polo: 'tee', longsleeve: 'tee',
  hoodie: 'sweat', sweatshirt: 'sweat', knit: 'sweat',
  shirt: 'shirt',
  jacket: 'outer', coat: 'outer', vest: 'outer',
  jeans: 'pants', trousers: 'pants',
  shorts: 'shorts',
  skirt: 'dress', dress: 'dress', jumpsuit: 'dress',
  shoes: 'shoes',
  other: 'other',
};

export function groupOf(kind: Kind | null | undefined): Group {
  return kind ? GROUPS[kind] : 'other';
}

const LONG_SLEEVED: Kind[] = ['longsleeve', 'shirt', 'hoodie', 'sweatshirt', 'knit', 'jacket', 'coat'];
export const hasLongSleeves = (kind: Kind) => LONG_SLEEVED.includes(kind);
export const isBottom = (kind: Kind) => ['jeans', 'trousers', 'shorts', 'skirt'].includes(kind);

/** Measurements that decide each check, most important first. */
export function dimsFor(kind: Kind, key: CheckKey): Dim[] {
  if (kind === 'shoes') return key === 'length' ? ['foot'] : [];
  if (isBottom(kind)) {
    if (key === 'width') return kind === 'skirt' ? ['waist', 'hip'] : ['waist', 'hip', 'thigh'];
    if (key === 'length') return kind === 'skirt' || kind === 'shorts' ? ['length', 'inseam'] : ['inseam', 'length'];
    return [];
  }
  if (key === 'width') return kind === 'dress' || kind === 'jumpsuit' ? ['chest', 'waist', 'hip'] : ['chest', 'shoulder'];
  if (key === 'length') return ['length'];
  return hasLongSleeves(kind) ? ['sleeve'] : [];
}

export function checkApplies(kind: Kind, key: CheckKey): boolean {
  if (key === 'sleeves') return hasLongSleeves(kind);
  if (key === 'width') return kind !== 'shoes';
  return true;
}

/**
 * Keyword patterns in match order. The first hit wins, so specific garments
 * come before generic ones ("T-Shirt" before "Shirt", "Jeansjacke" before
 * "Jeans", "Latzhose" before "Hose"). German, English, French and Italian.
 */
const KEYWORDS: [Kind, RegExp][] = [
  ['hoodie', /\b(hood(?:ie|y|ies)s?|hooded|kapuzen\w*|zip[\s-]?hood\w*|sweat\s?à\s?capuche|felpa con cappuccio)\b/i],
  ['tshirt', /\b(t[\s-]?shirts?|tees?|tee[\s-]?shirts?|maglietta)\b/i],
  ['polo', /\b(polo(?:shirts?|hemd)?)\b/i],
  ['longsleeve', /\b(long[\s-]?sleeves?|langarm\w*|manches longues)\b/i],
  ['jacket', /\b(\w*jacken?|jackets?|blazer|sakko|parka|anorak|windbreaker|bomber|blouson|veste|giacca|overshirt|shacket)\b/i],
  ['coat', /\b(\w*mantel|mäntel|coats?|trenchcoat|manteau|cappotto)\b/i],
  ['vest', /\b(westen?|gilets?|bodywarmer)\b/i],
  ['sweatshirt', /\b(sweat(?:shirts?|er)?|crew\s?necks?|felpa)\b/i],
  ['knit', /\b(pullover|pullis?|strick\w*|knit(?:wear|ted)?|jumpers?|cardigans?|troyer|pull|maglione)\b/i],
  ['jumpsuit', /\b(jumpsuits?|overalls?|latzhosen?|playsuits?)\b/i],
  ['shorts', /\b(shorts?|bermudas?|kurze hosen?)\b/i],
  ['jeans', /\b(jeans|denim)\b/i],
  ['trousers', /\b(\w*hosen?|trousers|pants|chinos?|joggers?|leggings?|sweatpants|cargos?|pantalons?|pantaloni)\b/i],
  ['dress', /\b(\w*kleid(?:er)?|dress(?:es)?|robe|vestito)\b/i],
  ['skirt', /\b(röcke|\w+rock|skirts?|jupe|gonna)\b|^rock\b|\brock$/i],
  ['shoes', /\b(schuhe?|sneakers?|trainers|boots?|stiefel\w*|sandalen?|sandals|loafers?|chaussures|baskets|scarpe|pumps|sliders?)\b/i],
  ['shirt', /\b(hemd(?:en)?|shirts?|blusen?|blouses?|chemise|camicia)\b/i],
  ['top', /\b(tops?|tanktops?|tank tops?|trägertops?)\b(?!\s*(?:zustand|qualität|condition|preis|marke|angebot))/i],
];

/** Things listed next to clothing that have no garment fit. */
const NOT_A_GARMENT = /\b(kleiderb(?:ü|ue)gel|hangers?|schuhschrank|schuhregal|shoe ?racks?|posters?|stickers?|aufkleber|patches|schuhcreme|schnürsenkel|shoelaces|waschmittel|puppen?|dolls?|lego|playmobil|bücher|books?|dvds?|vinyl|gutscheine?|vouchers?|gift ?cards?|tassen?|mugs?)\b/i;

export function guessKind(text: string): Kind | null {
  if (!text) return null;
  for (const [kind, pattern] of KEYWORDS) if (pattern.test(text)) return kind;
  return null;
}

export function isNotGarment(title: string): boolean {
  return NOT_A_GARMENT.test(title);
}

export const KIND_LABELS: Record<Kind, string> = {
  tshirt: 'T-shirt', top: 'Top', longsleeve: 'Long-sleeve', polo: 'Polo', shirt: 'Shirt',
  hoodie: 'Hoodie', sweatshirt: 'Sweatshirt', knit: 'Knitwear', jacket: 'Jacket', coat: 'Coat',
  vest: 'Vest', jeans: 'Jeans', trousers: 'Trousers', shorts: 'Shorts', skirt: 'Skirt',
  dress: 'Dress', jumpsuit: 'Jumpsuit', shoes: 'Shoes', other: 'Garment',
};

export const DIM_LABELS: Record<Dim, string> = {
  chest: 'Chest width', waist: 'Waist width', hip: 'Hip width', hem: 'Hem width',
  shoulder: 'Shoulder width', sleeve: 'Sleeve', length: 'Length', inseam: 'Inseam',
  thigh: 'Thigh width', rise: 'Rise', foot: 'Foot length',
};

export const FLAT_DIMS: Dim[] = ['chest', 'waist', 'hip', 'hem', 'thigh'];
