import { expect, it } from 'vitest';
import { errorMessage } from '../lib/api';
import { catalogCreateSchema, profileSchema } from '../../shared/validation';
const id = 'b3a184e2-56fc-4e6e-bd7f-09454680579a';
it('shows the friendly nickname boundary message without Zod code/path serialization', () => {
  const result = profileSchema.safeParse({ requestKey: id, expectedVersion: 1, nickname: '   ' });
  expect(result.success).toBe(false);
  if (!result.success) expect(errorMessage(result.error)).toBe('1~20자로 입력해 주세요');
});
it('uses the same safe validation presentation for administrator catalog forms', () => {
  const result = catalogCreateSchema.safeParse({ requestKey: id, name: '   ' });
  expect(result.success).toBe(false);
  if (!result.success) expect(errorMessage(result.error)).toBe('1~30자로 입력해 주세요');
});
it('normalizes browser fetch failures while preserving the friendly retry instruction', () => {
  expect(errorMessage(new TypeError('Failed to fetch'))).toBe('연결이 잠시 어려워요. 입력을 유지했으니 다시 시도해 주세요.');
  expect(errorMessage(new TypeError('Load failed'))).not.toContain('Load failed');
});
