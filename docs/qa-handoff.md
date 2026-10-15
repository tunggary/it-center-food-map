# 로컬 통합 QA 인계

2026-10-13. 제품 개발 담당의 기술 검증과 독립 역할 QA를 구분한다. 원본 기대 결과는 `docs/2-user-story/qa/`의 65개 항목을 따른다.

## 실행 환경

- 로컬 Supabase: `http://127.0.0.1:54321`, PostgreSQL 17/Docker 컨테이너 `supabase_db_it-center-food-map`.
- FE QA 고정 빌드: Node24.21.0에서 `pnpm build` 후 `pnpm preview --host :: --port 4173 --strictPort`, **http://localhost:4173**을 사용한다. compiled JS 응답 200과 HMR client 부재를 확인했다. Preview는 detached PID89095, 로그 `/tmp/foodmap-preview.log`. 빌드 교체는 QA 쓰기 중단 시간을 먼저 합의한다. 다른 origin은 localStorage 자격/cursor도 달라진다.
- Edge: `supabase functions serve --no-verify-jwt --env-file .env.edge.test.local`, 로그 `/tmp/foodmap-edge.log`. 실제 로컬 signed upload URL은 `127.0.0.1:54321`로 보정한다. 모든 함수가 경로별 직접 자격 검증을 수행한다.
- 독립 SQL 검사: `bash supabase/tests/run.sh`. 트랜잭션 테스트는 준비 자료를 임시 격리하고 롤백하며, 동시성 테스트는 자신이 생성한 자료만 정리한다. 실행 중 다른 QA의 쓰기를 멈춘다.
- 로컬 자격/서비스 설정은 `.env.supabase-status.local`, `.env.qa.local`, `.env.qa.participants.local`, `.env.edge.test.local`에 있고 Git에서 제외한다. 값은 채팅·로그·결과 문서에 복사하지 않는다.

## 준비 자료와 단일 실행자

- 관리자: `python3 scripts/bootstrap-local-qa.py`. 로그인 이메일/비밀번호 키는 `.env.qa.local`의 `QA_ADMIN_EMAIL`/`QA_ADMIN_PASSWORD`; 운영 관리자 계정과 별개다.
- FIX-01: `python3 scripts/seed-local-fixture.py`. A/B/C팀, 카페/맛집/산책, U1~U9와 L1~L3을 준비한다. 공개 ID 매핑은 `artifacts/qa-fixture.json`; 본인 검증용 브라우저 자격은 `.env.qa.participants.local`의 `QA_U1_TOKEN`~`QA_U9_TOKEN`이다.
- 기대값: L1 전체4·카페3·맛집1, L2카페3, L3카페2, 전체카페순위1·1·3. A팀카페 L1=2/L2=1, B팀카페 L1=1, B팀맛집0.
- 자료를 바꾸는 역할 QA를 동시에 같은 FIX-01에서 실행하지 않는다. 역할별 순차 실행 또는 별도 대상/참여자 자료를 사용한다. 초기화 요청은 DB 담당 한 명에게 전달한다.
- 완전 초기화는 로컬에 한정해 `supabase db reset --local` → 관리자 bootstrap → FIX-01 seed. 초기화 전 다른 QA/Edge 담당에게 알려야 하며 이전 로그인·참여 자격이 무효가 될 수 있다. 운영 프로젝트에서는 실행하지 않는다.

## 개발 담당의 확인 결과

- 깨끗한 로컬 reset에서 전체 migration/seed 적용 성공.
- SQL 권한/빈 profile/최초등록/같은명령재생/다른payload거절/version/팀정정/집계1·1·3/전체삭제영향재확인/삭제알림skip 검사 성공.
- 실제20동시 동일 명령은 신규코스1·등록1·알림1과19재생. 다른20키 동일참여자/대상은 모두 중복 거절.
- 사진 예약·타인거절·processing pending·raw 권한 만료 전 보류·백업 청소보류·실삭제실패예약보존·중복반환·지연객체재계상 검사 성공.
- 개인 운영 Supabase `gpsbnmgwowsbgclcottl`에 seed 없이 migration을 적용했다. 보안 advisor ERROR0; 공개 읽기7개를 anon/authenticated에 허용한 SECURITY DEFINER 알림은 승인된 설계 경계와 일치한다. 쓰기 gateway는 익명/일반 Auth 실행권한0이다.

## 부하 자료

`python3 scripts/seed-load-fixture.py --target local` 또는 `--target staging`으로 부하 전용 1,000대상/10,000등록/30팀/10분류 자료를 추가할 수 있다. 운영 ref는 선택할 수 없다. 역할 FIX-01 QA가 끝난 뒤 독립 성능 담당이 별도 테스트 환경에서 한 번 실행한다. 정확한 기준 데이터량을 측정하려면 기존 자료 없는 테스트 환경을 먼저 준비한다. 로더 자체의 작성이 성능 시험 통과를 뜻하지 않는다.

## QA 결과 기록

각 항목에 QA ID·역할·브라우저/환경·준비자료·실행절차·DOM/네트워크 근거·결과·결함ID를 남긴다. 결함은 해당 개발 담당에게 전달하고 수정 후 같은 항목과 인접 회귀를 재검증한다. 원본 항목의 통과 표시는 실행 증거가 있을 때만 바꾼다.

실제 iPhone/Android·처음 사용자5명 관찰·무료 서비스100명30분 성능은 로컬 desktop Aside로 대체하지 않는다. 미수행 항목은 미실행 또는 필요한 입력을 명시한 보류로 남긴다.

## 환경 담당 최종 인계

- 개인 카카오 앱 ID `1606843`: 카카오맵 ON과 무료 쿼터 배지/안내를 Aside로 확인했다. 비즈월렛 미연결·유료 API 사용 안 함을 유지한다. 기존 업무 앱은 사용하지 않는다. JavaScript SDK 허용 도메인은 localhost:5173·localhost:4173·개인 운영 주소 세 개다. 키는 ignored 환경 파일에만 보관하며 QA 문서에 복사하지 않는다.
- Vite를 키 반영 후 재시작했고 `127.0.0.1:5173` 네트워크 응답 200을 확인했다. 브라우저 QA는 위 canonical localhost 주소에서 시작한다. 개발 담당의 API 직접 기술 검증은 실제 카카오 검색 15개/서명 토큰 응답 200, 준비 자격 없는 조회 401, session/본인 조회 200, 허용 밖 origin 403, 사진 예약→signed PUT→WASM ready 200(로컬 1,167ms)을 확인했다. 역할 QA 통과로 대체하지 않는다.
- 운영/검증 프로젝트에 api·media-finalize·maintenance 세 함수를 배포했다. WASM static 파일은 API 서버측 번들 제한을 넘어 Docker CLI 로컬 번들로 배포했다. 운영은 빈 catalog/revision0이며 익명 gateway 실행 거절을 실제 HTTP로 확인했다. 운영 Vault·매시간 Cron·매일 원장 대조 스케줄 구성은 성공했지만 예약 실행 결과는 아직 검증 전이다.
- TECH-01: 독립 기술 agent가 백업 lease 업데이트의 POST/PATCH 불일치를 발견했다. heartbeat/snapshot/complete/fail 네 호출을 PATCH로 수정하고 문법 검사를 통과했다. 실제 DB+사진 백업/복원 재검증은 독립 기술 담당이 수행한다.
- 아직 전체 합격이 아닌 게이트: hosted 사진 CPU/총 메모리, 무료환경100명30분 성능, 실제 DB+사진 백업/복원, iPhone/Android 실기기와 처음 사용자5명 사용성. 세부 기준은 architecture/verification의 원래 기준을 유지한다.

- TECH-02/03 수정 인계(2026-10-13): 백업 snapshot 시각을 UTC `Z`로 직렬화하고 SQL의 실패 코드 7개를 shared/Edge/CLI에 맞췄다. 중단은 `OPERATOR_CANCELLED`, 다운로드 실패는 `DEPENDENCY_UNAVAILABLE`, heartbeat 실패는 `LEASE_EXPIRED`로 기록한다. Deno·Python 문법/암호화 검사 및 SQL/shared/CLI 코드 집합 검사를 통과했다. 종료된 개발 CLI 탓에 오래된 Edge 번들이 남았던 상태를 detached PID87425 재시작으로 해결하고 실제 canonical 실패 PATCH가 입력 검증을 통과해 DB까지 도달함을 확인했다. 실제 백업/복원 성공 판정은 독립 기술 agent의 재실행 결과를 따른다.

- TECH-05 수정 인계(2026-10-13): macOS 임시 경로의 /private symlink 정규화 차이로 정상 백업 압축 파일이 거절되던 문제를 `restore` 작업 루트의 `resolve()`로 수정했다. 정상 symlink 부모 경로의 추출과 경로탈출/절대경로/심볼릭링크/하드링크 거절 회귀를 통과했다. 실제 보존 archive의 DB+사진 복원은 독립 기술 agent에 반환했다. Edge/DB 자료를 변경하지 않았다.

- TECH-06~09 수정 인계(2026-10-13): pg_restore explicit dbname/PG환경변수, provider DEFAULT ACL 제외+앱 ACL 보존, restore-security.sql 전용owner/권한 재구성 및 사후검사, 관리자 participant/team suffix capture를 수정했다. local API의 올바른 `/team` 요청은 입력을 통과해 DB까지 도달하고 suffix 없는 요청은400이다. 실제 팀 변경 성공·전체 복원·익명gateway 차단·원본owner 경계 유지 판정은 독립 기술/관리 QA 결과를 따른다. 로컬 참가자/부스 FIX-01을 초기화하지 않았으며 0건 시나리오는 독립 실행자가 checkpoint/복원을 먼저 조율한다.

## Fixture 정규화 수정

2026-10-13 ADM-W1-02: B/C팀의 normalized_name을 공유 계약과 같은 trim·NFC·lower로 보정했다. `supabase/tests/fixture_normalization.sql`은 FIX-01에서 소문자 b팀/c팀 중복 거절을 실제 DB에서 확인하며 트랜잭션을 롤백한다. 전체 seed를 재실행하지 않고 원 등록·사진·event 내용을 보존했다. UI 재검증은 관리자 QA 담당이 수행한다.

## 등록 진입 참여 정보 모달 — 2026-10-14

- 새 계약은 PRD §2와 참여자 QA-P-03-02/05-01/05-10/08-03을 따른다. 변경된 항목의 과거 통과는 새 정책 검증으로 재사용하지 않는다. 독립 재검증 대기다.
- 로컬 새 gateway 마이그레이션을 적용하고 최신 Edge/FE를 사용한다. `pnpm test:db`는 프로필 SQL/동시성과 기존 회귀를 실행한다. Edge를 실행한 상태에서 `python3 supabase/tests/profile_api.py`로 실제 HTTP 인증/입력/멱등성/충돌을 확인한다. 두 도구는 로컬만 사용하고 자신의 fixture만 정리한다.
- 저장 전 모달 취소는 프로필 없음, 저장 후 최애 작성 취소는 프로필 유지/등록 없음이다. 프로필 저장만으로 등록 알림·랭킹은 변하지 않는다. 본인 UI는 현재 유효한 참여자에게만 제공한다.
- 개발 검증 근거: [브라우저 JSON](../artifacts/registration-profile-browser-verification.json). 실제 새 모바일/PC 모달·상세 등록·소유권 UI를 확인했다. 실기기/독립QA·운영배포는 미완료다.
- 운영 반영 시 새 DB 함수→Edge POST /me→프런트 순으로 배포한다. 기존 first-favorite profile 계약은 유지되어 이전 FE와 호환된다. 프런트를 먼저 배포하면 신규 참여 정보 저장이 실패하므로 금지한다.

## 소개 선택 입력 인계 (2026-10-15)

정책은 trim 후0~100 grapheme, 공백만 입력은 빈 문자열이며 문구·사진이 없어도 등록 카드를 유지한다. QA-P-05-03·11은 이전의0자/공백 거절과 달라 재검증한다. QA-P-03-01·05-01·05-04·06-01·07-01·07-02에는 빈 문구 조합을 추가한다. 과거 실행 기록·artifact는 보존하고 새로운 빌드의 결과를 구분한다. 로컬 자동검증과 독립QA/hosted QA는 구별해 기록한다.

로컬 구현 검증은 [요약](../artifacts/optional-message-verification.json)·[실제 브라우저](../artifacts/optional-message-browser-verification.json)에 기록했다. Vitest119개·타입/build·Deno·DB회귀/동시성·실제Edge HTTP·보안advisor를 통과했으며 독립QA/hosted반영을 의미하지 않는다.
