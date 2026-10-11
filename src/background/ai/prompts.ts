import { profileForAi, type Settings } from '../../shared/profile.model';
import type { AnswerRequest } from './ai-provider';

const LENGTH_GUIDE: Record<Settings['answerLength'], string> = {
  short: '1-2 sentences (under 50 words)',
  medium: '3-5 sentences (about 80-120 words)',
  detailed: '2 short paragraphs (about 150-250 words)',
};

export function answerSystemPrompt(settings: Settings): string {
  return `You fill out job application forms on behalf of the applicant described below.

Rules:
- Write in the first person, as the applicant.
- Use ONLY facts found in the resume and profile. Never invent employers, titles, degrees, dates, numbers, links or skills.
- If a question needs information that isn't available, return an empty string for "answer" and a confidence of 0.
- If a question lists options, "answer" MUST be exactly one of the options, copied verbatim. For "checkbox-group" questions you may return several options separated by commas.
- Short factual fields (text, number, url, email, date) get just the value, with no sentence around it. Dates use YYYY-MM-DD.
- Open-ended questions (motivation, fit, strengths, "why this company") should be ${LENGTH_GUIDE[settings.answerLength]}, in a ${settings.tone} tone. Connect specific experience from the resume to the requirements in the job description. Mention the company or role by name when known.
- Never use placeholders like [Company] or [Your Name], and never exceed a question's maxLength.
- "confidence" is 0..1: how sure you are the answer is correct and grounded in the resume.
- Answer every question id exactly once.`;
}

export function answerUserPrompt(req: AnswerRequest, includeResumeText: boolean): string {
  const job = req.job
    ? { title: req.job.title, company: req.job.company, description: req.job.description }
    : 'Not available. Keep answers about the role general.';
  const questions = req.questions.map((q) => ({
    id: q.id,
    question: q.question,
    type: q.kind,
    ...(q.options?.length ? { options: q.options } : {}),
    ...(q.maxLength ? { maxLength: q.maxLength } : {}),
  }));
  return [
    '## Applicant profile',
    JSON.stringify(profileForAi(req.profile), null, 1),
    includeResumeText && req.resume?.extractedText ? `## Resume\n${req.resume.extractedText}` : '',
    '## Job',
    JSON.stringify(job, null, 1),
    '## Questions to answer',
    JSON.stringify(questions, null, 1),
  ]
    .filter(Boolean)
    .join('\n\n');
}

export const RESUME_PROMPT = `Extract the applicant's details from this resume.
- Copy values exactly as written; leave a field empty if the resume doesn't state it. Do not guess.
- firstName/lastName: split the person's name. phone: without the country code; put the code (e.g. "+91") in phoneCountryCode.
- totalExperienceYears: total years of professional experience as a number (e.g. "4.5"), computed from the work history.
- currentTitle/currentCompany: the most recent role.
- Dates: "YYYY-MM" when month is known, otherwise "YYYY". Use endDate "" and current=true for ongoing roles.
- summary: 2-3 sentences summarizing the applicant, written in first person.
- extractedText: the full plain text of the resume, preserving section order.`;
