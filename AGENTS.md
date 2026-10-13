# 프로젝트 진행 규칙

- 작업 시작 시 [docs/README.md](docs/README.md)의 절차를 읽고 그 순서에 따라 진행한다.
- 현재 진행 상태는 docs/README.md의 체크리스트와 최근 작업 컨텍스트를 기준으로 확인한다.
- 단계 착수·완료 여부는 실제 수행과 확인된 결과를 기준으로 기록한다. 절차 합의를 해당 단계의 진행으로 간주하지 않는다.
- 단계별 상세 문서는 해당 작업을 진행하면서 필요할 때 작성한다. 미리 생성하지 않는다.
- 각 작업이 끝나면 docs/README.md의 체크리스트를 갱신하고, `최근 작업 컨텍스트`에 작업일·진행한 내용과 주요 결정·검증 결과(해당 시)·남은 사항·다음 작업을 간단히 남긴다. 세션 종료까지 미루지 않는다.
- 단계 전체가 완료된 경우에만 체크한다. 일부만 진행한 단계는 미체크 상태로 두고 진행 내용을 컨텍스트에 남긴다.
- 6~8단계 체크는 현재 개선 건의 상태를 나타낸다. 새 개선 건을 시작할 때 이전 결과를 컨텍스트에 짧게 남기고 해당 체크를 초기화한다.

## GitHub

- 공개 저장소: [tunggary/it-center-food-map](https://github.com/tunggary/it-center-food-map).
- `origin`: `https://github.com/tunggary/it-center-food-map.git`.
- `main`은 기본·운영 브랜치, `develop`은 통합 브랜치다. 두 브랜치에는 직접 push하지 않고 PR로 반영한다.
- 기능은 `develop` → `feature/*` → `develop` PR, 릴리스는 `develop` → `release/*` → `main`·`develop` PR, 긴급 수정은 `main` → `hotfix/*` → `main`·`develop` PR로 진행한다.
- 커밋·PR 제목은 `<type>: <한국어 제목>`, PR 본문은 한국어로 작성한다. Assignee는 `tunggary`, Reviewers는 `peter-lansik`, `paulkim-lansik`이다.

## Vercel — 개인 계정 전용

| 항목 | 값 |
| --- | --- |
| 로그인 계정 | `tunggary2@naver.com` (`tunggary2-4010`) |
| 개인 Hobby scope | `tunggary2-navercoms-projects` |
| 팀 ID | `team_nK4BZEkKZZbkPROxHvkQcJTV` |
| 프로젝트 | `it-center-food-map` |
| 프로젝트 ID | `prj_lbTToFgSxF9rMuyDBPWhmLOO6shf` |
| 관리 콘솔 | https://vercel.com/tunggary2-navercoms-projects/it-center-food-map |
| 운영 주소 | https://it-center-food-map.vercel.app |

- 이 프로젝트는 위 개인 scope만 사용한다. 업무 팀 `lansik-glucofit`에는 생성·연결·배포하지 않는다. 표시 이름은 바뀔 수 있으므로 scope와 팀·프로젝트 ID로 대상을 확인한다.
- Vercel 명령에는 항상 `--scope tunggary2-navercoms-projects`를 명시한다. 작업 디렉토리에서 `vercel whoami --format json`과 `vercel project inspect --non-interactive --scope tunggary2-navercoms-projects`로 계정·프로젝트를 확인한 뒤 변경한다. 대상이 다르면 변경을 중단하고 원인을 확인한다.
- 새 작업 폴더에 연결이 없을 때는 `vercel link --yes --project it-center-food-map --scope tunggary2-navercoms-projects`로 기존 프로젝트에 연결하고 다시 확인한다.
- GitHub 연동이 `main` 변경을 Production, 나머지 브랜치 변경을 Preview로 자동 배포한다. 별도 GitHub Actions 배포나 `VERCEL_TOKEN` secret은 추가하지 않는다.
- `.vercel/`·`.env*`·인증 토큰은 커밋하지 않는다. Preview 인증 보호를 유지하고 보호된 배포는 `vercel curl`로 확인한다.
- 배포·검증·복구 작업 시 [docs/deployment.md](docs/deployment.md)를 읽는다. 배포 완료는 대상 커밋의 `READY`와 실제 응답을 확인한 뒤 기록한다.

## Supabase — 개인 계정 전용

| 항목 | 값 |
| --- | --- |
| 로그인 계정 | `gsy1656@gmail.com` (`tunggary`) |
| 개인 조직 | `tunggary's Org` |
| 조직 ID / slug | `tiyzwalofmbdlhlybape` |
| 요금제 / 유형 | Free / Personal |
| 관리 콘솔 | https://supabase.com/dashboard/org/tiyzwalofmbdlhlybape |
| 운영 프로젝트 / project ref | `it-center-food-map` / `gpsbnmgwowsbgclcottl` |
| 검증 프로젝트 / project ref | `it-center-food-map-qa` / `yxgmpbjcvjeacnrgtcbq` |
| 리전 | 두 프로젝트 모두 서울 `ap-northeast-2` |
| 운영 프로젝트 콘솔 / API | https://supabase.com/dashboard/project/gpsbnmgwowsbgclcottl / https://gpsbnmgwowsbgclcottl.supabase.co |
| Codex MCP | `supabase` — `https://mcp.supabase.com/mcp` (OAuth 인증 완료) |

- Supabase 작업 시 `supabase` 스킬을 읽고 CLI 또는 MCP를 사용한다. CLI 명령·옵션은 설치된 버전의 `--help`로 확인한다.
- 이 프로젝트의 Supabase 리소스는 위 개인 조직의 Free 요금제에서 운영한다. 변경 전 `supabase orgs list --output-format json`과 `supabase projects list --output-format json`으로 조직 ID와 대상 프로젝트의 소속을 확인한다. 대상이 다르면 변경을 중단하고 원인을 확인한다.
- QA 자료·사진 처리·부하·복원 시험은 로컬 또는 위 검증 프로젝트에서 진행한다. 운영 프로젝트는 검증 fixture로 변경하지 않는다. 새 작업 폴더는 확인한 project ref로 `supabase link --project-ref <project-ref>`를 실행하고 연결 대상을 확인한다.
- CLI 로그인과 MCP OAuth 인증은 별개다. MCP 도구가 표시되지 않으면 등록·인증 상태와 세션 재연결을 확인한다. 프로젝트 생성 후 MCP URL의 `project_ref`를 제품용 프로젝트로 지정해 범위를 제한한다.
- 인증 토큰·DB 비밀번호·secret/service-role 키·`.env*`·`supabase/.temp/`는 커밋하지 않는다. 스키마 변경은 마이그레이션으로 관리하고 실제 쿼리로 검증한 뒤 완료를 기록한다.
