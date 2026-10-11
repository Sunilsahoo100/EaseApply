import { runInFrames } from '../shared/frame-runner';
import { errorMessage, type BackgroundRequest, type BackgroundResponseMap, type Result } from '../shared/messages';
import { DEFAULT_MODEL } from '../shared/profile.model';
import { loadData } from '../shared/storage';
import type { AiAnswer, ScanFillResult } from '../shared/types';
import { AiError } from './ai/ai-provider';
import { GeminiProvider } from './ai/gemini.provider';

// The toolbar icon opens the side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

/** Answers already generated, so re-opening the panel on the same page doesn't spend free-tier quota. */
const answerCache = new Map<string, AiAnswer>();

async function provider(apiKey?: string, model?: string): Promise<GeminiProvider> {
  const { settings } = await loadData(['settings']);
  return new GeminiProvider(apiKey ?? settings.geminiApiKey, model || settings.model || DEFAULT_MODEL);
}

async function answerQuestions(req: Extract<BackgroundRequest, { type: 'AI_ANSWER_QUESTIONS' }>): Promise<AiAnswer[]> {
  const { profile, resume, settings } = await loadData(['profile', 'resume', 'settings']);
  if (!resume && !profile.summary && !profile.experience.length) {
    throw new AiError('Upload your resume (or fill in your experience) in the Profile tab so the AI has something to work from.');
  }
  const cacheKey = (q: { question: string; options?: string[] }) =>
    [settings.model, settings.tone, settings.answerLength, req.pageUrl, q.question, q.options?.join('|')].join('\u0000');

  const fresh = req.questions.filter((q) => !answerCache.has(cacheKey(q)));
  if (fresh.length) {
    const answers = await (await provider()).answerQuestions({ questions: fresh, profile, resume, job: req.job, settings });
    for (const a of answers) {
      const q = fresh.find((f) => f.id === a.id);
      if (q && a.answer) answerCache.set(cacheKey(q), a);
    }
  }
  return req.questions.map((q) => {
    const cached = answerCache.get(cacheKey(q));
    return { id: q.id, answer: cached?.answer ?? '', confidence: cached?.confidence ?? 0 };
  });
}

async function handle(req: BackgroundRequest): Promise<BackgroundResponseMap[BackgroundRequest['type']]> {
  switch (req.type) {
    case 'AI_ANSWER_QUESTIONS':
      return answerQuestions(req);
    case 'AI_PARSE_RESUME': {
      const { resume } = await loadData(['resume']);
      if (!resume) throw new AiError('Upload a resume first.');
      return (await provider()).parseResume(resume);
    }
    case 'AI_TEST_KEY':
      return (await provider(req.apiKey, req.model)).testConnection();
    case 'AI_LIST_MODELS':
      return (await provider(req.apiKey)).listModels();
  }
}

const AI_TYPES = new Set<string>(['AI_ANSWER_QUESTIONS', 'AI_PARSE_RESUME', 'AI_TEST_KEY', 'AI_LIST_MODELS']);

chrome.runtime.onMessage.addListener((msg: BackgroundRequest, sender, sendResponse: (r: Result<unknown>) => void) => {
  // Only the extension's own pages (the side panel) may use the API key.
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  if (!AI_TYPES.has(msg?.type)) return false;
  handle(msg).then(
    (data) => sendResponse({ ok: true, data }),
    (err) => sendResponse({ ok: false, error: errorMessage(err) }),
  );
  return true;
});

async function flashBadge(tabId: number, text: string, color: string): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
  await chrome.action.setBadgeText({ tabId, text });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {}), 4000);
}

// Alt+Shift+F: fill known fields without opening the panel; the badge shows how many were filled.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'quick-fill' || !tab?.id) return;
  try {
    const results = await runInFrames<ScanFillResult>(tab.id, 'scanAndFill');
    const count = results.reduce((n, r) => n + r.data.filled.length, 0);
    await flashBadge(tab.id, String(count), '#16a34a');
  } catch {
    await flashBadge(tab.id, '!', '#dc2626');
  }
});
