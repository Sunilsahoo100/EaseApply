import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile, type AuthUser, type Resume } from '../src/shared/profile.model';
import { loadAccount, loadData, loadResume, saveAccount, signIn, signOut, SignedOutError } from '../src/shared/storage';

/** In-memory stand-in for chrome.storage.local. */
function mockStorage(initial: Record<string, unknown> = {}): Record<string, unknown> {
  const data: Record<string, unknown> = structuredClone(initial);
  const keyList = (keys: string | string[]) => (Array.isArray(keys) ? keys : [keys]);
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (keys: string | string[]) =>
          Object.fromEntries(keyList(keys).filter((k) => k in data).map((k) => [k, structuredClone(data[k])])),
        set: async (items: Record<string, unknown>) => void Object.assign(data, structuredClone(items)),
        remove: async (keys: string | string[]) => keyList(keys).forEach((k) => delete data[k]),
      },
    },
  });
  return data;
}

const user: AuthUser = {
  id: '1234',
  email: 'asha@gmail.com',
  name: 'Asha Rao',
  givenName: 'Asha',
  familyName: 'Rao',
  picture: '',
  signedInAt: 0,
};

const resume: Resume = { fileName: 'cv.pdf', mimeType: 'application/pdf', base64: 'JVBERi0=', size: 5, extractedText: '', updatedAt: 0 };

describe('storage', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('refuses to load data when no one is signed in', async () => {
    mockStorage();
    await expect(loadData()).rejects.toBeInstanceOf(SignedOutError);
  });

  it('creates a first profile set from the Google account on first sign-in', async () => {
    mockStorage();
    await signIn(user);
    const data = await loadData();
    expect(data.profile).toMatchObject({ firstName: 'Asha', lastName: 'Rao', email: 'asha@gmail.com' });
    expect(data.resume).toBeNull();
    expect((await loadAccount(user.id)).sets).toHaveLength(1);
  });

  it('moves data saved before sign-in existed into the first account', async () => {
    const store = mockStorage({
      profile: { ...defaultProfile(), firstName: 'A.', currentTitle: 'Software Engineer' },
      resume,
      savedAnswers: [{ id: 'x', question: 'Why us?', answer: 'Because.', updatedAt: 0 }],
      settings: { tone: 'friendly' },
    });
    await signIn(user);

    const data = await loadData();
    expect(data.profile.firstName).toBe('A.');
    expect(data.profile.email).toBe('asha@gmail.com');
    expect(data.resume?.fileName).toBe('cv.pdf');
    expect(data.savedAnswers).toHaveLength(1);
    expect(data.settings.tone).toBe('friendly');
    expect((await loadAccount(user.id)).sets[0]!.name).toBe('Software Engineer');
    for (const key of ['profile', 'resume', 'savedAnswers', 'settings']) expect(store).not.toHaveProperty(key);
  });

  it('fills from the active profile set, with that set’s own resume', async () => {
    mockStorage();
    await signIn(user);
    const account = await loadAccount(user.id);
    const engineer = account.sets[0]!;
    const analyst = { ...engineer, id: 'analyst', name: 'Data Analyst', profile: { ...engineer.profile, currentTitle: 'Data Analyst' } };
    await saveAccount(user.id, { ...account, sets: [engineer, analyst], activeSetId: 'analyst' });
    await chrome.storage.local.set({ [`resume:${user.id}:analyst`]: resume });

    const data = await loadData();
    expect(data.setId).toBe('analyst');
    expect(data.profile.currentTitle).toBe('Data Analyst');
    expect(data.resume?.fileName).toBe('cv.pdf');
    expect(await loadResume(user.id, engineer.id)).toBeNull();
  });

  it('keeps each account’s data across sign-out and sign-in', async () => {
    mockStorage();
    await signIn(user);
    const account = await loadAccount(user.id);
    account.sets[0]!.profile.city = 'Bengaluru';
    await saveAccount(user.id, account);

    await signOut();
    await expect(loadData()).rejects.toBeInstanceOf(SignedOutError);

    await signIn({ ...user, id: '5678', email: 'other@gmail.com' });
    expect((await loadData()).profile.city).toBe('');

    await signIn(user);
    expect((await loadData()).profile.city).toBe('Bengaluru');
  });
});
