import { describe, expect, it } from 'vitest';
import { byLabel, mount, scan } from './helpers';

describe('label resolution', () => {
  it('uses label[for], wrapping labels, aria and placeholders', () => {
    mount(`
      <label for="fn">First Name *</label><input id="fn" />
      <label>Email address: <input name="e" /></label>
      <span id="ph">Mobile number</span><input aria-labelledby="ph" />
      <input aria-label="LinkedIn profile" />
      <input placeholder="City" />
      <input name="current_company" />
    `);
    const labels = scan().map((f) => f.label);
    expect(labels).toEqual(['First Name', 'Email address', 'Mobile number', 'LinkedIn profile', 'City', 'current company']);
  });

  it('uses preceding text for div-based layouts', () => {
    mount(`<div class="row"><div class="lbl">Notice period</div><div><input /></div></div>`);
    expect(scan()[0]!.label).toBe('Notice period');
  });

  it('does not include select option text in the label', () => {
    mount(`<label>Country <select><option>India</option><option>USA</option></select></label>`);
    const [f] = scan();
    expect(f!.label).toBe('Country');
    expect(f!.options).toEqual(['India', 'USA']);
  });

  it('groups radios and reads the question from the legend', () => {
    mount(`
      <fieldset><legend>Will you require visa sponsorship?</legend>
        <label><input type="radio" name="spons" value="y" /> Yes</label>
        <label><input type="radio" name="spons" value="n" /> No</label>
      </fieldset>`);
    const [f] = scan();
    expect(f!.kind).toBe('radio');
    expect(f!.label).toBe('Will you require visa sponsorship?');
    expect(f!.options).toEqual(['Yes', 'No']);
  });

  it('reads a radio group question from preceding text when there is no fieldset', () => {
    mount(`
      <div><p>Are you willing to relocate?</p>
        <div><input type="radio" name="rel" id="r1" /><label for="r1">Yes</label>
        <input type="radio" name="rel" id="r2" /><label for="r2">No</label></div>
      </div>`);
    expect(scan()[0]!.label).toBe('Are you willing to relocate?');
  });

  it('skips hidden, password, submit and captcha inputs', () => {
    mount(`
      <input type="hidden" name="token" /><input type="password" /><input type="submit" />
      <textarea name="g-recaptcha-response"></textarea><input disabled placeholder="x" />
      <input placeholder="Real" />`);
    expect(scan().map((f) => f.label)).toEqual(['Real']);
  });

  it('finds fields inside open shadow roots', () => {
    mount(`<div id="host"></div>`);
    const root = document.getElementById('host')!.attachShadow({ mode: 'open' });
    root.innerHTML = `<label for="s">Last name</label><input id="s" />`;
    expect(byLabel(scan(), 'Last name').kind).toBe('text');
  });
});
