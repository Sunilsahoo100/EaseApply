import type { Profile, Resume, Settings } from '../../shared/profile.model';
import type { AiAnswer, AiQuestion, JobContext, ParsedResume } from '../../shared/types';

export interface AnswerRequest {
  questions: AiQuestion[];
  profile: Profile;
  resume: Resume | null;
  job: JobContext | null;
  settings: Settings;
}

/** A model backend. Gemini is the only one today; others (Groq, OpenRouter, Ollama) can implement this later. */
export interface AiProvider {
  answerQuestions(req: AnswerRequest): Promise<AiAnswer[]>;
  parseResume(resume: Resume): Promise<ParsedResume>;
  testConnection(): Promise<string>;
  listModels(): Promise<string[]>;
}

/** An error whose message is already worded for the user. */
export class AiError extends Error {}
