'use client';

import { Gate } from '@/components/Gate';
import { ReviewLoader } from '@/components/ReviewLoader';

export default function ReviewCardsPage() {
  return <Gate>{({ app, db }) => <ReviewLoader app={app} db={db} />}</Gate>;
}
