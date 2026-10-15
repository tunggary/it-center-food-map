# API 계약

[설계 목차](README.md) · [권한](identity.md) · [DB 계약](data-model.md)

## 두 진입점

- 공개 조회: `${SUPABASE_URL}/rest/v1/rpc/<함수>`, `apikey`에 공개 publishable key. **POST JSON**으로 읽기 전용 함수를 호출해 CDN의 오래된 응답을 피한다. 개인 자격은 보내지 않는다.
- 검증/명령: `${SUPABASE_URL}/functions/v1/api/<경로>` 및 media-finalize. `fetch` 기반 client 하나로 호출한다. 참여자는 `X-Participant-Token`, 관리자는 `Authorization: Bearer <JWT>`를 붙인다. 두 자격은 혼용하지 않는다.

CORS preflight는 허용된 origin·메서드·headers만 응답하고 credentials cookie는 사용하지 않는다. `Cache-Control: no-store`, 오류 로그에는 request_id·code·소요 시간만 남긴다.

## 공통 타입

```ts
type Revision = string; // bigint 십진수, Number로 변환 금지
type Kind = 'PLACE' | 'COURSE';
type Filters = { teamId: string | null; categoryId: string | null };
type Command = { requestKey: string; expectedVersion?: number };
type TargetInput =
  | { type: 'existing'; targetId: string }
  | { type: 'place'; selectionToken: string }
  | { type: 'course'; name: string; points: [number, number][] };
type PhotoSlot = { assetId: string; slot: 1 | 2 | 3 };
type CreateFavorite = Command & {
  target: TargetInput; categoryId: string; message: string;
  photos: PhotoSlot[];
  profile?: { nickname: string; teamId: string };
};
```

UUID·배열 크기·필수값·알 수 없는 필드는 Zod strict로 검사한다. 일반 JSON 본문 상한 64KiB, 사진 바이트는 signed upload에만 보낸다. POST/수정/삭제의 command는 requestKey 필수다. 새 FE는 POST /me로 프로필을 먼저 저장하고 최애 요청에 profile을 보내지 않는다. profile은 기존 FE의 첫 등록 호환용으로만 유지하며, 프로필 없는 첫 등록에서는 필수다. 같은 명령 키의 성공 결과 재생을 먼저 처리한 뒤, 새로운 명령에서 기존 참여자가 profile을 보내면 검증 오류로 폼을 동기화한다. 첫 성공 응답 유실 후 profile을 포함한 원래 요청의 재시도를 차단하지 않는다.

명령 응답: `{requestId, data:{resourceId, targetId?, revision, replayed}}`. 공개 read 응답은 각 DTO와 revision/dataEpoch를 반환한다. Edge 오류는 `{requestId,error:{code,message,details?,retryAfterSeconds?}}`; raw SQL·서버 스택을 노출하지 않는다. Data API 오류는 FE adapter에서 같은 오류 분류로 정규화한다. DB의 예상 업무 오류는 SQLSTATE P0001과 허용된 message code, 제한된 JSON detail로 발생시키고 Edge/FE adapter가 아래 상태로 변환한다. 알 수 없는 DB 오류는 500으로 처리하고 원문 detail을 사용자에게 노출하지 않는다.

## 공개 읽기 RPC

모든 인수명은 `p_` 접두사로 고정한다. 파라미터 없는 함수도 POST `{}`로 호출한다. 공개 함수는 쓰기 부작용이 없다.

| 함수 | 입력 | 결과 |
| --- | --- | --- |
| `read_revision` | 없음 | `{revision, dataEpoch, serverTime}`; 가벼운 한 행 조회 |
| `read_catalog` | 없음 | revision, selectableTeams/categories, allTeams/categories |
| `read_explore` | p_team_id nullable, p_category_id nullable, p_rank_page 기본1 | revision, filters, pins[], rankingPage, hasMore |
| `read_target` | p_target_id, p_team_id, p_category_id, p_cursor nullable, p_expected_revision nullable | revision, target, filteredCount, totalCount, overallRank, overallRankTied, favorites[], nextCursor |
| `read_booth` | p_pin_category_id nullable | revision, pins[], categoryRankings[]; 전체 팀 고정 |
| `read_events` | p_after_revision, p_until_revision, p_limit 1~100 | rows[{revision,favoriteId nullable}], nextCursor, done |
| `read_announcement` | p_event_revision | 현재 nickname/team/target 이름 또는 `{skip:true}` |

pins는 targetId/kind/좌표/count만 포함한다. 이름은 랭킹·선택 상세에서 읽는다. 코스 전체 좌표와 사진·문구는 pins 응답에 넣지 않는다. read_explore/read_booth의 압축 전송 크기와 전체 갱신 비용을 실측한다.

랭킹은 20건씩, 전체 조건 집합에서 rank를 계산한 뒤 페이지를 자른다. 상세는 `(created_at DESC,id DESC)` cursor 20건씩이다. 같은 상세에서 더 보기를 할 때 p_expected_revision과 현재 revision이 다르면 `SNAPSHOT_CHANGED`로 첫 페이지를 다시 읽는다. 이미 본 필터/대상과 다른 늦은 응답은 적용하지 않는다.

`TargetDetail`에 `overallRank: number | null`, `overallRankTied: boolean`을 포함한다. `read_target`은 같은 snapshot에서 `app_private.rankings(null,null)`의 전체 팀·전체 카테고리·장소/코스 순위를 조회한다. 상세의 team/category 인수는 기존 등록 목록 필터에만 적용하고 전체 순위에는 영향을 주지 않는다. 동일 전체 등록 횟수의 다른 대상이 있으면 공동이다. 등록0건은 `overallRank=null`, `overallRankTied=false`이며 모든 상세 페이지가 이 필드를 반환한다. 기존 RPC 인수·권한·오류 계약은 유지한다. 외부 적용은 RPC 확장 후 FE 순서다.

등록이 0건인 기존 target 직접 상세는 0건 상태·등록 행동을 제공한다. 물리 삭제된 target은 `TARGET_GONE`. 임의 지역 바깥이라는 이유로 조회/등록을 막지 않는다.

## 참여자·지도 Edge API

| 메서드·경로 | 입력 | 응답/계약 |
| --- | --- | --- |
| `POST /session` | header의 32바이트 자격 | identity 준비 여부·expiresAt·hasProfile; raw token 반환 없음 |
| `GET /me` | 참여자 자격 | participant 또는 null; version |
| `GET /me/favorites` | cursor nullable | 본인 등록만, 20건, 소유 상태 |
| `POST /me` | requestKey, nickname(trim 1~20 grapheme), teamId | 독립 프로필 생성 201, 같은 명령 재생 200; CommandResult. 기존 프로필은 VERSION_CONFLICT 후 GET /me로 확인, 덮어쓰기 없음 |
| `PATCH /me` | requestKey, expectedVersion, nickname | 팀 변경 필드 거절 |
| `GET /places/search` | q 1~100자, page 1~45 | 카카오 결과·signed selection token·isEnd; 서버가 페이지 크기 15 고정 |
| `POST /favorites` | CreateFavorite | 신규 등록 201, 동일 명령 재생 200 |
| `PATCH /favorites/:id` | requestKey, expectedVersion, message, categoryId, photos | 전체 편집 DTO로 교체; 누락 필드를 삭제로 해석하지 않음 |
| `DELETE /favorites/:id` | JSON requestKey, expectedVersion | 본인 등록 삭제 또는 같은 명령 결과 재생 |
| `POST /uploads` | requestKey, mediaType=`image/jpeg`, byteSize | assetId, upload 권한, 경로, 만료 |
| `POST /media-finalize` | 별도 함수 URL; requestKey, assetId | ready/pending, 검증된 byteSize·크기 |
| `GET /photos/:assetId` | size=`thumb` 또는 `full` | 현재 등록에 연결된 이미지 바이트; 로그인 불필요 |

등록 성공 뒤 상세 + GET /me를 갱신하여 본인 등록을 표시한다. 최신 상세에 반영되기 전에 폼을 지우지 않는다. 선택 사진 중 하나라도 ready가 아니면 등록은 실패다.

Kakao 결과의 selection token은 검증된 ID·이름·주소·좌표·identity ID·30분 만료를 HMAC-SHA256으로 서명한다. 등록 전에 Edge가 서명/세션/만료를 검증하고 표준 DTO로 DB에 전달한다. provider ID 조회 API가 따로 있다고 가정하지 않는다.

## 관리자 API

| 메서드·경로 | 입력·역할 |
| --- | --- |
| `GET /admin/catalog` | 목록 version·선택 상태 |
| `POST /admin/teams`, `POST /admin/categories` | requestKey/name, category는 kind |
| `PATCH /admin/teams/:id`, `PATCH /admin/categories/:id` | requestKey/expectedVersion/name/selectable; kind 변경 없음 |
| `GET /admin/participants?q=&cursor=` | 닉네임·공개 참여자 코드 검색, 20건; identity 비밀 제외 |
| `PATCH /admin/participants/:id/team` | requestKey/expectedVersion/teamId |
| `GET /admin/targets?q=&cursor=` | 이름/ID 검색, 종류·건수·version; 0건 포함 |
| `PATCH /admin/courses/:id` | requestKey/expectedVersion/name/points |
| `DELETE /admin/favorites/:id` | requestKey/expectedVersion |
| `GET /admin/targets/:id/deletion-preview` | target/version/count |
| `DELETE /admin/targets/:id` | requestKey/expectedVersion/expectedCount |
| `GET /admin/operations` | storage의 limitBytes/heldBytes/storedBytes/pendingCleanupBytes와 backup의 activeRun/lastSucceeded/lastFailed; 공급자 계량과 구분 |
| `POST /admin/backups` | requestKey로 백업 실행·청소 보류 lease 생성, 같은 키는 같은 run |
| `PATCH /admin/backups/:id` | leaseToken과 action=heartbeat/snapshot/complete/fail; [백업 DTO·상태](backup.md#관리자-api) |

모든 관리자 요청은 Auth 검증, 쓰기는 RPC 내부 allowlist 재검사. 목록 선택 중단·재개도 version/명령 키를 사용한다. 실제 공급자 비용·사용량의 최종 기준은 대시보드다.

## 내부 RPC와 청소

public schema에 있는 `gateway_create_favorite`, `gateway_edit_favorite`, `gateway_delete_favorite`, `gateway_admin_command`, identity/media/cleanup gateway는 service_role만 실행한다. 파라미터로 받는 actor 식별자는 Edge 검증 결과이며 사용자 body에서 복사하지 않는다. 임의 SQL·테이블 이름을 받는 범용 CRUD gateway는 만들지 않는다.

용량 예약/반환은 [storage gateway](storage-accounting.md#api-계약), 백업 시작/갱신은 [backup gateway](backup.md#관리자-api)를 사용한다. 모두 service_role 전용이며 현재 관리자 권한·소유·lease를 내부에서 재검사한다.

`maintenance` 함수는 매시간 Cron으로 호출하며 별도 secret을 검증한다. 한 호출에 최대 100개 cleanup claim, lease 5분, 객체 제거는 RPC 밖에서 수행한다. 실패는 지수 backoff(1분→2분→최대1시간)와 attempts 증가, 24시간 이상 밀리면 관리자 상태에서 표시한다. 활성 백업 lease가 있으면 물리 청소 claim을 보류한다. 매일 버킷 원장 대조를 추가하고 상세 잠금·해제는 용량 회계를 따른다. 유료 scheduler는 사용하지 않는다.

## 오류와 재시도

| 상태·코드 | 화면 동작 |
| --- | --- |
| 400 VALIDATION_ERROR | 입력 유지·해당 필드 수정 |
| 401 IDENTITY_REQUIRED/EXPIRED 또는 ADMIN_SESSION_EXPIRED | 열람 유지, 자격 준비/재로그인; 새 참여자 전환은 안내 |
| 403 FORBIDDEN | 작업 거절, 초안 유지 |
| 404 TARGET_GONE / PHOTO_GONE | 삭제 안내, 공개 내용 제거 |
| 409 ALREADY_REGISTERED | 본인 기존 등록 관리로 이동 |
| 409 VERSION_CONFLICT / SNAPSHOT_CHANGED | 최신 상태 재조회, 미저장 내용 유지·재확인 |
| 409 BACKUP_IN_PROGRESS / BACKUP_LEASE_EXPIRED | 진행 중 백업 또는 만료 안내; 만료 실행을 성공 처리하지 않음 |
| 410 RESULT_GONE | 이전 성공 자원 삭제됨 안내, 같은 명령으로 재생성 금지 |
| 413 MEDIA_TOO_LARGE | 브라우저 압축 재시도/사진 제거 |
| 429 RATE_LIMITED | Retry-After 안내, 무한 자동 재시도 금지 |
| 503 CAPACITY_REACHED / DEPENDENCY_UNAVAILABLE | 부분 성공 없음; 사진 용량이면 사진 제거 후 명시적 재제출 가능 |

응답 유실은 실패 확정이 아니다. 같은 requestKey로 결과를 확인한다. GET/공개 읽기는 최대 2회 지수 재시도, 쓰기는 사용자가 재시도할 때 같은 키로 전송한다. 5xx 이후 새 명령 키를 자동 생성하지 않는다.

## 등록 RPC 왕복 최적화 구현

`POST /favorites`는 Edge strict 입력/HMAC 검증과 canonical hash를 유지하고 `gateway_submit_favorite(p_token_hash,p_payload,p_selection_identity,p_selection_expires_at,p_validation_error)`를 한 번 호출한다. 내부에서 기존 자격·30회/분 rate·replay와 기존 create gateway를 재사용한다. 업무 쓰기는 subtransaction에 두고 오류를 제한된 envelope로 반환하여 실패해도 바깥 rate 증가가 유지된다. expired selection은 신규 등록만 거절하며 성공 replay는 허용하고, identity 만료/selection 소유자 불일치는 replay에도 거절한다. 기존 원장·revision·이벤트·사진 연결의 단일 트랜잭션 결정은 유지한다. 함수는 service_role 전용·전용 NOLOGIN owner·닫힌 search_path이며 공개 read는 변경하지 않는다.

## 등록 진입 모달 (2026-10-14)

POST /me는 기존 참여자 인증/명령 속도 제한·해시·원장을 사용한다. identity별 프로필은 하나이며 선택 가능한 팀만 허용한다. app_state 잠금 후 자격을 재검사하고 명령 재생을 먼저 처리한다. 성공 시 revision을 올리지만 최애·대상·registration_events는 생성하지 않는다. 최신 GET /me 확인 후 목적지로 이동하며 응답 유실은 같은 requestKey/body로 재시도한다. 기존 PATCH /me의 닉네임 수정/팀 변경 금지는 유지한다.

## 소개 문구 문자열 계약 (2026-10-15)

POST /favorites와 PATCH /favorites/:id의 `message` 키는 필수 문자열로 유지한다. 사용자 입력은 선택이며 빈 문자열을 허용한다. trim 후0~100 grapheme, 필드 누락·null·숫자는 VALIDATION_ERROR다. PATCH의 `message: ""`는 기존 소개를 지운다. 누락을 삭제로 해석하지 않는다. Favorite 응답도 항상 문자열이며 소개가 없으면 `""`다. 공유 스키마가 정규화한 결과로 기존 canonical JSON/payloadHash를 계산한다. DB 제약 완화→api Edge 재배포→FE 배포 순서로 반영한다.
