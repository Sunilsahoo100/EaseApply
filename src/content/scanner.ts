import { isPlaceholderOption } from '../shared/option-match';
import type { FieldKind } from '../shared/types';
import { resolveGroupLabel, resolveLabel, resolveOptionLabel } from './label-resolver';

/** A live field on the page. Radio and checkbox groups are one field with several inputs. */
export interface FieldHandle {
  jafId: string;
  kind: FieldKind;
  el: HTMLElement;
  group?: HTMLInputElement[];
  label: string;
  /** Extra text (name, id, autocomplete) used for matching when the label is ambiguous. */
  attrText: string;
  options?: string[];
  required: boolean;
  maxLength?: number;
}

export interface ScanOptions {
  /** Skip elements that aren't rendered. Disabled in tests because jsdom has no layout. */
  checkVisibility?: boolean;
}

const SKIP_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'password', 'search', 'range', 'color']);
const CAPTCHA = /captcha|recaptcha|hcaptcha|cf-turnstile/i;
const JAF_ATTR = 'data-jaf-id';

const prefix = Math.random().toString(36).slice(2, 6);
let counter = 0;

function jafIdFor(el: Element): string {
  let id = el.getAttribute(JAF_ATTR);
  if (!id) {
    id = `jaf-${prefix}-${++counter}`;
    el.setAttribute(JAF_ATTR, id);
  }
  return id;
}

/** All elements under `root`, including those inside open shadow roots. */
function* deepElements(root: Document | ShadowRoot | Element): Generator<Element> {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    yield el;
    if (el.shadowRoot) yield* deepElements(el.shadowRoot);
  }
}

function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return el.getClientRects().length > 0;
}

function inputKind(input: HTMLInputElement): FieldKind | null {
  const type = (input.getAttribute('type') || 'text').toLowerCase();
  if (SKIP_INPUT_TYPES.has(type)) return null;
  switch (type) {
    case 'email':
    case 'tel':
    case 'url':
    case 'number':
    case 'date':
    case 'radio':
    case 'checkbox':
    case 'file':
      return type;
    case 'month':
    case 'datetime-local':
    case 'week':
    case 'time':
      return 'date';
    default:
      return 'text';
  }
}

function attrText(el: Element): string {
  return ['name', 'id', 'autocomplete', 'data-automation-id']
    .map((a) => el.getAttribute(a) ?? '')
    .filter(Boolean)
    .join(' ');
}

function isRequired(el: Element): boolean {
  return (
    (el as HTMLInputElement).required ||
    el.getAttribute('aria-required') === 'true' ||
    /\*\s*$/.test(el.closest('label')?.textContent ?? '')
  );
}

function selectOptions(select: HTMLSelectElement): string[] {
  return Array.from(select.options)
    .filter((o) => !o.disabled && !isPlaceholderOption(o.text, o.value))
    .map((o) => o.text.trim());
}

function isEditableRoot(el: Element): el is HTMLElement {
  const ce = el.getAttribute('contenteditable');
  return ce === '' || ce === 'true' || ce === 'plaintext-only';
}

function isControl(el: Element): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    isEditableRoot(el)
  );
}

function isSkippable(el: Element): boolean {
  if ((el as HTMLInputElement).disabled) return true;
  return CAPTCHA.test(`${el.id} ${el.getAttribute('name') ?? ''} ${el.getAttribute('class') ?? ''}`);
}

/** Finds every fillable field in `root` (default: the current document). */
export function scanFields(root: Document | ShadowRoot = document, opts: ScanOptions = {}): FieldHandle[] {
  const checkVisibility = opts.checkVisibility ?? true;
  const fields: FieldHandle[] = [];
  const groups = new Map<string, { kind: 'radio' | 'checkbox'; inputs: HTMLInputElement[] }>();

  for (const el of deepElements(root)) {
    if (!isControl(el) || isSkippable(el)) continue;

    if (el instanceof HTMLInputElement) {
      const kind = inputKind(el);
      if (!kind) continue;
      if (kind === 'radio' || kind === 'checkbox') {
        // Custom-styled radios hide the native input, so don't check visibility for them.
        const scope = el.form?.id || (el.getRootNode() === document ? 'doc' : 'shadow');
        const key = el.name ? `${kind}:${scope}:${el.name}` : `${kind}:solo:${jafIdFor(el)}`;
        const g = groups.get(key) ?? { kind, inputs: [] };
        g.inputs.push(el);
        groups.set(key, g);
        continue;
      }
      // File inputs are usually hidden behind a styled "Upload" button.
      if (kind !== 'file' && (el.readOnly || (checkVisibility && !isVisible(el)))) continue;
      fields.push({
        jafId: jafIdFor(el),
        kind,
        el,
        label: resolveLabel(el),
        attrText: attrText(el),
        required: isRequired(el),
        maxLength: el.maxLength > 0 ? el.maxLength : undefined,
      });
    } else if (el instanceof HTMLTextAreaElement) {
      if (el.readOnly || (checkVisibility && !isVisible(el))) continue;
      fields.push({
        jafId: jafIdFor(el),
        kind: 'textarea',
        el,
        label: resolveLabel(el),
        attrText: attrText(el),
        required: isRequired(el),
        maxLength: el.maxLength > 0 ? el.maxLength : undefined,
      });
    } else if (el instanceof HTMLSelectElement) {
      // Libraries like select2 hide the native select but still read its value.
      fields.push({
        jafId: jafIdFor(el),
        kind: 'select',
        el,
        label: resolveLabel(el),
        attrText: attrText(el),
        options: selectOptions(el),
        required: isRequired(el),
      });
    } else if (isEditableRoot(el)) {
      if (checkVisibility && !isVisible(el)) continue;
      fields.push({
        jafId: jafIdFor(el),
        kind: 'contenteditable',
        el,
        label: resolveLabel(el),
        attrText: attrText(el),
        required: isRequired(el),
      });
    }
  }

  for (const { kind, inputs } of groups.values()) {
    const first = inputs[0]!;
    if (kind === 'checkbox' && inputs.length === 1) {
      fields.push({
        jafId: jafIdFor(first),
        kind: 'checkbox',
        el: first,
        group: inputs,
        label: resolveOptionLabel(first),
        attrText: attrText(first),
        options: ['Yes', 'No'],
        required: isRequired(first),
      });
      continue;
    }
    fields.push({
      jafId: jafIdFor(first),
      kind: kind === 'radio' ? 'radio' : 'checkbox-group',
      el: first,
      group: inputs,
      label: resolveGroupLabel(inputs),
      attrText: attrText(first),
      options: inputs.map(resolveOptionLabel),
      required: inputs.some(isRequired),
    });
  }

  return fields;
}

/** Current value of a field as text, for "don't overwrite" checks and the preview. */
export function currentValue(field: FieldHandle): string {
  const el = field.el;
  switch (field.kind) {
    case 'radio':
    case 'checkbox-group':
      return field.group!.filter((i) => i.checked).map(resolveOptionLabel).join(', ');
    case 'checkbox':
      return (el as HTMLInputElement).checked ? 'Yes' : '';
    case 'file':
      return (el as HTMLInputElement).files?.length ? (el as HTMLInputElement).files![0]!.name : '';
    case 'select': {
      const s = el as HTMLSelectElement;
      const opt = s.selectedOptions[0];
      return opt && !isPlaceholderOption(opt.text, opt.value) ? opt.text.trim() : '';
    }
    case 'contenteditable':
      return (el.textContent ?? '').trim();
    default:
      return (el as HTMLInputElement).value.trim();
  }
}
