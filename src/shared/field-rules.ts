import { DECLINE, fullName, type Profile } from './profile.model';
import type { FieldKind } from './types';

export type ProfileKey =
  | 'firstName'
  | 'middleName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'phoneCountryCode'
  | 'phone'
  | 'address'
  | 'city'
  | 'state'
  | 'zip'
  | 'country'
  | 'location'
  | 'linkedin'
  | 'github'
  | 'portfolio'
  | 'website'
  | 'currentCompany'
  | 'currentTitle'
  | 'totalExperienceYears'
  | 'noticePeriod'
  | 'expectedSalary'
  | 'currentSalary'
  | 'requiresSponsorship'
  | 'workAuthorization'
  | 'willingToRelocate'
  | 'earliestStartDate'
  | 'school'
  | 'degree'
  | 'fieldOfStudy'
  | 'graduationYear'
  | 'skills'
  | 'summary'
  | 'gender'
  | 'pronouns'
  | 'race'
  | 'veteran'
  | 'disability'
  | 'resume';

interface FieldRule {
  key: ProfileKey;
  match: RegExp;
  exclude?: RegExp;
  /** Restrict the rule to these field kinds. */
  kinds?: FieldKind[];
  /** Rule never applies to these kinds. */
  notKinds?: FieldKind[];
}

/** EEO questions: filled from the profile only, never sent to the AI. */
export const SENSITIVE_KEYS = new Set<ProfileKey>(['gender', 'pronouns', 'race', 'veteran', 'disability']);

/** Questions the user must answer themselves (consent, attestations, captchas). */
export const SENSITIVE_QUESTION =
  /\b(gender|sex|pronoun|race|racial|ethnic|hispanic|latino|veteran|disabilit|sexual orientation|transgender|signature|consent|i agree|agree to|acknowledge|certify|attest|privacy (policy|notice)|terms|captcha)/i;

// Order matters: the first matching rule wins, so specific rules come before general ones.
const RULES: FieldRule[] = [
  { key: 'resume', match: /\b(resume|résumé|cv|curriculum vitae)\b/, exclude: /cover/, kinds: ['file'] },

  { key: 'gender', match: /\bgender\b|\bsex\b/, exclude: /orientation/ },
  { key: 'pronouns', match: /pronoun/ },
  { key: 'race', match: /\brace\b|ethnicit|hispanic|latino/ },
  { key: 'veteran', match: /veteran|military service|protected veteran/ },
  { key: 'disability', match: /disabilit/ },

  { key: 'firstName', match: /\bfirst ?name\b|\bgiven ?name\b|\bfname\b|^first$|\bforename\b/ },
  { key: 'middleName', match: /\bmiddle ?name\b|\bmiddle initial\b/ },
  { key: 'lastName', match: /\blast ?name\b|\bsurname\b|\bfamily ?name\b|\blname\b|^last$/ },
  {
    key: 'fullName',
    match: /^(your )?(full |legal )?name$|\bfull ?name\b|\blegal name\b|\b(candidate|applicant)('?s)? name\b/,
    exclude: /company|employer|school|university|user ?name|reference|manager|emergency|referr|recruiter|preferred|nick/,
  },
  { key: 'email', match: /e-?mail/, exclude: /referr|reference|manager|recruiter/ },
  {
    key: 'phoneCountryCode',
    match: /country ?code|dial(ing)? ?code|phone.*\bcode\b|\bisd\b/,
    notKinds: ['textarea'],
  },
  {
    key: 'phone',
    match: /phone|mobile|\bcell\b|telephone|contact (number|no)|\btel\b|whatsapp/,
    exclude: /referr|reference|emergency|manager|type|extension/,
  },

  { key: 'linkedin', match: /linked ?in/ },
  { key: 'github', match: /git ?hub/ },
  { key: 'portfolio', match: /portfolio|dribbble|behance/ },
  {
    key: 'website',
    match: /website|personal (site|url|page)|\bblog\b|^url$|other (link|url)|social (media|link)/,
    exclude: /linked ?in|git ?hub|company|employer/,
  },

  {
    key: 'address',
    match: /street|address( line)? ?1?$|^address|mailing address|home address|current address/,
    exclude: /e-?mail|\bip\b|web|line ?2/,
  },
  { key: 'city', match: /\bcity\b|\btown\b/, exclude: /ethnic/ },
  { key: 'state', match: /\bstate\b|province|\bregion\b|county/, exclude: /statement|united states|state your|please state/ },
  { key: 'zip', match: /\bzip\b|postal|post ?code|pin ?code|zip ?code/ },
  { key: 'country', match: /\bcountry\b|nationality|citizenship/, exclude: /code|authori|sponsor/ },
  {
    key: 'location',
    match: /^location$|current location|where are you (based|located)|\breside\b|where do you live|\blocated in\b/,
  },

  { key: 'requiresSponsorship', match: /sponsor/ },
  {
    key: 'workAuthorization',
    match: /authori[sz]ed to work|work authori[sz]ation|legally (authori[sz]ed|eligible|allowed|permitted)|right to work|eligible to work|work permit|employment eligibility|visa status/,
  },
  { key: 'willingToRelocate', match: /relocat/ },
  { key: 'noticePeriod', match: /notice period|how soon can you (join|start)|joining (time|period)|serving notice/ },
  {
    key: 'earliestStartDate',
    match: /start date|earliest.*(start|join)|when can you (start|join)|(available|availability) to (start|join)|date of joining|availability date/,
  },
  {
    key: 'expectedSalary',
    match: /expected (ctc|salary|compensation|package|pay)|salary expectation|desired (salary|compensation|pay)|compensation expectation|salary requirement|expected annual/,
  },
  {
    key: 'currentSalary',
    match: /current (ctc|salary|compensation|package|pay)|present (ctc|salary)|\bctc\b|current annual/,
    exclude: /expect/,
  },
  {
    key: 'totalExperienceYears',
    match: /(total|overall|relevant|professional|work) (years of )?experience|years of (total |overall |relevant |professional |work |industry )?experience|experience \(?in years|^experience$|^years$|how many years/,
    exclude: /\bwith\b|\busing\b|\bin (a |an )?[a-z#+.]+ (role|position)|java|python|react|angular|sql|\.net|aws|management|leadership/,
  },

  {
    key: 'currentCompany',
    match: /current (company|employer|organi[sz]ation)|present (company|employer)|^company( name)?$|^employer( name)?$|most recent (company|employer)|^organi[sz]ation$/,
  },
  {
    key: 'currentTitle',
    match: /current (job )?(title|role|position|designation)|^(job )?title$|^designation$|^headline$|most recent (title|role|position)|^current role$/,
  },

  { key: 'school', match: /\bschool\b|university|college|institut(e|ion)/, exclude: /high school|graduat(e|ion) (year|date)/ },
  { key: 'degree', match: /\bdegree\b|qualification/, exclude: /year|date/ },
  { key: 'fieldOfStudy', match: /field of study|\bmajor\b|discipline|specialization|area of study/ },
  { key: 'graduationYear', match: /graduation (year|date)|year of (graduation|passing)|passing year|graduated in/ },

  { key: 'skills', match: /^(key |technical |primary )?skills?( set)?$|list your skills/ },
  {
    key: 'summary',
    match: /professional summary|^summary$|^about( me)?$|^bio$|tell us about yourself|describe yourself|introduce yourself/,
    kinds: ['textarea', 'contenteditable', 'text'],
  },
];

const AUTOCOMPLETE_MAP: Record<string, ProfileKey> = {
  'given-name': 'firstName',
  'additional-name': 'middleName',
  'family-name': 'lastName',
  name: 'fullName',
  email: 'email',
  tel: 'phone',
  'tel-national': 'phone',
  'tel-country-code': 'phoneCountryCode',
  'street-address': 'address',
  'address-line1': 'address',
  'address-level2': 'city',
  'address-level1': 'state',
  'postal-code': 'zip',
  country: 'country',
  'country-name': 'country',
  organization: 'currentCompany',
  'organization-title': 'currentTitle',
  url: 'website',
  sex: 'gender',
};

export function keyFromAutocomplete(autocomplete: string | null): ProfileKey | null {
  if (!autocomplete) return null;
  // Autocomplete can carry section/shipping prefixes: "section-1 shipping given-name".
  const parts = autocomplete.toLowerCase().trim().split(/\s+/);
  return AUTOCOMPLETE_MAP[parts[parts.length - 1] ?? ''] ?? null;
}

export function keyFromText(text: string, kind: FieldKind): ProfileKey | null {
  const t = text.toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  for (const rule of RULES) {
    if (rule.kinds && !rule.kinds.includes(kind)) continue;
    if (rule.notKinds?.includes(kind)) continue;
    if (kind === 'file' && rule.key !== 'resume') continue;
    if (rule.match.test(t) && !(rule.exclude && rule.exclude.test(t))) return rule.key;
  }
  return null;
}

/** The profile value for a key, or '' if the user hasn't provided it. */
export function profileValue(key: ProfileKey, p: Profile): string {
  const edu = p.education[0];
  switch (key) {
    case 'fullName':
      return fullName(p);
    case 'phone':
      return p.phone;
    case 'location':
      return [p.city, p.state, p.country].filter(Boolean).join(', ');
    case 'school':
      return edu?.school ?? '';
    case 'degree':
      return edu?.degree ?? '';
    case 'fieldOfStudy':
      return edu?.fieldOfStudy ?? '';
    case 'graduationYear':
      return (edu?.endDate ?? '').match(/\d{4}/)?.[0] ?? '';
    case 'skills':
      return p.skills.join(', ');
    case 'gender':
    case 'pronouns':
    case 'race':
    case 'veteran':
    case 'disability':
      return p.eeo[key];
    case 'resume':
      return '';
    default:
      return p[key] ?? '';
  }
}

/** Alternative phrasings tried when a select/radio has no option matching the profile value. */
export function valueAlternatives(value: string): string[] {
  if (value === DECLINE) {
    return ['Decline to self identify', 'Prefer not to say', 'Prefer not to answer', 'I do not wish to answer', 'Decline'];
  }
  return [];
}
