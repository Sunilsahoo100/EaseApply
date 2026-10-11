import type { JobContext } from '../shared/types';

const MAX_DESCRIPTION = 8000;
const MIN_DESCRIPTION = 150;

// Common containers on job boards and ATS pages (Greenhouse, Lever, Workday, Ashby, LinkedIn, Indeed).
const DESCRIPTION_SELECTORS = [
  '[data-automation-id="jobPostingDescription"]',
  '#job-details',
  '#jobDescriptionText',
  '.jobs-description__content',
  '[class*="job-description" i]',
  '[id*="job-description" i]',
  '[class*="jobdescription" i]',
  '[id*="jobdescription" i]',
  '[class*="posting-description" i]',
  '.section-wrapper.page-full-width',
  '#content .job__description',
  '[class*="description" i]',
  'article',
  'main',
];

function squash(text: string): string {
  return text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n').trim();
}

function textOf(el: Element): string {
  const html = el as HTMLElement;
  return squash((typeof html.innerText === 'string' ? html.innerText : html.textContent) ?? '');
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('br, p, li, div, h1, h2, h3, h4').forEach((n) => n.append('\n'));
  return squash(doc.body.textContent ?? '');
}

interface JsonLdPosting {
  '@type'?: string | string[];
  title?: string;
  description?: string;
  hiringOrganization?: { name?: string } | string;
  '@graph'?: unknown[];
}

function findPosting(node: unknown): JsonLdPosting | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findPosting(item);
      if (found) return found;
    }
    return null;
  }
  const obj = node as JsonLdPosting;
  const type = obj['@type'];
  if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) return obj;
  return obj['@graph'] ? findPosting(obj['@graph']) : null;
}

function fromJsonLd(doc: Document): JobContext | null {
  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const posting = findPosting(JSON.parse(script.textContent ?? ''));
      if (!posting?.description) continue;
      const org = posting.hiringOrganization;
      return {
        title: posting.title ?? '',
        company: typeof org === 'string' ? org : org?.name ?? '',
        description: htmlToText(posting.description).slice(0, MAX_DESCRIPTION),
        url: doc.location?.href ?? '',
        source: 'json-ld',
      };
    } catch {
      // Malformed JSON-LD is common; ignore it.
    }
  }
  return null;
}

function meta(doc: Document, name: string): string {
  return doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content')?.trim() ?? '';
}

function fromPage(doc: Document): JobContext | null {
  let description = '';
  for (const selector of DESCRIPTION_SELECTORS) {
    const candidates = Array.from(doc.querySelectorAll(selector)).map(textOf);
    const longest = candidates.sort((a, b) => b.length - a.length)[0] ?? '';
    if (longest.length >= MIN_DESCRIPTION) {
      description = longest;
      break;
    }
  }
  if (description.length < MIN_DESCRIPTION) return null;
  const h1 = doc.querySelector('h1');
  return {
    title: (h1 ? textOf(h1) : '') || meta(doc, 'og:title') || doc.title,
    company: meta(doc, 'og:site_name'),
    description: description.slice(0, MAX_DESCRIPTION),
    url: doc.location?.href ?? '',
    source: 'page',
  };
}

/** Title, company and description of the job on this page, or null if this frame doesn't show one. */
export function extractJobContext(doc: Document = document): JobContext | null {
  return fromJsonLd(doc) ?? fromPage(doc);
}
