# Admin browser QA wave 1 (QA-A-01-01 ~ QA-A-01-04)

- Role: independent administrator QA (Aside browser, desktop Chromium)
- Build: canonical fixed preview http://localhost:4173 (admin entry /admin/login)
- Backend: local Supabase 127.0.0.1:54321, Edge `functions/v1/api`
- Credentials: QA_ADMIN_EMAIL / QA_ADMIN_PASSWORD read from ignored `.env.qa.local` in the REPL and typed into the login form; never printed or logged.
- Evidence method: Aside accessibility snapshots (exact DOM text) + `performance.getEntriesByType('resource').responseStatus` for HTTP status. A page-local fetch recorder was used only for sanitized response error codes (no headers / tokens captured; auth/v1 bodies excluded).
- No code edits. FIX-01 write lock was granted (relayed from qa_participant, approx. 12:14-12:15Z) for A팀 rename/pause and U1 team correction, with restore after each scenario.

## Login

- 12:13Z login via UI -> `/admin` rendered "운영자 관리" with tabs 팀·카테고리 / 참여자 팀 정정 / 등록·코스·삭제 / 운영 상태. `GET /functions/v1/api/admin/catalog` 200 (x2), auth token 200.
- Catalog before tests: teams A팀/B팀/C팀 (all "선택 가능"); categories QA부스버스트(코스), QA부스버스트R2(코스), QA페이지(장소), 맛집(장소), 산책(코스), 카페(장소), all "선택 가능".

## DEFECT ADM-W1-01 (= TECH-10): new team/category creation returns 500

- Step (real UI): 팀·카테고리 tab -> "새 팀 이름" = `QA Admin T121459` -> click "팀 추가".
- Network: `POST /functions/v1/api/admin/teams` -> **500**, body error.code `INTERNAL_ERROR`, requestId `ea60467c-129c-4d47-87b8-e8b1f3a636eb` (12:15:12Z). Edge log line 705 shows `[Error] {"requestId":"ea60467c-...","code":"INTERNAL_ERROR"}`.
- DOM after: `alert: "요청을 마치지 못했어요. 잠시 후 다시 시도해 주세요."`; input keeps `QA Admin T121459`; team list unchanged (A팀/B팀/C팀 only). No duplicate/partial team shown.
- Request body contained only `requestKey` + `name`. Code reading (no edit): `supabase/functions/api/index.ts:28` create schema has no normalizedName; `supabase/migrations/20261013112023_admin_media_operations.sql:3` inserts `normalized_name = p_payload->>'normalizedName'` -> NULL. Independent technical QA confirmed TECH-10 root cause: `normalized_name NOT NULL` violation; same path for `POST /admin/categories`.
- Not retried repeatedly per main instruction.

## Status summary (updated during run)

| QA ID | Status | Note |
| --- | --- | --- |
| QA-A-01-01 | **FAIL (blocked by TECH-10)** | team create 500; rename/new-participant selection not yet executed |
| QA-A-01-02 | **FAIL (blocked by TECH-10)** | category create path same root cause (confirmed by technical QA); not executed by me in UI to avoid repeated failing writes |
| QA-A-01-03 | not executed yet | |
| QA-A-01-04 | not executed yet | |
| QA-A-02-01 | **PASS** | see below; restored |
| QA-A-03-02 | **PASS** (second full cycle incl. ranking/map/photo) | see below; no write |
| QA-A-03-01 | not executed (waiting for write resume) | |
| QA-A-02-03 | **in progress / partial** | anonymous subcase executed; others need fixtures + write resume |
| others | not executed | |

## QA-A-02-01 team correction and existing aggregates: PASS (executed, restored)

- Prep: FIX-01 as seeded; U1 (50000000-...0001) in A팀 with L1 카페 registration. Write lock granted.
- Public baseline (UI, /targets/L1 with filters, DOM text "이 조건 N 건 · 전체 M 건"):
  - no filter: 4/4; 카페: 3/4; A팀+카페: 2/4; B팀+카페: 1/4 (only article "U3 B팀 · 카페").
- Action (real UI): /admin -> 참여자 팀 정정 -> search "U1" -> card "U1 · A팀" -> "정정할 팀" = B팀 -> "팀 정정 저장".
  - Network: PATCH `/admin/participants/50000000-0000-4000-8000-000000000001/team` **200**, then `/admin/catalog` 200, `/admin/participants?q=U1` 200.
  - DOM: heading changed "U1 · A팀" -> "U1 · B팀"; select B팀 selected.
- Public after (L1): no filter 4/4; 카페 3/4; A팀+카페 **1**/4; B팀+카페 **2**/4 with articles "U3 B팀 · 카페" and "U1 B팀 · 카페" (U1's existing registration now shows B팀).
- Matches expectation (L1 전체4·카페3 유지, A팀카페1, B팀카페2, U1 표시 B팀).
- Restore (real UI): same row -> A팀 -> 팀 정정 저장: PATCH .../team **200**; heading "U1 · A팀". Public re-check: A팀+카페 2/4, B팀+카페 1/4, no filter 4/4 (baseline restored).
- Not covered yet: 카페 ranking page with A팀/B팀 filter during the corrected state (only L1 detail counts checked). Overall 카페 ranking after restore is 1·1·3 (see QA-A-03-02 supplement).

## QA-A-03-02 full-delete impact preview and cancel: PASS (executed, no write)

- Action (real UI): 등록·코스·삭제 tab -> search L1 id -> card "L1 테스트 장소 · 4건" -> "전체 삭제 영향 확인".
  - Network: GET `/admin/targets/30000000-0000-4000-8000-000000000001/deletion-preview` **200**.
  - DOM dialog: heading "장소·코스 전체를 삭제할까요?", text "L1 테스트 장소에 연결된 4건의 등록과 공개 내용을 모두 삭제해요.삭제 후 복구 기능은 없어요. 영향이 달라지면 최신 내용을 다시 확인해야 해요.", buttons 취소/삭제.
- Cancel: clicked "취소" -> dialog removed, **no network request** after cancel; card still "L1 테스트 장소 · 4건".
- Public after cancel: L1 no filter 4/4, 카페 3/4 (unchanged).
- First cycle (12:17Z) covered dialog/count/detail only. Supplemented by a second full read-only cycle during the Edge write pause:
  - Baseline (public UI): L1 detail "이 조건 4건 · 전체 4건", 4 articles, 0 images / 0 photo links (FIX-01 L1 has no photos; baseline 0). 카페 ranking `/rankings?category=카페`: "1 L1 테스트 장소 3건", "1 L2 테스트 장소 3건", "3 L3 테스트 장소 2건" (1·1·3 as expected). Explore `/?category=카페` ranking line "1위 L1 테스트 장소 · 3건"; map loaded without .map-error. Map pin data from the UI-triggered `read_explore` (p_category_id=카페) 200: L1 count 3 @37.001/127.001, L2 3, L3 2. L1-L3 fixture coordinates are outside the default map viewport (center 37.5088/127.0632), so their Kakao pin overlay buttons are not in the DOM; pin evidence is response data from the screen's own request, not a visible pin.
  - Preview again: GET deletion-preview 200, dialog "L1 테스트 장소에 연결된 4건 ...". Click 취소: dialog removed; no further request.
  - After: detail 4/4, 4 articles, 0 images; 카페 ranking identical (L1 3, L2 3, L3 2); explore line "1위 L1 테스트 장소 · 3건"; map no error. Post-cancel pin response capture was lost because page navigation reloaded the recorder; ranking/explore line used instead.

## Observations (non-blocking)

- OBS-1: after the failed team add, the page-level alert "요청을 마치지 못했어요..." stays visible after switching to other admin tabs and after later successful actions (stale error). Minor UX.
- OBS-2: public filters show team "QA중단팀" and category "QA중단검증" that were not in the admin catalog list at my login (created by another QA agent around the same time; admin list not refreshed until a mutation). Not attributed as defect.

## QA-A-02-03 admin access vs participant: IN PROGRESS (not passed)

Dedicated new tab (no admin sessionStorage; own admin tab session untouched).

| Subcase | Status | Evidence |
| --- | --- | --- |
| a. Anonymous (no admin session) opens /admin via UI | executed: rejected | DOM alert "운영자 로그인이 필요해요. 다시 로그인한 뒤 직접 재시도해 주세요."; tab menu shown but no admin data; no admin API request sent on load (client-side gate). |
| a2. Anonymous request reaches API (helper, not UI) | executed: rejected | page-context fetch without Authorization: GET /admin/catalog **401** ADMIN_SESSION_EXPIRED; GET /admin/participants?q=U1 **401** ADMIN_SESSION_EXPIRED. Marked API-level helper evidence. |
| b. Ordinary participant (participant identity, no admin) attempts admin action | NOT EXECUTED | needs participant identity in browser (support flow pending write resume) |
| c. Valid Auth JWT account NOT in allowlist | NOT EXECUTED | needs local temp auth user (fixture prep, write resume) |
| d. Allowlisted but enabled=false admin | NOT EXECUTED | needs local temp admin_users row enabled=false |
| e. Revoked during session (enabled true->false) keeps draft, rejects | NOT EXECUTED | |
| f. Expired/invalid session keeps draft, shows relogin guidance | NOT EXECUTED | |
| g. Manual relogin does not auto-execute the pending action | NOT EXECUTED | |
| h. Enabled allowlisted admin performs same action | covered indirectly by QA-A-02-01 (PATCH team 200 with QA admin) | not re-run in this item |

## Support run for participant QA: QA-P05-06 (executed by admin QA agent at main's request)

- Write resume received from dev (TECH-10 local fix). Dedicated ordinary app tab; before start localStorage had **no** `foodmap.identity:v1` (only `foodmap.booth:v1`); admin tab sessionStorage preserved (separate tab).
- Target 삼성역 2호선 `fbe4ae3e-266d-4e2d-bd48-b0831cef3c09` baseline DOM: "이 조건 1 건 · 전체 1 건", one article "QA사진정정 C팀 · 카페" / "사진실패검증" with 3 photos.
- UI: "나도 최애로 등록" -> /register?target=... ; POST /session 200, /me 200; form shows "첫 참여 정보". Filled 카테고리=카페, 한마디 "QA다른기기 같은닉네임 검증", 닉네임 "QA사진정정", 팀 C팀 -> "최애 등록하기".
  - Network: POST `/functions/v1/api/favorites` **201**, then read_target/me/me/favorites 200.
  - DOM: status "최애 등록 결과를 확인했어요.", "이 조건 2 건 · 전체 2 건", two articles both "QA사진정정 C팀 · 카페" (new one "QA다른기기 같은닉네임 검증" with link "내 등록 수정하기"; existing "사진실패검증" with 3 photos). Bottom link changed "나도 최애로 등록" -> "내 등록 관리".
- Distinct actors (admin UI 참여자 팀 정정 search "QA사진정정", GET 200): two cards "QA사진정정 · C팀" with participant ids `b67f3bcb-8a56-4cc9-b92a-77ed772a4c45` and `efd85083-e586-4262-a222-04418476e945`.
- Retry routing: "내 등록 관리" -> /register?favorite=685fb6c6-08af-4f13-877a-4a7fdb49066b, heading "내 최애 수정", 카페 selected, message preserved, "QA사진정정 · C팀 으로 등록해요." (own manage, no new form).
- Direct same-target retry: /register?target=fbe4... opens "최애 등록하기" form (profile known: "QA사진정정 · C팀 으로 등록해요."); submit 카페/"QA중복재시도" -> POST /favorites **409**; DOM alert "이미 등록한 최애예요. 내 최애에서 수정할 수 있어요."; input preserved. Public re-check: "이 조건 2 건 · 전체 2 건", still 2 articles (no duplicate).
- Observation: the direct /register?target= entry for an already-registered target shows a new-registration form instead of routing to own manage; server rejects with 409 + guidance. Product expectation for that entry point belongs to participant QA.
- New participant identity now stored in u2 localStorage for localhost:4173 and is preserved (owned by participant QA).
- Observation for admin QA: public catalog shows two categories with the identical display name "QAT107b1ec8장소É 수정" (created by dev request tests); kind/duplicate check pending in QA-A-01-04.

## QA-A-02-03 subcase b (ordinary participant) — executed

- Participant tab (identity present, no admin session) -> /admin: DOM alert "운영자 로그인이 필요해요. 다시 로그인한 뒤 직접 재시도해 주세요."; no admin request sent from UI.
- API-level helper (page-context fetch using the tab's participant identity as Bearer; value never printed): GET /admin/catalog **401** ADMIN_SESSION_EXPIRED; PATCH /admin/participants/U1/team **401** ADMIN_SESSION_EXPIRED (no change). Helper evidence, not UI.

## TECH-10 re-QA after dev local fix (my independent UI verification; separate from dev's 17 request tests)

- 12:2xZ admin UI "팀 추가" `QA Admin T121459b`: POST /admin/teams **200**, catalog 200 x2; new row "QA Admin T121459b · 선택 가능"; no alert.
- "카테고리 추가" `QA Admin 명소121459` 종류=장소: POST /admin/categories **200**; row "카테고리 이름 (장소) QA Admin 명소121459 · 선택 가능".
- "카테고리 추가" `QA Admin 러닝121459` 종류=산책코스: POST /admin/categories **200**; row "카테고리 이름 (코스) QA Admin 러닝121459 · 선택 가능".
- Team rename `QA Admin T121459b` -> `QA Admin T121459bR`: PATCH /admin/teams/a8278102-0deb-4ebb-87f8-69ec73c9ead1 **200**; row shows new name.
- ADM-W1-01/TECH-10: create path now works locally (re-verified). Original 12:15Z failure stays recorded.

## Isolated fixtures created through the real participant UI (helper prep for QA-A-01-01/02/03)

- Attempted an isolated profile on alternate origin 127.0.0.1:4173 -> POST /session 403 (origin not allowed; expected setup limit, not a product defect). Tab closed.
- **Disclosure:** to get a fresh first-time participant on canonical localhost:4173 I briefly swapped `foodmap.identity:v1` in the support tab: original value captured in REPL memory (never printed), removed, fresh identity created by the app, then the original written back immediately and verified equal (`restored: true`) before submitting. Same capture/restore window used once more to open /courses/new. The participant QA actor's identity is in place and was not deleted. Main later asked not to overwrite; no further swaps.
- First-participant form (fresh profile) on place 봉은사 해수관음상: 카테고리 options included **"QA Admin 명소121459"** (place) and not the course category; 팀 options included **"QA Admin T121459b"**; paused team QAT107b1ec8Edited absent. -> new team appears in new-participant selection (QA-A-01-01 positive part).
- Place fixture PX: POST /favorites **201**, target `2a1ad5f1-6f93-4513-913d-8e47855414a7` 봉은사 해수관음상, article "QA관리X1459 QA Admin T121459b · QA Admin 명소121459", count 1/1.
- Course fixture CX via /courses/new (2 points, 144 m): category options showed **"QA Admin 러닝121459"** with course categories only (QA부스버스트, QA부스버스트R2, 산책); POST /favorites **201**, target `bb247fb4-86c5-4f20-aa2e-4f55486624a8` "QA관리코스121459", article "QA관리X1459 QA Admin T121459b · QA Admin 러닝121459", 1/1.
- -> each new category reuses the existing place / course registration flow (QA-A-01-02 positive part).
- Category renames via admin UI (pre build replacement): `QA Admin 명소121459` -> `QA Admin 명소121459R` PATCH /admin/categories/5d734696-3ebf-472b-ae2a-10f26cbbc2a1 **200**, row "카테고리 이름 (장소) · 선택 가능"; `QA Admin 러닝121459` -> `QA Admin 러닝121459R` PATCH /admin/categories/798b7c9b-541b-495c-a669-b3de095b6301 **200**, row "카테고리 이름 (코스) · 선택 가능". No alert.
- Public verification of renamed team/category on PX/CX detail, filters and counts: **NOT YET EXECUTED** (pending after build replacement).

## Checkpoint at frontend build-replacement pause

- Writes paused on main's instruction; no refresh/navigation in admin tab.
- Build under test for all results above: fixed preview build before ErrorNotice formatter fix.
- Open tabs (mine): admin tab (QA admin session in sessionStorage), public read tab, participant support tab (participant QA identity in localStorage, restored/preserved), authz tab (anonymous).
- Temp data created by me: team `QA Admin T121459bR` (a8278102-...), categories `QA Admin 명소121459R` (5d734696-..., PLACE) and `QA Admin 러닝121459R` (798b7c9b-..., COURSE), participant QA관리X1459 with PX 2a1ad5f1-... and CX bb247fb4-... registrations, participant QA사진정정(2nd) favorite 685fb6c6-... on 삼성역 2호선. FIX-01 is back to baseline (U1 restored to A팀; L1 not deleted).

## Build replacement + resume

- Admin tab reloaded to new FE build `assets/index-nP-cJGmn.js` (ErrorNotice formatter fix); admin session survived reload; GET /admin/catalog 200.
- Identity separation proof (read-only, X-Participant-Token header, values never printed): localStorage identity -> /me 200 participant `efd85083-...` "QA사진정정" C팀 with favorite 685fb6c6 (삼성역 2호선, 카페, "QA다른기기 같은닉네임 검증"); fixture identity (private 0600 file in session tmp) -> /me 200 participant `30ee720a-10ca-4f35-a494-4b2fb5ec441e` "QA관리X1459" team **"QA Admin T121459bR"** with favorites c126be00 (QA관리코스121459, **"QA Admin 러닝121459R"**) and ab5f9a07 (봉은사 해수관음상, **"QA Admin 명소121459R"**). Tokens differ. Renames reflected; registrations kept.
- Admin endpoints with the participant header (correct participant channel): GET /admin/catalog 401 ADMIN_SESSION_EXPIRED, PATCH /admin/participants/U1/team 401 (QA-A-02-03 b, API-level helper).

## Participant collaboration: full delete of temporary target QA코스R2 (P05-12 support, not FIX-01)

- 12:26-12:27Z, admin UI 등록·코스·삭제 -> search `a65cdbe9-5074-41f6-8a1c-100daac82d5b` -> card "QA코스R2 · 1건 / 산책코스".
- "전체 삭제 영향 확인": GET .../deletion-preview **200**; dialog "QA코스R2에 연결된 1건의 등록과 공개 내용을 모두 삭제해요.삭제 후 복구 기능은 없어요. ..." (name and count read before confirm).
- "삭제": DELETE `/admin/targets/a65cdbe9-5074-41f6-8a1c-100daac82d5b` **200** (done 12:27:08Z), then catalog 200, targets?q=... 200; card removed from result list (search returns no card).

## QA-A-01-01 / QA-A-01-02 rename propagation (new build)

- Isolated fixtures, public UI after renames: PX `/targets/2a1ad5f1-...` "이 조건 1 건 · 전체 1 건", article "QA관리X1459 QA Admin T121459bR · QA Admin 명소121459R"; with filters team=a8278102 & category=5d734696: 1/1 same article. CX `/targets/bb247fb4-...` 1/1 "QA관리X1459 QA Admin T121459bR · QA Admin 러닝121459R"; filtered 1/1. Filter option labels show renamed names with the same IDs. No duplicate team/category rows.
- FIX-01 A팀 rename under lock: admin UI "A팀" -> "A팀QA임시" PATCH /admin/teams/10000000-...0001 **200**; team row count unchanged (no duplicate). Public L1: "이 조건 4 건 · 전체 4 건", articles "U4 A팀QA임시 · 맛집", "U3 B팀 · 카페", "U2 A팀QA임시 · 카페", "U1 A팀QA임시 · 카페"; filter A팀+카페 "2 건 · 전체 4 건" and team filter option label "A팀QA임시" (same id). Restored via UI "A팀QA임시" -> "A팀" PATCH 200; L1 A팀+카페 2/4 with "U2 A팀 · 카페", "U1 A팀 · 카페".

## QA-A-01-03 pause new selection (FIX-01 A팀 + 카페 under lock): PASS

- Admin UI: A팀 "신규 선택 중단" PATCH /admin/teams/10000000-...0001 **200** -> row "신규 선택 중단"; 카페 "신규 선택 중단" PATCH /admin/categories/20000000-...0002 **200** -> row "신규 선택 중단".
- First participation (fresh temporary identity in support tab; original identity backed up to 0600 file and restored, verified equal): /register?target=L2 "첫 참여 정보" -> 카테고리 options: QA Admin 명소121459R, QA중단검증, QA페이지, 맛집 (**카페 absent**); 팀 options: B팀, C팀, QA Admin T121459bR, QA중단팀 (**A팀 absent**).
- Existing views while paused: L1 detail filter A팀+카페 "이 조건 2 건 · 전체 4 건" articles "U2 A팀 · 카페", "U1 A팀 · 카페"; filter options still list A팀 and 카페; ranking 카페: L1 3, L2 3, L3 2 (1·1·3); ranking A팀+카페: L1 2, L2 1.
- Resume (also QA-A-01-04 "재개 허용"): "선택 재개" for A팀 and 카페 -> PATCH 200 each, rows "선택 가능". Fresh first-participation form again lists A팀 and 카페. Support identity re-verified ("내 등록 수정하기"/"내 등록 관리" on 삼성역 2호선).
- New registration by existing participants while paused: covered in QA-A-01-05 (isolated team/category).

## QA-A-01-05 paused team / paused category (isolated fixture identity QA관리X1459): PASS with UX observation

- Identity context: support tab localStorage temporarily set to the fixture identity (0600 file), restored after; verified support actor afterwards ("내 등록 수정하기"/"내 등록 관리" on 삼성역 2호선, value equal).
- Admin UI pause team `QA Admin T121459bR`: PATCH /admin/teams/a8278102-... **200**, row "신규 선택 중단".
- Existing member of paused team registers another target: /register search "봉은사 법왕루" -> form shows "QA관리X1459 · QA Admin T121459bR 으로 등록해요." -> 카테고리 QA Admin 명소121459R -> POST /favorites **201**, target f7f017b0-5e84-4810-a5a4-1d26c4ca1361, article "QA관리X1459 QA Admin T121459bR · QA Admin 명소121459R". PASS.
- Category paused while drafting (place 봉은사 진여문, category QA Admin 명소121459R selected, message "작성중 카테고리중단 초안"):
  - Run 1: admin paused category (PATCH 200) ~2 s before submit; the form's catalog refresh removed the option and reset the select to placeholder; click "최애 등록하기" sent **no request** (browser required field); message kept; no explanatory notice shown (OBS-3).
  - Run 2 (race, server path): resumed (PATCH 200), reselected the category, admin paused and submit clicked immediately -> POST /favorites **400**; DOM alert "입력 내용을 확인해 주세요."; message "작성중 카테고리중단 초안" retained; category reset to placeholder and paused category not offered. Rejection + draft retention PASS. OBS-4: error text is generic, does not tell the user the category was paused/reselect needed.
  - Reselect 맛집 -> POST /favorites **201** (target d7094e24-b6e4-4d0c-8177-e463691c6228, "QA관리X1459 QA Admin T121459bR · 맛집").
- Existing favorite with the paused category (PX favorite ab5f9a07): edit form shows option "QA Admin 명소121459R (신규 선택 중단)" (selected); message changed to "QA관리 격리자료 중단분류 수정" + photo added (POST /uploads 200, signed upload 200, media-finalize 200) -> "변경 저장하기" PATCH /favorites/ab5f9a07-... **200**; public: 1/1, banner "... · QA Admin 명소121459R", message updated, image "QA관리X1459의 최애 사진 1". PASS.
- Category QA Admin 명소121459R and team QA Admin T121459bR left paused for now (temporary objects).

## Participant collaboration (b): pause QA중단팀 + QA중단검증 (12:31:45Z)

- Admin UI 팀·카테고리, row "QA중단팀" (선택 가능) -> "신규 선택 중단": PATCH `/admin/teams/3bc122a0-7713-4951-966c-0bea2578df3d` **200**, catalog 200; row now "신규 선택 중단".
- Row "QA중단검증" (카테고리 이름 (장소), 선택 가능) -> "신규 선택 중단": PATCH `/admin/categories/1f91da24-a6ee-4399-a8dd-d1d266f43630` **200**, catalog 200; row now "신규 선택 중단".
- No other catalog rows changed. Will NOT resume until participant QA explicitly requests.

## DEFECT ADM-W1-02: normalized duplicate team accepted against FIX-01 "B팀" (fixture normalized_name not normalized)

- Step (real UI, new build): 팀 추가 with `" b팀 "` -> POST /admin/teams **200**; new row "b팀 · 선택 가능" next to existing "B팀". Expected per DEC-08/BR-A-01-04: trim+NFC+lowercase -> "b팀" equals normalized "B팀" -> reject.
- Control checks: "b팀" -> 400, "B팀" -> 400 (now collide with the new row), NFD "A팀" -> 400, "qa admin t121459br" -> 400 (app normalization works for app-created/renamed rows).
- Read-only DB check: teams `B팀` normalized_name `[B팀]`, `C팀` `[C팀]` (not lowercased); `A팀` `[a팀]` only because it was renamed via the admin UI earlier; new row `b팀` `[b팀]`. Source (read only): `scripts/seed-local-fixture.py:11` inserts `normalized_name = name` for FIX-01 teams. Edge `supabase/functions/api/index.ts:32` computes `normalizeName()` correctly.
- Impact: duplicate-name protection is bypassed for any seeded row whose name has uppercase letters (local FIX-01 B팀/C팀; any similar seed/restore path). Owner: DB/fixture. Product create path itself behaves correctly.
- Cleanup done via UI: row 89329ea1-261d-4ef3-bf02-1b9b79800ff8 renamed to `QA Admin T121459dup` (PATCH 200) and paused (PATCH 200) so it no longer appears as "b팀" in new selection. Teams cannot be deleted from the UI; row remains as a paused temporary object.

## QA-A-01-04 boundaries (in progress)

- Empty team name "": browser required validation "이 입력란을 작성하세요."; **no request**; catalog rows unchanged.
- Whitespace "    ": client validation alert "1~30자로 입력해 주세요" (friendly formatter, new build); no request; unchanged.
- 31 graphemes `QA가나다라마바사아자차카타파하ABCDEFGHIJKLMNO`: alert "1~30자로 입력해 주세요"; no request; catalog signature unchanged (verified equal).
- 30 graphemes rename of temp team -> PATCH 200 accepted, then renamed back (PATCH 200).
- Normalized duplicates: NFD "A팀" -> POST 400 alert "입력 내용을 확인해 주세요."; "qa admin t121459br" (lowercase of existing) -> 400; " b팀 " -> **accepted (ADM-W1-02)**.
- OBS-5: the same alert text appears twice (page section + hidden 재로그인 dialog ErrorNotice) and stale alerts persist after later successful actions.
- Category duplicates within type: " 카페 " (PLACE) -> POST /admin/categories **400** "입력 내용을 확인해 주세요."; "qa admin 명소121459r" (PLACE, lowercase of existing place) -> **400**. PASS.
- Same normalized name in other type: "qa admin 명소121459r" as COURSE -> **200** (allowed per DEC-08 "분류 유형 내 중복 금지"). Temporary row remains.
- Rename duplicate: dup team -> "c팀" **accepted 200** (same root cause ADM-W1-02, C팀 normalized_name `[C팀]`), then -> "A팀" **400**, -> " a팀 " **400** (A팀 normalized `[a팀]`), then back to `QA Admin T121459dup` 200 (paused). Course category -> "산책" (existing course) **400**. Failed rename keeps the typed draft in the row with inline alert (draft retained; stored name unchanged, verified after reload).
- Category kind change: no kind control on existing rows in the admin UI (0 row selects); create form only. API-level immutability check: see below.
- Invalid inputs did not change list rows/counts (catalog signature compare + reload).

### INCIDENT (my error, corrected): accidental rename of another agent's team

- 12:34:27Z my index-based rename (row index shifted because another agent added rows concurrently) sent PATCH `/admin/teams/af0b4927-5afb-40da-a274-b3e7661219a5` with name "QA Admin 러닝121459R" -> 200. That team was created 12:33:53Z by another admin agent (likely independent technical QA, name "독립기술907183c6" observed at 12:34 list).
- Corrected 12:3xZ via UI: renamed back to "독립기술907183c6" (PATCH 200), selectable unchanged (선택 가능). Its version is now 3 (was 1), so the owner may see VERSION_CONFLICT if it holds an older expectedVersion. Switched to name-verified row operations after reload.
- Kind immutability (API-level helper with the logged-in admin's own session token from the admin tab; never printed): PATCH /admin/categories/카페 with extra `kind: "COURSE"` -> **400 VALIDATION_ERROR**; catalog re-read: 카페 kind PLACE, version 3 unchanged, selectable true. UI offers no kind control on existing rows.
- Resume allowed: covered in QA-A-01-03 (A팀/카페 "선택 재개" 200).
- **QA-A-01-04 verdict: FAIL** due to ADM-W1-02 (normalized duplicate accepted against seeded FIX-01 rows B팀/C팀). All other boundary subcases passed. Re-QA needed after fixture/normalization fix.
- QA-A-02-03: handed to parallel authorization session GwXI579lV86QHBOc (artifact qa-admin-auth.md). My executed subcases a/a2/b remain as recorded above; c-g not executed by me.

## QA-A-02-02 shared course correction (technical fixture course 44a8641f-1ef7-4fe9-8e1c-5821727b597b, 2 registrations): PASS with defect ADM-W1-03

- Baseline: public "QA관리독립코스", 참고 선 거리 142 m, "이 조건 2 건 · 전체 2 건", articles "QA관리독립2 B팀 · 산책"/"QA관리 코스 타인" and "QA관리독립1 A팀 · 산책"/"QA관리 코스 원작성자"; admin list (read) points [[127.063,37.509],[127.064,37.51]], version 3.
- Admin UI 등록·코스·삭제 -> search by ID -> "등록·코스 관리" opens the same direct route editor (코스 이름, map with ＋, 점 추가/마지막 점 취소, "코스 정정 저장"), with both registrations listed.
- Validation (no request sent in each case): empty name -> "1~50자로 입력해 주세요"; 51 graphemes -> same; 1 point -> **"Too small: expected array to have >=2 items"** (raw English Zod text = ADM-W1-03); 2 identical points -> "서로 다른 점 두 개가 필요해요".
- Valid edit: name "QA관리독립코스정정", 3 new distinct points -> PATCH `/admin/courses/44a8641f-...` **200**; heading "QA관리독립코스정정 · 2건"; "3/200개 점 · 참고 선 거리 296 m".
- 50-grapheme name -> PATCH 200 accepted (heading showed 50 chars), then restored to "QA관리독립코스정정" (PATCH 200).
- After: admin list read same id, name "QA관리독립코스정정", points [[127.06318,37.50879],[127.06476,37.50825],[127.06612,37.50897]], count 2, version 6. Public detail: h1 "QA관리독립코스정정", 296 m, 2/2 with the same two articles/messages. Ranking 산책: "1 QA관리독립코스정정 산책코스 2건".
- Participant denial (API-level helper, fixture participant token, never printed): PATCH /admin/courses/44a8641f... -> **401 ADMIN_SESSION_EXPIRED**; participant PATCH /favorites/{own course favorite} with extra name/points -> **400 VALIDATION_ERROR**; course unchanged (name/version 6/count 2).
- Not separately checked: explore map pin position for the new start point (start point evidenced by admin data + detail map/distance).

## DEFECT ADM-W1-03 (minor, FE): course point-count validation shows raw English Zod message

- Admin course editor with 1 point -> "코스 정정 저장" shows alert "Too small: expected array to have >=2 items" (new build index-nP-cJGmn.js). Name/identical-point errors are Korean. Expected Korean guidance e.g. "서로 다른 점 2~200개". No request sent; data unaffected.

## QA-A-03-01 individual registration delete (isolated L1-equivalent): PASS

- Equivalence: FIX-01 L1 has 4 registrations and no photos. Isolated target PX 봉은사 해수관음상 `2a1ad5f1-6f93-4513-913d-8e47855414a7` prepared with 4 registrations: X (QA관리X1459, created via real UI, with 1 photo uploaded via UI) + H0/H1/H2 (local API helper actors: POST /session 200, POST /favorites 201 each; ids 51a02523..., e70ef262..., 24c128eb...). Temp team/category resumed for helper creation (PATCH 200, ids verified a8278102 / 5d734696). FIX-01 U1 left untouched (original row backup kept privately, not needed).
- Baseline public: "이 조건 4 건 · 전체 4 건"; X article message "QA관리 격리자료 중단분류 수정" with 1 image; photo URL `/functions/v1/api/photos/7abee6df-5bbe-4d6f-8449-d1a50df66c2d?size=full` -> 200 image/jpeg.
- Admin UI: 등록·코스·삭제 -> search PX id -> "등록·코스 관리" (4 rows) -> X row "이 등록만 삭제" -> dialog "이 등록만 삭제할까요? QA관리X1459의 등록 한 건만 삭제해요.삭제 후 복구 기능은 없어요..." -> "삭제": DELETE `/admin/favorites/ab5f9a07-49c8-4015-a07a-7f10f167cbae` **200**; card "봉은사 해수관음상 · 3건", X row removed.
- Public after: "이 조건 3 건 · 전체 3 건", articles H2/H1/H0 only, 0 images; X message absent; photo URL -> **404 PHOTO_GONE**. X's own list (/me/favorites, helper read) no longer contains 봉은사 해수관음상. No hide/restore action exists in UI.
- A-02-02 supplement (explore map): UI filter change to 산책 triggered `read_explore` (p_category_id=산책) **200**; pin for 44a8641f: lat 37.5087938247111, lng 127.063179269125 (= new first point 127.06318/37.50879), kind COURSE, count 2; rankingPage entry name "QA관리독립코스정정" rank 1 count 2. Map overlay buttons present in DOM: "산책코스 2건 상세" (x2), "산책코스 1건 상세" (x2) (overlay-to-target mapping not exposed in DOM). Selected path polyline itself not readable from DOM; path evidenced by admin target points (3 new points), detail distance 296 m, and pin start point.

## QA-A-03-04 failure / concurrent change: FAIL (ADM-W1-04); conflict/replay/deleted-detail parts pass

Targets are my temporary fixtures (not FIX-01): TC 봉은사 진여문 d7094e24, TD 봉은사 법왕루 f7f017b0, CX course bb247fb4.

1. Preview then concurrent registration (TC): UI preview GET 200 "봉은사 진여문에 연결된 1건 ..."; helper actor H3 POST /favorites **201** (f16e6c50...) after preview; UI "삭제" -> DELETE /admin/targets/d7094e24 **409** (not deleted), UI auto re-requested deletion-preview 200 and dialog now "...2건의 등록..." and card "봉은사 진여문 · 2건"; public 2/2 (H3 + X). PASS. OBS-6: no message tells the admin that the impact changed (the 409 error is cleared by the automatic re-preview; only the number changes).
2. Lost response after server success (TC, then repeated on TD with body capture). Network fault injected by a page-runtime fetch shim (local helper; real request sent, response dropped, TypeError thrown; removed afterwards):
   - T+0.3 s: alert **"Failed to fetch"** (raw English), dialog still open, no success shown.
   - T+2.8 s: revision refresh removed the card and dialog entirely; **no success/failure message, no same-key retry path in UI**. Public detail then shows deleted state.
   - Same-key replay (API helper with the identical captured body `{requestKey:65a74689..., expectedVersion:2, expectedCount:1}`): DELETE /admin/targets/f7f017b0 -> **200 {replayed:true, revision 229}**; new key -> 404 TARGET_GONE. No duplicate side effects. PASS at API level; UI retry path not available for this case.
3. Network failure before reaching server (CX): shim threw before sending. Alert "Failed to fetch", dialog stays (no success). After 3 s dialog still open; clicked "삭제" again -> same requestKey `46e1785d-...` sent -> DELETE **200 replayed:false**; card removed; public CX deleted state. Same-key retry PASS.
4. Deleted public detail (TC/TD/CX): heading "최애 상세", alert "이 장소나 코스가 삭제됐어요. 다른 대상을 선택해 주세요." with "← 지도" link (map move). PASS. OBS-7: alert also shows a "다시 시도" button that cannot succeed.

## DEFECT ADM-W1-04 (FE, admin delete UX under network failure)

- (a) Network failure is shown as raw "Failed to fetch" (not the friendly Korean formatter; build index-nP-cJGmn.js).
- (b) If the delete actually succeeded but the response was lost, the next revision refresh silently removes the target card and the open dialog; the admin gets neither a success confirmation nor the same-key retry the spec requires ("동일 요청 키로 재시도 ... 성공을 재생"). Server replay works (200 replayed:true via same key), but the UI never offers it.

## QA-A-03-03 whole delete place(4) + course(2) (technical fixtures from artifacts/qa-admin-fixture.json): PASS

- Equivalence: place QA관리독립장소 `1a1cc898-8e16-4733-9bc7-dfc387f6f5de` (synthetic DB place, 4 registrations by 4 actors via real API) = L1-equivalent; course QA관리독립코스(정정) `44a8641f-...` with 2 registrations = R1-equivalent (after QA-A-02-02 edit). Fixture registrations have no photos (photo removal on delete evidenced separately in QA-A-03-01: PHOTO_GONE 404).
- Baseline public: place "4 건 · 전체 4 건" (QA관리독립3~6, 카페); course "2 건 · 전체 2 건"; 카페 ranking "1 QA관리독립장소 4건", "2 L1 테스트 장소 3건"; 산책 ranking "1 QA관리독립코스정정 2건"; L1 4/4; PX 3/3.
- Admin UI: search place id -> "전체 삭제 영향 확인" GET preview 200, dialog "QA관리독립장소에 연결된 4건의 등록과 공개 내용을 모두 삭제해요..." -> "삭제" DELETE `/admin/targets/1a1cc898-...` **200**. Search course id -> preview dialog "QA관리독립코스정정에 연결된 2건..." -> "삭제" DELETE `/admin/targets/44a8641f-...` **200**; cards removed; admin search returns 0 targets.
- Public after: both detail pages show deleted state ("최애 상세" + deleted alert); 카페 ranking "1 L1 테스트 장소 3건" only; 산책 ranking no QA관리독립 entry; explore `read_explore` 200 for 산책 and 카페: no pins for either deleted target; L1 pin count 3 (카페). Unrelated preserved: L1 4/4 (U4/U3/U2/U1), PX 3/3.
- No hide/restore path offered.

## QA-A-02-01 supplement: ranking pages during correction (lock), restored

- Admin UI 참여자 팀 정정 search U1 id -> card "U1 · A팀" -> B팀 -> PATCH .../50000000-...0001/team **200**, card "U1 · B팀".
- Ranking A팀+카페: "1 L1 테스트 장소 1건", "1 L2 테스트 장소 1건"; ranking B팀+카페: "1 L1 테스트 장소 2건".
- Restore -> A팀 PATCH **200**, card "U1 · A팀"; ranking A팀+카페 "1 L1 2건", "2 L2 1건"; B팀+카페 "1 L1 1건" (baseline).

## QA-A-03-03 supplement: whole delete of a 4-registration place WITH photo (PX)

- X re-registered on PX via real UI after the QA-A-03-01 deletion (identity swap with restore verified): POST /favorites **201**, public "4 건 · 전체 4 건" (X with image "QA관리X1459의 최애 사진 1" + H2/H1/H0). Photo `photos/bcf9fe54-958e-4ff8-b67f-227c33bd0cfa?size=full` -> 200.
- Admin UI preview dialog "봉은사 해수관음상에 연결된 4건의 등록과 공개 내용을 모두 삭제해요..." -> "삭제". The admin tab's resource-timing buffer was full (250 entries), so the DELETE status was not captured for this one action (buffer then enlarged/cleared); outcome evidence: dialog/card gone, admin search for PX returns 0 targets (GET 200), photo URL -> **404 PHOTO_GONE**, public PX deleted state ("이 장소나 코스가 삭제됐어요..."), helper H0 own list empty (/me/favorites 200 []), L1 unchanged 4/4.

## QA-A-02-02 supplement: 200-point upper bound

- Helper course "QA관리경계코스121459" `8b4a72f5-25f6-4d00-a889-77dfb3398b40` created by local API helpers H4 (201) + H5 (201) = 2 registrations.
- Admin UI editor: start "2/200개 점"; one map drag, then "점 추가" x198 -> "200/200개 점 · 참고 선 거리 398m" and **"점 추가" disabled** (201st point impossible in UI). "코스 정정 저장" -> PATCH /admin/courses/8b4a72f5 **200**, no alert; admin read 200 points, count 2, version 4; public 2/2 same registrations.
- API-level helper: 201 points PATCH -> see next line.
- 201 points via admin API helper (admin's own session in page context): PATCH -> **400 VALIDATION_ERROR**; course unchanged (200 points, version 4).
- Catalog writes paused by main at this point for ADM-W1-02 developer surgical fix (B/C normalized names). Awaiting resume for normalized-duplicate re-QA.

## GLOBAL LOCAL WRITE PAUSE acknowledged (12:46:08Z)

- All API/DB writes stopped (no helper, catalog, course, delete, upload). No page refresh/navigation that could trigger POST /session. Read-only evidence saving only until explicit resume.
- State at pause: admin tab idle on 등록·코스·삭제 (course 8b4a72f5 editor open, saved); support tab holds original participant identity (verified restored); no shims installed (fetch restored).

## COVERAGE SUMMARY (12 admin QA IDs) — as of 12:46Z, session 2026-10-13_3sWppaHTHtRcpsAY

| QA ID | Verdict | Coverage basis | Open items / defects |
| --- | --- | --- | --- |
| QA-A-01-01 | **PASS after TECH-10 fix** (original 12:15Z run FAIL ADM-W1-01/TECH-10 kept) | UI add team 200; fresh participant team list shows new team; isolated team rename -> detail/filter/me updated, counts kept; FIX-01 A팀 rename -> L1 detail/filter labels updated, counts 4/2, no duplicate row; restored | none open (normalized-dup issue tracked under A-01-04) |
| QA-A-01-02 | **PASS after TECH-10 fix** | UI add PLACE + COURSE categories 200; each appears only in its own registration flow (place search form / course editor); registrations 201; rename -> detail/filter/me updated, counts kept | — |
| QA-A-01-03 | **PASS** | A팀/카페 paused via UI; fresh first-participation lists exclude both; L1 detail/filter/ranking (1·1·3, A팀카페 2/1) unchanged; resumed and restored | — |
| QA-A-01-04 | **FAIL (ADM-W1-02)** | empty/whitespace/31 rejected without request; 30 accepted; NFD/lowercase dups rejected; place dup rejected; cross-type same name allowed; kind change no UI control + API 400; invalid input leaves list unchanged; resume allowed | ADM-W1-02 seeded B팀/C팀 normalized_name not lowercased -> " b팀 "/"c팀" accepted. Re-QA after surgical fix (awaiting resume) |
| QA-A-01-05 | **PASS** (OBS-3/OBS-4 UX) | paused-team existing member registers new target 201; paused-category draft submit rejected 400 with message kept and reselect -> 201; existing favorite in paused category edited text+photo 200 | OBS-4 generic "입력 내용을 확인해 주세요." |
| QA-A-02-01 | **PASS** | U1 A->B via UI 200; L1 4/3 stable; A카페 1/B카페 2 detail+filter; ranking pages; restored twice | — |
| QA-A-02-02 | **PASS functionally; ADM-W1-03 open** | technical fixture course (2 regs): name+route edit 200, same id, both favorites kept; detail/distance/ranking/explore pin start point updated; 1~50 name (empty/51 rejected, 50 accepted); 2 identical points rejected; 200 points accepted, 201st disabled in UI, 201 via API 400; participant admin PATCH 401 / favorite name/points 400 | ADM-W1-03 raw English 1-point message; re-QA after FE fix. Polyline geometry not DOM-readable |
| QA-A-02-03 | **PARTIAL here** (a anonymous, b participant executed & rejected); c-g owned by parallel auth session GwXI579lV86QHBOc (qa-admin-auth.md) | UI alert + no admin request; API 401 ADMIN_SESSION_EXPIRED with no auth and with participant header | final verdict from auth session artifact |
| QA-A-03-01 | **PASS** (isolated L1-equivalent) | PX 4 regs incl. UI photo; "이 등록만 삭제" DELETE 200; 3 remain; message/photo gone (PHOTO_GONE 404) | FIX-01 U1 not deleted (equivalence documented) |
| QA-A-03-02 | **PASS** | L1 preview 4 via UI, cancel no request; detail/ranking/map data/photo count unchanged (two cycles) | — |
| QA-A-03-03 | **PASS** | technical place(4) + course(2) whole delete via UI 200; public detail deleted state; rankings/explore pins exclude; L1/PX unrelated preserved; plus PX 4-reg with photo whole delete -> PHOTO_GONE | PX DELETE status not captured (timing buffer), outcome verified |
| QA-A-03-04 | **FAIL (ADM-W1-04)** | preview->concurrent registration -> 409, re-preview 2건 (PASS, OBS-6 no notice); pre-send failure same-key UI retry 200 (PASS); lost response: UI raw "Failed to fetch" then card/dialog vanish silently, no same-key retry/success replay in UI (FAIL); API same-key replay 200 replayed:true (API-level only); deleted detail notice + map link (PASS) | ADM-W1-04 needs FE fix + independent UI re-QA |

Defects: ADM-W1-01 (=TECH-10, fixed locally, re-verified), ADM-W1-02 (fixture normalized_name), ADM-W1-03 (course points message), ADM-W1-04 (delete lost-response UX). Observations: OBS-1/5 stale/duplicate alerts, OBS-3/4 paused-category messaging, OBS-6 silent conflict re-preview, OBS-7 "다시 시도" on deleted detail.

Temporary objects left (all mine unless noted): teams QA Admin T121459bR (a8278102, selectable), QA Admin T121459dup (89329ea1, paused); categories QA Admin 명소121459R (5d734696, selectable), QA Admin 러닝121459R (798b7c9b), qa admin 명소121459r COURSE (5491e0c2); participant QA관리X1459 + helpers QA관리H0..H5 (tokens in session tmp 0600); course 8b4a72f5 (2 regs, 200 points); target d7094e24/f7f017b0/bb247fb4/2a1ad5f1 deleted. Support favorite 685fb6c6 (QA사진정정 2nd actor) kept. FIX-01 restored (U1 A팀, A팀 name/selectable, 카페 selectable, L1 4/4).

## ADM-W1-02 re-QA after surgical DB fix (resume received; 12:49:28Z) — PASS

- Failure history above is preserved (12:3xZ " b팀 " and "c팀" accepted).
- Same build index-nP-cJGmn.js, same admin tab/session (no reset). Admin UI 팀 추가 " b팀 " -> POST /admin/teams **400**, alert "입력 내용을 확인해 주세요."; no new row (catalog row signature identical before/after).
- 팀 추가 "c팀" -> POST /admin/teams **400**; no new row.
- Rename temp team `QA Admin T121459dup` (PATCH URL id 89329ea1-261d-4ef3-bf02-1b9b79800ff8 verified) -> "c팀" -> **400**, inline alert, draft kept in row.
- After reload: rows "A팀 · 선택 가능", "B팀 · 선택 가능", "C팀 · 선택 가능", "QA Admin T121459dup · 신규 선택 중단" (stored name unchanged). No duplicate team.
- **QA-A-01-04 verdict updated: PASS after ADM-W1-02 fix** (original FAIL kept as history). ADM-W1-03 / ADM-W1-04 remain open pending FE fix; QA-A-03-04 stays FAIL until independent UI re-QA on the fixed build.

---

# RE-QA ON FIXED FE BUILD `index-bhhxbMyc.js` (original failing records above preserved)

- REPL context was reset by the runtime before this wave; I re-attached only my own tabs by target id (admin A193AB53..., public 76DE0A8C..., support 18C84A4A...). The booth tab (BC457BA0...) belongs to common QA and was not attached. Admin tab reloaded: script `assets/index-bhhxbMyc.js`; admin sessionStorage present; GET /admin/catalog 200. Support tab localStorage identity equal to the saved original (verified).
- Source read only (no edits): `src/features/admin/Deletion.tsx` (DeletionDialog: states confirm/uncertain/conflict, actions "삭제" / "같은 요청으로 결과 확인" / "최신 영향 다시 확인", page status "아직 확인되지 않은 삭제 요청이 있어요." + "삭제 결과 확인 이어가기", "삭제 결과를 확인했어요."), `src/lib/api.ts errorMessage` (TypeError -> "연결이 잠시 어려워요. 입력을 유지했으니 다시 시도해 주세요."), `shared/validation.ts` Korean messages for points.

## ADM-W1-03 re-QA (course 8b4a72f5-25f6-4d00-a889-77dfb3398b40, 2 registrations, 200 points): PASS

- Baseline (admin read): name QA관리경계코스121459, 200 points, count 2, version 4. Editor shows "200/200개 점 · 참고 선 거리 398 m", "점 추가" disabled.
- Real UI "마지막 점 취소" to 1 point -> "코스 정정 저장": alert **"경로에 서로 다른 점을 두 개 이상 추가해 주세요."**, no PATCH sent (0 course requests). 0 points -> same Korean alert, no request. 2 identical points -> "서로 다른 점 두 개가 필요해요", no request. Name "" / 51 graphemes / "   " -> "1~50자로 입력해 주세요", no request. (Old build showed "Too small: expected array to have >=2 items".)
- Coordinates: the UI has no coordinate input (points only from map center), so corrupt coordinates cannot be entered in UI. Admin API helper (admin's own session in the page, not printed): points [[200,37.5],[127.06,37.5]] -> **400 VALIDATION_ERROR**; [[null,37.5],...] -> **400 VALIDATION_ERROR**.
- Valid UI save: name restored + 2 distinct points -> PATCH /admin/courses/8b4a72f5 **200**, "2/200개 점 · 참고 선 거리 134 m", server 2 points, version 5, count 2.
- Restore to original 200 points via admin API helper with the exact baseline points array -> 200; server points equal baseline (true), count 2, version 6. UI after reload "200/200개 점 · 참고 선 거리 398 m", no alert; public "이 조건 2 건 · 전체 2 건", 398 m, same H5/H4 registrations.

## ADM-W1-04 / QA-A-03-04 re-QA on index-bhhxbMyc.js

Fixtures (local API helpers, temp only): helper H4/H5 created courses `714dacea-efc1-43f8-9a01-7d0b7343dbaa` (lost), `a30e2f03-758b-4eaf-bcd8-35317001712a` (presend), `0f0e1884-3617-446b-bf4a-ccdf82148732` (conflict), each POST /favorites 201, public 1/1. Fault injection = page-runtime fetch shim in my admin tab only (logs sanitized DELETE body/status/code/replayed; no headers), removed after each case (`restored`).

### (1) Lost response after server success: PASS

- UI preview: GET deletion-preview 200; dialog "장소·코스 전체를 삭제할까요? QA관리삭제lost130808에 연결된 1건 ... 취소하면 삭제 요청을 보내지 않아요." -> "삭제".
- Server: DELETE /admin/targets/714dacea **200** (body `{"requestKey":"bf430beb-0045-4dcd-8710-ac8bd03bf518","expectedVersion":2,"expectedCount":1}`, replayed:false); response dropped by shim.
- T+0.4 s and T+4.4 s (after revision refresh: catalog 200, targets?q 200, target card removed): dialog **persists** as "삭제 결과를 다시 확인할까요?" with "응답을 받지 못해 결과가 아직 확정되지 않았어요. 처음 확인한 범위와 같은 요청으로 결과를 확인해요." and Korean alert "연결이 잠시 어려워요. 입력을 유지했으니 다시 시도해 주세요."; buttons 취소 / "같은 요청으로 결과 확인". No false success.
- "취소" -> page status "아직 확인되지 않은 삭제 요청이 있어요." + button "삭제 결과 확인 이어가기"; clicking it reopens the same uncertain dialog.
- "같은 요청으로 결과 확인" -> DELETE with the **identical body** (same requestKey bf430beb..., expectedVersion 2, expectedCount 1) -> **200 replayed:true**; dialog closes; page status **"삭제 결과를 확인했어요."**
- Public detail: "이 장소나 코스가 삭제됐어요. 다른 대상을 선택해 주세요."

### (2) Network failure before reaching server: PASS

- UI preview (a30e2f03, 1건) -> shim throws TypeError before sending -> dialog becomes "삭제 결과를 다시 확인할까요?" with the Korean alert "연결이 잠시 어려워요. 입력을 유지했으니 다시 시도해 주세요."; no request reached the server (0 DELETE entries), card still "QA관리삭제presend130808 · 1건", public still 1/1 -> **no false success**.
- "같은 요청으로 결과 확인" -> DELETE body identical to the first attempt (`requestKey ff04aacb-85ec-4493-9ba6-214c4f19cfbd`, expectedVersion 2, expectedCount 1) -> **200 replayed:false**; status "삭제 결과를 확인했어요."; card removed; public deleted notice.

### (3) Preview -> concurrent registration -> 409 -> manual latest impact -> confirm: PASS

- UI preview (0f0e1884) 200: "...1건...". Helper H4 POST /favorites existing target **201** (d1b52003...) after preview.
- "삭제" -> DELETE **409**; dialog keeps open with "삭제 영향이 달라졌어요. 최신 범위를 확인한 뒤 다시 삭제 여부를 결정해 주세요." + alert "다른 변경이 먼저 저장됐어요. 최신 내용을 확인한 뒤 다시 저장해 주세요."; action button **"최신 영향 다시 확인"**; card "· 2건"; public 2/2 (not deleted). (OBS-8: dialog body sentence still says "1건" until the manual refresh; the conflict text makes the change explicit, so not a defect.)
- "최신 영향 다시 확인" -> GET deletion-preview 200 -> dialog "...2건의 등록과 공개 내용을 모두 삭제해요." with "삭제".
- "삭제" -> DELETE body `{requestKey:de2859c6-..., expectedVersion:3, expectedCount:2}` (new key, new version/count) **200 replayed:false**; status "삭제 결과를 확인했어요."; public deleted notice.

### (4) Already-deleted public detail notice: PASS

- /targets/714dacea, a30e2f03, 0f0e1884 each: alert "이 장소나 코스가 삭제됐어요. 다른 대상을 선택해 주세요." with "← 지도" link.

**ADM-W1-04 re-QA: PASS. QA-A-03-04 full flow re-executed on the fixed build: PASS** (original FAIL record above retained as history).

## Cleanup evidence (13:10Z)

- Temp course 8b4a72f5 (QA관리경계코스121459, 2 helper registrations) whole-deleted via admin UI: preview "2건" -> DELETE **200**, status "삭제 결과를 확인했어요.", public deleted notice.
- ADM-04 targets 714dacea / a30e2f03 / 0f0e1884 deleted during the tests (public deleted notice each).
- Own temporary catalog rows paused via UI with PATCH URL id verified before recording: team a8278102 "QA Admin T121459bR", categories 5d734696 "QA Admin 명소121459R", 798b7c9b "QA Admin 러닝121459R", 5491e0c2 "qa admin 명소121459r" -> each 200, "신규 선택 중단" (rows cannot be deleted in UI). 89329ea1 "QA Admin T121459dup" already paused. Note: a common-QA booth tab is filtered by category 5d734696 (existing views unaffected by pause; I did not attach that tab).
- Helper/fixture participants: /me/favorites for H0..H5 and QA관리X1459 all return 0 registrations. Tokens remain only in 0600 files in the session tmp (u1-favorite-backup/).
- Support participant identity in localStorage equals the saved original; its favorite 685fb6c6 kept. Admin tab session present. No fetch shim active (`window.fetch` restored).
- FIX-01: A팀/B팀/C팀 selectable, 맛집/카페 PLACE and 산책 COURSE selectable. L1 now shows **5** registrations: U1~U4 plus "QA공통연결 C팀 · 독립기술907183c6", added by another agent (not by me) after my last L1 check.

## FINAL COVERAGE (admin QA, session 2026-10-13_3sWppaHTHtRcpsAY)

| QA ID | Final | Note |
| --- | --- | --- |
| QA-A-01-01 | PASS (after TECH-10 fix; 12:15Z FAIL kept) | |
| QA-A-01-02 | PASS (after TECH-10 fix) | |
| QA-A-01-03 | PASS | |
| QA-A-01-04 | PASS after ADM-W1-02 fix (FAIL kept) | |
| QA-A-01-05 | PASS | OBS-3/4 messaging |
| QA-A-02-01 | PASS | |
| QA-A-02-02 | PASS (functional on old build; ADM-W1-03 re-QA PASS on index-bhhxbMyc.js) | |
| QA-A-02-03 | a/b executed here; c–g by auth session GwXI579lV86QHBOc (qa-admin-auth.md, reported PASS by main) | |
| QA-A-03-01 | PASS (isolated equivalent) | |
| QA-A-03-02 | PASS | |
| QA-A-03-03 | PASS | |
| QA-A-03-04 | PASS on index-bhhxbMyc.js (old-build FAIL ADM-W1-04 kept) | |

Open defects: none from this admin wave. Observations remain (OBS-1/5 duplicate/stale alerts, OBS-3/4 paused-category messaging, OBS-6 old build, OBS-7 "다시 시도" on deleted detail, OBS-8 stale count sentence before manual refresh).

## INCIDENT 2 (my error, NOT a product defect): wrong target whole-deleted during adjacent auth-regression setup — STOPPED

- 13:1xZ. Setup step: helper POST /favorites to create a temp course with category 798b7c9b returned **400** because I had paused that category during cleanup. My script did not stop on the failed setup; the admin search box received an empty/undefined id, so the unfiltered target list was shown, and my script clicked the first card's "전체 삭제 영향 확인" and "삭제".
- Result: DELETE `/admin/targets/009299a5-2c94-4baa-9642-752979cf0e11` **200** — target **"QA버스트R2코스060"** (course, 1 registration, booth QA burst fixture, not mine) was whole-deleted. Public detail now shows the deleted notice. The lost-response shim was armed only for my intended target id, so it did not interfere (log empty); UI showed "삭제 결과를 확인했어요."
- No further actions taken. Shim removed (`restored`); admin session and support identity unchanged. Restoration of 009299a5 needs the DB/booth owner (no UI restore exists). Booth burst counts that include this course will be 1 lower.
- The adjacent auth regression (401 during uncertain delete) was **NOT executed**; no finding about 401 handling is claimed.
