import { describe, expect, it } from 'vitest';
import { describeChannelsUsed } from './channels';

const SLOTS = ['ECG_1', 'ECG_2', 'PPG', 'ABP'];

describe('describeChannelsUsed', () => {
  it('lists every channel the model saw', () => {
    expect(describeChannelsUsed(SLOTS, [1, 1, 1, 1])).toBe('ECG ×2 + PLETH + ABP');
  });
  it('drops masked channels', () => {
    expect(describeChannelsUsed(SLOTS, [1, 1, 1, 0])).toBe('ECG ×2 + PLETH');
    expect(describeChannelsUsed(SLOTS, [1, 0, 0, 1])).toBe('ECG + ABP');
  });
  it('says so when nothing was usable', () => {
    expect(describeChannelsUsed(SLOTS, [0, 0, 0, 0])).toBe('none');
  });
});
