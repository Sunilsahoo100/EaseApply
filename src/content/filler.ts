import { bestOptionIndex, isPlaceholderOption } from '../shared/option-match';
import { valueAlternatives } from '../shared/field-rules';
import type { FieldHandle } from './scanner';

type ValueElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function prototypeOf(el: ValueElement): object {
  if (el instanceof HTMLTextAreaElement) return HTMLTextAreaElement.prototype;
  if (el instanceof HTMLSelectElement) return HTMLSelectElement.prototype;
  return HTMLInputElement.prototype;
}

/**
 * Sets a value through the prototype's setter. React/Vue replace the instance's `value` property to
 * track edits; going through the prototype makes their change detection see the new value.
 */
export function setNativeValue(el: ValueElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(prototypeOf(el), 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

export function setNativeChecked(el: HTMLInputElement, checked: boolean): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
  if (setter) setter.call(el, checked);
  else el.checked = checked;
}

export function dispatchChange(el: Element, data?: string): void {
  const input =
    typeof InputEvent === 'function'
      ? new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: data ?? null })
      : new Event('input', { bubbles: true, composed: true });
  el.dispatchEvent(input);
  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  el.dispatchEvent(new FocusEvent('blur'));
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
}

function pickOption(value: string, options: string[]): number {
  let idx = bestOptionIndex(value, options);
  for (const alt of valueAlternatives(value)) {
    if (idx >= 0) break;
    idx = bestOptionIndex(alt, options);
  }
  return idx;
}

function isTruthy(value: string): boolean {
  return /^\s*(yes|y|true|checked|1|i (agree|accept|confirm)|agree)\b/i.test(value);
}

function toDateValue(value: string, type: string): string | null {
  const iso = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  let date: Date | null = null;
  if (iso) date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3] ?? 1));
  else if (!Number.isNaN(Date.parse(value))) date = new Date(value);
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  if (type === 'month') return `${y}-${m}`;
  if (type === 'date') return `${y}-${m}-${d}`;
  return null;
}

function fillTextLike(field: FieldHandle, value: string): string | null {
  const el = field.el as HTMLInputElement | HTMLTextAreaElement;
  let v = value;
  if (field.kind === 'number') {
    const num = value.match(/-?\d+(?:\.\d+)?/)?.[0];
    if (!num) return null;
    v = num;
  } else if (field.kind === 'date') {
    const converted = toDateValue(value, (el.getAttribute('type') ?? '').toLowerCase());
    if (converted === null) return null;
    v = converted;
  }
  if (field.maxLength && v.length > field.maxLength) v = v.slice(0, field.maxLength);
  setNativeValue(el, v);
  dispatchChange(el, v);
  return v;
}

function fillSelect(field: FieldHandle, value: string): string | null {
  const select = field.el as HTMLSelectElement;
  const real = Array.from(select.options).filter((o) => !o.disabled && !isPlaceholderOption(o.text, o.value));
  const idx = pickOption(value, real.map((o) => o.text.trim()));
  if (idx < 0) return null;
  const option = real[idx]!;
  setNativeValue(select, option.value);
  option.selected = true;
  dispatchChange(select);
  return option.text.trim();
}

function fillRadio(field: FieldHandle, value: string): string | null {
  const idx = pickOption(value, field.options ?? []);
  if (idx < 0) return null;
  const input = field.group![idx]!;
  if (!input.checked) input.click();
  if (!input.checked) {
    setNativeChecked(input, true);
    dispatchChange(input);
  }
  return field.options![idx]!;
}

function setChecked(input: HTMLInputElement, checked: boolean): void {
  if (input.checked === checked) return;
  input.click();
  if (input.checked !== checked) {
    setNativeChecked(input, checked);
    dispatchChange(input);
  }
}

function fillCheckboxGroup(field: FieldHandle, value: string): string | null {
  const options = field.options ?? [];
  const wanted = new Set(
    value
      .split(/[,;\n]/)
      .map((v) => pickOption(v.trim(), options))
      .filter((i) => i >= 0),
  );
  if (!wanted.size) return null;
  field.group!.forEach((input, i) => setChecked(input, wanted.has(i)));
  return [...wanted].map((i) => options[i]).join(', ');
}

function fillContentEditable(field: FieldHandle, value: string): string {
  const el = field.el;
  el.focus();
  el.textContent = value;
  dispatchChange(el, value);
  return value;
}

function fillFile(field: FieldHandle, file: File): string | null {
  const input = field.el as HTMLInputElement;
  if (typeof DataTransfer !== 'function') return null;
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  dispatchChange(input);
  return file.name;
}

/**
 * Puts `value` into the field the way a user would, so framework-managed forms register it.
 * Returns the value actually set (e.g. the chosen option's text), or null if nothing fit.
 */
export function fillField(field: FieldHandle, value: string, file?: File | null): string | null {
  switch (field.kind) {
    case 'file':
      return file ? fillFile(field, file) : null;
    case 'select':
      return fillSelect(field, value);
    case 'radio':
      return fillRadio(field, value);
    case 'checkbox':
      setChecked(field.el as HTMLInputElement, isTruthy(value));
      return isTruthy(value) ? 'Yes' : 'No';
    case 'checkbox-group':
      return fillCheckboxGroup(field, value);
    case 'contenteditable':
      return fillContentEditable(field, value);
    default:
      return value.trim() ? fillTextLike(field, value) : null;
  }
}
