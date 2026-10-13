# 개인 Vercel 자동 배포

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

현재는 의존성·빌드 명령 없는 정적 준비 페이지다. `vercel.json`에서 `public/`만 배포 출력으로 지정하므로 설계 문서·로컬 설정 파일은 사이트 출력에 포함하지 않는다. React/Vite 구현 시 framework·build command·output directory를 Vite와 `dist`에 맞게 변경한다. SPA rewrite와 Supabase·카카오 설정은 앱 구현 시 추가한다.

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
