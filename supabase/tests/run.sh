#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
container=supabase_db_it-center-food-map
for test_file in supabase/tests/domain.sql supabase/tests/aggregation.sql supabase/tests/media_operations.sql; do
  docker exec -i "$container" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < "$test_file"
done
python3 supabase/tests/concurrency.py
