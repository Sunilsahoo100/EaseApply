import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RestrictedPageError } from '../../../shared/frame-runner';
import { errorMessage, sendToBackground } from '../../../shared/messages';
import type { FillAnswersResult, FilledField, JobContext, ScanFillResult, ScannedField } from '../../../shared/types';
import { PageService } from '../../services/page.service';
import { StorageService } from '../../services/storage.service';

interface Draft {
  field: ScannedField;
  answer: string;
  include: boolean;
  save: boolean;
  confidence: number;
}

type Phase = 'idle' | 'filling' | 'filled';

/** Kinds the AI can answer. Files and single consent checkboxes are left to the user. */
const AI_KINDS = new Set(['text', 'email', 'tel', 'url', 'number', 'date', 'textarea', 'select', 'radio', 'checkbox-group', 'contenteditable']);

@Component({
  selector: 'app-fill',
  imports: [FormsModule, RouterLink],
  templateUrl: './fill.component.html',
})
export class FillComponent {
  protected readonly store = inject(StorageService);
  protected readonly page = inject(PageService);

  protected readonly phase = signal<Phase>('idle');
  protected readonly filled = signal<FilledField[]>([]);
  protected readonly prefilled = signal(0);
  protected readonly unmatched = signal<ScannedField[]>([]);
  protected readonly job = signal<JobContext | null>(null);
  protected readonly manualJob = signal('');

  protected readonly aiLoading = signal(false);
  protected readonly drafts = signal<Draft[]>([]);
  protected readonly applying = signal(false);

  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly showFilled = signal(false);

  protected readonly aiQuestions = computed(() => this.unmatched().filter((f) => !f.sensitive && AI_KINDS.has(f.kind)));
  protected readonly manualQuestions = computed(() => this.unmatched().filter((f) => f.sensitive || !AI_KINDS.has(f.kind)));
  protected readonly selectedCount = computed(() => this.drafts().filter((d) => d.include && d.answer.trim()).length);
  protected readonly hasKey = computed(() => !!this.store.settings().geminiApiKey);

  constructor() {
    // New page or tab: forget the previous page's results.
    effect(() => {
      this.page.pageVersion();
      untracked(() => this.reset());
    });
  }

  private reset(): void {
    this.phase.set('idle');
    this.filled.set([]);
    this.prefilled.set(0);
    this.unmatched.set([]);
    this.job.set(null);
    this.drafts.set([]);
    this.notice.set('');
    this.error.set('');
  }

  private fail(err: unknown): void {
    this.error.set(err instanceof RestrictedPageError ? err.message : errorMessage(err));
  }

  async fill(): Promise<void> {
    this.reset();
    this.phase.set('filling');
    try {
      const results = await this.page.run<ScanFillResult>('scanAndFill');
      const filled = results.flatMap((r) => r.data.filled.map((f) => ({ ...f, frameId: r.frameId })));
      const unmatched = results.flatMap((r) => r.data.unmatched.map((f) => ({ ...f, frameId: r.frameId })));
      const prefilled = results.reduce((n, r) => n + r.data.prefilled, 0);
      this.filled.set(filled);
      this.unmatched.set(unmatched);
      this.prefilled.set(prefilled);
      this.phase.set('filled');
      if (!filled.length && !unmatched.length && !prefilled) {
        this.notice.set('No form fields found on this page. If the form appears after clicking "Apply", click it first and try again.');
      }
      await this.detectJob();
    } catch (err) {
      this.phase.set('idle');
      this.fail(err);
    }
  }

  private async detectJob(): Promise<void> {
    try {
      const contexts = await this.page.run<JobContext | null>('jobContext');
      const best = contexts
        .map((c) => c.data)
        .filter((c): c is JobContext => !!c)
        .sort((a, b) => Number(b.source === 'json-ld') - Number(a.source === 'json-ld') || b.description.length - a.description.length)[0];
      this.job.set(best ?? null);
    } catch {
      this.job.set(null);
    }
  }

  async selectSet(id: string): Promise<void> {
    try {
      await this.store.selectSet(id);
      // Drafts were written from the previous set's resume and profile.
      this.drafts.set([]);
    } catch (err) {
      this.fail(err);
    }
  }

  async generate(): Promise<void> {
    const questions = this.aiQuestions();
    if (!questions.length) return;
    this.error.set('');
    this.aiLoading.set(true);
    const manual = this.manualJob().trim();
    const job: JobContext | null =
      this.job() ?? (manual ? { title: '', company: '', description: manual.slice(0, 8000), url: this.page.tab()?.url ?? '', source: 'manual' } : null);
    try {
      const answers = await sendToBackground({
        type: 'AI_ANSWER_QUESTIONS',
        pageUrl: this.page.tab()?.url ?? '',
        job,
        questions: questions.map((f) => ({
          id: f.jafId,
          question: f.label,
          kind: f.kind,
          options: f.options,
          maxLength: f.maxLength,
          required: f.required,
        })),
      });
      this.drafts.set(
        questions.map((field) => {
          const a = answers.find((x) => x.id === field.jafId);
          const answer = a?.answer ?? '';
          return { field, answer, include: !!answer, save: false, confidence: a?.confidence ?? 0 };
        }),
      );
    } catch (err) {
      this.fail(err);
    } finally {
      this.aiLoading.set(false);
    }
  }

  protected updateDraft(index: number, patch: Partial<Draft>): void {
    this.drafts.update((list) => list.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  async applyDrafts(): Promise<void> {
    const chosen = this.drafts().filter((d) => d.include && d.answer.trim());
    if (!chosen.length) return;
    this.applying.set(true);
    this.error.set('');
    try {
      const byFrame = new Map<number, Draft[]>();
      for (const d of chosen) byFrame.set(d.field.frameId ?? 0, [...(byFrame.get(d.field.frameId ?? 0) ?? []), d]);

      const failed = new Set<string>();
      for (const [frameId, drafts] of byFrame) {
        const [res] = await this.page.run<FillAnswersResult>(
          'fillAnswers',
          { answers: drafts.map((d) => ({ jafId: d.field.jafId, value: d.answer })) },
          [frameId],
        );
        (res?.data.failed ?? drafts.map((d) => d.field.jafId)).forEach((id) => failed.add(id));
      }

      const done = chosen.filter((d) => !failed.has(d.field.jafId));
      const toSave = done.filter((d) => d.save).map((d) => ({ question: d.field.label, answer: d.answer.trim() }));
      if (toSave.length) await this.store.rememberAnswers(toSave);

      const doneIds = new Set(done.map((d) => d.field.jafId));
      this.filled.update((list) => [
        ...list,
        ...done.map((d) => ({ jafId: d.field.jafId, frameId: d.field.frameId, label: d.field.label, value: d.answer, source: 'ai' as const })),
      ]);
      this.unmatched.update((list) => list.filter((f) => !doneIds.has(f.jafId)));
      this.drafts.update((list) => list.filter((d) => !doneIds.has(d.field.jafId)));
      this.notice.set(
        `Filled ${done.length} AI answer${done.length === 1 ? '' : 's'}.` +
          (failed.size ? ` ${failed.size} couldn't be filled (the form may have changed); fill those by hand.` : ' Review them before submitting.'),
      );
    } catch (err) {
      this.fail(err);
    } finally {
      this.applying.set(false);
    }
  }

  async clear(): Promise<void> {
    this.error.set('');
    try {
      const results = await this.page.run<{ cleared: number }>('clear');
      const cleared = results.reduce((n, r) => n + r.data.cleared, 0);
      this.reset();
      this.notice.set(cleared ? `Cleared ${cleared} field${cleared === 1 ? '' : 's'} filled by the extension.` : 'Nothing to clear on this page.');
    } catch (err) {
      this.fail(err);
    }
  }

  protected sourceLabel(f: FilledField): string {
    return f.source === 'ai' ? 'AI' : f.source === 'saved' ? 'Saved' : 'Profile';
  }

  protected isShortKind(f: ScannedField): boolean {
    return ['text', 'email', 'tel', 'url', 'number', 'date'].includes(f.kind) && !(f.maxLength && f.maxLength > 200);
  }
}
