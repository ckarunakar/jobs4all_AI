#!/usr/bin/env bash
# verify-mobile-backend.sh — acceptance checks for the mobile backend
# (spec: docs/superpowers/specs/2026-10-16-mobile-backend-readiness-design.md).
#
# Usage: scripts/verify-mobile-backend.sh [BASE_URL]
#   BASE_URL defaults to http://localhost:3000. Needs curl + jq.
#
# Uses the account $VERIFY_EMAIL / $VERIFY_PASSWORD (defaults below), creating
# it if needed, and DELETES it in the final section. Stops at the first failed
# check, so it is safe to re-run while features are still being built: the
# same account is reused until the deletion section passes.
# STOP_BEFORE_DELETE=1 exits successfully right before the deletion section.
#
# Side effects on the target database (all on the test account, all removed by
# the final section): a login_users row, mobile_sessions rows, user_job_seen
# rows, one resume_upload row, and possibly career_ops_scores rows (the scoring
# checks call the configured AI provider once).

set -uo pipefail

BASE="${1:-http://localhost:3000}"
EMAIL="${VERIFY_EMAIL:-mobile-verify@example.com}"
PASSWORD="${VERIFY_PASSWORD:-Verify-Mobile-2026x}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
BODY="$WORK/body.json"
HEADERS="$WORK/headers.txt"
JAR="$WORK/cookies.txt"
PASSED=0
USER_ID="?"

die() {
  echo "FAIL: $*"
  echo "--- last response body:"
  cat "$BODY" 2>/dev/null
  echo
  exit 1
}
ok() { PASSED=$((PASSED + 1)); echo "ok   $*"; }

# call METHOD PATH [curl args...] — prints the HTTP status; body -> $BODY, headers -> $HEADERS
call() {
  local method="$1" path="$2"
  shift 2
  curl -s --max-time 120 -o "$BODY" -D "$HEADERS" -w '%{http_code}' \
    -X "$method" "$BASE$path" "$@"
}
expect() { # expect WANT GOT LABEL
  if [ "$2" = "$1" ]; then ok "$3 ($2)"; else die "$3: expected HTTP $1, got $2"; fi
}
expect_not() { # expect_not UNWANTED GOT LABEL
  if [ "$2" != "$1" ]; then ok "$3 ($2)"; else die "$3: got HTTP $2"; fi
}
json() { jq -r "$1" "$BODY"; }
no_store() {
  grep -qi '^cache-control:.*no-store' "$HEADERS" || die "$1: missing Cache-Control: no-store"
  ok "$1 sends Cache-Control: no-store"
}
bearer() { printf 'authorization: Bearer %s' "$1"; }
JSON=(-H 'content-type: application/json')

echo "== 0. test account ($EMAIL on $BASE)"
s=$(call POST /api/auth/register "${JSON[@]}" \
  -d "$(jq -nc --arg e "$EMAIL" --arg p "$PASSWORD" '{name:"Mobile Verify",email:$e,password:$p}')")
[ "$s" = 200 ] || [ "$s" = 409 ] || die "register: expected 200 or 409, got $s"
ok "account ready ($s)"

echo "== 1. website cookie login (regression)"
call GET /api/auth/csrf -c "$JAR" -b "$JAR" >/dev/null
CSRF=$(json .csrfToken)
{ [ -n "$CSRF" ] && [ "$CSRF" != null ]; } || die "no csrfToken"
s=$(call POST /api/auth/callback/credentials -c "$JAR" -b "$JAR" \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=$PASSWORD")
grep -q 'session-token' "$JAR" || die "credentials callback ($s) set no session cookie"
ok "web login sets a session cookie ($s)"
call GET /api/auth/session -b "$JAR" >/dev/null
[ "$(json .user.email)" = "$EMAIL" ] || die "web session does not resolve to $EMAIL"
ok "web session resolves to $EMAIL"
s=$(call GET /api/jobs/tracked -b "$JAR")
expect 200 "$s" "cookie: GET /api/jobs/tracked"

echo "== 2. POST /api/mobile/login"
s=$(call POST /api/mobile/login "${JSON[@]}" -d "$(jq -nc --arg e "$EMAIL" '{email:$e}')")
expect 400 "$s" "missing password"
s=$(call POST /api/mobile/login "${JSON[@]}" -d 'not json')
expect 400 "$s" "invalid JSON"
s=$(call POST /api/mobile/login "${JSON[@]}" -d "$(jq -nc --arg e "$EMAIL" '{email:$e,password:12345678}')")
expect 400 "$s" "non-string password"
s=$(call POST /api/mobile/login "${JSON[@]}" -d "$(jq -nc --arg e "$EMAIL" '{email:$e,password:"definitely-wrong"}')")
expect 401 "$s" "wrong password"
[ "$(json .error)" = "Invalid email or password." ] || die "wrong-password message"
ok "wrong-password message"
s=$(call POST /api/mobile/login "${JSON[@]}" -d '{"email":"no-such-user-xyz@example.com","password":"whatever123"}')
expect 401 "$s" "unknown email"
[ "$(json .error)" = "Invalid email or password." ] || die "unknown-email message must match wrong-password message"
ok "unknown-email message is identical"
MIXED="  $(printf '%s' "$EMAIL" | tr '[:lower:]' '[:upper:]')  "
LONG_DEVICE=$(printf 'D%.0s' $(seq 1 300))
s=$(call POST /api/mobile/login "${JSON[@]}" \
  -d "$(jq -nc --arg e "$MIXED" --arg p "$PASSWORD" --arg d "$LONG_DEVICE" '{email:$e,password:$p,deviceName:$d}')")
expect 200 "$s" "login with upper-cased padded email + 300-char deviceName"
no_store "mobile login"
TOKEN=$(json .token)
[ "${#TOKEN}" = 43 ] || die "token should be 43 chars, got ${#TOKEN}"
ok "token is 43 chars"
[ "$(json .user.email)" = "$EMAIL" ] || die "login user.email mismatch"
USER_ID=$(json .user.id)
json .expiresAt | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' || die "expiresAt not ISO 8601"
ok "user id $USER_ID, expiresAt $(json .expiresAt)"

echo "== 3. GET /api/mobile/me and the Bearer rules"
s=$(call GET /api/mobile/me -H "$(bearer "$TOKEN")")
expect 200 "$s" "me with token"
[ "$(json .user.email)" = "$EMAIL" ] || die "me email mismatch"
no_store "me"
s=$(call GET /api/mobile/me -H "authorization: bearer $TOKEN")
expect 200 "$s" "lower-case 'bearer' scheme"
s=$(call GET /api/mobile/me)
expect 401 "$s" "me without auth"
s=$(call GET /api/mobile/me -H "$(bearer garbage-token)")
expect 401 "$s" "me with garbage token"
s=$(call GET /api/mobile/me -H 'authorization: Bearer')
expect 401 "$s" "me with empty Bearer"
s=$(call GET /api/mobile/me -b "$JAR")
expect 200 "$s" "me with website cookie only"
s=$(call GET /api/mobile/me -b "$JAR" -H "$(bearer garbage-token)")
expect 401 "$s" "garbage Bearer + valid cookie (no fallback)"

echo "== 4. POST /api/mobile/logout"
s=$(call POST /api/mobile/logout)
expect 401 "$s" "logout without Bearer"
s=$(call POST /api/mobile/logout -H "$(bearer "$TOKEN")")
expect 200 "$s" "logout"
no_store "logout"
s=$(call GET /api/mobile/me -H "$(bearer "$TOKEN")")
expect 401 "$s" "me after logout"
s=$(call POST /api/mobile/logout -H "$(bearer "$TOKEN")")
expect 200 "$s" "logout again (idempotent)"
s=$(call POST /api/mobile/login "${JSON[@]}" \
  -d "$(jq -nc --arg e "$EMAIL" --arg p "$PASSWORD" '{email:$e,password:$p,deviceName:"verify-script"}')")
expect 200 "$s" "fresh login"
TOKEN=$(json .token)
AUTH=(-H "$(bearer "$TOKEN")")

echo "== 5. existing routes accept the Bearer token"
s=$(call GET '/api/jobs?limit=5')
expect 200 "$s" "jobs as guest (unchanged)"
JOB=$(json '.jobs[0].id')
JOB2=$(json '.jobs[1].id')
{ [ -n "$JOB" ] && [ "$JOB" != null ] && [ -n "$JOB2" ] && [ "$JOB2" != null ]; } || die "need two jobs in the guest feed"
s=$(call GET '/api/jobs?limit=5' -H "$(bearer garbage-token)")
expect 401 "$s" "jobs with garbage Bearer"
s=$(call GET '/api/jobs?limit=5' -H 'authorization: Bearer')
expect 401 "$s" "jobs with empty Bearer"
for route in "POST /api/jobs/seen" "GET /api/jobs/tracked" "POST /api/jobs/seen/import" \
  "POST /api/resume-upload" "POST /api/scoring/score-job" "POST /api/scoring/score-batch"; do
  s=$(call "${route%% *}" "${route#* }" -H "$(bearer garbage-token)")
  expect 401 "$s" "$route with garbage Bearer"
done
s=$(call POST /api/jobs/seen "${AUTH[@]}" "${JSON[@]}" \
  -d "$(jq -nc --arg j "$JOB" '{jobReference:$j,status:"saved",snapshot:{title:"verify-script"}}')")
expect 200 "$s" "seen: save a job"
s=$(call GET /api/jobs/tracked "${AUTH[@]}")
expect 200 "$s" "tracked"
jq -e --arg j "$JOB" '[.jobs[].job.id] | index($j) != null' "$BODY" >/dev/null || die "saved job missing from tracked"
ok "saved job appears in tracked"
s=$(call GET '/api/jobs?limit=40' "${AUTH[@]}")
expect 200 "$s" "jobs with Bearer"
jq -e --arg j "$JOB" '[.jobs[].id] | index($j) == null' "$BODY" >/dev/null || die "seen job not excluded from the Bearer feed"
ok "seen job excluded from the Bearer feed"
s=$(call POST /api/jobs/seen/import "${AUTH[@]}" "${JSON[@]}" \
  -d "$(jq -nc --arg j "$JOB2" '{entries:[{jobReference:$j,status:"skipped"}]}')")
expect 200 "$s" "seen/import"
cat > "$WORK/resume.pdf" <<'PDF'
%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>> endobj
4 0 obj <</Length 55>> stream
BT /F1 14 Tf 20 60 Td (Mobile Verify - Java React SQL) Tj ET
endstream endobj
5 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj
trailer <</Root 1 0 R>>
%%EOF
PDF
s=$(call POST /api/resume-upload "${AUTH[@]}" \
  -F "resume=@$WORK/resume.pdf;type=application/pdf" -F "fullName=Mobile Verify")
expect 200 "$s" "resume-upload (text extraction may or may not succeed)"
s=$(call POST /api/scoring/score-job "${AUTH[@]}" "${JSON[@]}" -d "$(jq -nc --arg j "$JOB" '{jobId:$j}')")
expect_not 401 "$s" "score-job authenticates (result depends on the AI provider)"
s=$(call POST /api/scoring/score-batch "${AUTH[@]}" "${JSON[@]}" -d "$(jq -nc --arg j "$JOB" '{jobIds:[$j]}')")
expect_not 401 "$s" "score-batch authenticates"

if [ "${STOP_BEFORE_DELETE:-}" = 1 ]; then
  echo
  echo "STOP_BEFORE_DELETE=1 — stopping before deletion. $PASSED checks passed (user id $USER_ID)."
  exit 0
fi

echo "== 6. POST /api/account/delete"
s=$(call POST /api/account/delete "${JSON[@]}" -d "$(jq -nc --arg p "$PASSWORD" '{password:$p}')")
expect 401 "$s" "delete without auth"
s=$(call POST /api/account/delete "${AUTH[@]}" "${JSON[@]}" -d 'not json')
expect 400 "$s" "delete with invalid JSON"
s=$(call POST /api/account/delete "${AUTH[@]}" "${JSON[@]}" -d '{"password":"definitely-wrong"}')
expect 403 "$s" "delete with wrong password"
[ "$(json .error)" = "Incorrect password." ] || die "wrong-password message"
ok "wrong-password message"
s=$(call POST /api/account/delete "${AUTH[@]}" "${JSON[@]}" -d "$(jq -nc --arg e "$EMAIL" '{confirmEmail:$e}')")
expect 403 "$s" "password account cannot confirm by email"
s=$(call POST /api/account/delete "${AUTH[@]}" "${JSON[@]}" -d "$(jq -nc --arg p "$PASSWORD" '{password:$p}')")
expect 200 "$s" "delete with correct password"
no_store "delete"
s=$(call GET /api/mobile/me "${AUTH[@]}")
expect 401 "$s" "me after deletion"
s=$(call POST /api/account/delete "${AUTH[@]}" "${JSON[@]}" -d "$(jq -nc --arg p "$PASSWORD" '{password:$p}')")
expect 401 "$s" "second delete"
s=$(call POST /api/mobile/login "${JSON[@]}" -d "$(jq -nc --arg e "$EMAIL" --arg p "$PASSWORD" '{email:$e,password:$p}')")
expect 401 "$s" "login after deletion"

echo
echo "ALL $PASSED CHECKS PASSED — test account deleted (user id $USER_ID)."
