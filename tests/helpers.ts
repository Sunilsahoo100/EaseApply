import { defaultProfile, type Profile } from '../src/shared/profile.model';
import { scanFields, type FieldHandle } from '../src/content/scanner';

export function mount(html: string): void {
  document.body.innerHTML = html;
}

export function scan(): FieldHandle[] {
  return scanFields(document, { checkVisibility: false });
}

export function byLabel(fields: FieldHandle[], label: string): FieldHandle {
  const f = fields.find((x) => x.label === label);
  if (!f) throw new Error(`No field labeled "${label}". Found: ${fields.map((x) => x.label).join(' | ')}`);
  return f;
}

export function sampleProfile(): Profile {
  return {
    ...defaultProfile(),
    firstName: 'Asha',
    lastName: 'Rao',
    email: 'asha@example.com',
    phoneCountryCode: '+91',
    phone: '9876543210',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    linkedin: 'https://linkedin.com/in/asha',
    github: 'https://github.com/asha',
    currentTitle: 'Senior Engineer',
    currentCompany: 'Acme',
    totalExperienceYears: '6',
    noticePeriod: '30 days',
    expectedSalary: '30 LPA',
    workAuthorization: 'Yes',
    requiresSponsorship: 'No',
    willingToRelocate: 'Yes',
    skills: ['TypeScript', 'Angular'],
    education: [{ school: 'IIT Madras', degree: "Bachelor's", fieldOfStudy: 'CS', startDate: '2012', endDate: '2016', grade: '' }],
  };
}
