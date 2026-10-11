import type { Profile } from './profile.model';

export type FieldKind =
  | 'text'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'date'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'checkbox-group'
  | 'file'
  | 'contenteditable';

/** A form field found on the page, in a form that can cross the extension messaging boundary. */
export interface ScannedField {
  jafId: string;
  /** Set by the frame runner, not by the content script. */
  frameId?: number;
  label: string;
  kind: FieldKind;
  options?: string[];
  required: boolean;
  maxLength?: number;
  currentValue: string;
  /** EEO, consent and similar questions the AI must never answer. */
  sensitive: boolean;
}

export type FillSource = 'profile' | 'saved' | 'ai';

export interface FilledField {
  jafId: string;
  frameId?: number;
  label: string;
  value: string;
  source: FillSource;
}

export interface ScanFillResult {
  frameUrl: string;
  filled: FilledField[];
  unmatched: ScannedField[];
  /** Fields that already had a value and were left alone. */
  prefilled: number;
}

export interface FillAnswersResult {
  filled: number;
  failed: string[];
}

export interface JobContext {
  title: string;
  company: string;
  description: string;
  url: string;
  source: 'json-ld' | 'page' | 'manual';
}

export interface AiQuestion {
  id: string;
  question: string;
  kind: FieldKind;
  options?: string[];
  maxLength?: number;
  required: boolean;
}

export interface AiAnswer {
  id: string;
  answer: string;
  confidence: number;
}

export type ParsedResume = Partial<Profile> & { extractedText: string };
