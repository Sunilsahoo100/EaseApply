import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { errorMessage, sendToBackground } from '../../../shared/messages';
import {
  DECLINE,
  emptyEducation,
  emptyExperience,
  type Profile,
  type Resume,
  type SavedAnswer,
} from '../../../shared/profile.model';
import type { ParsedResume } from '../../../shared/types';
import { StorageService } from '../../services/storage.service';

const MAX_RESUME_BYTES = 8 * 1024 * 1024;

type StringKeys<T> = { [K in keyof T]: T[K] extends string ? K : never }[keyof T];

@Component({
  selector: 'app-profile',
  imports: [FormsModule, RouterLink],
  templateUrl: './profile.component.html',
})
export class ProfileComponent {
  protected readonly store = inject(StorageService);

  /** Working copy edited by the form; written to storage on Save. */
  protected readonly model = signal<Profile | null>(null);
  protected readonly skillsText = signal('');
  protected readonly answers = signal<SavedAnswer[]>([]);
  protected readonly dirty = signal(false);

  protected readonly importing = signal(false);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly hasKey = computed(() => !!this.store.settings().geminiApiKey);

  protected readonly yesNo = ['', 'Yes', 'No'];
  protected readonly eeoOptions = {
    gender: [DECLINE, 'Male', 'Female', 'Non-binary'],
    race: [
      DECLINE,
      'Asian',
      'Black or African American',
      'Hispanic or Latino',
      'White',
      'American Indian or Alaska Native',
      'Native Hawaiian or Other Pacific Islander',
      'Two or More Races',
    ],
    veteran: [DECLINE, 'I am not a protected veteran', 'I identify as one or more of the classifications of protected veteran'],
    disability: [DECLINE, 'No, I do not have a disability', 'Yes, I have a disability'],
  };

  constructor() {
    // Load the stored profile into the form once storage is ready.
    effect(() => {
      if (!this.store.loaded()) return;
      untracked(() => {
        if (this.model()) return;
        this.load();
      });
    });
  }

  private load(): void {
    const p = structuredClone(this.store.profile());
    this.model.set(p);
    this.skillsText.set(p.skills.join(', '));
    this.answers.set(structuredClone(this.store.savedAnswers()));
    this.dirty.set(false);
  }

  protected touch(event?: Event): void {
    // The resume picker saves on its own; it doesn't make the form dirty.
    if ((event?.target as HTMLInputElement | null)?.type === 'file') return;
    this.dirty.set(true);
    this.notice.set('');
  }

  async save(): Promise<void> {
    const p = this.model();
    if (!p) return;
    p.skills = this.skillsText()
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await this.store.save('profile', structuredClone(p));
      await this.store.save('savedAnswers', this.answers().filter((a) => a.question.trim() && a.answer.trim()));
      this.dirty.set(false);
      this.error.set('');
      this.notice.set('Profile saved.');
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  discard(): void {
    this.load();
    this.notice.set('Changes discarded.');
  }

  // ---- Resume ----

  async onResumeSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_RESUME_BYTES) {
      this.error.set('That file is over 8 MB. Please upload a smaller resume.');
      return;
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const resume: Resume = {
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      base64,
      size: file.size,
      extractedText: '',
      updatedAt: Date.now(),
    };
    await this.store.save('resume', resume);
    this.error.set('');
    this.notice.set(
      this.hasKey() && /pdf|text/.test(resume.mimeType)
        ? `Uploaded ${file.name}. Click "Import from resume" to fill your profile automatically.`
        : `Uploaded ${file.name}.`,
    );
  }

  async removeResume(): Promise<void> {
    await this.store.save('resume', null);
    this.notice.set('Resume removed.');
  }

  async importFromResume(): Promise<void> {
    this.importing.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const parsed = await sendToBackground({ type: 'AI_PARSE_RESUME' });
      this.applyParsed(parsed);
      const resume = this.store.resume();
      if (resume && parsed.extractedText) await this.store.save('resume', { ...resume, extractedText: parsed.extractedText });
      this.dirty.set(true);
      this.notice.set('Imported from your resume. Review the details below, then click Save.');
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.importing.set(false);
    }
  }

  private applyParsed(parsed: ParsedResume): void {
    const p = this.model();
    if (!p) return;
    const stringKeys: StringKeys<Profile>[] = [
      'firstName', 'middleName', 'lastName', 'email', 'phoneCountryCode', 'phone', 'address', 'city', 'state', 'country',
      'zip', 'linkedin', 'github', 'portfolio', 'website', 'currentTitle', 'currentCompany', 'totalExperienceYears', 'summary',
    ];
    for (const key of stringKeys) {
      const v = parsed[key];
      if (typeof v === 'string' && v.trim()) p[key] = v.trim();
    }
    if (parsed.skills?.length) this.skillsText.set(parsed.skills.join(', '));
    if (parsed.experience?.length) p.experience = parsed.experience.map((e) => ({ ...emptyExperience(), ...e }));
    if (parsed.education?.length) p.education = parsed.education.map((e) => ({ ...emptyEducation(), ...e }));
    this.model.set({ ...p });
  }

  // ---- Lists ----

  addExperience(): void {
    this.model.update((p) => p && { ...p, experience: [...p.experience, emptyExperience()] });
    this.touch();
  }

  removeExperience(i: number): void {
    this.model.update((p) => p && { ...p, experience: p.experience.filter((_, j) => j !== i) });
    this.touch();
  }

  addEducation(): void {
    this.model.update((p) => p && { ...p, education: [...p.education, emptyEducation()] });
    this.touch();
  }

  removeEducation(i: number): void {
    this.model.update((p) => p && { ...p, education: p.education.filter((_, j) => j !== i) });
    this.touch();
  }

  removeAnswer(id: string): void {
    this.answers.update((list) => list.filter((a) => a.id !== id));
    this.touch();
  }

  protected formatSize(bytes: number): string {
    return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
  }
}
