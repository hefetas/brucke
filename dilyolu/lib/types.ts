import type { Cefr, Skill } from './levels.ts';

export interface Language {
  code: string;
  name_native: string;
  name_tr: string;
  tts_locale: string;
  stt_locale: string;
  is_enabled: boolean;
  is_target: boolean;
}

export interface Profile {
  id: string;
  display_name: string | null;
  native_language_code: string | null;
  daily_minutes: 10 | 20 | 40 | 60;
  interests: string[];
  reminder_time: string; // "21:00:00"
  reminder_channel: 'browser' | 'email' | 'inapp';
  timezone: string;
  theme: 'light' | 'dark' | 'system';
  tts_rate: number;
  show_subtitles: boolean;
  push_subscription: unknown | null;
  onboarding_done: boolean;
}

export interface UserLanguage {
  id: string;
  user_id: string;
  language_code: string;
  role: 'target' | 'native';
  is_active: boolean;
  level_listening: Cefr;
  level_reading: Cefr;
  level_speaking: Cefr;
  level_writing: Cefr;
  level_vocab: Cefr;
  level_grammar: Cefr;
  placement_done: boolean;
  xp: number;
}

export interface GlossaryItem {
  lemma: string;
  pos?: string;
  meaning_tr: string;
  example?: string;
  example_tr?: string;
  forms?: string[]; // metinde geçebilecek çekimli biçimler
}

export interface Question {
  prompt: string;
  options: string[];
  answer: number; // seçenek indeksi
  explain_tr?: string;
}

export interface TranscriptLine {
  speaker?: string;
  text: string;
  tr?: string;
}

export interface ListeningContent {
  id: string;
  language_code: string;
  slug: string;
  title: string;
  kind: string;
  cefr_level: Cefr;
  topics: string[];
  duration_sec: number | null;
  audio_url: string | null;
  transcript: TranscriptLine[];
  glossary: GlossaryItem[];
  questions: Question[];
}

export interface ReadingContent {
  id: string;
  language_code: string;
  slug: string;
  title: string;
  kind: string;
  cefr_level: Cefr;
  topics: string[];
  body: string;
  word_count: number | null;
  est_read_sec: number | null;
  glossary: GlossaryItem[];
  questions: Question[];
}

export interface PracticeItem {
  type: 'mcq' | 'fill';
  prompt: string;
  options?: string[];
  answer: string | number; // mcq: indeks, fill: kabul edilen metin (| ile alternatifler)
  explain_tr?: string;
}

export interface GrammarTopic {
  id: string;
  language_code: string;
  slug: string;
  title_tr: string;
  title_target: string;
  cefr_level: Cefr;
  summary_tr: string;
  examples: { text: string; tr: string; highlight?: string }[];
  practice_items: PracticeItem[];
  order_index: number;
}

export interface SpeakingTask {
  id: string;
  language_code: string;
  slug: string;
  cefr_level: Cefr;
  kind: 'repeat' | 'describe' | 'answer' | 'roleplay';
  title_tr: string;
  prompt_tr: string;
  model_text: string;
  target_phrases: string[];
  max_seconds: number;
  topics: string[];
}

export interface WritingTask {
  id: string;
  language_code: string;
  slug: string;
  cefr_level: Cefr;
  kind: string;
  title_tr: string;
  prompt_tr: string;
  target_phrases: string[];
  min_words: number;
  max_words: number;
  sample_answer: string | null;
  topics: string[];
}

export interface CardRow {
  id: string;
  user_id: string;
  language_code: string;
  card_type: string;
  vocabulary_id: string | null;
  front: string;
  back: string;
  context_sentence: string | null;
  state: 'new' | 'learning' | 'review' | 'relearning' | 'suspended';
  step: number;
  ease: number;
  interval_days: number;
  due_at: string;
  correct_count: number;
  wrong_count: number;
  lapses: number;
  used_in_speaking: boolean;
  used_in_writing: boolean;
  is_leech: boolean;
  usage_bonus_given: boolean;
  learned_at: string;
}

export interface LessonRow {
  id: string;
  user_id: string;
  language_code: string;
  lesson_date: string;
  plan_minutes: number;
  status: 'planned' | 'in_progress' | 'completed' | 'skipped';
  current_step: number;
  completed_at: string | null;
  summary: Record<string, unknown>;
  xp_earned: number;
}

export interface LessonContentRow {
  id: string;
  lesson_id: string;
  step: number;
  position: number;
  content_type: 'listening' | 'reading' | 'grammar' | 'speaking' | 'writing' | 'review' | 'real_world' | 'free';
  content_slug: string | null;
  title: string | null;
  planned_seconds: number;
  actual_seconds: number | null;
  status: 'pending' | 'done' | 'skipped';
  result: Record<string, unknown>;
}

export const SKILL_KEY: Record<Skill, keyof UserLanguage> = {
  listening: 'level_listening',
  reading: 'level_reading',
  speaking: 'level_speaking',
  writing: 'level_writing',
  vocab: 'level_vocab',
  grammar: 'level_grammar',
};

export const INTERESTS = [
  'günlük hayat', 'seyahat', 'iş', 'teknoloji', 'yemek', 'sağlık', 'eğitim', 'alışveriş', 'spor', 'kültür',
] as const;

export const PURPOSES = ['Genel', 'IELTS', 'TOEFL', 'Goethe', 'Seyahat', 'İş hayatı', 'Okul/Üniversite'] as const;
