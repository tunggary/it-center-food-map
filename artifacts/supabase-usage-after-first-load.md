# Supabase Usage 독립 읽기 전용 검증

- 확인 시각: 2026-10-13 22:59 KST
- 출처: [조직 Usage](https://supabase.com/dashboard/org/tiyzwalofmbdlhlybape/usage), Current billing cycle, All projects. 해당 URL을 이 검증용 새 탭에서 새로고침한 뒤 확인.
- 조직: tunggary's Org, Free. 표시 청구 기간: 2026-10-13 ~ 2026-11-13.

| 항목 | 화면 표시 | 해석 |
|---|---:|---|
| 조직 전체 Egress (uncached) | 0.601 / 5 GB (12%) | 표시값 기준 잔량 4.399 GB, 약 4.40 GB |
| 조직 전체 Cached Egress | 0 / 5 GB (<1%); 상세 0.00 GB | 반올림된 표시값. 실제 사용량 0 확정 아님. Uncached Egress와 별도 한도. |
| 조직 전체 Edge Function Invocations | 354 / 500,000 (<1%) | 표시값 기준 잔여 499,646회 |
| QA 프로젝트 DB | 32.31 MB | it-center-food-map-qa, 프로젝트 ID yxgmpbjcvjeacnrgtcbq. Free 표시 한도 0.5 GB/프로젝트. |
| QA 프로젝트 Storage | 요약 0 GB; 상세 그래프의 평균 Storage Size 표기 | 0은 GB 단위 표시/반올림이며 실제 객체 크기 0 확정 아님. 조직 전체 상세 평균 사용량도 0.00 GB로 표시. |

QA 필터 URL: https://supabase.com/dashboard/org/tiyzwalofmbdlhlybape/usage?projectRef=yxgmpbjcvjeacnrgtcbq . QA 필터의 Edge 호출은 353회로 표시됐으나, quota 판단은 조직 전체 354회를 사용했다. Supabase 화면은 조직별 과금/한도에 모든 프로젝트 사용량을 합산한다고 안내한다.

## 시험 예산 판단의 한계

화면상 현재 조직 Free 한도를 초과하지 않았다. 위 잔량은 표시 숫자로만 계산한 대략적인 예산이며, Egress 및 Edge 호출 사용량은 매시간 갱신, Usage Summary는 최대 1시간 지연될 수 있다. 따라서 약 1시간 전 102클라이언트 30분 시험분이 모두 반영됐는지, 이후 새 시험에 필요한 트래픽/호출량이 이 잔량 안에 드는지는 이 화면만으로 확정할 수 없다. 새 시험 전후 수치 차이로 재확인할 것. 설정, 결제, 로그인, 시험 트래픽에는 변경을 가하지 않았다.
