#!/usr/bin/env bash
# Runs the database tests on a plain PostgreSQL 16 (NOT your Supabase project). Needs a local server and a superuser.
#   usage:  PSQL="psql -U postgres" ./run.sh        (default: `su postgres -c psql`, for a Linux box)
# Each test file runs on a fresh throw-away database "thsl_test" with a stand-in for Supabase's auth schema.
# Any line containing FAIL or ERROR means a security rule or payment rule is broken.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; SQL="$HERE/.."
STUBFILE="${STUB:-$HERE/00_supabase_stub.sql}"     # STUB=.../00_supabase_stub_strict.sql imitates a project where new tables are NOT granted to anyone by default
run() { if [ -n "${PSQL:-}" ]; then $PSQL "$@"; else su postgres -c "psql $(printf '%q ' "$@")"; fi; }
status=0
for t in 10_security_attacks 20_payment_flow 30_hardening_rules 40_least_privilege 50_login_lockout_and_settings 60_team_management 70_refunds_promos_abandoned; do
  run -q -c "drop database if exists thsl_test" -c "create database thsl_test" >/dev/null 2>&1
  run -q -v ON_ERROR_STOP=1 -f "$HERE/00_roles.sql" >/dev/null 2>&1
  run -q -d thsl_test -v ON_ERROR_STOP=1 -f "$STUBFILE" >/dev/null || { echo "stub failed"; exit 2; }
  for m in schema 002_content_and_ratings 003_admin_security 004_storage 005_hardening_pages_email 006_least_privilege 007_settings_and_login_guard 008_team_management 009_refunds_promos_abandoned; do
    run -q -d thsl_test -v ON_ERROR_STOP=1 -f "$SQL/$m.sql" >/dev/null 2>&1 || { echo "migration $m FAILED"; exit 2; }
  done
  out=$(run -q -d thsl_test -f "$HERE/$t.sql" 2>&1)
  ok=$(printf '%s\n' "$out" | grep -c "ok ")
  bad=$(printf '%s\n' "$out" | grep -cE "FAIL|ERROR")
  echo "$t: $ok checks passed, $bad problems"
  [ "$bad" -gt 0 ] && { printf '%s\n' "$out" | grep -E "FAIL|ERROR"; status=1; }
done
exit $status
