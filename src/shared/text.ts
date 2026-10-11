const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'do', 'does', 'you', 'your',
  'please', 'what', 'which', 'this', 'that', 'be', 'at', 'as', 'if', 'any', 'by', 'from', 'it',
]);

/** Collapses whitespace and strips the decorations forms put around labels ("*", ":", "(required)"). */
export function cleanLabel(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\(\s*(required|optional)\s*\)/gi, '')
    .replace(/[*✱]+/g, '')
    .replace(/\s*:\s*$/, '')
    .trim()
    .slice(0, 300);
}

/** "firstName" / "first_name" / "applicant[first-name]" → "first name". */
export function humanize(attr: string): string {
  return attr
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-[\].]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();
}

export function tokens(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t));
}

/** Jaccard similarity of the meaningful words in two strings, 0..1. */
export function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}
