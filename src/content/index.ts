import type { ContentAction, Result } from '../shared/messages';
import { errorMessage } from '../shared/messages';
import { base64ToFile, loadData } from '../shared/storage';
import type { FillAnswersResult, FillSource, JobContext, ScanFillResult, ScannedField } from '../shared/types';
import { clearFilled, fillAndRecord, previousFill } from './fill-registry';
import { extractJobContext } from './job-context';
import { isSensitive, matchField, profileKeyFor } from './matcher';
import { currentValue, scanFields, type FieldHandle } from './scanner';

/** Fields from the most recent scan in this frame, by jafId. */
const handles = new Map<string, FieldHandle>();

function toScanned(field: FieldHandle, sensitive: boolean): ScannedField {
  return {
    jafId: field.jafId,
    label: field.label,
    kind: field.kind,
    options: field.options,
    required: field.required,
    maxLength: field.maxLength,
    currentValue: currentValue(field),
    sensitive,
  };
}

async function scanAndFill(): Promise<ScanFillResult> {
  const { profile, resume, savedAnswers, settings } = await loadData();
  const fields = scanFields(document);
  handles.clear();
  for (const f of fields) handles.set(f.jafId, f);

  const result: ScanFillResult = { frameUrl: location.href, filled: [], unmatched: [], prefilled: 0 };
  const resumeFile = resume ? base64ToFile(resume) : null;
  const highlight = settings.highlightFields;

  for (const field of fields) {
    const earlier = previousFill(field.jafId);
    if (earlier) {
      result.filled.push({ jafId: field.jafId, label: field.label, value: earlier.value, source: earlier.source });
      continue;
    }
    if (currentValue(field) && !settings.overwriteExisting) {
      result.prefilled++;
      continue;
    }

    const key = profileKeyFor(field);
    const sensitive = isSensitive(field, key);
    const match = matchField(field, profile, savedAnswers);
    let set: string | null = null;
    if (match) {
      set =
        match.key === 'resume'
          ? resumeFile && fillAndRecord(field, '', 'profile', { file: resumeFile, highlight })
          : fillAndRecord(field, match.value, match.source, { highlight });
    }
    if (set) {
      result.filled.push({ jafId: field.jafId, label: field.label, value: set, source: match!.source });
    } else if (field.kind !== 'checkbox' || field.required) {
      // Optional single checkboxes ("Subscribe to updates") aren't worth asking about.
      result.unmatched.push(toScanned(field, sensitive));
    }
  }
  return result;
}

function findHandle(jafId: string): FieldHandle | undefined {
  const known = handles.get(jafId);
  if (known?.el.isConnected) return known;
  // The page may have re-rendered since the scan; rescan to pick up fresh elements.
  for (const f of scanFields(document)) handles.set(f.jafId, f);
  return handles.get(jafId);
}

async function fillAnswers(payload: { answers: { jafId: string; value: string; source?: FillSource }[] }): Promise<FillAnswersResult> {
  const { settings } = await loadData(['settings']);
  const result: FillAnswersResult = { filled: 0, failed: [] };
  for (const { jafId, value, source } of payload.answers) {
    const field = findHandle(jafId);
    const set = field ? fillAndRecord(field, value, source ?? 'ai', { highlight: settings.highlightFields }) : null;
    if (set) result.filled++;
    else result.failed.push(jafId);
  }
  return result;
}

async function handle(action: ContentAction, payload: unknown): Promise<Result<unknown>> {
  try {
    switch (action) {
      case 'scanAndFill':
        return { ok: true, data: await scanAndFill() };
      case 'fillAnswers':
        return { ok: true, data: await fillAnswers(payload as Parameters<typeof fillAnswers>[0]) };
      case 'clear':
        return { ok: true, data: { cleared: clearFilled() } };
      case 'jobContext':
        return { ok: true, data: extractJobContext(document) satisfies JobContext | null };
    }
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __jaf: { version: number; handle: typeof handle } | undefined;
}

// The content script can be injected twice (manifest + on-demand); keep the first instance and its registry.
if (!globalThis.__jaf) {
  globalThis.__jaf = { version: 1, handle };
}
