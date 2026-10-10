import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { computeView } from '@/config/view';
import { MODEL } from '@/test/helpers';
import { axisTicks, GradCamOverlay, InputWindowOverlay, OnsetLine, TimeAxis } from './overlays';

const view = computeView(MODEL);

describe('axisTicks', () => {
  it('runs every 2 s relative to the onset and marks the onset tick', () => {
    const ticks = axisTicks(view);
    expect(ticks.map((t) => t.label)).toEqual([
      '−14',
      '−12',
      '−10',
      '−8',
      '−6',
      '−4',
      '−2',
      '0',
      '+2',
      '+4',
    ]);
    expect(ticks.filter((t) => t.isOnset)).toHaveLength(1);
    expect(ticks[0]?.left).toBe(0);
    expect(ticks.at(-1)?.left).toBe(100);
  });
});

describe('overlays are positioned from the view, not hard-coded', () => {
  it('places the input window and the onset line', () => {
    render(
      <div>
        <InputWindowOverlay view={view} />
        <OnsetLine view={view} />
      </div>,
    );
    const win = screen.getByTestId('input-window');
    expect(parseFloat(win.style.left)).toBeCloseTo(33.33, 1); // window starts 6 s into the 18 s view
    expect(parseFloat(win.style.width)).toBeCloseTo(55.56, 1); // 10 s of 18 s
    expect(parseFloat(screen.getByTestId('onset-line').style.left)).toBeCloseTo(77.78, 1);
  });

  it('moves with the configured window offset', () => {
    const benchmark = computeView({ ...MODEL, window_end_offset_s: 0 });
    render(<InputWindowOverlay view={benchmark} />);
    expect(parseFloat(screen.getByTestId('input-window').style.left)).toBeCloseTo(33.33, 1);
    expect(parseFloat(screen.getByTestId('input-window').style.width)).toBeCloseTo(55.56, 1);
  });
});

describe('GradCamOverlay', () => {
  it('draws one bar per bin across the model window with opacity from the importance', () => {
    render(<GradCamOverlay bins={[0, 0.5, 1]} view={view} />);
    const bars = screen.getByTestId('gradcam').children;
    expect(bars).toHaveLength(3);
    expect(parseFloat((bars[0] as HTMLElement).style.opacity)).toBe(0);
    expect(parseFloat((bars[2] as HTMLElement).style.opacity)).toBeCloseTo(0.6);
    const widths = [...bars].map((b) => parseFloat((b as HTMLElement).style.width));
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(55.56, 1);
  });
  it('renders nothing for an empty attribution', () => {
    const { container } = render(<GradCamOverlay bins={[]} view={view} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('TimeAxis', () => {
  it('shows tick labels and the unit caption', () => {
    render(<TimeAxis view={view} />);
    expect(screen.getByText('+4')).toBeInTheDocument();
    expect(screen.getByText('seconds from onset')).toBeInTheDocument();
  });
  it('renders without ticks before the view is known', () => {
    render(<TimeAxis view={null} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
