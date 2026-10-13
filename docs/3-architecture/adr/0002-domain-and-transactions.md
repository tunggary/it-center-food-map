# ADR-0002: 정규화 원장과 단일 DB 함수로 정합성을 지킨다

- **상태**: 제안됨
- **날짜**: 2026-10-13
- **드라이버**: R1·R2·R4·R5·R6·D1·D3·C4 ([드라이버](../drivers.md))
- **설계 질문**: Q1·Q8 — 중복·재시도·수정·삭제를 어떻게 일치시킬까?
- **관련**: [데이터 모델](../data-model.md), [API](../api.md)

## 컨텍스트

최애 대상과 사람별 등록은 다른 개념이다. 카테고리는 등록마다 다르고 닉네임/팀은 현재 참여자 정보를 모든 과거 등록에 반영한다. Edge에서 여러 Supabase HTTP 요청을 호출하는 것은 하나의 DB 트랜잭션이 아니다.

## 검토한 대안

| 대안 | 얻는 것 | 치르는 것 |
| --- | --- | --- |
| 정규화 PostgreSQL·단일 SQL RPC | R1/R2/R5 원장과 이벤트·명령 결과가 원자적, C4 기존 구성 안 해결 | SQL 함수·권한·동시성 테스트 필요 |
| Edge에서 INSERT 여러 번·보상 삭제 | TypeScript 위주 구현 | 중간 실패 시 고아 코스·사진·누락 알림, R5 복구 책임 증가 |
| 문서 DB·비정규화 카운터 | 대상별 읽기 단순 | R2 팀/분류 정정·삭제 때 복수 사본 보정 |
| PostgreSQL+캐시 집계 | 대량 읽기 최적화 | C4/D7 추가 자원·집계 재구축·불일치 책임 |

## 결정

targets/participants/favorites를 분리한다. `(provider,place_id)`와 `(participant_id,target_id)`를 각각 UNIQUE로 강제하고 category.kind/target.kind는 복합 FK로 일치시킨다. 사진 slot은1~3 CHECK+unique다.

공개 변경은 gateway RPC 한 번에서 app_state 행 잠금→명령 중복/권한/version 검사→원장 수정→revision/event/cleanup/command 기록→commit한다. 외부 네트워크/이미지 변환은 잠금 밖이다. 읽기는 같은 SQL snapshot에서 current participant를 JOIN하고 SQL rank로 집계한다.

## 근거

불변 규칙이 속도보다 우선이다. 100명 규모에 글로벌 짧은 쓰기 잠금은 명시적인 단순화이며 원장과 알림 커밋 순서를 맞춘다. 새 코스 생성도 요청 키의 원자성에 넣어야 재시도로 코스가 복제되지 않는다.

## 결과

- **좋아진 것**: 정정/삭제에 별도 카운터 보정이 없고 성공 등록·알림의 원자성 확보.
- **감수할 것**: 쓰기 직렬화와 SQL 배포 부담. 대량 burst의 잠금 대기를 측정해야 한다.
- **함정**: 사진 JOIN 후 count, rank window 안에 ID 추가, 중단 목록을 집계에서 제거, RPC 여러 호출을 transaction으로 착각, PUBLIC EXECUTE 기본권한 방치.
- **새로 생긴 설계 숙제**: Q7 cursor→ADR-0005, Q8 자격→ADR-0003, Q9 파일/DB 실패→ADR-0006. 세부 계약은 데이터 문서에 해결.

## 검증

FIX-01,20개 중복 요청,새 코스 재시도,대상 전체삭제 경쟁,동시asset연결,anon의 쓰기RPC 우회 시도를 실제 PostgreSQL에서 검증한다. G4에서 잠금 비용을 포함해2초 완료를 측정한다.

## 재검토 트리거

100명 burst가2초 목표를 충족하지 못함,영구 재등록 금지/복구 요구 추가,집계 데이터가 무료DB예산 초과. 원장은 유지하면서 잠금 범위/조회 비용을 재검토한다.

## 변경 이력

- 최초안: 같은 도메인/유일성, Node/Drizzle 트랜잭션 제안.
- 2026-10-13: 무료 Edge 환경에 맞춰 단일 gateway DB RPC로 트랜잭션 경계를 이동. 기존 도메인 규칙 유지, SQL 권한 명시.
