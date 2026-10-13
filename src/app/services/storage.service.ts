import { computed, Injectable, signal } from '@angular/core';
import {
  defaultProfile,
  defaultSettings,
  newProfileSet,
  type AuthUser,
  type ProfileSet,
  type Resume,
  type Settings,
} from '../../shared/profile.model';
import * as storage from '../../shared/storage';
import { normalize } from '../../shared/text';
import { signInWithGoogle } from './google-auth';

/**
 * The signed-in account and its profile sets, exposed as signals; stays in sync when other extension pages write.
 * `profile`, `resume` and `savedAnswers` always refer to the active set.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  readonly user = signal<AuthUser | null>(null);
  readonly sets = signal<ProfileSet[]>([]);
  readonly activeSetId = signal('');
  readonly settings = signal<Settings>(defaultSettings());
  readonly resume = signal<Resume | null>(null);
  readonly loaded = signal(false);

  readonly activeSet = computed(() => this.sets().find((s) => s.id === this.activeSetId()) ?? null);
  readonly profile = computed(() => this.activeSet()?.profile ?? defaultProfile());
  readonly savedAnswers = computed(() => this.activeSet()?.savedAnswers ?? []);

  /** Drops results of a reload that a newer one overtook. */
  private reloads = 0;

  constructor() {
    void this.reload();
    chrome.storage.onChanged.addListener((_changes, area) => {
      if (area === 'local') void this.reload();
    });
  }

  private async reload(): Promise<void> {
    const run = ++this.reloads;
    const user = await storage.getUser();
    const account = user ? await storage.loadAccount(user.id) : null;
    const resume = user && account ? await storage.loadResume(user.id, account.activeSetId) : null;
    if (run !== this.reloads) return;
    this.user.set(user);
    this.sets.set(account?.sets ?? []);
    this.activeSetId.set(account?.activeSetId ?? '');
    this.settings.set(account?.settings ?? defaultSettings());
    this.resume.set(resume);
    this.loaded.set(true);
  }

  private userId(): string {
    const user = this.user();
    if (!user) throw new storage.SignedOutError();
    return user.id;
  }

  private async writeAccount(patch: Partial<storage.AccountData>): Promise<void> {
    const next = { sets: this.sets(), activeSetId: this.activeSetId(), settings: this.settings(), ...patch };
    await storage.saveAccount(this.userId(), next);
    this.sets.set(next.sets);
    this.settings.set(next.settings);
    if (next.activeSetId !== this.activeSetId()) {
      this.resume.set(await storage.loadResume(this.userId(), next.activeSetId));
      this.activeSetId.set(next.activeSetId);
    }
  }

  // ---- Account ----

  async signIn(): Promise<void> {
    await storage.signIn(await signInWithGoogle());
    await this.reload();
  }

  async signOut(): Promise<void> {
    await storage.signOut();
    await this.reload();
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.writeAccount({ settings });
  }

  // ---- Profile sets ----

  selectSet(id: string): Promise<void> {
    return this.writeAccount({ activeSetId: id });
  }

  /** Creates a set and makes it active. With `copyFrom`, starts as a copy of that set, resume included. */
  async createSet(name: string, copyFrom?: string): Promise<void> {
    const source = this.sets().find((s) => s.id === copyFrom);
    const user = this.user();
    const set = source
      ? newProfileSet(name, structuredClone(source.profile), structuredClone(source.savedAnswers))
      : newProfileSet(name, { ...defaultProfile(), firstName: user?.givenName ?? '', lastName: user?.familyName ?? '', email: user?.email ?? '' });
    if (source) {
      const resume = await storage.loadResume(this.userId(), source.id);
      if (resume) await storage.saveResume(this.userId(), set.id, resume);
    }
    await this.writeAccount({ sets: [...this.sets(), set], activeSetId: set.id });
  }

  updateSet(id: string, patch: Partial<Pick<ProfileSet, 'name' | 'profile' | 'savedAnswers'>>): Promise<void> {
    return this.writeAccount({ sets: this.sets().map((s) => (s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s)) });
  }

  async deleteSet(id: string): Promise<void> {
    const sets = this.sets().filter((s) => s.id !== id);
    if (!sets.length) throw new Error("You can't delete your only profile set.");
    const activeSetId = this.activeSetId() === id ? sets[0]!.id : this.activeSetId();
    await this.writeAccount({ sets, activeSetId });
    await storage.saveResume(this.userId(), id, null);
  }

  async saveResume(setId: string, resume: Resume | null): Promise<void> {
    await storage.saveResume(this.userId(), setId, resume);
    if (setId === this.activeSetId()) this.resume.set(resume);
  }

  /** Adds or updates answers in the active set to reuse on future forms, keyed by the normalized question. */
  async rememberAnswers(entries: { question: string; answer: string }[]): Promise<void> {
    const set = this.activeSet();
    if (!set) return;
    const list = structuredClone(set.savedAnswers);
    for (const { question, answer } of entries) {
      const key = normalize(question);
      const existing = list.find((a) => normalize(a.question) === key);
      if (existing) {
        existing.answer = answer;
        existing.updatedAt = Date.now();
      } else {
        list.push({ id: crypto.randomUUID(), question, answer, updatedAt: Date.now() });
      }
    }
    await this.updateSet(set.id, { savedAnswers: list });
  }

  hasProfile(): boolean {
    const p = this.profile();
    return !!(p.firstName || p.email);
  }
}
