import type { Attribution } from '@/stream/schemas';
import { kindOfSlot, TEXT_CLASS_BY_KIND } from '@/features/waveforms/slots';

interface Props {
  slots: readonly string[];
  attribution: Attribution | undefined;
  /** Source channel names (II, V, PLETH, ...) from the alarm detail. */
  sources: Readonly<Record<string, string | null>> | undefined;
}

function nameOf(slot: string, sources: Props['sources']): string {
  const source = sources?.[slot];
  return kindOfSlot(slot) === 'ecg' && source ? `ECG ${source}` : (source ?? slot);
}

/**
 * "Where the model looked". Grad-CAM is a checkpoint-2 item: until the backend sends
 * `attribution` this shows a plain placeholder instead of invented numbers.
 */
export function AttributionBars({ slots, attribution, sources }: Props) {
  return (
    <div className="flex flex-col gap-2.5 border-t border-line pt-3.5">
      <h3 className="m-0 text-body-sm font-semibold">Where the model looked</h3>
      {attribution ? (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {slots
            .filter((slot) => slot in attribution.channel_share)
            .map((slot) => {
              const pct = Math.round((attribution.channel_share[slot] ?? 0) * 100);
              return (
                <li key={slot} className="grid grid-cols-attr items-center gap-2.5">
                  <span
                    className={`font-mono text-caption ${TEXT_CLASS_BY_KIND[kindOfSlot(slot)]}`}
                  >
                    {nameOf(slot, sources)}
                  </span>
                  <span
                    aria-hidden="true"
                    className="relative block h-bar overflow-hidden rounded-track bg-track"
                  >
                    <span
                      className="absolute inset-y-0 left-0 bg-gradcam"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="text-right font-mono text-caption">{pct}%</span>
                </li>
              );
            })}
        </ul>
      ) : (
        <p className="m-0 text-caption leading-normal text-fg-muted">
          Grad-CAM attribution is not computed in this build (planned for checkpoint 2). Per-channel
          shares will appear here.
        </p>
      )}
    </div>
  );
}
