# 운영 도구

Python 도구는 별도 가상환경에 `backup-requirements.txt`를 설치하고 PostgreSQL 서버와 같은 major의 `pg_dump`/`pg_restore`를 준비한다. 실행 환경의 비밀 값은 로컬 비공개 설정에서 읽는다. 명령 인수·로그·커밋에 넣지 않는다.

`backup.py backup`은 `FOOD_MAP_BACKUP_DIR`(저장소 외부), `FOOD_MAP_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FOOD_MAP_ADMIN_JWT`를 사용한다. 암호화 비밀번호는 숨겨진 입력으로 받는다. 관리자 API의 청소 보류 lease, 동일 PostgreSQL snapshot의 dump/사진 manifest, 사진 hash, 암호화 roundtrip을 확인한 후 서버에 완료를 기록한다. lease 갱신이 끊기면 완료하지 않는다. 완료 기록은 운영 도구가 보고한 결과이며 서버가 로컬 파일을 독립 검증했다는 뜻이 아니다.

`backup.py restore --archive /저장소밖/백업.fmap`은 `FOOD_MAP_RESTORE_ALLOWED=non-production`과 비운영 대상 DB/API 설정이 필요하다. 운영제품 프로젝트 ref는 복원 대상으로 거절한다. 복원 뒤 관리자 계정/allowlist를 재연결하고 본인 등록, 집계, 사진 참조와 epoch 변경을 검증해야 한다. 운영 공개 재개는 이 도구가 수행하지 않는다.

`configure-maintenance.py`는 운영자가 승인한 프로젝트의 `FOOD_MAP_DB_URL`, `SUPABASE_URL`, `MAINTENANCE_SECRET`을 받아 Vault와 무료 Cron을 구성한다. 저장된 Cron SQL에는 Vault 조회만 들어가며 secret 원문은 들어가지 않는다. 매시간 최대 100개 물리청소를 처리하고 매일 private 버킷 전체와 원장을 대조한다. 활성 백업 lease 중에는 DB가 청소 claim을 막는다.

암호화 검증은 `python -m unittest discover -s scripts -p test_backup.py`로 실행한다. 실제 DB+사진 백업/복원은 별도 비운영 프로젝트에서 수행해야 하며 이 단위 검증만으로 완료 처리하지 않는다.

복원은 비밀 없는 DB 이름을 `pg_restore --dbname` 인수에 지정하고 호스트·사용자·비밀번호·TLS 설정은 PG 환경변수로 전달한다. dump 목록에서 공급자 계정의 DEFAULT ACL만 제외하며 앱 ACL은 유지한다. 복원 전후 `restore-security.sql`이 전용 NOLOGIN 소유자와 RLS·정확한 공개 읽기 7개·service_role 전용 gateway·닫힌 search_path/default privileges를 재적용하고 조건이 깨지면 중단한다. 대상에는 같은 제품 migration과 private 사진 버킷이 먼저 있어야 한다. 기존 사진이 hash/크기까지 같으면 재사용하고, 다른 내용이면 덮어쓰지 않고 실패한다.
