import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// jsdom has no ResizeObserver; strips only need it to exist.
class ResizeObserverStub {
  observe = (): undefined => undefined;
  unobserve = (): undefined => undefined;
  disconnect = (): undefined => undefined;
}
globalThis.ResizeObserver = ResizeObserverStub;
