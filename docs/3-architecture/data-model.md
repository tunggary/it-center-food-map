# 데이터 모델·트랜잭션

[설계 목차](README.md) · [권한](identity.md) · [API](api.md)

## 저장 원칙

PostgreSQL을 현재 등록과 집계의 유일한 원장으로 둔다. DB/API/테스트 이름은 [용어집](../../GLOSSARY.md)을 따른다. 물리 테이블은 `app_private`, UUID는 내부 키, 시간은 `timestamptz`, HTTP의 bigint revision은 정밀도 손실을 막기 위해 **십진수 문자열**이다.

```text
teams 1 ─ N participants 1 ─ N favorites N ─ 1 targets
categories 1 ─ N favorites                       ├ PLACE
favorites 1 ─ 0..3 photo_assets                   └ COURSE
browser_identities 1 ─ 0..1 participants
registration_events N ─ 0..1 favorites (삭제 후 tombstone)
```

## 테이블

| 테이블 | 핵심 필드 | 제약·수명 |
| --- | --- | --- |
| `teams` | id, name, normalized_name, selectable, version | 이름 trim 1~30 grapheme, normalized_name unique; 삭제 API 없음 |
| `categories` | id, name, normalized_name, kind, selectable, version | kind PLACE/COURSE, 종류 내 이름 unique, UNIQUE(id,kind); kind 변경 불가 |
| `browser_identities` | id, token_hash, expires_at, last_seen_at, revoked_at | hash unique; 원문 없음; 만료된 해시 재사용 거절 |
| `participants` | id, identity_id, nickname, team_id, version | identity_id UNIQUE FK, team_id FK RESTRICT; 닉네임 중복 가능; 최애 없는 프로필 허용 |
| `targets` | id, kind, name, provider, place_id, address, lng, lat, route_json, approximate_length_m, version | UNIQUE(provider,place_id), UNIQUE(id,kind); PLACE/COURSE 필드 조합 CHECK |
| `favorites` | id, participant_id, target_id, category_id, kind, message, version, created_at, updated_at | UNIQUE(participant_id,target_id), FK(target_id,kind), FK(category_id,kind), participant FK |
| `photo_assets` | id, owner_identity_id, favorite_id, slot, state, expires_at, lease_token, lease_until, final_object_key, thumb_object_key | slot 1~3 CHECK, UNIQUE(favorite_id,slot), owner FK; favorite는 삭제 전에 연결 해제 |
| `media_objects` | object_key, asset_id, variant, attempt_id, reserved_bytes, actual_bytes, state, upload_expires_at, writer_lease_until, sha256, created_at, released_at | key PK; raw/final/thumb, processing 시도별 키; 객체보다 먼저 행 예약 |
| `storage_budget` | id=1, limit_bytes=734003200, updated_at | 용량 예약 직렬화; 누적 카운터 대신 미해제 예약 합계 |
| `backup_runs` | id, actor_auth_user_id, request_key, status, snapshot 메타데이터, manifest/archive 해시, lease, 오류코드 | 실행1개 제한·종료 상태 불변; [필드·제약](backup.md) |
| `commands` | actor_kind, actor_id, request_key, payload_hash, resource_id, outcome, revision, created_at | UNIQUE(actor_kind,actor_id,request_key); payload 원문 미보관 |
| `app_state` | id=1, revision, data_epoch UUID, updated_at | 한 행; 도메인 쓰기 직렬화·최신 snapshot 식별 |
| `registration_events` | revision, favorite_id nullable, created_at | revision PK; favorite ON DELETE SET NULL; 이름/문구 스냅샷 없음 |
| `admin_users` | auth_user_id, enabled | Auth UID PK; 클라이언트 metadata와 독립 |
| `cleanup_jobs` | object_key, attempts, next_attempt_at, lease_token, lease_until | object_key UNIQUE; 객체 삭제 후 완료 |
| `rate_counters` | scope, key_hash, window_start, count, expires_at | UNIQUE(scope,key_hash,window_start); TTL 청소 |

사진 객체의 예약량·실제량·해제 조건은 [용량 회계](storage-accounting.md)에, 백업의 타입·유일 제약·상태 전이는 [백업 기록](backup.md)에 정의한다. 용량 변경은 storage_budget → asset → object 순으로 잠그고 app_state를 나중에 요청하지 않는다. 이미 예약한 사진의 favorite 연결은 app_state → asset만 사용하며 용량을 다시 예약하지 않는다.

### 필드·검증

- PLACE: provider=`kakao`, place_id 문자열·이름·좌표 필수, route_json NULL. 좌표는 위도 -90~90/경도 -180~180의 유한 수. 장소명의 사용자 수정은 허용하지 않는다.
- COURSE: provider/place_id/address NULL, 이름·GeoJSON LineString 필수, 2~200점·서로 다른 점 2개 이상. 배열은 `[경도,위도]`; 시작점 lng/lat는 첫 점에서 생성한다. self-intersection은 산책 경로의 유효성 거절 사유로 쓰지 않는다.
- API에서 문구 trim 후 grapheme 0~100(선택), 닉네임 1~20, 코스명 1~50. DB는 NOT NULL·UTF-8 바이트 상한(문구 8KiB, 이름 2KiB)을 방어한다. 문구는 빈 문자열을 허용하며 이름의 빈 값 금지는 유지한다. grapheme 계산을 PostgreSQL char_length로 대체하지 않는다.
- 공유 Zod를 우회하는 직접 gateway 실행은 service_role에만 가능하다. Edge가 검증한 값만 전달하고 SQL도 id/FK/길이 안전 상한·타입·좌표·사진 슬롯·권한을 재검증한다.
- 이름 중복 키는 trim·Unicode NFC·소문자화한 값이다. 일반 닉네임에는 unique를 두지 않는다. 이름 정규화는 Edge 단일 함수에서 수행한다.

## 권한과 공개 조회

`anon`/`authenticated`는 private schema의 테이블·함수에 권한이 없다. 읽기 projection 함수만 `public.read_*`로 공개한다. gateway 쓰기 함수는 `PUBLIC`, anon, authenticated의 EXECUTE를 모두 revoke하고 service_role에만 grant한다. 로컬 테스트에서 권한 목록을 검사한다.

공개 조회는 익명에게 보여도 되는 필드만 반환한다. token_hash, identity_id, auth_user_id, storage object_key, commands, 처리 lease는 반환하지 않는다. 공개 닉네임·팀·문구·사진 asset ID는 PRD의 공개 정보다. 본인 여부는 별도 인증 조회를 사용하므로 공용 응답에 자격을 섞지 않는다.

모든 snapshot 조회는 하나의 SQL 문/`LANGUAGE sql STABLE` 함수에서 revision과 결과를 함께 계산한다. PLpgSQL의 서로 다른 READ COMMITTED 질의에서 각각 revision/결과를 읽고 일관된 snapshot이라고 주장하지 않는다.

## 집계

`favorites → participants → teams`, `favorites → targets/categories`를 JOIN한다. team_id/nickname을 등록에 복사하지 않는다. 사진을 등록 count 전에 JOIN하지 않는다.

```sql
WITH counts AS (
  SELECT f.target_id, count(*) AS favorite_count
  FROM app_private.favorites f
  JOIN app_private.participants p ON p.id=f.participant_id
  WHERE (p_team IS NULL OR p.team_id=p_team)
    AND (p_category IS NULL OR f.category_id=p_category)
  GROUP BY f.target_id
), ranked AS (
  SELECT *, rank() OVER (ORDER BY favorite_count DESC) AS rank
  FROM counts
)
SELECT * FROM ranked ORDER BY favorite_count DESC, target_id;
```

순위는 `rank()`로 1·1·3을 만든다. 안정 정렬용 target ID는 window 안에 넣지 않는다. `selectable=false`는 조회 필터에 넣지 않는다. 0건 대상은 counts에 나타나지 않는다. 지도 표시 범위는 랭킹의 전체 지역 모집단을 바꾸지 않는다.

초기 인덱스: participants(team_id,id), favorites(target_id,created_at,id), favorites(category_id,target_id,participant_id), 소유/유일 제약, photo_assets(favorite_id), events(revision), 청소 테이블의 만료/lease. EXPLAIN으로 필요가 확인된 것만 추가한다.

## 쓰기 트랜잭션

공개 상태를 바꾸는 등록/수정/삭제/목록 변경은 **Edge → gateway RPC 한 번**으로 실행한다. RPC 내부 예외는 전체를 롤백한다. 개별 INSERT를 여러 HTTP RPC로 나누지 않는다.

1. 참여자 hash 또는 검증된 admin ID로 actor를 정하고 만료/allowlist를 확인한다.
2. `app_state FOR UPDATE`. 이후 대상/참여자 → asset ID 오름차순으로 잠근다. asset 전용 처리는 나중에 app_state를 잠그지 않는다.
3. 같은 actor/request_key의 commands를 다시 확인한다. 같은 payload_hash면 기존 결과, 다르면 409다.
4. 소유권·version·대상 존재·선택 가능 상태·ready asset을 검사하고 변경한다.
5. revision을 1 증가시킨다. 신규 favorite에만 같은 revision의 event 하나를 생성한다. 결과 참조를 commands에 저장한다.
6. commit 후 응답한다. Storage/Kakao/Auth 호출이나 이미지 변환을 이 잠금 안에서 하지 않는다.

Edge는 정규화한 업무 DTO를 canonical JSON으로 직렬화해 SHA-256을 계산한다. 장소 선택 토큰의 서명/기한은 검증하지만 payload_hash는 서명 문자열이 아닌 검증된 provider/place_id 등으로 만든다. 토큰 재발급만으로 다른 명령이 되지 않는다.

예상 가능한 업무 오류는 변경 전에 검사한다. 변경 후의 예외를 삼켜 부분 commit하지 않는다. deadlock/timeout은 전체 rollback, 같은 키로 수동 재시도한다. lock_timeout 초기 1초·statement_timeout 초기 1.5초로 시작하고 100건 burst에서 2초 완료 목표를 평가한다. timeout은 PostgREST 역할/요청 설정으로 해당 SQL 문 시작 전에 적용하고 실제 취소 동작을 시험한다. 실행 중인 함수 안에서 statement_timeout을 바꾸는 것만으로 현재 문이 취소된다고 가정하지 않는다.

### 첫 등록

identity가 준비됐고 profile이 없을 때만 team/nickname을 요구한다. 참여자·신규 target·favorite·asset 연결·commands·event를 원자적으로 생성한다. 기존 참여자의 제출 내용으로 team/nickname을 덮어쓰지 않는다.

기존 target을 명시했다면 사라졌을 때 404다. 새 PLACE는 검증된 선택 결과의 provider ID로 upsert한다. 새 COURSE는 한 명령에 한 target이다. 같은 request_key 재시도는 profile/target/event도 늘리지 않는다. 별도 키로 동일 참여자/target을 등록하면 409 `ALREADY_REGISTERED`와 본인 favorite ID를 반환한다.

### 수정·개별 삭제

favorite.expectedVersion을 비교한다. message/category/photos를 수정해도 신규 event는 없고 전체 건수도 유지된다. 기존 중단 category를 유지하는 문구/사진 편집은 허용하되, 다른 중단 category로 바꾸는 것은 거절한다.

개별 삭제: asset 공개 연결 해제 → cleanup 예약 → favorite 삭제 → event 참조 NULL → target version/revision 증가. target은 0건이어도 식별용으로 남기고 공개 목록에서 제외한다. 원작성자의 favorite 삭제로 course를 지우지 않는다.

### 전체 삭제·경합

preview는 target ID/name/version/전체 등록 수를 같은 snapshot으로 반환한다. 등록 추가/삭제/편집 등 대상에 연결된 내용 변경은 target version을 증가시킨다. 실행 때 같은 전역 잠금 아래 version/건수를 비교하고 달라졌으면 409와 재확인 내용을 반환한다.

일치하면 모든 asset 공개 연결 해제·cleanup 예약·모든 favorite 삭제·target 삭제를 commit한다. 삭제된 원 target ID의 재전송으로 복구하지 않는다. 새 검색/새 course 작성을 명시한 재등록은 새 명령으로 허용한다. 영구 차단 목록은 만들지 않는다.

성공 응답 유실 뒤 결과 자원이 다른 작업으로 삭제돼 있으면 등록/수정은 `RESULT_GONE`. 이미 성공한 삭제의 동일 키는 성공을 반환한다. commands에 삭제한 문구·사진을 남기지 않는다. 참여자 명령은 identity 유효 기간 동안 보존하고, 만료 identity의 과거 명령은 재실행할 수 없다. 관리자 명령은 Auth UID에 귀속시켜 로그인 갱신 후에도 같은 키를 사용하며 첫 버전에서 자동 삭제하지 않는다.

## 변경 기록

팀/닉네임/카테고리 이름 수정도 revision을 증가시키고 조회는 현재 정보를 사용한다. 이벤트에 개인 이름의 과거 값을 복제하지 않는다. 관리 감사 정보는 commands에 actor·동작·대상 ID·시각만 남기며 입력 원문/삭제 내용은 저장하지 않는다. SQL migration만 직접 DDL과 초기 데이터를 다룬다.
