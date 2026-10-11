import { describe, expect, it } from 'vitest';
import { isSensitive, matchField } from '../src/content/matcher';
import { keyFromText } from '../src/shared/field-rules';
import { bestOptionIndex } from '../src/shared/option-match';
import { byLabel, mount, sampleProfile, scan } from './helpers';

describe('keyFromText', () => {
  it.each([
    ['First Name', 'firstName'],
    ['Legal last name', 'lastName'],
    ['Full name', 'fullName'],
    ['Email Address', 'email'],
    ['Phone number', 'phone'],
    ['Country code', 'phoneCountryCode'],
    ['LinkedIn Profile URL', 'linkedin'],
    ['Current CTC', 'currentSalary'],
    ['Expected CTC (in LPA)', 'expectedSalary'],
    ['Total years of experience', 'totalExperienceYears'],
    ['Will you now or in the future require sponsorship?', 'requiresSponsorship'],
    ['Are you legally authorized to work in India?', 'workAuthorization'],
    ['What is your notice period?', 'noticePeriod'],
    ['Current Company', 'currentCompany'],
    ['Gender', 'gender'],
  ])('%s → %s', (label, key) => {
    expect(keyFromText(label, 'text')).toBe(key);
  });

  it.each(['Name of your reference', 'Years of experience with React', 'Why do you want to join us?'])(
    'leaves "%s" unmatched',
    (label) => {
      expect(keyFromText(label, 'textarea')).toBeNull();
    },
  );

  it('only maps file inputs to the resume', () => {
    expect(keyFromText('Resume/CV', 'file')).toBe('resume');
    expect(keyFromText('Cover letter', 'file')).toBeNull();
    expect(keyFromText('Email', 'file')).toBeNull();
  });
});

describe('bestOptionIndex', () => {
  it('matches yes/no phrasing', () => {
    expect(bestOptionIndex('Yes', ['No, I am not', 'Yes, I am authorized'])).toBe(1);
    expect(bestOptionIndex('No', ['Yes', 'No'])).toBe(1);
  });

  it('matches numeric ranges', () => {
    const opts = ['0-2 years', '3-5 years', '6-9 years', '10+ years'];
    expect(bestOptionIndex('6', opts)).toBe(2);
    expect(bestOptionIndex('12', opts)).toBe(3);
  });

  it('matches synonyms and partial text', () => {
    expect(bestOptionIndex('USA', ['India', 'United States', 'Canada'])).toBe(1);
    expect(bestOptionIndex("Bachelor's", ["Bachelor's Degree", "Master's Degree"])).toBe(0);
    expect(bestOptionIndex('+91', ['United States (+1)', 'India (+91)'])).toBe(1);
  });

  it('maps "Decline to answer" to the form\'s decline option', () => {
    expect(bestOptionIndex('Decline to answer', ['Male', 'Female', 'I prefer not to say'])).toBe(2);
  });

  it('returns -1 when nothing fits', () => {
    expect(bestOptionIndex('Purple', ['Red', 'Green'])).toBe(-1);
  });
});

describe('matchField', () => {
  it('matches profile values, saved answers, and leaves the rest for the AI', () => {
    mount(`
      <label for="a">First name</label><input id="a" />
      <label for="b">Years of experience</label>
      <select id="b"><option value="">Select</option><option>0-2</option><option>3-5</option><option>6+</option></select>
      <label for="c">Why do you want to work here?</label><textarea id="c"></textarea>
      <label for="d">How did you hear about us?</label><input id="d" />
    `);
    const fields = scan();
    const p = sampleProfile();
    const saved = [{ id: '1', question: 'How did you hear about us', answer: 'LinkedIn', updatedAt: 0 }];
    expect(matchField(byLabel(fields, 'First name'), p, saved)).toMatchObject({ value: 'Asha', source: 'profile' });
    expect(matchField(byLabel(fields, 'Years of experience'), p, saved)).toMatchObject({ value: '6' });
    expect(matchField(byLabel(fields, 'Why do you want to work here?'), p, saved)).toBeNull();
    expect(matchField(byLabel(fields, 'How did you hear about us?'), p, saved)).toMatchObject({ value: 'LinkedIn', source: 'saved' });
  });

  it('flags EEO and consent questions as sensitive', () => {
    mount(`
      <label for="g">Gender</label><select id="g"><option>Male</option><option>Female</option></select>
      <label><input type="checkbox" name="tos" /> I agree to the privacy policy</label>
      <label for="w">Why us?</label><textarea id="w"></textarea>`);
    const fields = scan();
    expect(isSensitive(byLabel(fields, 'Gender'))).toBe(true);
    expect(isSensitive(byLabel(fields, 'I agree to the privacy policy'))).toBe(true);
    expect(isSensitive(byLabel(fields, 'Why us?'))).toBe(false);
  });
});
