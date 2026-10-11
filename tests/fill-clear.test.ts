import { describe, expect, it, vi } from 'vitest';
import { clearFilled, fillAndRecord } from '../src/content/fill-registry';
import { byLabel, mount, scan } from './helpers';

const opts = { highlight: true };

describe('fill and clear', () => {
  it('fills text, select, radio and checkbox fields and fires input/change events', () => {
    mount(`
      <label for="n">Name</label><input id="n" />
      <label for="c">Country</label><select id="c"><option value="">--</option><option value="in">India</option><option value="us">USA</option></select>
      <fieldset><legend>Relocate?</legend>
        <label><input type="radio" name="r" value="y" />Yes</label><label><input type="radio" name="r" value="n" />No</label>
      </fieldset>
      <label><input type="checkbox" name="remote" /> Open to remote work</label>
      <label for="exp">Years</label><input id="exp" type="number" />`);
    const fields = scan();
    const name = byLabel(fields, 'Name');
    const onInput = vi.fn();
    name.el.addEventListener('input', onInput);

    expect(fillAndRecord(name, 'Asha Rao', 'profile', opts)).toBe('Asha Rao');
    expect((name.el as HTMLInputElement).value).toBe('Asha Rao');
    expect(onInput).toHaveBeenCalled();
    expect(name.el.style.outline).toContain('solid');

    expect(fillAndRecord(byLabel(fields, 'Country'), 'India', 'profile', opts)).toBe('India');
    expect((document.getElementById('c') as HTMLSelectElement).value).toBe('in');

    expect(fillAndRecord(byLabel(fields, 'Relocate?'), 'No', 'ai', opts)).toBe('No');
    expect((document.querySelector('input[value="n"]') as HTMLInputElement).checked).toBe(true);

    fillAndRecord(byLabel(fields, 'Open to remote work'), 'Yes', 'ai', opts);
    expect((document.querySelector('input[name="remote"]') as HTMLInputElement).checked).toBe(true);

    expect(fillAndRecord(byLabel(fields, 'Years'), '6 years', 'profile', opts)).toBe('6');
  });

  it('returns null when a select has no matching option', () => {
    mount(`<label for="c">Color</label><select id="c"><option>Red</option></select>`);
    expect(fillAndRecord(scan()[0]!, 'Blue', 'ai', opts)).toBeNull();
  });

  it('respects maxlength', () => {
    mount(`<label for="t">Short</label><input id="t" maxlength="5" />`);
    expect(fillAndRecord(scan()[0]!, 'abcdefgh', 'ai', opts)).toBe('abcde');
  });

  it('clear restores the original values and styles of only the filled fields', () => {
    mount(`
      <label for="a">A</label><input id="a" value="typed by user" />
      <label for="b">B</label><input id="b" />
      <label for="u">Untouched</label><input id="u" value="keep me" />
      <fieldset><legend>Q</legend>
        <label><input type="radio" name="q" value="1" checked />One</label><label><input type="radio" name="q" value="2" />Two</label>
      </fieldset>`);
    const fields = scan();
    fillAndRecord(byLabel(fields, 'A'), 'overwritten', 'profile', opts);
    fillAndRecord(byLabel(fields, 'B'), 'new', 'profile', opts);
    // Filling twice must keep the very first snapshot.
    fillAndRecord(byLabel(fields, 'B'), 'newer', 'ai', opts);
    fillAndRecord(byLabel(fields, 'Q'), 'Two', 'ai', opts);
    (document.getElementById('u') as HTMLInputElement).value = 'user edit';

    expect(clearFilled()).toBe(3);
    expect((document.getElementById('a') as HTMLInputElement).value).toBe('typed by user');
    expect((document.getElementById('b') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('b') as HTMLInputElement).style.outline).toBe('');
    expect((document.getElementById('u') as HTMLInputElement).value).toBe('user edit');
    expect((document.querySelector('input[value="1"]') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('input[value="2"]') as HTMLInputElement).checked).toBe(false);
    expect(clearFilled()).toBe(0);
  });
});
