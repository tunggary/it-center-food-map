import type { Snapshot } from '../../shared/contracts';
export function isRestore(previous: Snapshot, next: Snapshot) { return previous.dataEpoch !== next.dataEpoch || BigInt(next.revision) < BigInt(previous.revision); }
export function restoreBoothCursor(saved: unknown, snapshot: Snapshot): string {
  if (saved && typeof saved === 'object' && 'epoch' in saved && 'cursor' in saved && saved.epoch === snapshot.dataEpoch && typeof saved.cursor === 'string' && /^\d+$/.test(saved.cursor) && BigInt(saved.cursor) <= BigInt(snapshot.revision)) return saved.cursor;
  return snapshot.revision;
}
