import type { AiAnswer, AiQuestion, JobContext, ParsedResume } from './types';

/** Actions the side panel and background run inside page frames via chrome.scripting.executeScript. */
export type ContentAction = 'scanAndFill' | 'fillAnswers' | 'clear' | 'jobContext';

/** Requests to the background service worker, which owns all Gemini calls. */
export type BackgroundRequest =
  | { type: 'AI_ANSWER_QUESTIONS'; questions: AiQuestion[]; job: JobContext | null; pageUrl: string }
  | { type: 'AI_PARSE_RESUME' }
  | { type: 'AI_TEST_KEY'; apiKey: string; model: string }
  | { type: 'AI_LIST_MODELS'; apiKey: string };

export interface BackgroundResponseMap {
  AI_ANSWER_QUESTIONS: AiAnswer[];
  AI_PARSE_RESUME: ParsedResume;
  AI_TEST_KEY: string;
  AI_LIST_MODELS: string[];
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function sendToBackground<R extends BackgroundRequest>(
  request: R,
): Promise<BackgroundResponseMap[R['type']]> {
  const res = (await chrome.runtime.sendMessage(request)) as Result<BackgroundResponseMap[R['type']]> | undefined;
  if (!res) throw new Error('No response from the extension background. Try reloading the extension.');
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
