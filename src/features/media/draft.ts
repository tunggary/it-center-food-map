import type { PhotoSlot } from '../../../shared/contracts';
export type DraftPhoto = { id: string; file?: File; blob?: Blob; preview?: string; assetId?: string; prepareKey: string; finalizeKey: string; status: 'selected' | 'preparing' | 'uploading' | 'processing' | 'ready' | 'failed'; error?: string; uploadUrl?: string };
export const existingPhotos = (photos: PhotoSlot[]): DraftPhoto[] => photos.map(p => ({ id: p.assetId, assetId: p.assetId, prepareKey: crypto.randomUUID(), finalizeKey: crypto.randomUUID(), status: 'ready' }));
