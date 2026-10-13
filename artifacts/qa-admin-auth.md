# QA-A-02-03 관리자 인증·권한 독립 QA 증거 (완료 2026-10-13 21:43 KST)

## 요약

| ID | 하위 사례 | 결과 |
|---|---|---|
| AUTH-1 | 유효 JWT·allowlist 없음 → 로그인/관리 API 403 | 통과 |
| AUTH-2 | allowlist enabled=false → 로그인 403 | 통과 |
| AUTH-3 | enabled=true → 로그인 허용 | 통과 |
| AUTH-4 | 작성 중 회수 → 제출 403·초안 유지·생성0 | 통과 |
| AUTH-5 | 재허용 후 수동 재로그인 → 자동 실행 없음 | 통과 |
| AUTH-6 | 명시 재제출 → 200·1행 | 통과 |
| AUTH-7a | 무효 token 서버401 → 안내·초안 유지·재로그인 후 자동 실행 없음·명시 재제출 200 | 통과 |
| AUTH-7b | 만료+refresh 실패 → Edge 미호출·안내·초안 유지·재로그인 후 자동 실행 없음·명시 재제출 200 | 통과 |
| AUTH-7c | (추가·비필수) 자연 1시간 만료 JWT | 미실행, 필수 아님 |
| 범위 외 | 일반 참여자·익명 관리 행동 거절 | 다른 QA 수행, 여기서 미반복 |

**필수 인증 사례 8/8 실행, 8 통과·0 실패, 완료.** 만료 흐름은 AUTH-7b(실제 클라이언트 expires_at 과거+refresh 실패)로, 서버 401 분기는 AUTH-7a(무효 JWT)로 충족한다. AUTH-7c는 추가·비필수 사례로 명시적으로 미실행. 결함 0. QA-A-02-03 전체 판정은 다른 QA의 참여자/익명 하위사례 결과와 합쳐서 정한다(원본 문서는 수정하지 않음).

- 역할: 독립 관리자 인증 QA agent (Aside u2 세션 GwXI579lV86QHBOc). 다른 관리자 QA 세션 3sWppaHTHtRcpsAY의 탭에는 attach/변경하지 않음.
- 환경: 고정 production build `http://localhost:4173` (`assets/index-nP-cJGmn.js` 확인), 로컬 Supabase `127.0.0.1:54321`, Edge `api`.
- 브라우저: 직접 연 새 탭 1개(`/admin/login`에서 시작). localStorage `foodmap.identity:v1`은 변경하지 않음(SHA-256 앞 8바이트 `de13217d573604c1` 시작 시 기록, 종료 시 재확인 예정).
- 근거 수집: snapshot(DOM) + 탭 내부 sanitized fetch recorder(method/path/status/error.code만 기록, `/auth/*` 응답 본문·요청 헤더·토큰·비밀번호 미기록) + `performance.getEntriesByType('resource').responseStatus` 보조.
- 범위 외(다른 QA 수행): 일반 참여자·익명 하위사례. 반복하지 않았고 identity를 바꾸지 않았다.

## 준비 자료 (helper, UI 아님)

| 항목 | 값 |
|---|---|
| 임시 Auth 사용자 공개 ID | `7856866c-7fc5-4a0b-a320-7345e4c8c78a` |
| 생성 방법 | 로컬 Auth Admin API(`/auth/v1/admin/users`, email_confirm) — service key는 `.env.supabase-status.local`에서 메모리로만 읽음 |
| 자격 파일 | `.env.qa.authtemp-213610f78c.local` (0600, `.gitignore`의 `.env*`로 제외 확인). 값은 문서/로그에 미기록 |
| allowlist 조작 | `docker exec supabase_db_it-center-food-map psql`로 **임시 사용자 행만** insert/update. root QA 관리자 `ebd1f0cd-…`는 매 단계 `enabled=t` 유지 확인, 미변경 |

## 하위 사례 결과

### AUTH-1 유효 JWT + allowlist 없음 → 거절 — **통과**
- 절차: allowlist에 없는 상태에서 실제 로그인 UI에 임시 계정 입력 → 로그인.
- 네트워크: `POST /auth/v1/token` 200(유효 JWT 발급) → `GET /functions/v1/api/admin/catalog` **403 FORBIDDEN**.
- DOM: `/admin/login`에 머무름, alert “이 작업을 할 권한이 없어요.” 관리 화면 이동 없음.
- 추가: 같은 탭에서 `/admin` 직접 이동 시 catalog/participants/targets/operations 모두 **403**, alert만 표시되고 관리 자료(팀/카테고리/참여자/대상/운영) 렌더 0.
- 관찰(결함 아님): 거절 후 sessionStorage `foodmap.admin:v1` 세션은 남는다(서버가 매 요청 거절하므로 권한 노출 없음).

### AUTH-2 allowlist `enabled=false` → 로그인 거절 — **통과**
- 준비(helper): 임시 사용자만 `admin_users(enabled=false)` insert.
- 절차: UI 로그아웃 → 로그인 화면에서 같은 계정 로그인.
- 네트워크: token 200 → `GET /admin/catalog` **403 FORBIDDEN**. DOM: 로그인 화면 유지, alert “이 작업을 할 권한이 없어요.”

### AUTH-3 `enabled=true` → 로그인 허용 — **통과**
- 준비(helper): 임시 사용자만 `enabled=true`.
- 절차: 같은 로그인 폼 제출.
- 네트워크: token 200 → `GET /admin/catalog` **200**. DOM: `/admin` “운영자 관리”, 팀·카테고리 목록과 “새 팀 이름” 폼 표시.

### AUTH-4 작성 중 권한 회수 → 제출 거절·초안 유지 — **통과**
- 절차: “새 팀 이름”에 고유 초안 `QA인증213610f78c` 입력 → (helper) 임시 사용자만 `enabled=false` → 실제 “팀 추가” 클릭.
- 네트워크: `POST /functions/v1/api/admin/teams` **403 FORBIDDEN**.
- DOM: alert “이 작업을 할 권한이 없어요.”, 입력값 `QA인증213610f78c` 유지. DB `app_private.teams`에 해당 이름 0건.
- 판정 기준: 회수 계정은 거절이 요구사항이며 403에 재로그인 안내는 요구되지 않는다(재로그인 안내는 401 인증 실패/만료 대상). 결함 아님. 화면에는 상시 “재로그인” 버튼이 있다.

### AUTH-5 재허용 후 수동 재로그인 → 자동 실행 없음 — **통과**
- 준비(helper): 임시 사용자만 `enabled=true`.
- 절차: 관리 화면 “재로그인” → dialog “운영자 재로그인 / 작성 중인 내용은 유지해요. 로그인 후 작업은 직접 다시 실행해 주세요.” → 임시 계정으로 로그인.
- 네트워크: token 200 → `GET /admin/catalog` 200. **`POST /admin/teams` 0건**(자동 재실행 없음). dialog 닫힘, 초안 `QA인증213610f78c` 유지.

### AUTH-6 명시적 재제출 — **통과**
- 절차: AUTH-5 직후 snapshot에서 “새 팀 이름” 값 `QA인증213610f78c` 확인 후 같은 form의 “팀 추가”를 사용자가 직접 클릭.
- 네트워크: `POST /admin/teams` **200** → catalog 200 재조회.
- DOM: 신규 행 “QA인증213610f78c / 선택 가능”, 입력란 비움, alert 0.
- DB(read-only 확인): `app_private.teams` 해당 이름 정확히 1행, ID `1242f4ae-1f65-4cda-a002-34a9afb8bb8a`(거절 시도에서 생성 0 → 명시 재제출로 1, 중복 없음).
### AUTH-7a 무효 access token(서버 401) 중 초안 유지·재로그인 안내·수동 재로그인 후 자동 실행 없음 — **통과**
- 절차: snapshot으로 “새 팀 이름” textbox·“팀 추가” button을 확인하고 초안 `QA만료a213610f78c` 입력. (helper, 내 탭만) sessionStorage `foodmap.admin:v1`의 `access_token`만 서명 불가능한 값으로 변조(expires_at은 미래 유지 → 클라이언트는 유효로 판단, 서버가 거절). 토큰 값은 출력하지 않음. “팀 추가” 클릭.
- 네트워크: `POST /admin/teams` **401 ADMIN_SESSION_EXPIRED**.
- DOM: alert “운영자 로그인이 만료됐어요. 다시 로그인한 뒤 직접 재시도해 주세요.”, 초안 유지. DB 해당 이름 0건.
- 수동 재로그인: “재로그인” dialog(유지/직접 재실행 안내 + 같은 401 안내 alert) → 로그인 → token 200, catalog 200, **`POST /admin/teams` 0건**, dialog 닫힘, 초안 유지, 저장된 access_token 정상화 확인(값 미출력), DB 0건.
- 명시적 재제출: “팀 추가” 클릭 → `POST /admin/teams` **200**, 입력란 비움, DB 정확히 1행 `5817d72d-767d-45cc-b002-e92c3382ef7b`.
- 관찰(결함 아님): 401 후 재로그인 dialog가 자동으로 열리지는 않는다. 안내 문구와 상시 “재로그인” 버튼으로 재로그인을 안내하므로 기준(재로그인 안내) 충족. 사용성 개선 후보로만 기록.
- 화면 근거: Aside 세션 tmp `auth7a-401.png`(사용자 채팅에 첨부).

### AUTH-7b 만료 세션 + refresh 실패(클라이언트 만료) — **통과**
- 절차: snapshot으로 form 확인 후 초안 `QA만료b213610f78c` 입력. (helper, 내 탭만) `foodmap.admin:v1`의 `expires_at`을 600초 과거로, `refresh_token`을 무효 값으로 변조. “팀 추가” 클릭.
- 네트워크: 클라이언트 refresh `POST /auth/v1/token` **400** → 세션 제거(sessionStorage key 없음). **Edge `POST /admin/teams` 호출 0건**(만료 자격 미전송).
- DOM: alert “운영자 로그인이 필요해요. 다시 로그인한 뒤 직접 재시도해 주세요.”, 초안 유지.
- 수동 재로그인: “재로그인” dialog(같은 안내 alert 포함) → token 200, catalog 200, **`POST /admin/teams` 0건**, 초안 유지, 5초 후 DB 해당 이름 0건.
- 명시적 재제출: `POST /admin/teams` **200**, DB 정확히 1행 `ec2ac23a-a4d0-4ba6-9cf0-79c006fb1a1a`.
- 화면 근거: Aside 세션 tmp `auth7b-expired.png`.

### AUTH-7c (추가·비필수) 자연 만료 JWT(서버 측 exp 경과) — **미실행, 필수 아님**
- access token 수명(약 1시간) 경과를 기다리거나 JWT secret으로 만료 토큰을 서명해야 한다. 비밀 취급 최소화를 위해 수행하지 않았다. 서버 401 경로는 AUTH-7a(검증 불가 토큰, 같은 `getUser` 실패 분기)로, 클라이언트 만료 경로는 AUTH-7b로 확인했다.

## 결함
- 없음. 관찰 2개(결함 아님): (1) allowlist 거절 후 Auth 세션이 sessionStorage에 남음(서버가 계속 403). (2) 401 후 재로그인 dialog 자동 열림 없음(문구+상시 버튼으로 안내).

## 정리 상태와 무결성
- 임시 팀 3개(`1242f4ae-…`, `5817d72d-…`, `ec2ac23a-…`)는 실제 UI “신규 선택 중단” PATCH 200 ×3(정확히 해당 ID)으로 신규 참여 선택에서 제외. 삭제하지 않음.
- 내 탭 UI 로그아웃 → `/admin/login`, `foodmap.admin:v1` 없음. 임시 사용자 allowlist는 helper로 `enabled=false`로 되돌림. Auth 사용자와 0600 자격 파일은 재검증용으로 남김.
- root QA 관리자 `ebd1f0cd-…` 마지막까지 `enabled=t`, 변경 없음. 다른 QA 탭·fixture는 attach/변경하지 않음. 기존 탭을 닫지 않음.
- localStorage `foodmap.identity:v1` SHA-256 접두사: 내 탭 열기 직후(21:36 KST) `de13217d573604c1`, 종료 후 재확인(21:44 KST)도 `de13217d573604c1`로 같음. 이 값은 내가 시작 시 관찰한 값이며, 다른 QA의 임시 스왑 전 원본 여부는 그 QA의 기록과 대조해야 한다. 나는 이 키를 읽기(해시)만 했다. 빌드 asset 종료 시 `index-nP-cJGmn.js`.
- 제품 코드·문서는 변경하지 않았다. 이 파일만 새로 만들었다.
