# 요구사항 추적

[설계 목차](README.md) · [검증 계획](verification.md)


| 스토리 | 담당 설계 | 확인할 QA 묶음 |
| --- | --- | --- |
| US-P-01 | explore snapshot, 필터 URL, 지도 클라이언트 | QA-P-01-01~03 |
| US-P-02 | DB rank와 같은 집계, 지도 위 랭킹 패널 | QA-P-02-01~03 |
| US-P-03 | 지도 위 조건별 상세 시트, 전체 보기, 내 등록 상태 | QA-P-03-01~02 |
| US-P-04 | 카카오 검색 증명과 provider ID 유일성 | QA-P-04-01~02 |
| US-P-05 | 브라우저 자격+프로필+등록 원자성, 자산 연결, 요청 키 | QA-P-05-01~12 |
| US-P-06 | COURSE 경로·기존 대상·신규 명령 | QA-P-06-01~02 |
| US-P-07 | 소유권·version·등록만 삭제 | QA-P-07-01~07 |
| US-P-08 | 참여자 nickname JOIN, 관리자 team 변경 | QA-P-08-01~03 |
| US-B-01 | 카테고리별 랭킹, 시작점·선택 경로 | QA-B-01-01~03 |
| US-B-02 | DB 이벤트·완료 cursor·독립 동기화 | QA-B-02-01~04 |
| US-A-01 | catalog selectable와 조회 분리 | QA-A-01-01~05 |
| US-A-02 | 관리자 가드, participant/course version | QA-A-02-01~03 |
| US-A-03 | 영향 preview·version, 사진 공개 연결 해제 | QA-A-03-01~04 |
| US-N-01 | 지연 예산·지연 로딩·접근성·실기기 측정 | QA-N-01-01~07 |
| US-N-02 | Query 마지막 결과·초안·명령 재시도 | QA-N-02-01~03 |
| US-N-03 | 기간 자동 차단 없음, 운영자 피드백 | QA-N-03-01~02 |


## 세부 책임 연결

- 참여자 식별·관리자 권한: [identity](identity.md)
- 집계·중복·정정·삭제: [데이터](data-model.md), [API](api.md)
- 실제 장소·산책 경로·모바일 입력: [화면](frontend.md)
- 부스·연결 상태: [동기화](synchronization.md)
- 사진 업로드·삭제·용량: [사진](media.md)
- 사용량·휴면·백업: [운영](operations.md)
- 추가 결정 DEC-01~12: [확정 정책](policies.md)

QA 범위는 설계의 추적 관계이며 실행 증거가 아니다. 추가 기술 게이트는 [검증](verification.md)에 별도로 둔다.

추가 운영 계약은 [용량](storage-accounting.md)과 [백업](backup.md)에 있다. 기존 QA65개는 정책 확정 후 모두 미실행이며, 새 기술 검증은 verification의 추가 상세 설계 검증으로 추적한다.
