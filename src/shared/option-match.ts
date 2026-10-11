import { normalize, tokenSimilarity } from './text';

const SYNONYMS: string[][] = [
  ['us', 'usa', 'united states', 'united states of america', 'america'],
  ['uk', 'united kingdom', 'great britain', 'england'],
  ['uae', 'united arab emirates'],
  ['in', 'ind', 'india'],
  ['male', 'man', 'm'],
  ['female', 'woman', 'f'],
  ['immediately', 'immediate', 'immediate joiner', '0 days', 'none'],
];

const DECLINE_PATTERN = /decline|prefer not|do not wish|don t wish|not to (say|answer|disclose)|rather not/;

function synonymGroup(v: string): string[] | undefined {
  return SYNONYMS.find((g) => g.includes(v));
}

function yesNo(v: string): 'yes' | 'no' | null {
  if (/^(yes|y|true|i am|i do|i will|i have|authorized|willing)\b/.test(v)) return 'yes';
  if (/^(no|n|false|i am not|i do not|i don t|i will not|not)\b/.test(v)) return 'no';
  return null;
}

/** Parses option text like "3-5 years", "5+ years", "Less than 2", "10 or more". */
function numericRange(option: string): [number, number] | null {
  const o = option.toLowerCase();
  let m = o.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/);
  if (m) return [Number(m[1]), Number(m[2])];
  m = o.match(/(\d+(?:\.\d+)?)\s*(?:\+|or more|and above|plus)|(?:more than|over|above|at least)\s*(\d+(?:\.\d+)?)/);
  if (m) return [Number(m[1] ?? m[2]), Infinity];
  m = o.match(/(?:less than|under|below|fewer than|up to)\s*(\d+(?:\.\d+)?)/);
  if (m) return [0, Number(m[1])];
  m = o.match(/^\D*(\d+(?:\.\d+)?)\D*$/);
  if (m) return [Number(m[1]), Number(m[1])];
  return null;
}

/**
 * Index of the option that best represents `value`, or -1.
 * Handles exact text, yes/no phrasing, synonyms, numeric ranges and fuzzy word overlap.
 */
export function bestOptionIndex(value: string, options: string[]): number {
  const v = normalize(value);
  if (!v || !options.length) return -1;
  const opts = options.map(normalize);

  const exact = opts.indexOf(v);
  if (exact >= 0) return exact;

  const group = synonymGroup(v);
  if (group) {
    const idx = opts.findIndex((o) => group.includes(o));
    if (idx >= 0) return idx;
  }

  if (DECLINE_PATTERN.test(v)) {
    const idx = opts.findIndex((o) => DECLINE_PATTERN.test(o));
    if (idx >= 0) return idx;
  }

  const yn = yesNo(v);
  if (yn) {
    const idx = opts.findIndex((o) => yesNo(o) === yn);
    if (idx >= 0) return idx;
  }

  const num = Number(value.match(/\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isNaN(num) && /^\s*\d/.test(value)) {
    const idx = options.findIndex((o) => {
      const r = numericRange(o);
      return r !== null && num >= r[0] && num <= r[1];
    });
    if (idx >= 0) return idx;
  }

  // Containment: "Bachelor's" vs "Bachelor's Degree", "India" vs "India (+91)".
  let best = -1;
  let bestScore = 0;
  opts.forEach((o, i) => {
    if (!o) return;
    let score = 0;
    if (o.length >= 2 && v.length >= 2 && (o.startsWith(v) || v.startsWith(o) || o.includes(` ${v}`) || o.includes(`${v} `))) {
      score = 0.6 + 0.4 * (Math.min(o.length, v.length) / Math.max(o.length, v.length));
    } else {
      score = tokenSimilarity(v, o);
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return bestScore >= 0.5 ? best : -1;
}

/**
 * Placeholder entries like "Select...", "-- Please choose --" or an empty-valued "Code" that aren't real answers.
 * An `<option>` without a value attribute reports its text as the value, so an empty value is a deliberate placeholder.
 */
export function isPlaceholderOption(text: string, value: string): boolean {
  const t = text.trim().toLowerCase();
  return !t || !value.trim() || /^-+\s*(select|choose|please)/.test(t) || /^(select|choose|please select)\b/.test(t);
}
