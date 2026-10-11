import { describe, expect, it } from 'vitest';
import { extractJobContext } from '../src/content/job-context';

const LONG = 'We are looking for an engineer to build delightful products. '.repeat(5);

describe('extractJobContext', () => {
  it('prefers JSON-LD JobPosting data', () => {
    document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: 'x' },
        { '@type': 'JobPosting', title: 'Frontend Engineer', hiringOrganization: { name: 'Acme' }, description: `<p>${LONG}</p><ul><li>Angular</li></ul>` },
      ],
    })}</script>`;
    document.body.innerHTML = '<h1>Something else</h1>';
    const job = extractJobContext(document)!;
    expect(job).toMatchObject({ title: 'Frontend Engineer', company: 'Acme', source: 'json-ld' });
    expect(job.description).toContain('Angular');
    expect(job.description).not.toContain('<p>');
  });

  it('falls back to job-description containers on the page', () => {
    document.head.innerHTML = '';
    document.body.innerHTML = `<h1>Backend Engineer</h1><div class="job-description">${LONG}</div>`;
    expect(extractJobContext(document)).toMatchObject({ title: 'Backend Engineer', source: 'page' });
  });

  it('returns null when the page has no job description', () => {
    document.head.innerHTML = '';
    document.body.innerHTML = '<form><input /></form>';
    expect(extractJobContext(document)).toBeNull();
  });
});
