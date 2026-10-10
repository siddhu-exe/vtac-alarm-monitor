import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeView } from '@/config/view';
import { chunk, session } from '@/test/fixtures';
import { MODEL } from '@/test/helpers';
import { createFrameScheduler } from './frameScheduler';
import { LiveBuffers } from './LiveBuffers';
import { buildStripSpecs } from './slots';
import { WaveformStrip } from './WaveformStrip';

interface FakePlot {
  setData: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}
const plots = vi.hoisted(() => ({ created: [] as unknown[] }));
vi.mock('uplot', () => ({
  default: class {
    setData = vi.fn();
    setSize = vi.fn();
    destroy = vi.fn();
    constructor() {
      plots.created.push(this);
    }
  },
}));
const created = () => plots.created as FakePlot[];

const view = computeView(MODEL);
const specs = buildStripSpecs(MODEL.channel_slots, {
  ECG_1: 'II',
  ECG_2: 'V',
  PPG: 'PLETH',
  ABP: null,
});
const spec = (slot: string) => {
  const s = specs.find((x) => x.slot === slot);
  if (!s) throw new Error(slot);
  return s;
};

function manualScheduler() {
  const frames: FrameRequestCallback[] = [];
  const scheduler = createFrameScheduler(
    (cb) => frames.push(cb),
    () => undefined,
  );
  return {
    scheduler,
    frame: () => {
      frames.splice(0).forEach((cb) => {
        cb(0);
      });
    },
  };
}

beforeEach(() => {
  plots.created.length = 0;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('WaveformStrip: missing channel', () => {
  it('shows the notice instead of a trace and never creates a chart', () => {
    const live = new LiveBuffers();
    const { scheduler } = manualScheduler();
    render(
      <WaveformStrip
        spec={spec('ABP')}
        recorded={false}
        live={live}
        scheduler={scheduler}
        view={view}
      />,
    );
    expect(screen.getByText('Channel not recorded · masked in model input')).toBeInTheDocument();
    expect(screen.getByTestId('readout-value')).toHaveTextContent('—');
    expect(screen.getByText('not recorded')).toBeInTheDocument();
    expect(screen.getByTestId('quality-label')).toHaveTextContent('Absent');
    expect(screen.queryByTestId('input-window')).not.toBeInTheDocument();
    expect(created()).toHaveLength(0);
  });
});

describe('WaveformStrip: recorded channel', () => {
  const sess = session({ channels: ['ECG_1', 'PPG'], fs: { ECG_1: 250, PPG: 250 } });

  it('creates one chart, feeds it inside the frame, and shows label, quality and readout', () => {
    const live = new LiveBuffers();
    const { scheduler, frame } = manualScheduler();
    live.onData(scheduler.request);
    render(
      <WaveformStrip spec={spec('ECG_1')} recorded live={live} scheduler={scheduler} view={view} />,
    );
    expect(created()).toHaveLength(1);
    expect(screen.getByText('II')).toBeInTheDocument();
    expect(screen.getByText('ECG · mV')).toBeInTheDocument();

    act(() => {
      live.reset(sess, view);
      live.chunk(
        chunk({
          t0: 286,
          channels: { ECG_1: [0.1, null, 0.3] },
          quality: { ECG_1: 'degraded' },
          numerics: { hr_bpm: 184, pr_bpm: null, abp_sys: null, abp_dia: null, abp_map: null },
        }),
      );
    });
    // nothing is drawn until the animation frame...
    const plot = created()[0];
    const drawsBefore = plot?.setData.mock.calls.length ?? 0;
    act(() => {
      frame();
    });
    const calls = plot?.setData.mock.calls as [[number[], (number | null)[]]][];
    expect(calls.length).toBeGreaterThan(drawsBefore);
    const [xs, ys] = calls.at(-1)?.[0] ?? [[], []];
    expect(xs).toHaveLength(4500);
    expect(xs[0]).toBe(286);
    const rounded = ys.slice(0, 4).map((v) => (v === null ? null : Math.round(v * 1000) / 1000));
    expect(rounded).toEqual([0.1, null, 0.3, null]); // the dropped sample is a gap
    // ...and the slow values reach the DOM through the throttled subscription
    act(() => {
      live.chunk(chunk({ t0: 287, channels: { ECG_1: [0] }, quality: { ECG_1: 'degraded' } }));
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId('quality-label')).toHaveTextContent('Noisy');
    expect(screen.getByTestId('readout-value')).toHaveTextContent('184');
  });

  it('does not redraw when nothing changed, and does not recreate the chart on re-render', () => {
    const live = new LiveBuffers();
    const { scheduler, frame } = manualScheduler();
    live.onData(scheduler.request);
    const { rerender } = render(
      <WaveformStrip spec={spec('PPG')} recorded live={live} scheduler={scheduler} view={view} />,
    );
    act(() => {
      live.reset(sess, view);
      live.chunk(chunk({ t0: 286, channels: { PPG: [1, 2] } }));
      frame();
    });
    const plot = created()[0];
    const n = plot?.setData.mock.calls.length ?? 0;
    act(() => {
      scheduler.request();
      frame();
    });
    expect(plot?.setData.mock.calls.length).toBe(n);
    rerender(
      <WaveformStrip spec={spec('PPG')} recorded live={live} scheduler={scheduler} view={view} />,
    );
    expect(created()).toHaveLength(1);
  });

  it('keeps its chart (hidden) when a later alarm lacks the channel, and destroys it on unmount', () => {
    const live = new LiveBuffers();
    const { scheduler } = manualScheduler();
    const { rerender, unmount } = render(
      <WaveformStrip spec={spec('PPG')} recorded live={live} scheduler={scheduler} view={view} />,
    );
    rerender(
      <WaveformStrip
        spec={spec('PPG')}
        recorded={false}
        live={live}
        scheduler={scheduler}
        view={view}
      />,
    );
    expect(created()).toHaveLength(1);
    expect(created()[0]?.destroy).not.toHaveBeenCalled();
    expect(screen.getByText('Channel not recorded · masked in model input')).toBeInTheDocument();
    unmount();
    expect(created()[0]?.destroy).toHaveBeenCalledTimes(1);
  });

  it('renders an attribution overlay when one is supplied', () => {
    const live = new LiveBuffers();
    const { scheduler } = manualScheduler();
    render(
      <WaveformStrip
        spec={spec('ECG_1')}
        recorded
        live={live}
        scheduler={scheduler}
        view={view}
        overlay={<div data-testid="overlay" />}
      />,
    );
    expect(screen.getByTestId('overlay')).toBeInTheDocument();
  });
});
