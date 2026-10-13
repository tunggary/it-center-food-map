# 독립 기술 검증 — 2026-10-13

검증 담당: 독립 subagent. 개발 담당의 결과를 그대로 합격 판정에 사용하지 않았다. 운영 DB에는 fixture/복원을 수행하지 않았다.

## 실행 결과

| 검사 | 실제 결과 | 한계 |
| --- | --- | --- |
| Node 24 strict TS + production build | 통과; lazy route chunks 생성 | 브라우저 렌더링/성능 합격과 별개 |
| Vitest | 2 files / 10 tests 통과 | 단위 검증 |
| Deno check | API / finalize / maintenance 통과 | 배포 runtime 동작과 별개 |
| Deno 이미지 | 2 tests 통과; 1,999,396픽셀 elapsed 578ms, full138048B/thumb18248B/heap90780248B | 로컬 elapsed/heap; hosted CPU/총메모리 증거 아님 |
| 백업 암호화 | roundtrip, 변조, 잘못된 비밀번호 검증 통과 | 실제 DB/Storage 백업을 대체하지 않음 |
| SQL | domain/aggregation/media_operations 3 suites 통과 | transaction rollback, 기존 fixture 보존 |
| 실제 DB 동시성 | 동일키20개 → 1코스/1등록/1이벤트/19재생; 다른20키 → 전부 중복 거절 | 전체 삭제/팀 변경/사진 연결의 모든 동시 경합을 포괄하지 않음 |
| 로컬 사진 실제 통합 | signed PUT→finalize ready→사진 첨부 등록 성공 | 모바일 원본 처리/hosted G2와 별개 |
| 실제 DB+사진 백업 | snapshot 단계 실패를 재현해 TECH-02/03 발견 | 전체 dump/manifest/복원 완료 전 |
| 동일 signed URL 재업로드 | HTTP400, JSON error Duplicate/statusCode409 재현 | TECH-04의 브라우저 재시도 경로는 별도 QA 필요 |

## 결함

- TECH-01 / 높음 / `scripts/backup.py`: backup run 업데이트를 POST로 호출하고 API는 PATCH만 받았다. 개발 담당이 4개 호출을 PATCH로 수정. 실제 재실행이 snapshot까지 도달해 해당 수정 확인.
- TECH-02 / 높음 / `scripts/backup.py`, `supabase/functions/api/index.ts`: Python snapshotAt ISO offset `+00:00`을 Edge datetime(Z전용)이 거절. 실제 snapshot PATCH400 재현. 개발 담당 수정 대기.
- TECH-03 / 높음 / 백업 API/DB/script: fail 코드 집합이 서로 다르다. 실제 INTERRUPTED 처리도 VALIDATION_ERROR, run이 running으로 남아 청소를 보류. 개발 담당 수정 대기.
- TECH-04 / 높음 / `src/features/media/PhotoPicker.tsx`: 저장 성공 응답 유실 후 재PUT은 Storage가 HTTP400/본문409 Duplicate를 반환한다. FE는 HTTP409만 허용하여 finalize로 이어지지 않는다. 실제 API 재현 완료, 개발 담당 수정 대기.

## 미완료 판정

실제 DB+사진 dump/manifest·복원·identity/집계·epoch/용량 재계산, hosted WASM CPU/메모리, 무료 DB 100명+부스+관리자 30분/SDK 포함 E2E, 실기기·5명 사용성은 이 문서 시점 미통과다. 로컬 단위/통합 결과로 대체하지 않는다.

## 수정 후 재검증 (20:48 KST)

- TECH-02/03: 런타임 재시작 후 기존 run을 `OPERATOR_CANCELLED`로 정상 실패 종료. 새 run의 실제 PostgreSQL repeatable-read exported snapshot → 같은 snapshot의 pg_dump/manifest → 실제 Storage 다운로드 → 파일/hash → AES-GCM roundtrip → complete succeeded 전 과정을 통과했다. 사진 4객체/156881B, migrationVersion20261013112711. 소스 등록 수 보존 확인.
- 백업 파일은 저장소 밖 `/private/tmp/foodmap-backup-independent/5d8cd926-fa78-469f-885b-ff844af69efe.fmap`에 유지. 비밀번호/자격은 문서에 기록하지 않는다. 독립 복호화 후 DB dump hash와 4객체의 크기/hash를 다시 모두 확인했다.
- TECH-04: 수정된 실제 `uploadRawPhoto`를 Node24에서 실제 중복 signed PUT에 사용했다. Storage HTTP400/본문Duplicate409를 허용하고 동일 asset의 실제 finalize HTTP200/ready까지 확인했다. 임의 400/409/403 거절 테스트를 포함한 Vitest13개 통과. 브라우저 response-loss 전체 흐름은 역할 QA의 영역이다.
- 실제 hosted maxJPEG1,999,396픽셀 finalize HTTP200/ready를 확인했다. `artifacts/hosted-image-verification.json`에 wall latency4912ms 및 idempotent3634ms를 저장. CPU/전체 메모리가 아니므로 G2 판정을 통과시키지 않는다.
- 새 TECH-05 / 높음 / `scripts/backup.py:restore`: macOS에서 임시 작업 경로는 unresolved `/tmp/...`이고 archive member는 `.resolve()`로 `/private/tmp/...`가 된다. 동일 정상 archive라도 `work not in p.parents`가 되어 `Unsafe archive member`를 발생시킨다. TempDirectory의 work를 정규화해 두 안전 경계 비교를 일치시켜야 한다. 실제 staging 복원은 이 검증에서 pg_restore 이전에 중단됐고 staging DB를 변경하지 않았다. 개발 담당에 전달 완료.

## 재개 인계

- staging `yxgmpbjcvjeacnrgtcbq`은 개인 Free 조직 소속을 CLI로 재확인했고 기술검증 독점 사용이 허용됐다. 현재 DB는0대상/0등록/0팀/0분류이며 hosted 이미지 검증의 미첨부 ready 자산만 있다. 운영 ref는 절대 복원/seed하지 않는다.
- 재검증 runner는 `/tmp/foodmap-backup-rerun.py`, `/tmp/foodmap-restore-verify.py`; PostgreSQL17 Docker wrapper는 `/tmp/foodmap-verify-bin/pg_dump`, `/tmp/foodmap-verify-bin/pg_restore`. 가상환경 `/tmp/foodmap-verify-venv`에 프로젝트 pinned cryptography/psycopg와 aiohttp3.13.3 준비. wrapper의 DB URL은 env로 전달하고 출력하지 않는다.
- staging DB URL과 임시 테스트 토큰 파일은 `/tmp`의 권한600 파일에만 유지하며 결과물에는 넣지 않는다. archive 검사용 복호화 디렉터리 `/tmp/foodmap-archive-check`는 권한700으로 유지, 최종 인계 후 삭제 필요.
- 30분 HTTP API 부하 runner `/tmp/foodmap-api-load.py` 준비만 완료, 아직 실행하지 않았다. 100참여자+부스+관리자 상당 poller로2초/30분 약91,800요청+revision변경 snapshot을 계산했다. 실제 부하 전 정확한1000대상/10000등록/30팀/10분류 baseline과 gzip snapshot 크기·잔여egress를 확인한다. API 부하 결과는 SDK/브라우저DOM/E2E 및 독립측정 RTT/bandwidth를 포함하지 않는다.

## TECH-05 이후 복원 재검증·추가 결함 (21:00 KST)

- TECH-05 안전 경로 정규화 수정 후 동일 실제 archive의 tar/manifest 경계 검사를 통과했다. 회귀 검사와 별도로 실제 복원 흐름에서 확인했다.
- TECH-06 / 높음: 원본 `pg_restore` 명령에는 `-d/--dbname` 또는 `-f/--file`이 없다. `PGDATABASE` 환경변수만으로 복원 모드가 선택되지 않아 실제 PostgreSQL17에서 `one of -d/--dbname and -f/--file must be specified`로 중단했다. 비밀 URL을 argv에 넣지 않고 PGHOST/PGPORT/PGUSER/PGPASSWORD 환경변수와 비밀 없는 dbname을 사용하도록 개발 담당에게 전달했다.
- 메인 지시에 따라 원본 코드 수정 없이 `/tmp` wrapper에서만 `--dbname=postgres`와 분리 PG 환경변수를 사용해 이후 경로를 진단했다. 이 우회 실행을 제품 복원 스크립트 통과로 기록하지 않는다.
- TECH-07 / 높음: 실제 hosted restore는 source public schema dump의 `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`에서 권한 오류로 중단했다. 공급자 역할의 기본 ACL을 복원할 권한이 hosted postgres에 없다. 단순 `--no-acl`은 API 함수의 PUBLIC EXECUTE 기본값을 남길 위험이 있어 정확한 grants/revokes 재적용 또는 공급자 default ACL만 제외하는 계약이 필요하다.
- TECH-08 / 높음: 부분 복원 뒤 실제 SQL에서 모든 `public.gateway_*` 소유자가 `postgres`인 것을 확인했다. `--no-owner` 복원이 전용 `foodmap_gateway` 소유권/최소 권한 경계를 제거한다. 복원 완료 전에 domain 테이블/함수·공개 함수 소유권, search_path와 grants/revokes의 전체 재검증이 필요하다.
- staging에는 이 우회 시도로 5대상/11등록/6자산이 부분 복원됐다. 사진 재업로드/epoch 변경/lease 초기화/용량 재계산/관리자 재연결은 아직 수행되지 않았다. staging을 정상 복원 완료 상태로 사용하지 않는다. source archive·local 데이터와 운영 프로젝트는 보존했다.
- TECH-09 / 높음: `PATCH /admin/participants/:id/team`의 정규식은 team을 capture group3으로 만들지만 코드 조건은 `match[4] === 'team'`을 검사한다. 실제 관리자 JWT/allowlist와 strict 정상 body로 HTTP400 VALIDATION_ERROR를 재현했다. 모든 운영자 팀 정정이 막힌다. Edge/DB 담당 및 메인에게 batch 전달했다.
- 추가 정적 확인 사항: 복원 대상 Storage의 기존 객체가 남아 있을 경우 manifest 외 객체·용량/unknown 상태를 실제 대조해야 한다. 현재 단계에서는 복원 이후 검증까지 실행되지 않아 이 항목을 합격 또는 확정 결함으로 판정하지 않는다.

## 독립 브라우저 QA 지원 fixture

- `artifacts/qa-page-fixture.json`: 독립 category QA페이지, 21장소/41등록. 상세 대상 하나는21등록(5개2025년 날짜), 나머지20대상 각각1등록. expected 최신순/순위 동점 ID순을 포함한다. 직접 테스트 데이터 생성이며 실제 카카오 검색/등록 API 통과를 대체하지 않는다. 이벤트0, 기존FIX01·사진·역할QA 자료 보존.
- `artifacts/ownership-verification.json`: 기존 U1 자격으로 타인 QA페이지 등록에 실제 HTTP PATCH/DELETE를 각각 보내403 FORBIDDEN, DB message/version/participant_id 불변을 확인했다. QA-P07-06의 UI 검사와 별도 기술 근거다.
- `artifacts/qa-booth-burst.json`: 별도 COURSE category QA부스버스트R2에서105고유 자격/코스가 실제 API로105등록·105이벤트 생성. before26→after132(카테고리 gap27, 이벤트28~132), 순서별 공개 revision/대상/등록/index만 저장한다. 기존FIX01/페이지 fixture의 카테고리 결과는 보존했다.
- `artifacts/qa-booth-ops.json`: index50(event77)의 닉네임/코스명 실제 API 수정, index51(event74)의 실제 API 삭제를 기록했다. index50 팀 변경은 TECH-09 때문에 직접 DB 테스트 fixture 정정이며 운영자 API 합격으로 기록하지 않는다.
- 앞선 버스트 첫 시도는3등록 이후 TECH-09에서 중단됐다. 부스 담당은 이3건 완료cursor26을 확인하고 R2 before26으로 새 baseline을 설정했다. R2와 선행3건을 섞어105개 누락 판정하지 않는다.
- 부스 후속 현재 표시 등록 삭제 도구: `/tmp/foodmap-verify-venv/bin/python /tmp/foodmap-booth-ops.py delete <index>`. index는 공개 artifact의 원생성 index를 사용한다. 실제 표시 순서는 비동기 commit revision 순이므로 index 순으로 추정하지 않는다. 고유 자격은 `/tmp/foodmap-booth-burst-private.json` 권한600에만 저장한다.
- API30분 부하는 아직 미실행이다. 복원 스크립트/보안 계약 수정과 독립 재검증 후 격리된 staging baseline을 준비해야 한다.

## TECH-06~09 수정 후 실제 독립 재검증 (21:15 KST)

- 원본 개발 스크립트가 받은 실제 archive를 staging에 전체 복원했다. Docker PostgreSQL17 wrapper는 host 파일/환경변수 전달만 수행하고 restore 옵션/ACL/소유권 정책을 보정하지 않았다.
- 전체 restore 완료: 11등록·2첨부 자산·4사진 객체, 예약156881B=manifest156881B. epoch 변경, 사진/청소/백업 lease 모두0, 원본 participant identity 재사용, 새 관리자 생성/allowlist 접근 및 권한 회수403을 실제 확인했다.
- `artifacts/restore-verification.json`: app_private/public 함수 owner/search_path 위반0, gateway anon/auth EXEC 노출0, private 테이블 RLS/접근 위반0, PUBLIC EXEC0, 모든 공개 사진 바이트/hash 일치. TECH-09 운영자 팀 정정도 정상 본문 실제 HTTP200으로 재검증했다.
- 복원 archive에는 원본 FIX01 외 당시 QA 자료가 포함된다. 해당 snapshot의 카페 집계는4/3/2였으며 별도의 순수 FIX01 1·1·3 판정으로 보고하지 않는다.
- 복원 대상 Storage의 이전 미첨부 검증 사진은 manifest 밖에 존재할 수 있다. 전체 객체 reconciliation의 unknown-accounting 검증은 남아 있다. 전체100명 API 부하는 아직 미실행이다.

## 추가 TECH-10 및 participant 경합 지원 준비

- TECH-10 / 높음: 실제 관리자 `POST /admin/categories` 정상 `{requestKey,name,kind}`에500 INTERNAL_ERROR. DB create_team/create_category의 `normalized_name` NOT NULL 입력은 `p_payload.normalizedName`인데 Edge가 name만 전달한다. edit_team/edit_category도 동일 누락 가능성을 개발 담당/관리 QA에 전달했다.
- TECH-10 확인 직후 직접 DB 격리 category QA중단검증/team QA중단팀을 생성하고 실제 API로 해당 팀의 새 profile/독립 course 등록을 준비했다. 이후 메인의 fallback 금지 지시를 받았으므로 준비 자료를 실제 operator API 통과로 기록하지 않고 변형·사용을 멈췄다.
- 준비 상태는 `artifacts/qa-race-fixture.json`, 자격은 ignored `.env.qa.race.local` 권한600. category/team은 아직 active이고 요청된 대상 전체삭제도 수행하지 않았다. 기존 FIX01은 보존했다. 수정 후 실제 관리자 생성 API 검증을 별도 고유 명칭으로 수행하거나 준비 fixture 활용 여부를 조율해야 한다.
- staging 부하 baseline을 만들기 전에 이 실제 복원/권한 결과와 archive를 보존한다. 현재 stage 자료를 seed-loaded 정확한1,000/10,000/30/10이라고 간주하지 않는다.

## 100명 API 부하·최종 인계 (21:41 KST)

- 개인 조직·staging 소속을 CLI로 재확인했다. staging을 실제 복원 결과 기록 이후 테스트 전용 exact baseline1,000대상/10,000등록/30팀/10카테고리로 재구성했다. 운영 프로젝트와 local 역할QA는 변경하지 않았다.
- `artifacts/api-load-budget.json`: actual Usage UI에서 Free egress0/5GB(표시상 잔여약5GB), cached별도0/5GB·Edge4/500000·QA DB31.53MB를 읽었다. GB반올림/summary최대1h/일부metric최대24h 지연을 명시한다. 응답 body 최악 예산1.324GB, 새 runner에는1.5GB accumulated decompressed body guard를 둔다. 실제 wire/header와 공급자 청구량은 body 합계와 다를 수 있다.
- 첫 managed-exec 예비 run은 약6분에서 슬롯 회전 중 지속성을 확보하기 위해 중단했다. `artifacts/api-load-interrupted.json`에 보존하며 새30분 run과 합산하지 않는다. 예비 무사진 등록100요청P953326.6ms/max6783.1ms/mean2294.2ms,99성공·1HTTP500 INTERNAL_ERROR. 이 수치는 등록 POST 단일 API의 시간이며 /session 설정이나 상세 확인·지도SDK·DOM은 포함하지 않는다. 이미2초 목표에 우려가 있으며 G4 합격으로 보고하지 않는다.
- 예비 DB 실행 누적은 `artifacts/api-load-db-spans.json`: read_explore 평균220.7ms/max1800ms, gateway_create_favorite78.74ms, identity18.04ms/rate10.69ms/replay11.78ms. DBSQL span 누적에는 이전 준비·복원 시점도 포함되며 개별 Edge request trace로 해석하지 않는다. Edge 개발 담당에게 serialRPC/DB snapshot 압박/HTTP cold-warm 원인 분리용 재현을 전달했다.
- 새 exact baseline에서 독립 `Popen(start_new_session=True,stdin=DEVNULL)` run 시작: PID64935, UTC12:38:30.730706(21:38:30KST). process를 별도 tool invocation 뒤에도 생존 확인했다. 원래 managed job은 종료해 동시 이중 부하가 없다.
- 새30분 run: `/tmp/foodmap-api-load.py`, 로그`/tmp/foodmap-api-load-detached.log`, PID파일`/tmp/foodmap-api-load-pid`, 결과`artifacts/api-load-verification.json`. 65.6초5230요청/error0을 확인했다. 매20초 artifact 갱신, 마지막 context.complete=true만 실행기간 완료를 뜻하며 목표 합격을 뜻하지 않는다. registrationSamples에 각 요청의 latency/status/requestKey/requestId/revision과 시작 후 시간만 기록하고 자격은 기록하지 않는다.
- 시나리오:100 HTTP pollers read_revision→revision변경 snapshot, 부스read_booth와관리자 상당revision 각1개,100명의 무사진 첫등록을 순차 응답 확인+200ms 간격으로 보낸다. 이는5등록/초 stress burst가 아니다. 실제 브라우저100명 foreground·SDK·정상RTT/상하향 독립조건·DOM5초 반영을 포함하지 않는다. warm/cold 표본과 API/E2E 범위를 분리한다.
- source staging의 이전 사진 객체는 유지하고 ledger.has_untracked_objects=true로 새 사진 예약을 막았다. exact load에 사진 처리 테스트를 섞지 않았다.
- G2 actual hosted Shutdown CPU/메모리 raw를 Aside로 읽고 공식 runtime 소스로 단위를 확인했다. `artifacts/supabase-usage-verification.md`에880ms 및 종료total58,596,672B와 peak-memory/배포commit 미확인 한계를 기록했다.

## 역할 QA 지원 최종 상태

- TECH-10 독립 실제 HTTP 재검증: 별도 임시 팀·PLACE카테고리 생성/이름수정/선택중단 모두 성공. 결과`artifacts/qa-race-ops.json`. 처음 helper의 catalog 키 가정 오류로 남은 임시 독립기술907183c6 행은 QA 관리자 실UI에서 오변경 후 즉시 이름/선택 상태를 원복했고 현재version3 인계를 받았다. 이것은 제품 결함으로 기록하지 않는다.
- participant R2 삭제 경쟁은 별도 관리자 agent가 실제 UI DELETE200(UTC12:27:08)으로 수행했다. 기술 helper는 이후 preview404만 확인하고 중복 삭제하지 않았다. 준비된 QA중단검증/team/profile는`artifacts/qa-race-fixture.json`, ignored`.env.qa.race.local`에 유지하며 disable은 아직 수행하지 않았다.
- 관리자 독립fixture `artifacts/qa-admin-fixture.json`: QA관리독립코스2등록, QA관리독립장소4등록,6고유 자격의 등록은 실제API. 장소 provider ID만 합성 DB자료임을 구분했다. 현재 소유권/삭제/정정은 관리자 AsideQA가 수행한다.
- 전체0 local QA helper는 `/tmp/foodmap-local-empty-qa.py`로 준비만 했으며 실행하지 않았다. 두 역할 agent의 쓰기 락을 확인한 뒤에만 실행해야 한다. 활성 backup lease로 cleanup claim을 보류하고 source data-only dump+정확한 favorites/photo_refs/event_refs checkpoint를 저장, 일시0 실제RPC 확인 뒤 최대180초 또는 `/tmp/foodmap-empty-qa-done` 신호에 정확 row/ref 원복·fingerprint 일치와 lease 종료를 수행한다. globalreset/Storage 삭제는 사용하지 않는다. 아직 이 helper의 실제 empty/원복 검증을 수행하지 않았으므로 원복 안전 완료로 단정하지 않는다.

## 최적화 독립 검증과 사용자 범위 축소 (2026-10-13 23:16 KST)

- 새 단일 RPC `gateway_submit_favorite`와 작은 API 번들을 staging에서 독립 검증했다. 36 실제 HTTP/SQL 사례와 추가 권한 검사5개 모두 통과했다. 증거 `artifacts/submit-contract-verification.json`.
- 검증은 최초 profile 생성201, canonical key replay200/다른payload409, 서명된 장소·기한 만료 proof의 기존명령 재생과 새명령 거절·다른 소유자 proof 거절, 만료 identity, 잘못된 shape의 rate차감과 업무 롤백,20동시 동일키1코스/1등록/1이벤트·19재생,다른20키 중복거절,타인/미준비 사진거절·준비된 본인 DBfixture첨부,rate429와RetryAfter60,실제app_state 잠금 timeout503·rate보존을 포함한다. ready사진 사례는 DB 준비자료이며 실제 Storage/재인코딩 검증으로 확대하지 않는다.
- 새 gateway의 실제 anonymous HTTP401/42501 및 정상 authenticated JWT의HTTP403/42501, 전용owner/search_path/RLS/PUBLIC EXEC/default privilege/스키마CREATE 차단을 확인했다. stage API v6/ezbr04daa10ebb819e139779c8c91c0154e379a8d12e7862aebf486f9915e233d0e1과 제품 함수3개만 남은 실제 CLI 목록을 확인했다. latency-probe/api-shadow는 삭제됐다.
- TECH-11: production 공개 Auth signup이 열려 있음을 독립 조회로 발견했다. 릴리스 담당이 개인 조직을 확인해 product/stage 모두 signup을 닫은 뒤 독립 `GET /auth/v1/settings`에서14:00:18UTC disable_signup=true를 재확인했다. 이전false/실제hourlyCron SQL성공+pg_netHTTP200 이력은 `production-readonly-audit-before-signupfix.json`에 보존했다. 최신 `production-readonly-audit.json`의product는 여전히0대상/0등록/0팀/0분류/revision0·privateJPEG버킷·leastprivilege0위반이다. 새 최적화의 product반영 전 조회이므로 해당新gateway최종production판정으로 전용하지 않는다.
- 최적화 전 정식 API run은1808.7초/99,748 HTTP/error0으로 완료했으나 무사진POST100의P95약2.757초로2초 목표에 실패했다. 이는 HTTP부하 실행 완료이며 G4/E2E 합격이 아니다. 기존 `api-load-verification.json`을 새run과 혼산하지 않았다.
- 새로운 exact1,000대상/10,000등록/30팀/10카테고리에서102HTTP peer와2cohort100+100의 독립30분 run을 시작했다. 실제 Usage 새조회는egress0.601/5GB·표시잔여4.399GB/Edge354호출, 새 decoded body worst예산2.514GB·encoded1GB/decoded2.8GB guard, 매응답 실제gzip wirebody를 계량했다. 단일POST timer는session준비·상세/지도/DOM을 제외한다. freshTCP/새profile과 keepalive/기존profile 구분이며 공급자 isolate cold/warm 또는 실제 브라우저 cache cold/warm이 아니다.
- 메인에서 전달된 사용자 지시 **“러프하게 확인하고 마무리해줘”**에 따라 새30분 작업 PID27974를 SIGTERM으로 중단했고 process command가 사라진 것을 재확인했다. 이 작업을 공식30분·각100표본 합격으로 바꾸지 않는다.
- 중단 직전 rough226.9초/HTTPerror0·cold100성공(84건≤2초,P952632.3ms,max3908.7ms)·warm43성공(39건≤2초,P952046.7ms,max2612.1ms), 실제encoded body233,108,867B를 기록했다. 증거 `artifacts/api-load-optimized.json`의context.complete=false/interrupted=true와 사용자 범위 변경 사유.
- source API 및 새migration SHA는 실제run 시작과 현재가 동일함을 확인했다. 관련공통파일/denoSHA,authority 결과,rough한계와 stoppedPID를 `artifacts/rough-codefreeze-verification.json`에 남기고 메인·Edge·릴리스 담당에게 즉시 인계했다. Production migration/API 변경은 Edge 담당,Git/Vercel릴리스는 별도release담당이 수행하며 기술검증 agent는 source코드를 수정하지 않았다.
- 실제100브라우저/SDK·정상RTT/상하향 독립조건·3초/2초/5초 E2E·QR실기기·iPhone/Android·처음 사용자5명·행사입력은 남은 미검증이다. 사용자 범위 축소는 이 조건을 충족했다는 증거가 아니다.
