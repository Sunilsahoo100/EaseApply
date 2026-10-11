import type { FillSource } from '../shared/types';
import { dispatchChange, fillField, setNativeChecked, setNativeValue } from './filler';
import type { FieldHandle } from './scanner';

const OUTLINE: Record<FillSource, string> = {
  profile: '2px solid #22c55e',
  saved: '2px solid #0ea5e9',
  ai: '2px solid #8b5cf6',
};

interface Snapshot {
  field: FieldHandle;
  source: FillSource;
  filledValue: string;
  value: string;
  checked: boolean[];
  files: FileList | null;
  styled: { el: HTMLElement; outline: string; outlineOffset: string }[];
}

/** Fields this extension filled in this frame, with what they held before, so Clear can undo exactly these. */
const registry = new Map<string, Snapshot>();

function highlightTargets(field: FieldHandle): HTMLElement[] {
  if (!field.group) return [field.el];
  // Native radios are often hidden behind custom styling; outline the visible label instead.
  return field.group.map((input) => (input.labels?.[0] as HTMLElement | undefined) ?? input);
}

function snapshot(field: FieldHandle): Snapshot {
  const el = field.el as HTMLInputElement;
  return {
    field,
    source: 'profile',
    filledValue: '',
    value: field.kind === 'contenteditable' ? field.el.textContent ?? '' : el.value ?? '',
    checked: field.group?.map((i) => i.checked) ?? [],
    files: field.kind === 'file' ? el.files : null,
    styled: [],
  };
}

function highlight(snap: Snapshot): void {
  for (const target of highlightTargets(snap.field)) {
    if (!snap.styled.some((s) => s.el === target)) {
      snap.styled.push({ el: target, outline: target.style.outline, outlineOffset: target.style.outlineOffset });
    }
    target.style.outline = OUTLINE[snap.source];
    target.style.outlineOffset = '1px';
  }
}

/**
 * Fills a field and remembers its state from before the first fill, so Clear can restore it.
 * Returns the value set, or null if the value didn't fit the field.
 */
export function fillAndRecord(
  field: FieldHandle,
  value: string,
  source: FillSource,
  opts: { file?: File | null; highlight: boolean },
): string | null {
  const snap = registry.get(field.jafId) ?? snapshot(field);
  const set = fillField(field, value, opts.file);
  if (set === null) return null;
  snap.source = source;
  snap.filledValue = set;
  registry.set(field.jafId, snap);
  if (opts.highlight) highlight(snap);
  return set;
}

export function previousFill(jafId: string): { source: FillSource; value: string } | null {
  const snap = registry.get(jafId);
  return snap ? { source: snap.source, value: snap.filledValue } : null;
}

function restore(snap: Snapshot): void {
  const { field } = snap;
  const el = field.el;
  switch (field.kind) {
    case 'radio':
    case 'checkbox':
    case 'checkbox-group':
      field.group!.forEach((input, i) => {
        const want = snap.checked[i] ?? false;
        if (input.checked !== want) {
          setNativeChecked(input, want);
          dispatchChange(input);
        }
      });
      break;
    case 'file': {
      const input = el as HTMLInputElement;
      if (snap.files) input.files = snap.files;
      else if (typeof DataTransfer === 'function') input.files = new DataTransfer().files;
      else input.value = '';
      dispatchChange(input);
      break;
    }
    case 'contenteditable':
      el.textContent = snap.value;
      dispatchChange(el);
      break;
    default:
      setNativeValue(el as HTMLInputElement, snap.value);
      dispatchChange(el);
  }
  for (const s of snap.styled) {
    s.el.style.outline = s.outline;
    s.el.style.outlineOffset = s.outlineOffset;
  }
}

/** Restores every field this extension filled. Returns how many were cleared. */
export function clearFilled(): number {
  let count = 0;
  for (const snap of registry.values()) {
    if (!snap.field.el.isConnected) continue;
    restore(snap);
    count++;
  }
  registry.clear();
  return count;
}
