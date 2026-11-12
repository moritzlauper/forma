/**
 * Shared data model. The pipeline has three stages, one type each:
 *   Listing  – what the content script read from the page, without judgement
 *   Reading  – garment facts and per-size judgement from the reader
 *              (the AI model, or the local table parser in "No AI" mode)
 *   Decision – the verdict FORMA computes locally from a Reading, the person's
 *              worn garments, measurements and recorded feedback
 */

export const KINDS = [
  'tshirt', 'top', 'longsleeve', 'polo', 'shirt', 'hoodie', 'sweatshirt', 'knit',
  'jacket', 'coat', 'vest', 'jeans', 'trousers', 'shorts', 'skirt', 'dress',
  'jumpsuit', 'shoes', 'other',
] as const;
export type Kind = typeof KINDS[number];

/** Garment measurements in centimetres. Widths are laid flat (half circumference). */
export const DIMS = [
  'chest', 'waist', 'hip', 'hem', 'shoulder', 'sleeve', 'length', 'inseam', 'thigh', 'rise', 'foot',
] as const;
export type Dim = typeof DIMS[number];

/** Where a number comes from. Only chart and seller are published values. */
export const SOURCES = ['chart', 'seller', 'photo', 'typical'] as const;
export type Source = typeof SOURCES[number];

export type Measure = { dim: Dim; cm: number; tol: number; source: Source };

/** Body measurements, full circumference for chest/waist/hip. */
export const BODY_DIMS = ['chest', 'waist', 'hip', 'height', 'inseam', 'foot'] as const;
export type BodyDim = typeof BODY_DIMS[number];
export type BodyRange = { dim: BodyDim; min: number; max: number };

// ---------------------------------------------------------------- Listing

export type Table = { caption: string; rows: string[][] };
export type SizeOption = { label: string; available: boolean | null; selected: boolean };
export type Attribute = { name: string; value: string };

export type Listing = {
  url: string;
  site: string;
  /** Second-hand or classifieds listing: usually one item in one size. */
  marketplace: boolean;
  title: string;
  brand: string;
  breadcrumbs: string[];
  attributes: Attribute[];
  sizes: SizeOption[];
  description: string;
  /** Page text lines that mention measurements, model details or fit. */
  facts: string[];
  tables: Table[];
  images: string[];
  /** Local keyword guess; the reader decides the final kind. */
  kind: Kind | null;
  /** Looks like one purchasable item rather than a catalogue or article. */
  product: boolean;
  signals: string[];
};

// ---------------------------------------------------------------- Reading

export const VERDICTS = [
  'much_too_small', 'slightly_small', 'right', 'slightly_large', 'much_too_large',
  'unknown', 'not_applicable',
] as const;
export type Verdict = typeof VERDICTS[number];
export type Judgement = { verdict: Verdict; why: string };

export type SizeReading = {
  label: string;
  available: boolean | null;
  measures: Measure[];
  body: BodyRange[];
  width: Judgement;
  length: Judgement;
  sleeves: Judgement;
};

export type Reading = {
  garment: {
    kind: Kind;
    cut: string;
    stretch: 'none' | 'some' | 'high' | 'unknown';
  };
  sizes: SizeReading[];
  cut: { score: number | null; reason: string };
  pick: string | null;
  summary: string;
  evidence: string[];
  unknowns: string[];
  /** Set locally: who produced the reading and with how many photos. */
  reader: 'ai' | 'local';
  imagesUsed: number;
};

// ---------------------------------------------------------------- Person

export type Fit = 'close' | 'regular' | 'relaxed' | 'oversized';

/** Stored profile. The shape stays compatible with FORMA 1.x. */
export type StoredMeasure = { value: number; uncertainty: number; locked?: boolean; estimated?: boolean };
export type Profile = {
  name: string;
  mode: 'body' | 'reference';
  category: string;
  fit: Fit;
  measures: Record<string, StoredMeasure | undefined>;
  context?: {
    height: number;
    weight: number;
    waistLabel: string;
    topSize?: string;
    shoeSizeEU?: string;
    bodyShape?: string;
    style: string;
    concerns: string[];
  };
};

export const PERSON_DIMS = ['chest', 'waist', 'hip', 'arm', 'inseam', 'foot'] as const;
export type PersonDim = typeof PERSON_DIMS[number];

/** The clean view of a profile that the reader and the decision use. */
export type Person = {
  height: number | null;
  weight: number | null;
  build: string;
  usual: { top: string; jeans: string; shoe: string };
  fit: Fit;
  style: string;
  notes: string;
  /** Only measurements the person entered, in cm, full circumference. */
  body: Partial<Record<PersonDim, number>>;
};

export type Feedback = { name: string; url?: string; size: string; value: string; note?: string };

export type GoodFit = {
  url: string;
  name: string;
  kind: Kind | null;
  size: string;
  reason: string;
  savedAt: number;
  /** Measurements of the worn size, copied when known. */
  measures?: Measure[];
  image?: string;
};

/** A garment the person has worn: a saved good fit or a fit report. */
export type Reference = {
  name: string;
  url: string;
  kind: Kind | null;
  size: string;
  liked: boolean;
  /** Quick label of a fit report, e.g. "Too short". Empty for liked garments. */
  issue: string;
  note: string;
  measures: Measure[];
  sameProduct: boolean;
};

/** Measurements FORMA has seen for a product, kept so feedback can use them later. */
export type LibraryEntry = {
  url: string;
  name: string;
  kind: Kind;
  at: number;
  image?: string;
  sizes: { label: string; measures: Measure[] }[];
};

// ---------------------------------------------------------------- Decision

export type CheckKey = 'width' | 'length' | 'sleeves';
export type Step = -2 | -1 | 0 | 1 | 2;
export type Confidence = 'high' | 'medium' | 'low';
export type Basis = 'your feedback' | 'your garments' | 'your measurements' | 'size chart' | 'estimate';

export type Check = {
  key: CheckKey;
  /** Negative: tight or short. Positive: loose or long. null: not established. */
  step: Step | null;
  basis: Basis;
  text: string;
  confidence: Confidence;
};

export type SizeResult = {
  label: string;
  available: boolean | null;
  score: number | null;
  checks: Check[];
  measures: Measure[];
  excluded?: string;
  confirmed?: boolean;
};

export type Level = 'confirmed' | 'good' | 'ok' | 'risky' | 'poor' | 'unknown';

export type Decision = {
  level: Level;
  size: string | null;
  /** Best candidate even when FORMA does not recommend it. */
  closest: string | null;
  score: number | null;
  confidence: Confidence;
  headline: string;
  summary: string;
  sizes: SizeResult[];
  cut: { score: number | null; reason: string };
  evidence: string[];
  unknowns: string[];
  kind: Kind;
  references: string[];
};

// ---------------------------------------------------------------- Page state

export type PageStatus = 'other' | 'reading' | 'assessing' | 'ready' | 'blocked' | 'error';

export type PageState = {
  url: string;
  identity: string;
  title: string;
  status: PageStatus;
  at: number;
  manual?: boolean;
  listing?: Listing;
  reading?: Reading;
  decision?: Decision;
  model?: string;
  cached?: boolean;
  message?: string;
  code?: 'profile' | 'key' | 'permission' | 'limit' | 'paused';
};
