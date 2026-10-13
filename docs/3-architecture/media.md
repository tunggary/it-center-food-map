# 사진 수명주기

[설계 목차](README.md) · [데이터](data-model.md) · [무료 용량](operations.md)

## 처리 기준

등록당 0~3장은 유지한다. 한 사람이 등록할 수 있는 대상 수에 별도 한도를 만들지 않는다. 유한한 무료 저장 용량 소진은 자원 오류로 처리한다.

| 단계 | 기본값 |
| --- | --- |
| 사용자 선택 원본 | JPEG/PNG/WebP, 최대 10MiB·40MP. 브라우저가 디코딩하지 못하는 HEIC는 변환 안내 |
| 브라우저 전처리 | 방향 보정 Canvas, 긴 변≤1280px·면적≤2MP, JPEG, ≤512KiB까지 품질/크기 축소 |
| 서버 입력 | JPEG만, ≤512KiB·2MP. 매직바이트·헤더 크기를 확인한 뒤 WASM 디코딩 |
| 최종 full | JPEG, 긴 변≤1280px, ≤512KiB, 메타데이터 제거 |
| 썸네일 | JPEG, 긴 변≤320px, ≤64KiB |
| 임시 만료 | 마지막 업로드 준비 후 24시간, processing lease 5분 |
| 임시 활성 수 | identity당 미연결 자산 최대 6개, 초과는 폐기/청소 후 재시도 |

이는 2026-10-13 사용자가 채택한 DEC-04의 저장 기준이다. 압축된 결과를 미리 보여주며 실패하면 File/텍스트를 유지한다. 사진 품질 제한을 조용히 적용해 원본 보관을 약속하지 않는다. 투명 PNG는 흰 배경 JPEG로 변환한다. 애니메이션/동영상/SVG는 지원하지 않는다.

## Sharp 대체

Supabase Edge는 Sharp를 지원하지 않으며 요청당 CPU 2초·메모리 256MB 제한이 있다. 공식 예시의 `@imagemagick/magick-wasm`을 **media-finalize 전용 함수**에 사용한다. 브라우저에서 축소한 한 장만 요청마다 처리하며 3장 동시 변환을 한 함수에 넣지 않는다. [Edge 한도](https://supabase.com/docs/guides/functions/limits), [WASM 이미지 예시](https://supabase.com/docs/guides/functions/examples/image-manipulation)

최대 이미지의 WASM 초기화·decode·strip·재인코딩·thumb 생성까지 CPU/메모리/번들 크기를 먼저 검증한다. 목표 CPU≤1.5초·메모리≤192MB는 내부 여유 기준이다. 실패 시 기능을 생략하지 않고 서버 입력 최대 픽셀/압축 알고리즘을 재검토하며, 검증되지 않은 유료 변환 서비스로 우회하지 않는다.

## 업로드·검증·연결

1. 브라우저가 먼저 작은 JPEG를 만든다. `POST /uploads`에서 자격·입력 크기·용량 여유를 검사하고 asset·raw/final/thumb용 예약량과 임시 object key를 DB에 만든다.
2. 서버는 지정한 raw 경로의 signed upload 권한만 발급한다. 브라우저는 private Storage로 직접 전송한다. `upsert=false`, 임의 경로/다른 자산을 지정할 권한은 없다.
3. `media-finalize`가 owner·상태를 확인하고 원자적으로 lease를 획득한다. 같은 자산의 중복 finalize는 ready면 결과 재생, 유효한 processing이면 202 pending을 반환한다.
4. Storage에서 raw를 읽고 실제 JPEG·크기·픽셀 제한을 검사한다. 형식 헤더만 확인하고 사용자 파일을 그대로 공개하지 않는다. 서버가 다시 디코딩/strip/인코딩해 파일을 정규화한다.
5. 처리 시도마다 서버 전용의 새 final/thumb key를 **DB에 먼저 기록**한다. 결과 업로드 후 lease token을 비교하며 ready로 바꾸고 실제 byte 수를 기록한다. 실패한 lease의 늦은 완료는 채택하지 않고 그 시도 파일을 청소한다.
6. raw 청소를 예약하되 signed upload 권한이 만료되기 전에는 원본을 지우지 않는다. 만료 후 서버 처리 종료와 실제 삭제/부재를 확인하고, 이후 재등장 객체도 대조해 재청소한다. 앱의 자산 유효 기간과 공급자 signed 권한 수명은 같은 값이라고 가정하지 않는다.
7. 등록 명령이 ready·미만료·본인 소유 자산을 잠가 slots 1~3으로 연결한다. 등록 성공 전에는 공개 사진 응답이 거절된다.

준비 요청의 requestKey로 같은 asset를 재사용한다. signed 권한 응답 유실 시 같은 raw 경로로 재발급하며 이미 업로드됐으면 finalize로 넘어간다. 파일 내용을 바꾸려면 새 asset를 만든다. `final_key`는 클라이언트가 올린 raw와 반드시 다르므로 기존 signed 권한 재사용으로 공개 파일을 바꿀 수 없다.

## 사진 공개·삭제

사진은 로그인 없이 볼 수 있지만 Storage 버킷은 비공개다. `GET /photos/:assetId?size=...` Edge가 살아 있는 favorite 연결과 ready/attached 상태를 조회한 뒤 지정된 비공개 key의 바이트만 스트리밍한다. key나 signed download URL을 응답에 넣지 않는다.

응답 `Content-Type: image/jpeg`, `Cache-Control: no-store`, `nosniff`. 외부 이미지 최적화/CDN 캐시를 추가하지 않는다. 사진 조회마다 Edge 호출·저장소 전송이 발생하므로 [호출/egress 예산](operations.md)에 포함한다. FE는 현재 상세의 이미지 Blob을 메모리에서 재사용할 수 있지만 persistent 캐시는 두지 않는다.

삭제/교체는 같은 DB 트랜잭션에서 asset 연결 철회와 cleanup 예약을 수행한다. 이후 새 사진 요청은 404다. 이미 받은 파일·삭제 전에 시작한 다운로드를 회수할 수 있다는 보장은 하지 않는다. 다음 snapshot에서 삭제된 asset의 DOM·Blob URL을 제거한다.

## 청소 경쟁과 복구

`uploading → processing → ready → attached`가 정상 경로다. 취소/만료/삭제는 `deleting → deleted`로 끝난다. 수정 시 기존 사진은 새 등록 편집 commit까지 유지되고, commit 때 새 사진 연결과 옛 연결 해제를 동시에 수행한다.

- 등록 연결과 만료 청소가 같은 asset 행을 잠근다. 청소가 먼저 deleting이면 연결 거절, 연결이 먼저면 청소 대상에서 제외한다.
- cleanup은 DB에서 최대100개·5분 lease를 claim하고 Storage 호출은 트랜잭션 밖에서 수행한다. 객체 404는 성공으로 취급한다. lease token 일치 때만 완료로 바꾼다.
- WASM 실행 중 종료되면 lease 만료 후 재시도할 수 있다. 존재하는 raw와 추적된 결과 key 모두 청소 가능해야 한다. processing이 오래됐다는 이유로 attached 객체를 삭제하지 않는다.
- 실제 Storage 바이트에는 아직 삭제 못 한 파일도 포함한다. 청소를 예약했다는 이유로 용량 예약을 먼저 반환하지 않는다. 객체가 삭제/부재 확인된 뒤 반납한다.
- 세션 만료는 즉시 첨부 사진 삭제 사유가 아니다. 공개 등록이 살아 있으면 사진도 유지한다. 미연결 만료 자산만 정리한다.

매시간 Supabase Cron이 maintenance를 호출한다. maintenance secret은 Vault와 Edge secret에 보관하고 공개 publishable key만으로 청소를 허용하지 않는다. 휴면 때는 Cron도 가용성 보장이 없으므로 수동 재개 후 backlog를 먼저 확인한다.

용량은 [storage_budget·media_objects 계약](storage-accounting.md)으로 원자적으로 예약·반환한다. 물리 청소는 [활성 백업 lease](backup.md)가 없을 때만 실행한다. 성공한 공개 연결 삭제와 물리 파일 보류는 다른 상태이며 백업 때문에 삭제된 내용이 다시 공개되지 않는다.
