import {
  defaultProfile,
  defaultSettings,
  newProfileSet,
  type AuthUser,
  type Profile,
  type ProfileSet,
  type Resume,
  type SavedAnswer,
  type Settings,
} from './profile.model';

/*
 * Everything lives in chrome.storage.local (never synced):
 *   auth                     the signed-in Google account (AuthUser)
 *   account:<userId>         that account's profile sets, active set and settings (AccountData)
 *   resume:<userId>:<setId>  the resume of one profile set, kept apart because it can be megabytes
 */

export interface AccountData {
  sets: ProfileSet[];
  activeSetId: string;
  settings: Settings;
}

/** The signed-in account's active profile set: what the content script and background fill and answer from. */
export interface StoredData {
  setId: string;
  profile: Profile;
  resume: Resume | null;
  savedAnswers: SavedAnswer[];
  settings: Settings;
}

export type StorageKey = keyof StoredData;

const ALL_KEYS: StorageKey[] = ['setId', 'profile', 'resume', 'savedAnswers', 'settings'];
const AUTH_KEY = 'auth';
/** Keys from before sign-in existed; moved into the first account that signs in. */
const LEGACY_KEYS = ['profile', 'resume', 'savedAnswers', 'settings'];
export const DEFAULT_SET_NAME = 'My profile';

const accountKey = (userId: string) => `account:${userId}`;
const resumeKey = (userId: string, setId: string) => `resume:${userId}:${setId}`;

export class SignedOutError extends Error {
  constructor() {
    super('Sign in to EaseApply first: click the toolbar icon to open the side panel.');
  }
}

function withProfileDefaults(raw: Partial<Profile> | undefined): Profile {
  const profile = { ...defaultProfile(), ...raw };
  profile.eeo = { ...defaultProfile().eeo, ...profile.eeo };
  return profile;
}

function withSettingsDefaults(raw: Partial<Settings> | undefined): Settings {
  const settings = { ...defaultSettings(), ...raw };
  // A key saved as empty falls back to the built-in one from .env.local, if any.
  settings.geminiApiKey ||= defaultSettings().geminiApiKey;
  return settings;
}

function withAccountDefaults(raw: Partial<AccountData> | undefined): AccountData {
  const sets = (raw?.sets ?? []).map((s) => ({ ...s, profile: withProfileDefaults(s.profile), savedAnswers: s.savedAnswers ?? [] }));
  // Fixed id, so a resume saved before the account is first written isn't orphaned.
  if (!sets.length) sets.push({ ...newProfileSet(DEFAULT_SET_NAME), id: 'default' });
  const activeSetId = sets.some((s) => s.id === raw?.activeSetId) ? raw!.activeSetId! : sets[0]!.id;
  return { sets, activeSetId, settings: withSettingsDefaults(raw?.settings) };
}

export async function getUser(): Promise<AuthUser | null> {
  const raw = await chrome.storage.local.get(AUTH_KEY);
  return (raw[AUTH_KEY] as AuthUser | undefined) ?? null;
}

export async function loadAccount(userId: string): Promise<AccountData> {
  const key = accountKey(userId);
  const raw = await chrome.storage.local.get(key);
  return withAccountDefaults(raw[key] as Partial<AccountData> | undefined);
}

export async function saveAccount(userId: string, data: AccountData): Promise<void> {
  await chrome.storage.local.set({ [accountKey(userId)]: data });
}

export async function loadResume(userId: string, setId: string): Promise<Resume | null> {
  const key = resumeKey(userId, setId);
  const raw = await chrome.storage.local.get(key);
  return (raw[key] as Resume | undefined) ?? null;
}

export async function saveResume(userId: string, setId: string, resume: Resume | null): Promise<void> {
  const key = resumeKey(userId, setId);
  if (resume) await chrome.storage.local.set({ [key]: resume });
  else await chrome.storage.local.remove(key);
}

/**
 * Records the signed-in account. On an account's first sign-in this creates its first profile set,
 * from data saved before sign-in existed if there is any, otherwise from the Google name and email.
 */
export async function signIn(user: AuthUser): Promise<void> {
  const key = accountKey(user.id);
  if (!(await chrome.storage.local.get(key))[key]) {
    const legacy = await chrome.storage.local.get(LEGACY_KEYS);
    const profile = withProfileDefaults(legacy['profile'] as Partial<Profile> | undefined);
    profile.firstName ||= user.givenName;
    profile.lastName ||= user.familyName;
    profile.email ||= user.email;
    const set = newProfileSet(profile.currentTitle || DEFAULT_SET_NAME, profile, (legacy['savedAnswers'] as SavedAnswer[] | undefined) ?? []);
    if (legacy['resume']) await saveResume(user.id, set.id, legacy['resume'] as Resume);
    await saveAccount(user.id, {
      sets: [set],
      activeSetId: set.id,
      settings: withSettingsDefaults(legacy['settings'] as Partial<Settings> | undefined),
    });
    await chrome.storage.local.remove(LEGACY_KEYS);
  }
  await chrome.storage.local.set({ [AUTH_KEY]: user });
}

export async function signOut(): Promise<void> {
  await chrome.storage.local.remove(AUTH_KEY);
}

/** Loads the active profile set of the signed-in account. The resume is read only when asked for. */
export async function loadData<K extends StorageKey>(keys: K[] = ALL_KEYS as K[]): Promise<Pick<StoredData, K>> {
  const user = await getUser();
  if (!user) throw new SignedOutError();
  const account = await loadAccount(user.id);
  const set = account.sets.find((s) => s.id === account.activeSetId)!;
  const data: StoredData = {
    setId: set.id,
    profile: set.profile,
    savedAnswers: set.savedAnswers,
    settings: account.settings,
    resume: keys.includes('resume' as K) ? await loadResume(user.id, set.id) : null,
  };
  return data;
}

export function base64ToFile(resume: Resume): File {
  const binary = atob(resume.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], resume.fileName, { type: resume.mimeType });
}
