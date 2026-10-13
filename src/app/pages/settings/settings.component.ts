import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorMessage, sendToBackground } from '../../../shared/messages';
import { DEFAULT_MODEL, type Settings } from '../../../shared/profile.model';
import { StorageService } from '../../services/storage.service';

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  templateUrl: './settings.component.html',
})
export class SettingsComponent {
  protected readonly store = inject(StorageService);

  protected readonly model = signal<Settings | null>(null);
  protected readonly showKey = signal(false);
  protected readonly models = signal<string[]>([]);
  protected readonly busy = signal<'' | 'test' | 'models' | 'save'>('');
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly defaultModel = DEFAULT_MODEL;

  constructor() {
    effect(() => {
      if (!this.store.loaded()) return;
      untracked(() => {
        if (!this.model()) this.model.set({ ...this.store.settings() });
      });
    });
  }

  private async run(kind: 'test' | 'models' | 'save', fn: () => Promise<string>): Promise<void> {
    this.busy.set(kind);
    this.error.set('');
    this.notice.set('');
    try {
      this.notice.set(await fn());
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.busy.set('');
    }
  }

  save(): Promise<void> {
    return this.run('save', async () => {
      const s = this.model()!;
      await this.store.saveSettings({ ...s, geminiApiKey: s.geminiApiKey.trim(), model: s.model.trim() || DEFAULT_MODEL });
      return 'Settings saved.';
    });
  }

  async signOut(): Promise<void> {
    try {
      await this.store.signOut();
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  test(): Promise<void> {
    return this.run('test', () => {
      const s = this.model()!;
      return sendToBackground({ type: 'AI_TEST_KEY', apiKey: s.geminiApiKey.trim(), model: s.model.trim() || DEFAULT_MODEL });
    });
  }

  loadModels(): Promise<void> {
    return this.run('models', async () => {
      const list = await sendToBackground({ type: 'AI_LIST_MODELS', apiKey: this.model()!.geminiApiKey.trim() });
      this.models.set(list);
      return `Found ${list.length} models. Flash models have the most generous free tier.`;
    });
  }
}
