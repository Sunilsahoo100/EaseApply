import { cleanLabel, humanize } from '../shared/text';

const CONTROL_SELECTOR = 'input, select, textarea, button, [contenteditable="true"], [contenteditable=""]';
const MAX_LABEL_TEXT = 250;

function textOf(el: Element | null | undefined): string {
  if (!el) return '';
  const html = el as HTMLElement;
  // innerText respects CSS visibility; jsdom doesn't implement it, so fall back to textContent.
  const text = typeof html.innerText === 'string' ? html.innerText : html.textContent;
  return cleanLabel(text ?? '');
}

/** Text of a label element without the text of any controls inside it (e.g. a nested select's options). */
function labelText(label: Element): string {
  const clone = label.cloneNode(true) as Element;
  clone.querySelectorAll(CONTROL_SELECTOR + ', option, [aria-hidden="true"]').forEach((n) => n.remove());
  return textOf(clone) || cleanLabel(clone.textContent ?? '');
}

function byIds(el: Element, ids: string | null): string {
  if (!ids) return '';
  const root = el.getRootNode() as Document | ShadowRoot;
  return ids
    .split(/\s+/)
    .map((id) => {
      const target = root.getElementById?.(id) ?? el.ownerDocument.getElementById(id);
      return target ? labelText(target) : '';
    })
    .filter(Boolean)
    .join(' ');
}

function labelsOf(el: Element): string {
  const labels = (el as HTMLInputElement).labels;
  if (labels?.length) {
    const text = Array.from(labels).map(labelText).filter(Boolean).join(' ');
    if (text) return text;
  }
  // `labels` doesn't see across shadow boundaries or into custom elements; look for label[for] manually.
  const id = el.id;
  if (id) {
    const root = el.getRootNode() as Document | ShadowRoot;
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&');
    const label = root.querySelector?.(`label[for="${escaped}"]`);
    if (label) return labelText(label);
  }
  const wrapping = el.closest('label');
  return wrapping ? labelText(wrapping) : '';
}

function containsControl(el: Element): boolean {
  return el.matches(CONTROL_SELECTOR) || !!el.querySelector(CONTROL_SELECTOR);
}

/**
 * Nearest text that visually precedes `el`: walks up a few ancestors and checks earlier siblings.
 * Catches layouts like `<div><div class="label">Name</div><input></div>`.
 */
export function precedingText(el: Element, maxDepth = 4): string {
  let node: Element | null = el;
  for (let depth = 0; node && depth < maxDepth; depth++) {
    let sibling = node.previousElementSibling;
    for (let hops = 0; sibling && hops < 3; hops++) {
      if (!containsControl(sibling)) {
        const t = textOf(sibling);
        if (t.length >= 2 && t.length <= MAX_LABEL_TEXT) return t;
      }
      sibling = sibling.previousElementSibling;
    }
    // Text nodes directly before the element: "Name: <input>".
    let prev = node.previousSibling;
    while (prev && prev.nodeType === Node.TEXT_NODE && !prev.textContent?.trim()) prev = prev.previousSibling;
    if (prev?.nodeType === Node.TEXT_NODE) {
      const t = cleanLabel(prev.textContent ?? '');
      if (t.length >= 2 && t.length <= MAX_LABEL_TEXT) return t;
    }
    const parent: Element | null = node.parentElement ?? ((node.getRootNode() as ShadowRoot).host ?? null);
    if (!parent || parent === el.ownerDocument.body) break;
    node = parent;
  }
  return '';
}

function attrName(el: Element): string {
  return humanize(el.getAttribute('name') || el.id || el.getAttribute('data-automation-id') || '');
}

/** Best human-readable question for a single control. */
export function resolveLabel(el: Element): string {
  return (
    labelsOf(el) ||
    byIds(el, el.getAttribute('aria-labelledby')) ||
    cleanLabel(el.getAttribute('aria-label') ?? '') ||
    cleanLabel(el.getAttribute('placeholder') ?? '') ||
    cleanLabel(el.getAttribute('title') ?? '') ||
    precedingText(el) ||
    attrName(el)
  );
}

/** The text of one radio/checkbox option ("Yes", "No", "Remote"). */
export function resolveOptionLabel(input: HTMLInputElement): string {
  return (
    labelsOf(input) ||
    byIds(input, input.getAttribute('aria-labelledby')) ||
    cleanLabel(input.getAttribute('aria-label') ?? '') ||
    cleanLabel(input.nextSibling?.textContent ?? '') ||
    textOf(input.nextElementSibling) ||
    input.value
  );
}

function commonAncestor(els: Element[]): Element | null {
  if (!els.length) return null;
  let candidate: Element | null = els[0]!.parentElement;
  while (candidate && !els.every((e) => candidate!.contains(e))) candidate = candidate.parentElement;
  return candidate;
}

/** The question for a radio/checkbox group, e.g. "Are you willing to relocate?". */
export function resolveGroupLabel(inputs: HTMLInputElement[]): string {
  const first = inputs[0]!;
  const fieldset = first.closest('fieldset');
  const legend = fieldset?.querySelector('legend');
  if (legend && fieldset!.contains(inputs[inputs.length - 1]!)) {
    const t = labelText(legend);
    if (t) return t;
  }
  const group = first.closest('[role="radiogroup"], [role="group"]');
  if (group) {
    const t = byIds(group, group.getAttribute('aria-labelledby')) || cleanLabel(group.getAttribute('aria-label') ?? '');
    if (t) return t;
  }
  const container = commonAncestor(inputs);
  if (container) {
    const t = precedingText(container) || headingInside(container, inputs);
    if (t) return t;
  }
  return attrName(first);
}

/** A label-like text node at the top of the group container, before the first option. */
function headingInside(container: Element, inputs: HTMLInputElement[]): string {
  const first = inputs[0]!;
  for (const child of Array.from(container.children)) {
    if (child.contains(first) || child.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_PRECEDING) break;
    if (!containsControl(child)) {
      const t = textOf(child);
      if (t.length >= 2 && t.length <= MAX_LABEL_TEXT) return t;
    }
  }
  return '';
}
