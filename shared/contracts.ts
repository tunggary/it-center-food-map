export type Revision = string;
export type Kind = 'PLACE' | 'COURSE';
export type Point = [number, number];
export type Filters = { teamId: string | null; categoryId: string | null };
export type CatalogItem = { id: string; name: string; selectable: boolean; version: number };
export type Category = CatalogItem & { kind: Kind };
export type Snapshot = { revision: Revision; dataEpoch: string };
export type Catalog = Snapshot & { selectableTeams: CatalogItem[]; selectableCategories: Category[]; allTeams: CatalogItem[]; allCategories: Category[] };
export type Pin = { targetId: string; kind: Kind; lng: number; lat: number; count: number };
export type Ranking = { targetId: string; kind: Kind; name: string; count: number; rank: number };
export type Explore = Snapshot & { filters: Filters; pins: Pin[]; rankingPage: Ranking[]; hasMore: boolean };
export type Participant = { id: string; nickname: string; teamId: string; teamName: string; version: number };
export type PhotoSlot = { assetId: string; slot: 1 | 2 | 3 };
export type Target = { id: string; kind: Kind; name: string; address: string | null; lng: number; lat: number; points: Point[] | null; approximateLengthM: number | null; version: number };
export type Favorite = { id: string; targetId: string; participantId: string; nickname: string; teamId: string; teamName: string; categoryId: string; categoryName: string; message: string; photos: PhotoSlot[]; version: number; createdAt: string; target?: Target };
export type TargetDetail = Snapshot & { target: Target; filteredCount: number; totalCount: number; favorites: Favorite[]; nextCursor: string | null };
export type Command = { requestKey: string; expectedVersion?: number };
export type TargetInput = { type: 'existing'; targetId: string } | { type: 'place'; selectionToken: string } | { type: 'course'; name: string; points: Point[] };
export type CreateProfile = { requestKey: string; nickname: string; teamId: string };
export type CreateFavorite = Command & { target: TargetInput; categoryId: string; message: string; photos: PhotoSlot[]; profile?: { nickname: string; teamId: string } };
export type CommandResult = { resourceId: string; targetId?: string; revision: Revision; replayed: boolean };
export type Booth = Snapshot & { pins: Pin[]; categoryRankings: { categoryId: string; categoryName: string; rankings: Ranking[] }[] };
export type EventPage = { rows: { revision: Revision; favoriteId: string | null }[]; nextCursor: Revision; done: boolean };
export type Announcement = { skip: true } | { skip: false; nickname: string; teamName: string; targetName: string; favoriteId: string };
export const errorStatuses = {
  VALIDATION_ERROR: 400, IDENTITY_REQUIRED: 401, IDENTITY_EXPIRED: 401, ADMIN_SESSION_EXPIRED: 401,
  FORBIDDEN: 403, TARGET_GONE: 404, PHOTO_GONE: 404, ALREADY_REGISTERED: 409, VERSION_CONFLICT: 409,
  SNAPSHOT_CHANGED: 409, REQUEST_KEY_CONFLICT: 409, BACKUP_IN_PROGRESS: 409, BACKUP_LEASE_EXPIRED: 409,
  RESULT_GONE: 410, MEDIA_TOO_LARGE: 413, RATE_LIMITED: 429, CAPACITY_REACHED: 503,
  DEPENDENCY_UNAVAILABLE: 503, INTERNAL_ERROR: 500,
} as const;
export type ErrorCode = keyof typeof errorStatuses;

export const BACKUP_ERROR_CODES = [
  'LEASE_EXPIRED', 'HASH_MISMATCH', 'OBJECT_MISSING', 'DUMP_FAILED',
  'ENCRYPTION_FAILED', 'OPERATOR_CANCELLED', 'DEPENDENCY_UNAVAILABLE',
] as const;
