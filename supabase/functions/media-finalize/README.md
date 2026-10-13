# 이미지 처리 번들

`magick.wasm.gz`는 `@imagemagick/magick-wasm@0.0.44`의 `dist/x86/magick.wasm`을 gzip(mtime=0)으로 압축한 파일이다. 원본 실행 파일을 CDN에서 가져오지 않고 함수 static asset으로 배포한다. 라이선스와 NOTICE를 함께 보관한다.

Supabase 서버측 API 번들은 5MB이며 static file을 지원하지 않으므로, Docker를 사용하는 `supabase functions deploy media-finalize --project-ref <확인한 ref>`로 로컬 번들링한다. gzip 초기화·JPEG decode·strip·full/thumb 재인코딩은 실제 무료 Edge에서 CPU/메모리 한도를 검증해야 한다. 로컬 Deno의 elapsed/heap 결과는 hosted CPU/총 메모리 측정을 대체하지 않는다.

`deno test --allow-read --config supabase/functions/deno.json supabase/functions/media-finalize/image_test.ts`로 비JPEG/초대형 헤더 거절과 1,999,396픽셀 입력의 full/thumb 저장 기준을 검증한다. 입력 픽셀 한도는 2MP, 512KiB이며 이미지 처리 실패 시 원본을 공개하지 않는다.
