# 참여자 식별·권한

[설계 목차](README.md) · [API](api.md) · [데이터](data-model.md)

## 참여자 자격

Cloudflare Pages와 Supabase는 서로 다른 출처다. Supabase 도메인의 쿠키를 Pages에서 같은 출처 cookie처럼 사용할 수 있다고 가정하지 않는다. **참여자 bearer 토큰을 앱 origin의 localStorage에 보관**한다. HttpOnly 보호를 포기하는 대가가 있으므로 외부 HTML 삽입 금지·CSP·토큰 로그 금지를 적용한다.

1. 지도/랭킹 열람에는 토큰이 필요 없다. 작성/내 정보 진입 때 `foodmap.identity` Web Lock을 얻고 저장소를 다시 읽는다.
2. 자격이 없으면 `crypto.getRandomValues`로 32바이트 토큰을 생성하여 **네트워크 요청 전에** 저장한다. 서버가 원문을 발급한 뒤 응답이 유실되는 문제를 피한다.
3. `POST /session`에 `X-Participant-Token`으로 전송한다. 서버는 길이/형식을 검증하고 SHA-256 해시의 unique key로 등록/재사용한다. 클라이언트가 만든 무작위 비밀이지, 공개 참여자 ID를 임의 주장하는 방식이 아니다.
4. 서버 응답과 재조회로 자격이 준비됐음을 확인한 뒤 쓰기/업로드를 허용한다. 저장소 사용 불가면 무로그인 열람은 유지하고 등록은 실패 안내한다.
5. 원문은 URL·요청 body·분석 이벤트에 넣지 않는다. 서버는 해시만 보관한다. 유효 기간 180일, 성공적인 참여자 인증 때 1일 1회까지만 만료 시각을 갱신한다.

응답 유실 후 동일 토큰으로 다시 준비하면 같은 browser_identity가 된다. 만료된 토큰을 자동 부활시키지 않는다. `IDENTITY_EXPIRED`를 받으면 재참여가 새 사람으로 취급됨을 알리고 새 자격을 만든다. 참여자 프로필은 첫 최애 등록 트랜잭션에서만 만든다.

Web Locks를 지원하지 않는 브라우저는 읽기는 허용하되 동시 최초 등록 보장 대상에서 제외한다. 지원 iPhone/Android의 실제 버전을 기록하고 잠금 지원을 출시 전에 확인한다. localStorage를 공유하지 않는 브라우저/기기는 별개 참여자다. 기기 fingerprint는 사용하지 않는다.

## Supabase 익명 Auth를 선택하지 않은 이유

공식 기본값은 익명 가입이 IP당 시간당 30회다. 회사 공유 Wi-Fi에서 100명 최초 참여 시 충돌할 수 있다. 설정을 올리는 대안도 있지만 이 서비스는 계정·RLS 기반 개인 조회가 필요하지 않아 기존 불투명 자격 모델을 유지한다. 익명 Auth를 몰래 켜거나 모든 방문자에게 가입을 호출하지 않는다. [공식 한도](https://supabase.com/docs/guides/auth/rate-limits)

## 관리자

- Supabase Auth에 운영자가 사전 생성한 이메일/비밀번호 계정만 사용한다. 이메일 확인까지 준비한 계정을 행사 전에 시험하고, 행사 중 가입/메일 링크 발급을 요구하지 않는다. 공개 signup은 비활성화한다.
- 관리자 Auth client는 별도 storage key를 사용하고 sessionStorage에 보관한다. 참여자 토큰을 교체하지 않는다. 자동 refresh를 사용하되 탭 종료 후 다시 로그인한다.
- 관리자 API는 `Authorization: Bearer <Auth JWT>`를 받는다. Edge가 `auth.getUser(jwt)`로 검증하고 얻은 사용자 ID만 내부 DB RPC에 전달한다. DB 함수는 매번 `admin_users.enabled`를 확인한다.
- `user_metadata.role`, 요청 body의 admin ID, 화면 URL은 권한 증거가 아니다. 권한 회수 후 다음 쓰기는 403, 토큰 만료/invalid는 401이다. 초안은 유지하되 로그인 후 작업을 자동 재실행하지 않는다.
- 운영자 bootstrap/비밀번호 분실 처리는 서비스 관리자 대시보드에서 수행한다. 원문 비밀번호를 문서/로그에 남기지 않는다.

## Edge와 DB 권한 경계

| 경로 | 호출자 검증 | DB 실행 권한 |
| --- | --- | --- |
| 공개 Data API RPC | 공개 publishable key; 키 자체는 비밀 아님 | 명시적으로 grant한 읽기 함수만 |
| 참여자 Edge API | custom bearer 해시를 내부 RPC가 조회 | service_role 전용 gateway RPC |
| 관리자 Edge API | Supabase Auth getUser + DB allowlist | service_role 전용 gateway RPC |
| 사진 응답 | 로그인 없이 현재 공개 연결 존재 검사 | public projection을 통한 asset 정보만 |
| maintenance | 서버 보관 전용 secret, 고정 시간 비교 | 청소 claim/완료 함수만 |

Edge의 공개/혼합 API는 `verify_jwt=false`로 두고 경로별 검증을 직접 수행한다. 이는 공개 read/session 준비와 custom bearer가 Supabase JWT가 아니기 때문이다. **설정을 끈 채 쓰기 검증을 생략하면 안 된다.** 알 수 없는 경로/메서드는 거절한다. 브라우저에서 service_role 키 또는 쓰기 RPC를 직접 호출하는 경로는 없다.

Data API 노출 schema는 `public`. 테이블은 `app_private`에 둔다. `public`에는 허용한 읽기 RPC와 service_role 전용 gateway RPC만 둔다. 기본 PUBLIC execute를 revoke하고 함수별 grant한다. 모든 SECURITY DEFINER 함수는 `search_path=''`, fully qualified 이름, 정적 SQL, 최소 권한 소유자를 사용한다. 새 migration에서 기본 권한이 다시 열리지 않도록 default privileges도 설정한다.

## 브라우저 보안·요청 제한

CORS는 운영 pages.dev origin·지정한 preview origin·로컬 개발 origin만 정확히 허용한다. 쓰기는 Origin도 검사하지만 CORS/Origin을 인증 대용으로 사용하지 않는다. custom bearer는 브라우저가 타 사이트에 자동 첨부하지 않으므로 쿠키 기반 CSRF 토큰은 사용하지 않는다. XSS에는 취약하므로 문구·닉네임·코스명은 텍스트로만 렌더링한다.

CSP는 self 스크립트와 검증한 카카오 SDK 출처만 허용하고 object-src none, base-uri self를 적용한다. 허용 목록은 실제 SDK 네트워크로 검증한다. API 응답·사진은 `no-store`, `X-Content-Type-Options: nosniff`.

기본 rate limit은 DB 원자 카운터로 집행한다: 참여자 명령 30회/분/자격, 검색 30회/분/자격, 사진 준비/finalize 20회/분/자격, 새 자격 300회/10분/신뢰 가능한 원 IP 해시. 같은 NAT의 100명은 차단하지 않는다. 신뢰할 수 있는 원 IP를 플랫폼에서 얻지 못하면 임의 헤더를 믿지 않고 새 자격 총량 3,000회/일을 방어선으로 사용한다. 이는 남용 방지의 제안값이며 누적 최애 개수 제한이 아니다. 초과는 429+Retry-After, DB counter는 만료 후 청소한다.

## 상실·복구

localStorage/기기 상실 시 기존 소유권 자동 복구 없음. 닉네임·팀이 같아도 병합하지 않는다. 내 정보에는 운영자 정정 대상을 구별할 public participant ID를 표시하되 이것으로 권한을 넘기지 않는다. 토큰 유출은 identity 폐기로 대응하며 원문을 복구/표시하는 관리자 기능은 만들지 않는다.
