# 수동 백업 기록·복원

[설계 목차](README.md) · [운영](operations.md) · [용량 원장](storage-accounting.md)

상태: 2026-10-13 사용자 채택. 행사 직전·직후·DB 구조 변경 전, 이후 변경이 있었던 주에 운영자가 실행한다. 마지막 성공 백업 이후 등록의 손실 가능성을 수용한다. 자동 백업 서비스나 제품의 삭제 복구 기능을 추가하지 않는다.

## backup_runs 스키마

`app_private.backup_runs`, 직접 브라우저 접근 금지. ID는uuid, 시각은timestamptz, 크기는bigint다. 상태·actor·request_key·verification_source는 NOT NULL이다. snapshot/완료 메타데이터는 확보 전 NULL이며 상태별 CHECK로 필수값을 강제한다.

| 필드 | 제약·의미 |
| --- | --- |
| id | UUID PK |
| actor_auth_user_id | NOT NULL, 실행 당시 관리자 UID; 감사 이력은 관리자 삭제 후에도 보존 |
| request_key | UUID NOT NULL, UNIQUE(actor_auth_user_id,request_key) |
| status | running / succeeded / failed |
| started_at / snapshot_at / completed_at | 시작 필수, snapshot/종료는 nullable |
| data_epoch / migration_version | snapshot 확보 시 기록, 성공 시 필수 |
| object_count / total_bytes | nonnegative, 성공 시 필수 |
| manifest_sha256 / archive_sha256 | 성공 시64자리hex 필수 |
| lease_token / lease_until | 실행 중만 유효; 종료 후NULL |
| error_code | 실패 시 제한된 코드만 저장, 비밀번호·경로·에러본문 없음 |
| verification_source | 고정 operator_reported |

running 행은 프로젝트당 최대1개인 partial unique index로 제한한다. 성공/실패는 completed_at 필수, running은 completed_at NULL. terminal 상태는 수정하지 않는다. 감사 UID에 Auth 시스템 schema FK를 걸어 다른 프로젝트 복원을 막지 않는다. 조회/변경 시 현재관리자의 allowlist를 별도로 확인한다.

## 관리자 API

| 요청 | 계약 |
| --- | --- |
| `POST /admin/backups` | requestKey. 관리자 검증 후 run/청소 보류 lease 생성. 같은 키는 같은 run, 다른 실행이 진행 중이면409 BACKUP_IN_PROGRESS |
| `PATCH /admin/backups/:id` action=heartbeat | leaseToken. 현재 소유자만 연장; 만료된 lease를 되살리지 않음 |
| 같은 경로 action=snapshot | leaseToken, snapshotAt(UTC `Z` 표기), dataEpoch, migrationVersion. 실행 도구가 확보한 snapshot 식별 메타데이터 기록 |
| 같은 경로 action=complete | leaseToken, snapshot 메타데이터, objectCount/totalBytes, manifestSha256/archiveSha256. 형식·일관성 검사 후 성공 |
| 같은 경로 action=fail | leaseToken, errorCode는 `LEASE_EXPIRED` / `HASH_MISMATCH` / `OBJECT_MISSING` / `DUMP_FAILED` / `ENCRYPTION_FAILED` / `OPERATOR_CANCELLED` / `DEPENDENCY_UNAVAILABLE`. 실패로 종료 |
| `GET /admin/operations.backups` | activeRun, lastSucceeded, lastFailed. 로컬 파일이 서버에서 독립 검증된 결과라고 표시하지 않음 |

완료의 중복 호출은 같은 결과·같은 hash면 기존 결과를 반환하고 다르면409다. 원실행 관리자 외의 관리자는 조회할 수 있지만 실행 중인 lease를 이어받지 않는다. 중단된 실행은 만료→실패 후 새 요청 키로 재시작한다. 서비스 전용 gateway_start_backup/gateway_update_backup가 DB 상태 전이를 보장한다.

## 청소 보류와 실제 백업

1. 운영자가 로컬 백업 도구를 실행하고 관리자 API로 run을 만든다. lease는10분이며60초마다 갱신한다. 시작/청소 claim 모두 storage_budget 행 아래 활성 backup 여부를 직렬화한다. 새 cleanup claim을 막고 이미 claim된 작업의 완료/만료를 확인한 뒤 snapshot을 시작한다.
2. PostgreSQL의 read-only repeatable-read 트랜잭션에서 snapshot을 export한다. 같은 snapshot으로 DB dump와 살아 있는 favorite의 final/thumb manifest를 만든다. dump는 `pg_dump --snapshot`을 사용한다. manifest 확보와 dump 완료까지 exporter 연결을 유지한다. [공식 snapshot 지원](https://www.postgresql.org/docs/current/app-pgdump.html)
3. snapshot 이후에도 등록·논리 삭제는 허용한다. 물리 사진 청소는 백업 완료까지 보류하므로 manifest의 불변 객체를 내려받을 수 있다. 백업에 raw 임시 파일은 포함하지 않는다.
4. manifest는 objectKey·assetId·variant·실제 크기·SHA-256으로 구성한다. 모든 객체의 존재·바이트·hash와 dump 프로세스의 정상 종료를 확인한다. 하나라도 없거나 달라졌으면 백업 실패다.
5. migration 버전·DB dump·manifest·final/thumb 파일을 로컬에서 암호화해 저장한다. 보관 루트는 로컬 설정 `FOOD_MAP_BACKUP_DIR`로 지정하고 저장소 외부 경로만 허용한다. 지정되지 않으면 백업 시작 전 오류로 멈춘다. 비밀번호·키는 비밀 입력 또는 로컬 자격 저장소에서 읽고 로그·DB·레포에 보관하지 않는다.
6. 임시 파일의 검증·암호화·최종 파일 확정을 마친 뒤 complete를 기록한다. 부분 다운로드나 일부 사진만 있는 경우 성공으로 표시하지 않는다. 웹 API는 대용량 백업 바이트를 전송하지 않는다.

서버는 로컬 파일 존재를 검증할 수 없다. `operator_reported`는 실행 도구/운영자가 검증해 기록했다는 의미다. 관리자 화면에 그 경계를 표시한다.

lease 갱신 실패·만료면 실행 도구는 즉시 중단하고 성공 등록을 금지한다. 다음 start/cleanup 점검에서 만료된 running을 failed(LEASE_EXPIRED)로 바꾼 뒤 청소를 재개한다. 늦은 complete는409 BACKUP_LEASE_EXPIRED다. 이미 저장된 로컬 부분 파일은 성공 백업 목록에 포함하지 않는다.

## 복원 계약

1. 로컬/비운영 Supabase에서 같은 migration을 적용하고 dump를 복원한다. 운영 복원 시 제품 공개 재개는 아래 검증을 완료한 후에 한다.
2. manifest에 있는 final/thumb를 private 버킷에 올리고 크기/hash를 대조한다. Auth 시스템 테이블을 임의 복원하지 않고 관리자 계정/allowlist를 재연결한다.
3. 첨부 자산의 참조와 identity hash 관계를 보존한다. 미연결 임시 자산은 만료·비공개 처리한다. 처리·청소·백업 lease와 실행 중 작업은 무효화하고, 복원 manifest에 없는 미첨부 객체는 삭제 완료 상태로 정리한다.
4. 복원한 객체의 실제 크기에서 용량 예약을 재계산한다. 연결된 사진이 누락됐으면 등록 데이터를 조용히 사진 없는 상태로 바꾸지 않고 복원 실패로 보고한다. 새 data_epoch를 발급해 브라우저 snapshot/cursor를 초기화한다.
5. 본인 등록·관리 권한·FIX-01 집계·사진 샘플과 백업 시점을 확인한다. 마지막 성공 백업 이후 데이터 손실 범위를 기록하고, 선택한 백업을 공개 재개할지 운영자가 판단한다. 제품의 개별 삭제 복구 버튼은 제공하지 않는다.

## 검증

동일 start 재시도에서1run, 서로 다른2관리자 동시 시작에서1run, 백업 중 삭제해도 manifest 파일 보존, 사진 누락/해시 불일치 실패, lease 만료 후 complete 거절, cleanup 재개, 성공 결과 중복 호출, 복원 시 용량·epoch·cursor 재설정을 검증한다.
