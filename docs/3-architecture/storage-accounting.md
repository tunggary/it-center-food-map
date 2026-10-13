# 사진 용량 예약·반환

[설계 목차](README.md) · [데이터 모델](data-model.md) · [사진](media.md) · [백업](backup.md)

상태: 2026-10-13 채택된 상세 설계. 제품 구현/DB migration 적용 전이다. 여기서 말하는 용량은 앱의 저장 예산이며 공급자 계정 전체의 과금 계량을 대신하지 않는다.

## 물리 스키마

모든 테이블은 `app_private`. 별도 NULL 표시가 없는 필드는 NOT NULL이다. bytes는 PostgreSQL bigint이고 API는 십진수 문자열이다. 사진 버킷의 업로드 제한도 JPEG·512KiB로 설정해 클라이언트가 신고한 크기만 신뢰하지 않는다.

| 테이블·필드 | 타입·제약 | 의미 |
| --- | --- | --- |
| storage_budget.id | smallint PK CHECK(id=1) | 잠금용 단일 행 |
| storage_budget.limit_bytes | bigint NOT NULL CHECK(>0), 초기734003200 | 앱700MiB 예산 |
| storage_budget.updated_at | timestamptz NOT NULL | 예산 설정 기록; 일반 UI 변경 없음 |
| media_objects.object_key | text PK | 재사용하지 않는 불변 객체 경로 |
| media_objects.asset_id | uuid NOT NULL FK photo_assets RESTRICT | 삭제 완료까지 추적 유지 |
| media_objects.variant | text CHECK IN(raw,final,thumb) | 용도 |
| media_objects.attempt_id | uuid NOT NULL | finalize 처리 시도/업로드 세대 |
| media_objects.reserved_bytes | bigint NOT NULL CHECK(>=0) | 현재 점유하도록 예약한 상한 |
| media_objects.actual_bytes | bigint NULL CHECK(>=0) | 서버가 확인한 실제 크기 |
| media_objects.state | text CHECK IN(reserved,stored,delete_pending,deleted) | 객체 수명 |
| media_objects.upload_expires_at | timestamptz NULL | raw에 발급한 signed 권한의 가장 늦은 만료 |
| media_objects.writer_lease_until | timestamptz NULL | 서버 처리 시도의 생성 가능 기한 |
| media_objects.sha256 | text NULL, 값 존재 시64자리hex | 완성 객체 무결성 |
| media_objects.created_at/released_at | timestamptz NOT NULL / NULL | 추적 시작/회계 해제 |

UNIQUE(asset_id,variant,attempt_id). deleted이면 reserved_bytes=0이고 released_at이 존재한다. 나머지 상태에서는 released_at이 NULL이다. photo_assets에 채택된 `final_object_key`, `thumb_object_key` nullable FK(media_objects.object_key)를 둔다. ready/attached는 두 참조가 필수이며 참조 객체가 같은 asset의 stored 상태·올바른 variant인지 gateway가 확인한다. 원본 raw는 공개 참조로 사용하지 않는다.

기존 media_objects.bytes는 actual_bytes로 구체화한다. 이 레포에는 아직 실제 schema가 없어 기존 DB를 ALTER하는 migration은 필요하지 않다. 최초 migration에 위 구조를 만든다.

## 예산 계산과 잠금

`heldBytes = SUM(reserved_bytes WHERE state <> 'deleted')`. 별도 누적 사용량 카운터를 저장하지 않아 카운터와 원장의 이중 보정 책임을 없앤다. actual_bytes가 예약을 초과한 비정상 객체를 발견하면 예약도 실제 크기까지 올려 보수적으로 계상하고 새 예약을 중단한다.

용량을 바꾸는 모든 RPC는 `storage_budget FOR UPDATE → asset ID 오름차순 → object key 오름차순`으로 잠근다. 이 잠금 안에서 합계 확인·예약/반환을 원자적으로 수행한다. Storage 호출·이미지 변환은 잠금 밖이다. 이미 예약된 자산을 favorite에 연결하는 경로는 기존 `app_state → asset` 순서이고 용량 행을 요청하지 않는다. 용량 경로도 뒤늦게 app_state를 요청하지 않는다.

사진 준비 1건은 raw512KiB + final512KiB + thumb64KiB = **1,114,112바이트**를 예약한다. 요청 키와 소유 identity의 조합은 유일하며 같은 준비 재시도는 같은 asset/객체를 반환한다. 미연결 자산6개 제한도 같은 identity 잠금 아래 검사한다.

서명 발급에 실패해도 슬롯을 새로 예약하지 않는다. 같은 asset로 재발급하며 raw의 upload_expires_at을 **권한 발급 전에 보수적으로 갱신**한다. 토큰 발급 후 응답 유실로 만료 시각을 잃지 않게 한다. 상태를 뒤로 돌려 이미 삭제된 경로를 재사용하지 않는다.

## 저장·실패·반환

1. 최종 파일은 서버에서 정규화하고 크기를 확인한 뒤 업로드한다. full512KiB/thumb64KiB를 초과하면 업로드하지 않고 재압축/실패 처리한다.
2. 성공한 final/thumb는 lease token 일치 확인 후 stored와 actual_bytes/hash를 기록하고 reserved_bytes를 실제 크기로 낮춘다. raw는 클라이언트 권한이 살아 있는 동안 원래 상한을 유지한다.
3. 같은 finalize 시도의 pending 재요청은 새 객체를 만들지 않는다. lease 만료 후 새 시도라면 새 key와 추가 final/thumb 예약을 먼저 확보한다. 옛 시도는 delete_pending으로 유지하며 아직 삭제되지 않은 바이트도 합계에 남는다.
4. 등록 삭제/사진 교체는 공개 참조를 철회하고 cleanup을 예약한다. **이 시점에는 reserved_bytes를 줄이지 않는다.**
5. 청소는 raw의 signed 권한 만료, 서버 writer lease 종료, 활성 백업의 청소 보류 여부를 확인한다. raw는 권한 만료 전에 삭제해 재업로드할 빈 경로를 만들지 않는다. 실제 공급자 권한 유효 기간은 [공식 API](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl)를 기준으로 기록한다.
6. Storage 삭제/부재 확인 뒤 용량 RPC가 lease token·미연결 상태·기한을 재검증하고 deleted/reserved_bytes=0/released_at을 한 번만 기록한다. 중복 완료는 같은 결과를 반환한다.
7. 시간 초과로 생성/삭제 결과가 불명확하면 예약을 유지한다. 단순TTL만으로 해제하지 않는다. 추후 서버 조회로 존재/크기를 확인한다.

지연된 업로드/처리 결과를 ready로 채택하지 않는다. 정리 완료 이후라도 object key의 tombstone을 남겨 다시 나타난 파일을 재계상·재청소한다. 매일 maintenance가 버킷 목록과 원장을 페이지 단위로 대조한다. 미추적 객체나 실제 크기 초과가 있으면 예약을 보수적으로 복구하고 관리 경고를 만든다. 원장 없는 임의 파일은 자동 삭제하지 않고 경고·신규 예약 중단으로 처리한다.

공급자 저장소와 DB는 하나의 트랜잭션이 아니므로700MiB는 앱의 admission 예산이다. 공급자 절대 용량을 수학적으로 보장하는 장치라고 주장하지 않으며 여유 용량과 대조 검증을 함께 사용한다.

## API 계약

- `POST /uploads`: 기존 입력 유지. 용량 부족은503 CAPACITY_REACHED, 초안 유지. 사진 제거 후 새 본문은 새 등록 명령 키를 사용한다.
- `GET /admin/operations.storage`: `{limitBytes, heldBytes, storedBytes, pendingCleanupBytes, reconciledAt, hasUntrackedObjects}`.
- storedBytes는 아직 삭제되지 않은 객체의 확인된 actual_bytes 합이다. pendingCleanupBytes는 delete_pending의 예약 합이다. 두 수치를 heldBytes에 다시 더하지 않는다.
- gateway_reserve_media / gateway_complete_media / gateway_release_media / gateway_reconcile_media는 service_role 전용이다. 소유·lease 검증을 수행하며 브라우저가 예약량·해제량을 직접 지정하지 않는다.

## 검증

한도 직전 동시2개 준비에서 초과 예약0, 동일 requestKey 이중 예약0, 저장 후DB실패의 예약 유지, 새 finalize 시도의 추가 예약, 삭제 실패·늦은 성공·cleanup 중복 완료에서 음수/이중 해제0을 검증한다. 실제 DB 잠금 테스트와 별도로 Storage 장애·지연 응답을 주입한다. 백업 중 삭제는 공개 연결만 철회하고 파일/예약은 보존해야 한다.
