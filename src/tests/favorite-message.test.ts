import { expect, it } from 'vitest';
import { canonicalJson, createFavoriteSchema, editFavoriteSchema, profileSchema, courseEditSchema, catalogCreateSchema } from '../../shared/validation';
const id = '11111111-1111-4111-8111-111111111111';
const base = { requestKey: id, categoryId: id, photos: [] };
const schemas = [
  { name: 'create', schema: createFavoriteSchema, body: { ...base, target: { type: 'existing' as const, targetId: id } } },
  { name: 'edit', schema: editFavoriteSchema, body: { ...base, expectedVersion: 1 } },
];
for (const { name, schema, body } of schemas) {
  it.each(['', ' \n\t ', '가', '가'.repeat(100), '👨‍👩‍👧‍👦'.repeat(100)])(`${name} accepts optional message within 100 graphemes: %s`, message => {
    const parsed = schema.parse({ ...body, message });
    expect(parsed.message).toBe(message.trim());
  });
  it.each([null, undefined, 123, '가'.repeat(101), '👨‍👩‍👧‍👦'.repeat(101)])(`${name} rejects invalid message: %s`, message => {
    expect(schema.safeParse({ ...body, message }).success).toBe(false);
  });
  it(`${name} requires the message field and normalizes whitespace before command hashing`, () => {
    expect(schema.safeParse(body).success).toBe(false);
    expect(canonicalJson(schema.parse({ ...body, message: '' }))).toBe(canonicalJson(schema.parse({ ...body, message: ' \n ' })));
    expect(schema.parse({ ...body, message: '  좋아요  ' }).message).toBe('좋아요');
  });
}
it('keeps nickname, course and category names required', () => {
  expect(profileSchema.safeParse({ requestKey: id, expectedVersion: 1, nickname: ' ' }).success).toBe(false);
  expect(courseEditSchema.safeParse({ requestKey: id, expectedVersion: 1, name: ' ', points: [[127, 37], [127.1, 37.1]] }).success).toBe(false);
  expect(catalogCreateSchema.safeParse({ requestKey: id, name: ' ' }).success).toBe(false);
});
