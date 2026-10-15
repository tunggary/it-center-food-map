import { act } from '@testing-library/react';
import { vi } from 'vitest';

const listeners = new Set<() => void>();
export function installRankingObserver() {
  listeners.clear();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private callback: IntersectionObserverCallback) {}
    private intersect = () => this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    observe() { listeners.add(this.intersect); }
    disconnect() { listeners.delete(this.intersect); }
  });
}
export async function intersectRankingEnd() {
  await act(async () => { for (const listener of [...listeners]) listener(); });
}
