'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Gate, type ReadyApp } from '@/components/Gate';
import { ObjectiveRunner } from '@/components/exam/ObjectiveRunner';
import { SpeakingRunner } from '@/components/exam/SpeakingRunner';
import { WritingRunner } from '@/components/exam/WritingRunner';
import type { Db } from '@/lib/db';
import { EXAM_SECTIONS, type ExamSection } from '@/lib/exam';
import { findItem, getExamContent, type ObjectiveItem, type SpeakingItem, type WritingItem } from '@/lib/exam-content';

export default function ExamItemPage() {
  return <Gate>{({ app, db }) => <ExamItem app={app} db={db} />}</Gate>;
}

function ExamItem({ app, db }: { app: ReadyApp; db: Db }) {
  const params = useParams<{ section: string; id: string }>();
  const section = params.section as ExamSection;
  const content = getExamContent(app.active.language_code);
  const item = content && EXAM_SECTIONS.includes(section) ? findItem(content, section, params.id) : null;

  if (!content || !item) {
    return (
      <div className="card">
        <p>Bu görev bu dilde bulunamadı. Çalıştığın dili kontrol et.</p>
        <Link className="btn" href="/exam">Sınav sekmesi</Link>
      </div>
    );
  }
  const common = { app, db, exam: content.exam, meta: content.meta };
  if (section === 'reading' || section === 'listening') return <ObjectiveRunner key={params.id} {...common} section={section} item={item as ObjectiveItem} />;
  if (section === 'writing') return <WritingRunner key={params.id} {...common} item={item as WritingItem} />;
  return <SpeakingRunner key={params.id} {...common} item={item as SpeakingItem} />;
}
