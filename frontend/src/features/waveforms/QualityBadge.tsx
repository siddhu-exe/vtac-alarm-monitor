import { QUALITY_LABEL } from '@/lib/format';
import type { Quality } from '@/stream/schemas';

const DOT_CLASS: Record<Quality, string> = {
  good: 'bg-ok',
  degraded: 'bg-warn',
  bad: 'bg-warn',
  absent: 'bg-absent',
};

/** Colour dot plus a text label: quality is never conveyed by colour alone. */
export function QualityBadge({ quality }: { quality: Quality | undefined }) {
  const dot = quality ? DOT_CLASS[quality] : 'bg-absent';
  return (
    <span className="mt-auto inline-flex items-center gap-1.5 text-micro text-fg-secondary">
      <span aria-hidden="true" className={`inline-block size-dot rounded-full ${dot}`} />
      <span data-testid="quality-label">{quality ? QUALITY_LABEL[quality] : 'Waiting'}</span>
    </span>
  );
}
