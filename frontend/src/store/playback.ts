import type { StateCreator } from 'zustand';
import type { AppState, PlaybackSlice } from './types';

export const createPlaybackSlice: StateCreator<AppState, [], [], PlaybackSlice> = (set) => ({
  playing: true,
  speed: 1,
  autoAdvance: true,
  setPlaying: (playing) => {
    set({ playing });
  },
  setSpeed: (speed) => {
    set({ speed });
  },
  setAutoAdvance: (autoAdvance) => {
    set({ autoAdvance });
  },
});
