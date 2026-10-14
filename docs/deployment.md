# 개인 Vercel 자동 배포

최종 지도 수정 확인 (2026-10-13): PR #13의 main `e0e3562`와 PR #14의 develop 반영을 완료했다. Production `dpl_H7fvqNLnqdJUVQxNgVEywFCXG8y8` READY·HTTP200을 확인했고, CSP에 실제 SDK `t1.kakaocdn.net`과 타일 `mts.kakaocdn.net`을 허용했다. Aside 운영 화면에서 지도 SDK와 512px 타일21개의 정상 로딩을 직접 확인했다. 이전 CSP가 캐시된 페이지는 강력 새로고침으로 갱신한다.

## 대상

- GitHub: https://github.com/tunggary/it-center-food-map
- Vercel 로그인 계정: `tunggary2@naver.com` (`tunggary2-4010`)
- 개인 Hobby scope: `tunggary2-navercoms-projects`
- Vercel 프로젝트: `it-center-food-map`
- 관리 콘솔: https://vercel.com/tunggary2-navercoms-projects/it-center-food-map
- Production URL: https://it-center-food-map.vercel.app
- 프로젝트 ID: `prj_lbTToFgSxF9rMuyDBPWhmLOO6shf`
- 팀 ID: `team_nK4BZEkKZZbkPROxHvkQcJTV`

모든 CLI 명령에 위 개인 scope를 명시한다. `lansik-glucofit`은 사용하지 않는다.

## 배포 흐름

Vercel GitHub 연동으로 빌드·배포한다. GitHub Actions 배포 작업이나 별도 `VERCEL_TOKEN` secret은 필요하지 않다.

- `feature/*` → `develop` PR: Preview 배포에서 변경을 확인한 뒤 머지한다.
- `develop` 변경: Preview 배포한다.
- `develop`에서 `release/*` 분기 → `main` PR: 머지하면 Production에 자동 배포한다. 릴리스 변경이 있으면 `develop`에도 PR로 반영한다.
- Production 브랜치: `main`.
- Preview의 Vercel 인증 보호는 유지한다. 보호된 배포는 `vercel curl`로 확인한다.

프로젝트 최초 연결에서는 첫 feature 브랜치 배포가 Production으로 생성됐다. 준비 페이지의 `READY`와 Production URL의 HTTP 200을 확인했다. 후속 feature 커밋 `80035e6`, develop·release 브랜치가 Preview로 배포됐고, PR #4 머지 후 main 커밋 `d68541b`가 Production READY로 자동 배포됐다. 보호된 Preview HTML과 운영 URL의 준비 페이지 응답을 확인했다.

제품은 React/Vite 앱이며 Node.js 24와 고정된 pnpm 버전으로 빌드한다. `vercel.json`의 framework `vite`, build command `pnpm build`, output directory `dist`를 적용해 설계 문서·로컬 설정 파일을 사이트 출력에서 제외한다. 명시된 제품 경로만 SPA로 rewrite하고 존재하지 않는 자산은 404를 유지한다.

Production에는 운영 Supabase `gpsbnmgwowsbgclcottl`, Preview에는 QA Supabase `yxgmpbjcvjeacnrgtcbq`를 연결한다. 각각 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_KAKAO_JS_KEY` 세 공개 설정만 등록한다. 서비스 역할 키·DB 비밀번호·Kakao REST key·참여자 자격을 Vite 설정에 넣지 않는다. 카카오 SDK 허용 도메인은 운영과 실제 검증할 Preview 주소를 구분해 확인한다. Preview 인증 보호는 그대로 유지한다.

2026-10-13 릴리스 준비에서 개인 계정·프로젝트·GitHub 연결과 Production 브랜치 main을 다시 조회했다. 두 환경의 세 공개 설정을 등록하고 환경별 URL/publishable key가 맞는지 값 출력 없이 대조했다. 원격 Supabase 공개 signup을 운영·QA 모두 비활성화했고 실제 Auth settings와 독립 운영 감사로 확인했다. 배포 READY와 운영 응답은 해당 커밋이 실제 배포된 뒤 아래 실행 기록에 남긴다.

## 로컬 연결과 확인

```sh
vercel whoami --format json
vercel link --yes --project it-center-food-map --scope tunggary2-navercoms-projects
vercel project inspect --non-interactive --scope tunggary2-navercoms-projects
vercel list it-center-food-map --scope tunggary2-navercoms-projects
vercel inspect <deployment-url> --scope tunggary2-navercoms-projects
vercel curl / --deployment <deployment-url> --scope tunggary2-navercoms-projects
```

`project inspect`의 Owner와 프로젝트가 위 대상과 일치한 뒤 배포·Git 연결 등을 수행한다. `.vercel/`과 `.env*`는 Git에서 제외한다. 인증 파일과 토큰은 커밋하지 않는다.

## 복구

문제 변경을 되돌리는 PR을 `main`에 머지하면 Production이 다시 배포된다. 긴급한 경우 위 scope와 프로젝트를 확인한 뒤 `vercel rollback <previous-production-url>`을 사용할 수 있다. rollback 이후에는 자동 도메인 할당이 중단되므로 검증된 배포를 `vercel promote <deployment-url>`로 승격해 복구한다.

## 첫 제품 릴리스 실행 기록

2026-10-13 기능 PR #9 → develop, 릴리스 PR #10·#11 → main을 거쳤다. main `ccdd483705134e7c521a1913fd032b964fe65fe7`은 Production READY(`dpl_BujwNnjcZzkSdBxT1psmR8naP4FK`)이며 framework Vite/output dist와 운영 주소 HTTP200을 확인했다. 주요 직접 경로200·없는asset404·CSP, 운영 Supabase 공개읽기4개200·기본분류3/팀0/revision1도 확인했다. 초기 지도 SDK CSP 누락을 실제 CDN t1.kakaocdn.net 허용으로 수정했고, 지도 타일 최종 DOM/네트워크 검증은 메인 담당에 인계했다. 원본 QA56통과·9보류와 정식 성능 미통과를 유지하며 실제 팀·관리자 계정 입력이 남아 있다.

## 지도 UI 개편 릴리스 (2026-10-14)

기능 PR #17→develop `d56d726` 반영. 기능 `d2d7f87` Preview `it-center-food-bu86xw6xj-tunggary2-navercoms-projects.vercel.app` READY 및 vercel curl로 보호된 HTML/CSS/JS를 확인했다. 타입/build·Vitest24개와 로컬 실제 UI 검증을 통과했다. main PR #18 이후 Production 상태/커밋/운영 응답을 확인한다. 운영 팀2개 selectable=true·등록0·revision2이며 실기기/기존 성능 보류는 유지한다.

실행 결과 (2026-10-14): PR #18 main `e210e683ad1c2b688c0ad2e4f5cfc273e606bc10`의 Production `dpl_4Zn8ktEknRZCHBNh9kC7iJKLq9Jy` READY와 canonical 운영HTTP200을 확인했다. 운영 브라우저에서 PC1440×900/모바일390×844 지도전체 크기·overflow없음, Kakao 타일35개, 팀2개 필터, 전체랭킹패널을 실제 확인했다. 공개조회만 수행해 운영fixture등록을 만들지 않았다. PR #19로 릴리스 문서를 develop에 역반영했다. 이후 이 실행 기록을 반영하는 문서 전용 릴리스는 코드 변경 없이 최종 READY/HTTP 응답을 다시 확인한다.

## 2차 UI 피드백 릴리스 (2026-10-14)

- 문서 `35480cb`·UI `8ffae7b`, 기능 PR #22→develop `a5119a1`, release PR #23→main `494b584dce8e253f51b502e35557e44f16f47840`.
- 기능 Preview READY·인증보호 HTML/JS/CSS 확인, Vitest32개·타입/build 통과.
- Production `dpl_AFCKCc7zcDFBw9B3mevr8gqJXyxS` READY와 canonical HTTP200·지도타일30개·PC top24/height44/width380/ranktop84, 모바일티커/오른쪽메뉴/메인복귀를 실제 브라우저로 확인했다.
- 운영 검증은 공개조회/탐색만 수행했다. 브라우저연결/로그인/DB변경은 없고 실기기GPS/권한/키보드·기존QA/성능 보류를 유지한다.
- 이 실행 기록은 코드 변경 없는 문서 릴리스로 main/develop에 반영하고 최종 main 커밋의 READY·HTTP 응답을 다시 확인한다.

## 등록 UX 개선 릴리스 (2026-10-14)

- 기능 PR #26→develop `ddb2e88a6f7881e434ffeae61c3f2ad350bb052e`, 릴리스 PR #27→main `9ac0cdf32c6f460e9c52f37e294e78991760249d`.
- 개인 scope/팀/프로젝트 ID를 실제 CLI로 확인했다. 기능 Preview READY·보호된 HTML/CSS/JS, QA 카페 검색30건의 삼성역 거리순, Vitest52개·타입/build·Deno API check를 확인했다.
- 검색 정렬은 Supabase api 함수에도 반영했다. 개인 QA `yxgmpbjcvjeacnrgtcbq` api7 / 운영 `gpsbnmgwowsbgclcottl` api8 ACTIVE, verify_jwt=false 유지, 두 번들 SHA256 `a4f897eabddaeb61ec3fd68a301c01b15860df8f2c14208fa5bc0a37400706a5`. DB 마이그레이션 없음.
- Production `dpl_2m9aPvtRr3PqRUVPEV5N5gGW3Tjm` (`it-center-food-mbderv7tj-tunggary2-navercoms-projects.vercel.app`) READY·대상 main 커밋과 운영 `/`, `/register`, `/register/places`, `/courses/new` HTTP200·없는asset404를 확인했다.
- 운영 모바일390×844에서 선택버튼56px·메뉴0·검색top16/버튼top74·장소선택level5→3·핀비가림·검색어/목록15/핀15복귀, 실제 장소상세→등록X복귀를 확인했다. PC1280×800에서 코스상세→등록X복귀·개인링크2개·overflow없음을 확인했다. 카페 검색1페이지89~190m/2페이지192~218m 거리순. 근거는 `artifacts/register-ux-production-verification.json`.
- 운영 검증에서 후기를 신규 등록/수정/삭제하지 않았다. 수정/삭제/마지막후기 빈상세는 로컬 실제 검증과 회귀테스트로 확인했다. 실기기GPS/키보드·기존QA/성능 보류는 유지한다. 이 기록을 문서 전용 릴리스로 main/develop에 반영하고 최종 main READY·운영응답을 재확인한다.

## 랭킹 탭·작은 트로피 릴리스 (2026-10-14)

- 기능코드270d8d2·문서c077018, 기능 PR #30→develop `b36ea1b9715a5e925094365d5abcffe8b11e1ff0`, release PR #31→main `a22a72ad99fdab0ac8d96ab25b4f497f35166734`.
- 개인 계정·scope·팀/프로젝트 ID를 CLI로 재확인했다. feature Preview `dpl_AY4bWrkf4HzdTqp211CqAktpCL78` READY·보호된 HTML/JS/CSS/트로피200·이미지SHA256 일치를 확인했다. release/develop Preview도 READY·GitHub checks SUCCESS였다.
- Production `dpl_2BunoTAWGmhoyQzyDeQ4K4m8potC` (`it-center-food-mzp1guhrj-tunggary2-navercoms-projects.vercel.app`) READY·대상 main SHA·canonical 운영alias를 확인했다. `/`, `/rankings`, 커스텀 직접URL, `/register`, `/register/places`, `/courses/new` HTTP200·없는asset404·CSP와 JS/CSS/트로피200·이미지SHA256 일치를 확인했다.
- 실제 운영 PC1280×800/모바일390×844에서5개탭·탭별API/목록등록수/공동순위·지도타일·커스텀팀선택·상세→랭킹복귀/새로고침 상태유지·트로피PC32×36/모바일30×34·순위문구없음·가로넘침없음을14항목으로 확인했다. 전체 랭킹은10항목이며 앱window error/unhandled rejection은0건이다.
- Vitest65개·타입/build·문서링크246개·diff검사 통과. DB/API·환경변수·인증보호 설정은 변경하지 않았다. 운영 검증은 공개조회/필터/상세탐색만 수행했고 fixture등록/수정/삭제는 하지 않았다. 실기기·기존 독립QA/성능보류는 유지한다.
- 지정 리뷰어 peter-lansik/paulkim-lansik은 이 개인저장소의 협업자가 아니라 GitHub API422로 리뷰요청이 거절됐다. 협업자 권한은 변경하지 않았으며 Assignee는tunggary다.
- 근거: [운영 검증 JSON](../artifacts/ranking-production-verification.json). 이 결과 기록은 문서전용 release PR로 main/develop 양쪽에 반영하고 최종 main의READY/실제응답을 다시 확인한다.

## 등록 모달·상세·폼 개선 릴리스 (2026-10-14)

- 기능 PR #34 → develop `3cdb4baee33bd9457f1d348c317acce8b42e6628`, main 릴리스 PR #35 준비. 후속 코드3533a55·문서15fd204이며 전체Vitest88개·타입/build·Deno check·로컬DB/동시명령/실제Edge검증을통과했다.
- 개인Supabase조직/QA/운영·개인Vercel계정/scope/팀/프로젝트ID를확인했다. QA/운영에프로필생성/상세전체순위migration2개를dry-run후적용했다. 기존데이터는운영18등록/10참여자/13대상/revision22로유지했다.
- api는QA8/운영9 ACTIVE·verify_jwt=false이며두번들SHA256 `50cac0fc183eca032eca04e6111591036caddccf10ba49765861847e166300de`다. QA실제프로필API201/재생200/충돌409/무자격401/검증400·빈본인등록/상세순위를확인했고시험자료는정리했다. QA10146등록/200참여자/1000대상유지·프로필시험후revision150, 양쪽보안advisor ERROR0이다.
- 기능Preview `dpl_CeTp14QTA5qDsFDe5pNrmLWpxJyB` READY·보호된HTML/JS/CSS200·QAendpoint와최종UI스타일을확인했다. Preview인증보호/환경변수/미디어·maintenance함수는변경하지않았다.
- 사용자후속요청으로이번릴리스PR은리뷰어미지정이다. 이전지정시도는협업자제약으로422였고권한을변경하지않았다. Assignee는tunggary다. main머지후READY·대상SHA·canonical응답·운영UI를확인한다.
- 복구는이전main상태로되돌리는PR과기존Vercelrollback절차를사용한다. 추가DB함수/응답필드는기존FE/API와호환되므로급히삭제하지않고, 필요시이전main의api코드로재배포한다. 운영fixture등록은만들지않는다.
