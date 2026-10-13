export interface Experience {
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

export interface Education {
  school: string;
  degree: string;
  fieldOfStudy: string;
  startDate: string;
  endDate: string;
  grade: string;
}

/** Equal-opportunity answers. These are filled from the profile only and never sent to the AI. */
export interface EeoAnswers {
  gender: string;
  pronouns: string;
  race: string;
  veteran: string;
  disability: string;
}

export interface Profile {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phoneCountryCode: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  zip: string;

  linkedin: string;
  github: string;
  portfolio: string;
  website: string;

  currentTitle: string;
  currentCompany: string;
  totalExperienceYears: string;
  noticePeriod: string;
  currentSalary: string;
  expectedSalary: string;
  workAuthorization: string;
  requiresSponsorship: string;
  willingToRelocate: string;
  earliestStartDate: string;

  summary: string;
  skills: string[];
  experience: Experience[];
  education: Education[];
  eeo: EeoAnswers;
}

export interface Resume {
  fileName: string;
  mimeType: string;
  /** File contents, base64 without the data: prefix. */
  base64: string;
  size: number;
  /** Plain text of the resume, filled in by "Import from resume". */
  extractedText: string;
  updatedAt: number;
}

export interface SavedAnswer {
  id: string;
  question: string;
  answer: string;
  updatedAt: number;
}

/** A named profile for one kind of role (e.g. "Software Engineer"), with its own resume and saved answers. */
export interface ProfileSet {
  id: string;
  name: string;
  profile: Profile;
  savedAnswers: SavedAnswer[];
  updatedAt: number;
}

/** The Google account signed in to the extension. Only identity is kept; no tokens are stored. */
export interface AuthUser {
  /** Google's stable account id (the OpenID "sub" claim). */
  id: string;
  email: string;
  name: string;
  givenName: string;
  familyName: string;
  picture: string;
  signedInAt: number;
}

export type AnswerTone = 'professional' | 'friendly' | 'confident';
export type AnswerLength = 'short' | 'medium' | 'detailed';

export interface Settings {
  geminiApiKey: string;
  model: string;
  tone: AnswerTone;
  answerLength: AnswerLength;
  /** Replace values already present in a field. Off by default. */
  overwriteExisting: boolean;
  highlightFields: boolean;
}

export const DECLINE = 'Decline to answer';

export function emptyExperience(): Experience {
  return { company: '', title: '', location: '', startDate: '', endDate: '', current: false, description: '' };
}

export function emptyEducation(): Education {
  return { school: '', degree: '', fieldOfStudy: '', startDate: '', endDate: '', grade: '' };
}

export function defaultProfile(): Profile {
  return {
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    phoneCountryCode: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    country: '',
    zip: '',
    linkedin: '',
    github: '',
    portfolio: '',
    website: '',
    currentTitle: '',
    currentCompany: '',
    totalExperienceYears: '',
    noticePeriod: '',
    currentSalary: '',
    expectedSalary: '',
    workAuthorization: '',
    requiresSponsorship: '',
    willingToRelocate: '',
    earliestStartDate: '',
    summary: '',
    skills: [],
    experience: [],
    education: [],
    eeo: { gender: DECLINE, pronouns: '', race: DECLINE, veteran: DECLINE, disability: DECLINE },
  };
}

export function newProfileSet(name: string, profile: Profile = defaultProfile(), savedAnswers: SavedAnswer[] = []): ProfileSet {
  return { id: crypto.randomUUID(), name, profile, savedAnswers, updatedAt: Date.now() };
}

export const DEFAULT_MODEL = 'gemini-flash-latest';

export function defaultSettings(): Settings {
  return {
    geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY ?? '',
    model: DEFAULT_MODEL,
    tone: 'professional',
    answerLength: 'medium',
    overwriteExisting: false,
    highlightFields: true,
  };
}

export function fullName(p: Profile): string {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
}

/** Profile without EEO answers, safe to include in AI prompts. */
export function profileForAi(p: Profile): Omit<Profile, 'eeo'> {
  const { eeo: _eeo, ...rest } = p;
  return rest;
}
