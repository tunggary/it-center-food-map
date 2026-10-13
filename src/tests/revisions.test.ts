import { describe, expect, it } from 'vitest';
import { isRestore, restoreBoothCursor } from '../lib/revisions';
import { approximateDistance } from '../features/courses/Editor';
import { createFavoriteSchema, graphemeLength } from '../../shared/validation';
const epoch = 'b3a184e2-56fc-4e6e-bd7f-09454680579a';
describe('restoration and completed booth cursor', () => {
  it('compares revisions above Number.MAX_SAFE_INTEGER without rounding', () => { expect(isRestore({ revision: '9007199254740993', dataEpoch: epoch }, { revision: '9007199254740992', dataEpoch: epoch })).toBe(true); expect(isRestore({ revision: '9007199254740992', dataEpoch: epoch }, { revision: '9007199254740993', dataEpoch: epoch })).toBe(false); });
  it('resets on epoch replacement even if the new revision is greater', () => expect(isRestore({ revision: '10', dataEpoch: epoch }, { revision: '20', dataEpoch: 'new-epoch' })).toBe(true));
  it('resumes completed cursor, but rejects future, malformed, and foreign cursors', () => {
    const snapshot = { revision: '100', dataEpoch: epoch };
    expect(restoreBoothCursor({ epoch, cursor: '42' }, snapshot)).toBe('42');
    for (const saved of [null, { epoch, cursor: '101' }, { epoch, cursor: '-1' }, { epoch, cursor: '1e2' }, { epoch: 'old', cursor: '42' }]) expect(restoreBoothCursor(saved, snapshot)).toBe('100');
  });
});
describe('input contracts', () => {
  it('counts emoji families and combining characters as graphemes', () => { expect(graphemeLength('👨‍👩‍👧‍👦')).toBe(1); expect(graphemeLength('e\u0301')).toBe(1); });
  it('rejects identical course points, unknown fields and 4 photo slots', () => {
    const id = 'b3a184e2-56fc-4e6e-bd7f-09454680579a';
    const valid = { requestKey: id, target: { type: 'existing', targetId: id }, categoryId: id, message: '좋아요', photos: [] };
    expect(createFavoriteSchema.safeParse(valid).success).toBe(true);
    expect(createFavoriteSchema.safeParse({ ...valid, arbitrary: true }).success).toBe(false);
    expect(createFavoriteSchema.safeParse({ ...valid, target: { type: 'course', name: '산책', points: [[127, 37], [127, 37]] } }).success).toBe(false);
    expect(createFavoriteSchema.safeParse({ ...valid, photos: [1, 2, 3, 4].map(slot => ({ assetId: id, slot })) }).success).toBe(false);
  });
  it('shows only a reference line distance using longitude, latitude order', () => { expect(approximateDistance([[127, 37], [127, 37.001]])).toBeGreaterThan(110); expect(approximateDistance([[127, 37], [127, 37.001]])).toBeLessThan(113); });
});
it('reports course point boundaries in Korean for participant and administrator forms', async () => {
  const { courseEditSchema } = await import('../../shared/validation');
  const id = 'b3a184e2-56fc-4e6e-bd7f-09454680579a';
  const result = courseEditSchema.safeParse({ requestKey: id, expectedVersion: 1, name: '산책', points: [[127, 37]] });
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.issues[0].message).toBe('경로에 서로 다른 점을 두 개 이상 추가해 주세요.');
});
