import { useAppStore } from '@/store';

export function AppFooter() {
  const mode = useAppStore((s) => s.modelInfo?.model_mode);
  return (
    <footer className="border-t border-line pt-3 text-caption leading-normal text-fg-muted">
      {mode === 'mock'
        ? 'Mock mode: verdicts, probabilities and latencies are illustrative until the trained ONNX model is loaded. '
        : mode === 'onnx'
          ? 'Scores come from the exported ONNX model. '
          : ''}
      Waveforms are recordings replayed at their original rate, not a live monitor feed. Research
      prototype on the public VTaC dataset — not for clinical use.
    </footer>
  );
}
