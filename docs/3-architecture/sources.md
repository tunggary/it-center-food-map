# 공식 근거·검증 경계

[설계 목차](README.md)

조회일: 2026-10-13. 아래는 공개 문서 확인이며 실제 계정 권한·프로비저닝·부하 시험 결과가 아니다. 가격/쿼터/SDK는 변경될 수 있어 출시 직전에 다시 확인한다.

| 자료 | 이번 설계에 적용한 사실 |
| --- | --- |
| [Vercel Vite 배포](https://vercel.com/docs/frameworks/frontend/vite) | 정적 Vite 배포·SPA 직접 링크 rewrite |
| [Supabase 가격](https://supabase.com/pricing) | Free API 횟수 무제한, DB500MB/Storage1GB/전송 한도/함수50만/휴면/자동백업 제외 |
| [DB 함수](https://supabase.com/docs/guides/database/functions) | SQL 함수 호출과 권한, SECURITY DEFINER 주의 |
| [API 보안](https://supabase.com/docs/guides/api/securing-your-api) | 노출 schema/권한·Data API 경계 |
| [Edge 인증](https://supabase.com/docs/guides/functions/auth) | verify_jwt와 함수 내부 인증 책임을 구분 |
| [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits) | 익명 가입 기본 IP당30회/시간, 이메일 기본 한도; 행사에 가입메일 의존 안 함 |
| [Realtime 한도](https://supabase.com/docs/guides/realtime/limits) | Free 초당100메시지·200연결; 단순100명 fan-out에 여유 부족 |
| [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) | 구독자별 검사/순차 전달 비용; Realtime을 무한 전달로 가정하지 않음 |
| [Edge 한도](https://supabase.com/docs/guides/functions/limits) | CPU2초·256MB·번들제한·Sharp 미지원 |
| [이미지 WASM 예시](https://supabase.com/docs/guides/functions/examples/image-manipulation) | magick-wasm 방식; 우리 최대 파일의 CPU 충족은 별도 시험 |
| [Cron](https://supabase.com/docs/guides/cron), [함수 예약](https://supabase.com/docs/guides/functions/schedule-functions) | DB scheduler/pg_net 호출, secret 보관 |
| [Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals) | private 저장과 업로드 제한 |
| [서명 업로드](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) | signed 권한 수명과 앱 자산TTL을 구분하고 원본 삭제 전에 확인 |
| [pg_dump snapshot](https://www.postgresql.org/docs/current/app-pgdump.html) | DB dump와 사진 manifest에 같은 snapshot 사용 |
| [DB 백업](https://supabase.com/docs/guides/platform/backups) | Storage 파일은 DB 백업과 별개 |
| [카카오 Local](https://developers.kakao.com/docs/ko/local/dev-guide) | 장소 ID·좌표·검색 결과 |
| [카카오 Web](https://apis.map.kakao.com/web/documentation/), [선 길이](https://apis.map.kakao.com/web/sample/calculatePolylineDistance/) | 직접 그린 경로·선 길이; 공식 보행 길찾기 시간은 아님 |
| [카카오 쿼터](https://developers.kakao.com/docs/ko/getting-started/quota) | 실제 앱의 권한/사용량·유료 설정 점검 필요 |
| [네이버 Directions15](https://api.ncloud-docs.com/docs/ai-naver-mapsdirections15-driving) | 자동차 경로 API, 자동 보행 기능 근거로 사용하지 않음 |
| [Vercel Hobby](https://vercel.com/docs/plans/hobby) | 개인·비상업 사용 조건과 CDN 월100만 요청·정적 전송100GB. 사용자 개인 프로젝트 선택에 따라 정적 배포처로 채택 |

패키지 패치는 npm registry의 각 패키지 `/latest`를 조회했다. 이는 패키지 설치·빌드·의존성 호환을 확인한 결과가 아니며, 최종 설치 버전은 G1/G2 검증 후 lockfile로 고정한다.
