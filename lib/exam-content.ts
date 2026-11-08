// Sınav içeriği (depodaki JSON dosyaları) için tipler ve erişim yardımcıları. Yalnızca uygulama tarafında içe aktarılır.

import enReading from '@/content/exam/en/reading.json';
import enListening from '@/content/exam/en/listening.json';
import enWriting from '@/content/exam/en/writing.json';
import enSpeaking from '@/content/exam/en/speaking.json';
import enMeta from '@/content/exam/en/meta.json';
import deReading from '@/content/exam/de/reading.json';
import deListening from '@/content/exam/de/listening.json';
import deWriting from '@/content/exam/de/writing.json';
import deSpeaking from '@/content/exam/de/speaking.json';
import deMeta from '@/content/exam/de/meta.json';
import { EXAM_OF_LANG, type ExamKind, type ExamQuestion, type ExamSection, type ItemRef, type RubricCriterion } from './exam.ts';

export interface ObjectiveItem {
  id: string;
  level?: string;
  title: string;
  difficulty?: string;
  minutes: number;
  text?: string;
  script?: { speaker?: string; text: string }[];
  questions: ExamQuestion[];
}

export interface WritingItem {
  id: string;
  level?: string;
  task: string;
  kind: string;
  title: string;
  prompt: string;
  minWords: number;
  minutes: number;
  wantParagraphs?: number;
  data?: { headers: string[]; rows: string[][] };
  steps?: string[];
  points?: string[];
}

export interface SpeakStep {
  kind: 'q' | 'cue';
  text: string;
  points?: string[];
  prep?: number;
  seconds: number;
}

export interface SpeakingItem {
  id: string;
  level?: string;
  part?: number;
  title: string;
  steps: SpeakStep[];
}

export interface EssayType {
  name: string;
  outline: string[];
  phrases: string[];
}

export interface ExamMeta {
  name: string;
  tagline: string;
  formatNote: string;
  format?: { section: ExamSection; text: string }[];
  levels?: Record<string, { text: string }>;
  essayTypes: Record<string, EssayType>;
  strategies: Record<string, string>;
  rubrics: { writing: RubricCriterion[]; speaking: RubricCriterion[] };
  vocab?: { lemma: string; pos: string; meaning_tr: string; example: string }[];
}

export interface ExamContent {
  exam: ExamKind;
  reading: ObjectiveItem[];
  listening: ObjectiveItem[];
  writing: WritingItem[];
  speaking: SpeakingItem[];
  meta: ExamMeta;
}

const cast = <T,>(x: unknown) => x as T;

const CONTENT: Record<string, ExamContent> = {
  en: {
    exam: 'ielts',
    reading: cast(enReading),
    listening: cast(enListening),
    writing: cast(enWriting),
    speaking: cast(enSpeaking),
    meta: cast(enMeta),
  },
  de: {
    exam: 'goethe',
    reading: cast(deReading),
    listening: cast(deListening),
    writing: cast(deWriting),
    speaking: cast(deSpeaking),
    meta: cast(deMeta),
  },
};

export function getExamContent(lang: string): ExamContent | null {
  return EXAM_OF_LANG[lang] ? (CONTENT[lang] ?? null) : null;
}

export const SECTION_ITEMS = (c: ExamContent, section: ExamSection): (ObjectiveItem | WritingItem | SpeakingItem)[] => c[section];

export function itemRefs(c: ExamContent, level?: string | null): ItemRef[] {
  const out: ItemRef[] = [];
  for (const section of ['listening', 'reading', 'writing', 'speaking'] as const) {
    for (const it of c[section]) {
      if (c.exam === 'goethe' && level && it.level !== level) continue;
      out.push({ id: it.id, section, title: it.title, level: it.level });
    }
  }
  return out;
}

export function findItem(c: ExamContent, section: ExamSection, id: string) {
  return (c[section] as { id: string }[]).find((i) => i.id === id) ?? null;
}
