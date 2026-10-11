import {
  keyFromAutocomplete,
  keyFromText,
  profileValue,
  SENSITIVE_KEYS,
  SENSITIVE_QUESTION,
  valueAlternatives,
  type ProfileKey,
} from '../shared/field-rules';
import { bestOptionIndex } from '../shared/option-match';
import type { Profile, SavedAnswer } from '../shared/profile.model';
import { humanize, normalize, tokenSimilarity } from '../shared/text';
import type { FieldHandle } from './scanner';

export interface FieldMatch {
  key: ProfileKey | null;
  value: string;
  source: 'profile' | 'saved';
}

const SAVED_ANSWER_THRESHOLD = 0.8;

export function profileKeyFor(field: FieldHandle): ProfileKey | null {
  const grouped = field.kind === 'radio' || field.kind === 'checkbox' || field.kind === 'checkbox-group';
  return (
    (grouped ? null : keyFromAutocomplete(field.el.getAttribute('autocomplete'))) ??
    keyFromText(field.label, field.kind) ??
    keyFromText(humanize(field.attrText), field.kind)
  );
}

export function isSensitive(field: FieldHandle, key: ProfileKey | null = profileKeyFor(field)): boolean {
  return (key !== null && SENSITIVE_KEYS.has(key)) || SENSITIVE_QUESTION.test(field.label);
}

function fitsOptions(field: FieldHandle, value: string): boolean {
  if (!field.options || field.kind === 'checkbox') return true;
  return [value, ...valueAlternatives(value)].some((v) => bestOptionIndex(v, field.options!) >= 0);
}

export function findSavedAnswer(label: string, saved: SavedAnswer[]): SavedAnswer | null {
  const key = normalize(label);
  if (!key) return null;
  let best: SavedAnswer | null = null;
  let bestScore = 0;
  for (const sa of saved) {
    const score = normalize(sa.question) === key ? 1 : tokenSimilarity(label, sa.question);
    if (score > bestScore) {
      bestScore = score;
      best = sa;
    }
  }
  return bestScore >= SAVED_ANSWER_THRESHOLD ? best : null;
}

/** What to put in a field from the profile or saved answers, or null if the AI (or the user) must answer. */
export function matchField(field: FieldHandle, profile: Profile, saved: SavedAnswer[]): FieldMatch | null {
  const key = profileKeyFor(field);
  if (key === 'resume') return { key, value: '', source: 'profile' };
  if (key) {
    const value = profileValue(key, profile);
    if (value && fitsOptions(field, value)) return { key, value, source: 'profile' };
  }
  if (field.kind === 'file') return null;
  const savedAnswer = findSavedAnswer(field.label, saved);
  if (savedAnswer && fitsOptions(field, savedAnswer.answer)) {
    return { key: null, value: savedAnswer.answer, source: 'saved' };
  }
  return null;
}
