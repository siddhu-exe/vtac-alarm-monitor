import { kindOfSlot } from '@/features/waveforms/slots';

/**
 * "ECG ×2 + PLETH + ABP": the channels the model actually saw. `mask[i]` is 1 when slot i was
 * present in the model input (the same order as /model channel_slots).
 */
export function describeChannelsUsed(slots: readonly string[], mask: readonly number[]): string {
  const used = slots.filter((_, i) => mask[i] === 1);
  const ecg = used.filter((s) => kindOfSlot(s) === 'ecg').length;
  const parts: string[] = [];
  if (ecg > 0) parts.push(ecg > 1 ? `ECG ×${ecg}` : 'ECG');
  if (used.some((s) => kindOfSlot(s) === 'pleth')) parts.push('PLETH');
  if (used.some((s) => kindOfSlot(s) === 'abp')) parts.push('ABP');
  return parts.length > 0 ? parts.join(' + ') : 'none';
}
