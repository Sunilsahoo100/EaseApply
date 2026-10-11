import {
  defaultProfile,
  defaultSettings,
  type Profile,
  type Resume,
  type SavedAnswer,
  type Settings,
} from './profile.model';

/** Everything the extension stores, all in chrome.storage.local (never synced). */
export interface StoredData {
  profile: Profile;
  resume: Resume | null;
  savedAnswers: SavedAnswer[];
  settings: Settings;
}

export type StorageKey = keyof StoredData;

const ALL_KEYS: StorageKey[] = ['profile', 'resume', 'savedAnswers', 'settings'];

function withDefaults(raw: Record<string, unknown>): StoredData {
  const profile = { ...defaultProfile(), ...(raw['profile'] as Partial<Profile> | undefined) };
  profile.eeo = { ...defaultProfile().eeo, ...profile.eeo };
  const settings = { ...defaultSettings(), ...(raw['settings'] as Partial<Settings> | undefined) };
  // A key saved as empty falls back to the built-in one from .env.local, if any.
  settings.geminiApiKey ||= defaultSettings().geminiApiKey;
  return {
    profile,
    resume: (raw['resume'] as Resume | undefined) ?? null,
    savedAnswers: (raw['savedAnswers'] as SavedAnswer[] | undefined) ?? [],
    settings,
  };
}

export async function loadData<K extends StorageKey>(keys: K[] = ALL_KEYS as K[]): Promise<Pick<StoredData, K>> {
  const raw = await chrome.storage.local.get(keys);
  return withDefaults(raw);
}

export async function saveData<K extends StorageKey>(key: K, value: StoredData[K]): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export function base64ToFile(resume: Resume): File {
  const binary = atob(resume.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], resume.fileName, { type: resume.mimeType });
}
