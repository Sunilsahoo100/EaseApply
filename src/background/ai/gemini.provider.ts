import type { Resume } from '../../shared/profile.model';
import type { AiAnswer, ParsedResume } from '../../shared/types';
import { AiError, type AiProvider, type AnswerRequest } from './ai-provider';
import { answerSystemPrompt, answerUserPrompt, RESUME_PROMPT } from './prompts';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_QUESTIONS_PER_CALL = 25;
/** MIME types Gemini can read directly as inline document data. */
const READABLE_MIME = /^(application\/pdf|text\/)/;

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

interface GeminiError {
  error?: { code?: number; message?: string; status?: string; details?: { '@type'?: string; retryDelay?: string }[] };
}

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

const STRING = { type: 'STRING' } as const;

const ANSWERS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answers: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { id: STRING, answer: STRING, confidence: { type: 'NUMBER' } },
        required: ['id', 'answer', 'confidence'],
      },
    },
  },
  required: ['answers'],
};

const RESUME_SCHEMA = {
  type: 'OBJECT',
  properties: {
    firstName: STRING,
    middleName: STRING,
    lastName: STRING,
    email: STRING,
    phoneCountryCode: STRING,
    phone: STRING,
    address: STRING,
    city: STRING,
    state: STRING,
    country: STRING,
    zip: STRING,
    linkedin: STRING,
    github: STRING,
    portfolio: STRING,
    website: STRING,
    currentTitle: STRING,
    currentCompany: STRING,
    totalExperienceYears: STRING,
    summary: STRING,
    skills: { type: 'ARRAY', items: STRING },
    experience: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          company: STRING,
          title: STRING,
          location: STRING,
          startDate: STRING,
          endDate: STRING,
          current: { type: 'BOOLEAN' },
          description: STRING,
        },
      },
    },
    education: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { school: STRING, degree: STRING, fieldOfStudy: STRING, startDate: STRING, endDate: STRING, grade: STRING },
      },
    },
    extractedText: STRING,
  },
  required: ['firstName', 'lastName', 'email', 'skills', 'experience', 'education', 'extractedText'],
};

function friendlyError(status: number, body: GeminiError): AiError {
  const err = body.error;
  const msg = err?.message ?? `HTTP ${status}`;
  if (status === 429 || err?.status === 'RESOURCE_EXHAUSTED') {
    const retry = err?.details?.find((d) => d.retryDelay)?.retryDelay;
    return new AiError(
      `Gemini free-tier limit reached. ${retry ? `Try again in ${retry.replace(/s$/, ' seconds')}.` : 'Wait a minute and try again.'}` +
        (/per ?day|daily/i.test(msg) ? ' The daily quota resets at midnight Pacific time.' : ''),
    );
  }
  if (/API key not valid|API_KEY_INVALID/i.test(msg)) return new AiError('Your Gemini API key is not valid. Check it in Settings.');
  if (status === 403) return new AiError(`Gemini refused the request: ${msg}`);
  if (status === 404) return new AiError(`Model not found. Pick another model in Settings. (${msg})`);
  return new AiError(`Gemini error: ${msg}`);
}

export class GeminiProvider implements AiProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    if (!apiKey) throw new AiError('Add your free Gemini API key in Settings first.');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${API}/${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      });
    } catch {
      throw new AiError('Could not reach Gemini. Check your internet connection.');
    }
    const body = (await res.json().catch(() => ({}))) as T & GeminiError;
    if (!res.ok) throw friendlyError(res.status, body);
    return body;
  }

  private async generateJson<T>(system: string | null, parts: Part[], schema: object, temperature: number): Promise<T> {
    const body = {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature },
    };
    const res = await this.request<GenerateResponse>(`models/${encodeURIComponent(this.model)}:generateContent`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (res.promptFeedback?.blockReason) throw new AiError(`Gemini blocked the request (${res.promptFeedback.blockReason}).`);
    const candidate = res.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('');
    if (!text) throw new AiError(`Gemini returned no answer (${candidate?.finishReason ?? 'unknown reason'}). Try again.`);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new AiError(
        candidate?.finishReason === 'MAX_TOKENS'
          ? 'Gemini ran out of space for the answer. Try fewer questions or a shorter answer length.'
          : 'Gemini returned a malformed answer. Try again.',
      );
    }
  }

  async answerQuestions(req: AnswerRequest): Promise<AiAnswer[]> {
    const { resume } = req;
    // Without extracted text, send the resume file itself so Gemini can still read it.
    const attachResume = !!resume && !resume.extractedText && READABLE_MIME.test(resume.mimeType);
    const out: AiAnswer[] = [];
    for (let i = 0; i < req.questions.length; i += MAX_QUESTIONS_PER_CALL) {
      const chunk = { ...req, questions: req.questions.slice(i, i + MAX_QUESTIONS_PER_CALL) };
      const parts: Part[] = [{ text: answerUserPrompt(chunk, !attachResume) }];
      if (attachResume) parts.push({ inlineData: { mimeType: resume.mimeType, data: resume.base64 } });
      const res = await this.generateJson<{ answers: AiAnswer[] }>(answerSystemPrompt(req.settings), parts, ANSWERS_SCHEMA, 0.4);
      out.push(...(res.answers ?? []));
    }
    return out;
  }

  async parseResume(resume: Resume): Promise<ParsedResume> {
    if (!READABLE_MIME.test(resume.mimeType)) {
      throw new AiError('Gemini can only read PDF or plain-text resumes. Fill the profile manually, or upload a PDF.');
    }
    return this.generateJson<ParsedResume>(
      null,
      [{ text: RESUME_PROMPT }, { inlineData: { mimeType: resume.mimeType, data: resume.base64 } }],
      RESUME_SCHEMA,
      0,
    );
  }

  async testConnection(): Promise<string> {
    const res = await this.generateJson<{ reply: string }>(
      null,
      [{ text: 'Reply with {"reply":"ok"}' }],
      { type: 'OBJECT', properties: { reply: STRING } },
      0,
    );
    return `Connected to ${this.model} (${res.reply ?? 'ok'}).`;
  }

  async listModels(): Promise<string[]> {
    interface ModelList {
      models?: { name: string; supportedGenerationMethods?: string[] }[];
      nextPageToken?: string;
    }
    const names: string[] = [];
    let token = '';
    do {
      const res = await this.request<ModelList>(`models?pageSize=1000${token ? `&pageToken=${token}` : ''}`);
      for (const m of res.models ?? []) {
        const name = m.name.replace(/^models\//, '');
        if (m.supportedGenerationMethods?.includes('generateContent') && /^gemini/.test(name) && !/tts|image|embedding|live|audio/.test(name)) {
          names.push(name);
        }
      }
      token = res.nextPageToken ?? '';
    } while (token);
    return names.sort();
  }
}
