import { Injectable, signal, type WritableSignal } from '@angular/core';
import {
  defaultProfile,
  defaultSettings,
  type Profile,
  type Resume,
  type SavedAnswer,
  type Settings,
} from '../../shared/profile.model';
import { loadData, saveData, type StorageKey, type StoredData } from '../../shared/storage';
import { normalize } from '../../shared/text';

/** chrome.storage.local exposed as signals; stays in sync when other extension pages write. */
@Injectable({ providedIn: 'root' })
export class StorageService {
  readonly profile = signal<Profile>(defaultProfile());
  readonly resume = signal<Resume | null>(null);
  readonly savedAnswers = signal<SavedAnswer[]>([]);
  readonly settings = signal<Settings>(defaultSettings());
  readonly loaded = signal(false);

  private readonly signals: { [K in StorageKey]: WritableSignal<StoredData[K]> } = {
    profile: this.profile,
    resume: this.resume,
    savedAnswers: this.savedAnswers,
    settings: this.settings,
  };

  constructor() {
    void this.reload();
    chrome.storage.onChanged.addListener((_changes, area) => {
      if (area === 'local') void this.reload();
    });
  }

  private async reload(): Promise<void> {
    const data = await loadData();
    this.profile.set(data.profile);
    this.resume.set(data.resume);
    this.savedAnswers.set(data.savedAnswers);
    this.settings.set(data.settings);
    this.loaded.set(true);
  }

  async save<K extends StorageKey>(key: K, value: StoredData[K]): Promise<void> {
    await saveData(key, value);
    this.signals[key].set(value);
  }

  /** Adds or updates answers to reuse on future forms, keyed by the normalized question. */
  async rememberAnswers(entries: { question: string; answer: string }[]): Promise<void> {
    const list = [...this.savedAnswers()];
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
    await this.save('savedAnswers', list);
  }

  hasProfile(): boolean {
    const p = this.profile();
    return !!(p.firstName || p.email);
  }
}
