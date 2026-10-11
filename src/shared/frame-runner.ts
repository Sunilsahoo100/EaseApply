import type { ContentAction, Result } from './messages';

export interface FrameResult<T> {
  frameId: number;
  data: T;
}

/** Runs in the page's isolated world, where the content script exposed `__jaf`. Must be self-contained. */
function invoke(action: string, payload: unknown): unknown {
  const api = (globalThis as { __jaf?: { handle: (a: string, p: unknown) => unknown } }).__jaf;
  return api ? api.handle(action, payload) : { ok: false, error: '__jaf_missing__' };
}

const MISSING = '__jaf_missing__';

export class RestrictedPageError extends Error {
  constructor() {
    super("Chrome doesn't allow extensions on this page (e.g. chrome:// pages or the Web Store). Open a job application page instead.");
  }
}

async function execute(tabId: number, target: { allFrames: true } | { frameIds: number[] }, action: ContentAction, payload: unknown) {
  return chrome.scripting.executeScript({
    target: { tabId, ...target },
    func: invoke,
    args: [action, payload ?? null],
  });
}

/**
 * Runs a content-script action in every frame of a tab (or the given frames) and collects successful results.
 * Frames where the content script isn't loaded yet (e.g. tabs opened before install) get it injected first.
 */
export async function runInFrames<T>(
  tabId: number,
  action: ContentAction,
  payload?: unknown,
  frameIds?: number[],
): Promise<FrameResult<T>[]> {
  const target = frameIds ? { frameIds } : ({ allFrames: true } as const);
  let results: chrome.scripting.InjectionResult<unknown>[];
  try {
    results = await execute(tabId, target, action, payload);
  } catch (err) {
    if (/cannot be scripted|cannot access|chrome:\/\/|extensions gallery/i.test(String(err))) throw new RestrictedPageError();
    throw err;
  }

  const missing = results.filter((r) => (r.result as Result<T> | null)?.ok === false && (r.result as { error: string }).error === MISSING);
  if (missing.length) {
    const ids = missing.map((r) => r.frameId);
    try {
      await chrome.scripting.executeScript({ target: { tabId, frameIds: ids }, files: ['content.js'] });
      results = [...results.filter((r) => !ids.includes(r.frameId)), ...(await execute(tabId, { frameIds: ids }, action, payload))];
    } catch {
      // Some frames (sandboxed, about:blank without opener) can't be injected; skip them.
    }
  }

  const out: FrameResult<T>[] = [];
  const errors: string[] = [];
  for (const r of results) {
    const res = r.result as Result<T> | null | undefined;
    if (res?.ok) out.push({ frameId: r.frameId, data: res.data });
    else if (res && !res.ok && res.error !== MISSING) errors.push(res.error);
  }
  if (!out.length && errors.length) throw new Error(errors[0]);
  return out;
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
