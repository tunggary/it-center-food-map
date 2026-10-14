import { z } from 'zod';
const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
export const graphemeLength = (value: string) => [...segmenter.segment(value)].length;
export const normalizeName = (value: string) => value.trim().normalize('NFC').toLocaleLowerCase('ko');
export const text = (max: number) => z.string().trim().refine(v => graphemeLength(v) >= 1 && graphemeLength(v) <= max, `1~${max}자로 입력해 주세요`);
export const uuid = z.string().uuid();
export const point = z.tuple([z.number().finite('지도에서 정상 위치를 선택해 주세요.').min(-180, '지도에서 정상 위치를 선택해 주세요.').max(180, '지도에서 정상 위치를 선택해 주세요.'), z.number().finite('지도에서 정상 위치를 선택해 주세요.').min(-90, '지도에서 정상 위치를 선택해 주세요.').max(90, '지도에서 정상 위치를 선택해 주세요.')]);
export const points = z.array(point).min(2, '경로에 서로 다른 점을 두 개 이상 추가해 주세요.').max(200, '경로의 점은 200개까지 추가할 수 있어요.').refine(v => new Set(v.map(p => p.join(','))).size >= 2, '서로 다른 점 두 개가 필요해요');
export const photoSlots = z.array(z.object({ assetId: uuid, slot: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict()).max(3, '사진은 세 장까지 선택해 주세요.').refine(v => new Set(v.map(p => p.slot)).size === v.length && new Set(v.map(p => p.assetId)).size === v.length, '사진의 순서와 선택한 파일을 다시 확인해 주세요.');
export const targetInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('existing'), targetId: uuid }).strict(),
  z.object({ type: z.literal('place'), selectionToken: z.string().min(1).max(8000) }).strict(),
  z.object({ type: z.literal('course'), name: text(50), points }).strict(),
]);
export const createFavoriteSchema = z.object({ requestKey: uuid, target: targetInput, categoryId: uuid, message: text(100), photos: photoSlots, profile: z.object({ nickname: text(20), teamId: uuid }).strict().optional() }).strict();
export const editFavoriteSchema = z.object({ requestKey: uuid, expectedVersion: z.number().int().positive(), categoryId: uuid, message: text(100), photos: photoSlots }).strict();
export const deleteSchema = z.object({ requestKey: uuid, expectedVersion: z.number().int().positive() }).strict();
export const createProfileSchema = z.object({ requestKey: uuid, nickname: text(20), teamId: uuid }).strict();
export const profileSchema = z.object({ requestKey: uuid, expectedVersion: z.number().int().positive(), nickname: text(20) }).strict();
export const catalogCreateSchema = z.object({ requestKey: uuid, name: text(30), kind: z.enum(['PLACE', 'COURSE']).optional() }).strict();
export const catalogEditSchema = z.object({ requestKey: uuid, expectedVersion: z.number().int().positive(), name: text(30), selectable: z.boolean() }).strict();
export const courseEditSchema = z.object({ requestKey: uuid, expectedVersion: z.number().int().positive(), name: text(50), points }).strict();
export const teamEditSchema = z.object({ requestKey: uuid, expectedVersion: z.number().int().positive(), teamId: uuid }).strict();
export const targetDeleteSchema = deleteSchema.extend({ expectedCount: z.number().int().nonnegative() }).strict();
export const uploadSchema = z.object({ requestKey: uuid, mediaType: z.literal('image/jpeg'), byteSize: z.number().int().positive().max(524288) }).strict();
export const finalizeSchema = z.object({ requestKey: uuid, assetId: uuid }).strict();
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
