# 구현 스택·구조

[설계 목차](README.md) · [근거](sources.md)

## 선택 스택

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| FE | React 19, TypeScript 7, Vite 8, React Router 8 | 로그인 없는 지도 중심 SPA; 서버 렌더링을 운영할 필요 없음 |
| UI | Tailwind CSS 4, Radix Dialog/Select 등 필요한 primitive만 | 모바일 패널·키보드 접근성; 별도 디자인 시스템 선도입 없음 |
| 상태 | TanStack Query 5 + React 폼 상태 | 필터별 캐시·요청 취소·실패 시 마지막 결과 유지 |
| 검증 | Zod 4, Intl.Segmenter | 입력 공유·grapheme 기준 문자 수 |
| 정적 배포 | Cloudflare Pages Free, 제공되는 pages.dev 도메인 | 앱 서버 없이 정적 파일 배포; 도메인 구매 없음 |
| 서버 | Supabase Edge Functions의 Deno/TypeScript, supabase-js 2 | 서버 비밀·인증·검색·파일 처리를 한 공급자에서 관리 |
| DB | Supabase PostgreSQL, SQL migration + SQL/PLpgSQL RPC | 하나의 RPC에서 원자적 변경, Data API는 연결 풀 관리 불필요 |
| 참여자 | Web Crypto 무작위 bearer 자격 + DB 해시 | 공유 IP에서 100명 참여, Auth 익명 가입 제한과 분리 |
| 관리자 | Supabase Auth 이메일/비밀번호 + DB allowlist | 관리자만 로그인, 비밀번호 검증 직접 구현 안 함 |
| 지도 | Kakao Web SDK + Local REST | 실제 장소 ID·마커·polyline |
| 사진 | Canvas 사전 축소 + magick-wasm 서버 검증/재인코딩 + private Storage | Edge에서 미지원하는 Sharp 제거, 전송/저장 제한 |
| 동기화 | 2초 read_revision RPC + 변경 시 공개 snapshot RPC | Edge 호출 수·Realtime 전달 제한을 피함 |
| 청소 | Supabase Cron + pg_net + Edge cleanup | 사용 중인 플랫폼 내 소량 배치 |
| 개발/검증 | Node 24 LTS, pnpm, Supabase CLI/Docker, Vitest, Deno test, Playwright, k6 | 실제 PostgreSQL 권한/트랜잭션·실기기·부하 검증 |

2026-10-13 npm 조회값: vite 8.3.4, react 19.3.0, typescript 7.0.2, react-router 8.4.0, supabase-js 2.117.3, Query 5.104.2, zod 4.6.7, tailwindcss 4.3.3, magick-wasm 0.0.44. 설치/호환 검증 전 후보 패치다. 최소 빌드·타입 검사·WASM 로딩을 확인한 패치로 pnpm-lock.yaml/deno.lock을 고정한다. 서버는 Node가 아니라 배포 플랫폼의 Deno 런타임이다.

## 배포 경계

```text
브라우저 ── 정적 JS/CSS ── Cloudflare Pages
  ├─ 지도 SDK ── Kakao
  ├─ 공개 읽기 RPC ── Supabase Data API ── PostgreSQL
  ├─ 본인/관리 명령 ── Edge Functions ── 서비스 전용 DB RPC
  │                                     ├─ Storage
  │                                     └─ Kakao Local REST
  ├─ 임시 signed upload ── private Storage
  └─ 관리자 로그인 ── Supabase Auth
```

모든 도메인 원장은 PostgreSQL 하나다. Edge에서 API를 여러 번 호출해 트랜잭션을 흉내 내지 않는다. 일반 읽기는 Data API의 허용된 함수만 공개하고 내부 테이블은 노출하지 않는다.

## 코드 구조

```text
src/
  routes/           지도·랭킹·상세·작성·내 정보·부스·관리자
  features/         explore, favorites, courses, booth, admin, media
  lib/              public-api, edge-api, identity, query-client, maps
shared/             입력 DTO·검증·오류코드 (브라우저 API/Node 의존 없음)
supabase/
  migrations/       스키마·FK·권한·RPC·Cron 설정
  functions/
    api/            참여자·관리자·검색·사진 응답 라우터
    media-finalize/ WASM 포함, 다른 함수 번들에서 분리
    maintenance/    청소 전용 secret 검증
    _shared/        서버 입력 검증·자격 확인·오류 변환
  tests/            SQL 권한·집계·동시성 fixture
```

FE에 server-only 기능을 넣지 않는다. `VITE_`로 공개할 것은 Supabase URL/publishable key, Kakao JS key뿐이다. 개발자 권한 키·REST 지도 키·DB 연결 URL·선택 토큰 서명 키는 함수 비밀 저장소에만 둔다. 유지보수용 로컬 DB 연결은 배포 앱 의존성이 아니다.

## 이전 설계에서 바뀐 것

| 이전 | 이번 기준 |
| --- | --- |
| Next.js + Vercel Pro | React/Vite + Cloudflare Pages 정적 배포 |
| Route Handlers + Drizzle/pg | Edge Functions + DB RPC, SQL migration |
| 같은 출처 HttpOnly 참여자 cookie | 별도 출처 API이므로 브라우저 bearer 자격; 인증 정보 URL 전달 금지 |
| Edge/앱을 경유하는 2초 poll | 공개 Data API 직접 읽기 |
| 무료안에서 잠정 추천한 Realtime | 초당 100메시지 한도 확인 후 채택 철회 |
| Sharp로 큰 원본 처리 | 브라우저 축소·작은 JPEG만 WASM으로 정규화 |
| Vercel Cron/유료 자동 백업 | Supabase Cron 청소 + 운영자 수동 백업 |

스택 변경으로 중복 방지·팀 정정·현재 등록 집계·삭제 의미를 완화하지 않는다. 성능은 측정 결과로 판단한다.
