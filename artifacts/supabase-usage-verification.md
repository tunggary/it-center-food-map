# Supabase Usage 읽기 전용 검증

- 관측 시각: 2026-10-13 21:36 KST
- 출처: [조직 Usage](https://supabase.com/dashboard/org/tiyzwalofmbdlhlybape/usage), 브라우저의 실제 UI 텍스트
- 조직: `tunggary's Org`, 개인 Free. 현재 청구 기간: 2026-10-13 ~ 2026-11-13.
- 대상 프로젝트: `it-center-food-map-qa` (`yxgmpbjcvjeacnrgtcbq`). 프로젝트 필터를 적용한 주소의 `projectRef`와 UI의 프로젝트 이름을 대조함.

## Usage

| 항목 | 조직 전체 Free quota UI | QA 프로젝트 필터 UI |
|---|---:|---:|
| Egress (uncached, cached 별도 청구) | 0 / 5 GB, 상세 Used in period 0.00 GB | 0 GB |
| Cached Egress | 0 / 5 GB, 상세 Used in period 0.00 GB | 0 GB |
| Edge Function Invocations | 4 / 500,000회 | 4회 |
| Database Size | 포함량 0.5 GB/프로젝트 | 요약 0.033 GB, 상세 현재 DB 31.53 MB |
| Storage Size | 0 / 1 GB, 상세 평균 0.00 GB | 요약 0 GB |

- 조직 전체 egress의 표시상 남은 포함량은 약 **5 GB** (5 GB에서 화면상 0 GB 차감). 정확한 바이트 단위 잔량은 이 화면에서 확인되지 않음.
- Supabase UI는 청구와 quota가 **조직 단위**이며, 프로젝트 필터의 숫자는 해당 프로젝트 사용량이고 quota 비교는 All projects로 보라고 안내함. 다른 프로젝트 사용량을 QA 사용량으로 합산하지 않음.
- 0 GB/0.00 GB는 표시 정밀도에 따른 반올림이다. **실제 사용량이 정확히 0이라는 보장이 아니다.** QA egress 일별 그래프에는 KB 축, Storage에도 KB 축이 보인다.
- Usage Summary는 최대 1시간 갱신 지연을 안내하며, 개별 'No data in period' 지표는 표시까지 최대 24시간이 걸릴 수 있다고 안내한다. 따라서 실시간 확정 사용량이나 정확한 잔량으로 해석하지 않는다.

## Logs 후속 검증

[검증 프로젝트의 `media-finalize` 로그](https://supabase.com/dashboard/project/yxgmpbjcvjeacnrgtcbq/functions/media-finalize/logs)와 실제 [Logs Explorer](https://supabase.com/dashboard/project/yxgmpbjcvjeacnrgtcbq/logs/explorer)에서 `event_type = Shutdown` 두 건을 확인했다. UI에 보인 시간은 KST, Raw의 UTC 시각과 일치한다.

| 종료 로그 시각 (KST) | `cpu_time_used` Raw/Details | `memory_used.total` Raw/Details | 사유 |
|---|---:|---:|---|
| 2026-10-13 20:44:04 | 83 | 16,490,351 | EarlyDrop |
| 2026-10-13 20:43:59 | 880 | 58,596,672 | EarlyDrop |

**단위 미검증:** 이 종료 이벤트의 Raw/Details 및 Explorer 필드 참조에는 위 두 필드의 단위가 표시되지 않는다. 함수 Overview의 *집계 지표*에는 Average/Max CPU Time `ms`, Average Memory Usage `MB`가 표시되지만, 이는 데이터 없음/0으로 나타나는 별도 집계이며 개별 종료 이벤트 원시값의 단위를 직접 명시하지 않는다. 따라서 원시값에 `ms` 또는 `bytes`를 임의로 붙이거나 MB로 환산한 값을 확정치로 보고하지 않는다. `booted (time: …ms)`는 wall/boot 시간이며 CPU 시간이 아니고, `memory_used.heap`는 total memory가 아니다.

결제, 업그레이드, 프로젝트 설정, 계정, 기존 localhost QA 탭은 변경하지 않았다. 인증 로그인이나 토큰 추출은 하지 않았다.

## 원시 로그 단위의 공식 소스 확인

UI에서 생략된 단위는 공식 [supabase/edge-runtime](https://github.com/supabase/edge-runtime/tree/d4a4f606a90e8c66864219c9b1d31ef0e3e3f626)의 실제 생성 코드를 읽어 보완했다.

- [`ShutdownEvent` 생성](https://github.com/supabase/edge-runtime/blob/d4a4f606a90e8c66864219c9b1d31ef0e3e3f626/crates/base/src/worker/supervisor/mod.rs#L345): `cpu_time_used`에는 `cpu_usage_ms`가 들어간다. 원시83/880은83ms/880ms다.
- 같은 코드에서 `memory_used.total`은 `used_heap_size + external_memory`다. [메모리 검사 코드](https://github.com/supabase/edge-runtime/blob/d4a4f606a90e8c66864219c9b1d31ef0e3e3f626/crates/base/src/runtime/mod.rs#L200)는 이 값을 bytes로 취급한다. 종료 로그 total은16,490,351B(약15.73MiB)/58,596,672B(약55.88MiB)다.
- CPU880ms와 공급자 종료 이벤트의 total55.88MiB는 각각 설계 목표1.5초/192MB 이하다. 이는 실제 hosted JPEG 검증과 같은 시각의 두 종료 이벤트다. wall4912ms를 CPU로 사용하지 않았다.
- 제한: 이 소스 정의의 `memory_used.total`은 종료 시점의 V8 heap+external snapshot이며 peak RSS가 아니다. 별도 MemoryCheck는 malloced bytes도 더하므로 이 로그만으로 실행 중 모든 메모리의 peak192MB를 입증하지 않는다. 실제 배포된 런타임의 정확한 commit은 로그 UI에서 확인하지 못했다. 수치의 단위와 관측 범위를 구분한다.
