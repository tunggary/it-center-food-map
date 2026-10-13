# ADR-0003: 브라우저 bearer 자격과 관리자 인증을 분리한다

- **상태**: 제안됨
- **날짜**: 2026-10-13
- **드라이버**: R3·R5·D3·D5·C3·C4 ([드라이버](../drivers.md))
- **설계 질문**: Q2·Q8 — 출처가 다른 무료 앱/API에서 무로그인 소유권을 어떻게 유지할까?
- **관련**: [참여자 식별·권한](../identity.md)

## 컨텍스트

닉네임 중복/다른 기기 재참여는 허용하되 남의 등록 수정은 금지한다. Vercel 정적 앱과 Supabase는 다른 출처여서 기존 same-origin cookie 설계를 그대로 쓰기 어렵다. 회사 공유 네트워크로 100명이 들어올 수 있다.

## 검토한 대안

| 대안 | 얻는 것 | 치르는 것 |
| --- | --- | --- |
| 브라우저 무작위 비밀 + 서버 해시 | D3 로그인/가입 없음, 기존 DB identity 유지, C4 추가서비스 없음 | JS 접근 가능한 저장소라 XSS 방어와 자격 수명 직접 관리 |
| Supabase Anonymous Auth | 토큰 갱신·RLS 통합 | 기본 공유 IP 가입 30회/시간, 설정·남용 대응 필요; 현재 서버 검증 경로에서 이점 작음 |
| same-origin proxy+HttpOnly cookie | JS 탈취면 축소 | Vercel Functions 추가 호출·운영 경계; 무료 읽기 직결과 권한 경로 복잡화 |
| 공개 participant ID/닉네임만 인증 | 구현 간단 | R3 위반이므로 채택 불가 |

## 결정

Web Crypto로 만든 32바이트 무작위 토큰을 네트워크 요청 전에 localStorage에 저장하고 서버에는 SHA-256 해시만 보관한다. 여러 탭 초기화는 Web Locks로 보호하고, 쓰기는 X-Participant-Token header로 인증한다. 열람에는 자격을 만들지 않으며 첫 favorite 트랜잭션에서 participant를 생성한다. 180일 활동 갱신과 만료 후 자동 복구 없음이 기본안이다.

관리자만 Supabase Auth의 사전 계정을 사용하며 Edge getUser와 DB allowlist로 검증한다. 일반 signup과 익명 Auth는 사용하지 않는다. 모든 도메인 쓰기 RPC는 service_role 전용이다. CORS·저장·오류·권한의 상세는 연결 문서에 규정한다.

## 근거

D3는 엄격한 실명/기기 간 계정이 아닌 같은 브라우저의 비밀 보유 증명으로 충족한다. 토큰을 요청 전에 보존하면 최초 응답 유실에도 같은 자격을 재사용한다. 무료 API 출처 분리의 비용을 받아들이고 별도 proxy를 추가하지 않는다.

## 결과

- **좋아진 것**: 공유 IP 가입 제한과 독립된 참여, 동명 참여자 구분, 이메일 없는 첫 참여.
- **감수할 것**: HttpOnly 보호가 없다. XSS가 발생하면 자격 탈취가 가능하고 브라우저 기록 삭제 시 소유권을 잃는다.
- **함정**: 토큰을 URL/로그에 노출, 자격 준비 전 등록, 요청 body의 admin ID 신뢰, verify_jwt=false 상태에서 경로별 검증 누락.
- **새로 생긴 설계 숙제**: Q8의 초기 자격 보존·동일 키 재시도·권한 회수·만료 정책을 identity/API 문서에 해결.

## 검증

두 탭 초기화·저장소 차단·응답 유실·변조/만료·동명 참여·타인 favorite/asset 접근·관리자 권한 회수·공개 RPC 권한을 시험한다. 실제 Safari의 Web Locks 지원도 확인한다.

## 재검토 트리거

HttpOnly 보호 필수, SSO/기기 간 복구 요구, 지원 브라우저의 초기화 기능 부재. 이때 same-origin proxy 또는 관리형 익명 Auth의 비용과 제한을 다시 비교한다.

## 변경 이력

- 최초안: same-origin 서버 발급 HttpOnly cookie.
- 2026-10-13: Pages/Supabase 출처 분리와 공유 IP Auth 한도를 반영해 bearer 자격으로 변경. 보안상의 대가와 서버 권한 경계를 명시.

- 2026-10-13: 개인 프로젝트의 정적 배포처를 Vercel Hobby로 변경했다. API는 여전히 Supabase의 별도 출처이므로 bearer 자격 결정을 유지하고 운영 origin을 vercel.app으로 갱신했다.
