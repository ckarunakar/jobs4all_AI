#!/usr/bin/env bash
# verify-profile-sync.sh — acceptance checks for GET/PUT /api/profile
# (spec: docs/superpowers/specs/2026-10-20-server-side-profile-design.md).
#
# Usage: scripts/verify-profile-sync.sh [BASE_URL]
#   BASE_URL defaults to http://localhost:3000. Needs curl + jq.
#
#        ALLOW_ANY_EMAIL=1 VERIFY_EMAIL=<non-example.com address> scripts/verify-profile-sync.sh
#   Refuses to run unless the account is @example.com or ALLOW_ANY_EMAIL=1.
#
# Uses the account $VERIFY_EMAIL / $VERIFY_PASSWORD (defaults below). Section 0
# starts from a fresh account (an account left over from an earlier run is
# deleted first), and the final section DELETES it. Stops at the first failed
# check, so it is safe to re-run while features are still being built.
#
# Side effects on the target database (all on the test account, all removed by
# the final section): a login_users row, mobile_sessions rows, one
# resume_upload row and one user_profiles row.

set -uo pipefail

BASE="${1:-http://localhost:3000}"
EMAIL="${VERIFY_EMAIL:-profile-verify@example.com}"
PASSWORD="${VERIFY_PASSWORD:-Verify-Profile-2026x}"
if [[ "$EMAIL" != *@example.com && "${ALLOW_ANY_EMAIL:-}" != "1" ]]; then
  echo "Refusing to run: this script DELETES the account $EMAIL. Use an @example.com address, or set ALLOW_ANY_EMAIL=1."
  exit 2
fi
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
json() { jq -r "$1" "$BODY"; }
no_store() {
  grep -qi '^cache-control:.*no-store' "$HEADERS" || die "$1: missing Cache-Control: no-store"
  ok "$1 sends Cache-Control: no-store"
}
bearer() { printf 'authorization: Bearer %s' "$1"; }
JSON=(-H 'content-type: application/json')
check() { # check LABEL JQ_EXPR — asserts the jq expression is true for the last body
  jq -e "$2" "$BODY" >/dev/null || die "$1"
  ok "$1"
}
check_arg() { # check_arg LABEL JQ_EXPR VAR VALUE
  jq -e --arg v "$4" "$2" "$BODY" >/dev/null || die "$1"
  ok "$1"
}

REGISTER_BODY="$(jq -nc --arg e "$EMAIL" --arg p "$PASSWORD" '{name:"Profile Verify",email:$e,password:$p}')"

echo "== 0. fresh test account ($EMAIL on $BASE)"
s=$(call POST /api/auth/register "${JSON[@]}" -d "$REGISTER_BODY")
if [ "$s" = 409 ]; then
  ok "account left over from an earlier run (409), deleting it"
  s=$(call POST /api/mobile/login "${JSON[@]}" -d "$(jq -nc --arg e "$EMAIL" --arg p "$PASSWORD" '{email:$e,password:$p}')")
  expect 200 "$s" "leftover account: login"
  OLD_TOKEN=$(json .token)
  s=$(call POST /api/account/delete -H "$(bearer "$OLD_TOKEN")" "${JSON[@]}" \
    -d "$(jq -nc --arg p "$PASSWORD" '{password:$p}')")
  expect 200 "$s" "leftover account: delete"
  s=$(call POST /api/auth/register "${JSON[@]}" -d "$REGISTER_BODY")
fi
expect 200 "$s" "register fresh account"

echo "== 1. sign-ins"
call GET /api/auth/csrf -c "$JAR" -b "$JAR" >/dev/null
CSRF=$(json .csrfToken)
{ [ -n "$CSRF" ] && [ "$CSRF" != null ]; } || die "no csrfToken"
s=$(call POST /api/auth/callback/credentials -c "$JAR" -b "$JAR" \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=$PASSWORD")
grep -q 'session-token' "$JAR" || die "credentials callback ($s) set no session cookie"
ok "web login sets a session cookie ($s)"
s=$(call POST /api/mobile/login "${JSON[@]}" \
  -d "$(jq -nc --arg e "$EMAIL" --arg p "$PASSWORD" '{email:$e,password:$p,deviceName:"verify-script"}')")
expect 200 "$s" "mobile login"
TOKEN=$(json .token)
USER_ID=$(json .user.id)
{ [ -n "$TOKEN" ] && [ "$TOKEN" != null ]; } || die "mobile login returned no token"
AUTH=(-H "$(bearer "$TOKEN")")
ok "user id $USER_ID"

echo "== 2. auth rules"
s=$(call GET /api/profile)
expect 401 "$s" "GET /api/profile without auth"
s=$(call GET /api/profile -b "$JAR" -H "$(bearer not-a-real-token)")
expect 401 "$s" "GET /api/profile with cookie + garbage Bearer (no fallback)"
s=$(call PUT /api/profile "${JSON[@]}" -d '{"profile":{}}')
expect 401 "$s" "PUT /api/profile without auth"

echo "== 3. empty profile"
s=$(call GET /api/profile -b "$JAR")
expect 200 "$s" "GET /api/profile (cookie)"
check_arg "email is the signed-in account" '.email == $v' email "$EMAIL"
check "profile is null" '.profile == null'
check "prefFilters defaults to true" '.prefFilters == true'
check "updatedAt is null" '.updatedAt == null'
no_store "GET /api/profile"

echo "== 4. rejected PUTs"
s=$(call PUT /api/profile -b "$JAR" -H 'content-type: text/plain' -d '{"profile":{}}')
expect 400 "$s" "PUT with content-type text/plain"
[ "$(json .error)" = "Invalid JSON body." ] || die "text/plain message"
ok "text/plain message"
s=$(call PUT /api/profile -b "$JAR" "${JSON[@]}" -d 'not json')
expect 400 "$s" "PUT with invalid JSON"
[ "$(json .error)" = "Invalid JSON body." ] || die "invalid JSON message"
ok "invalid JSON message"
s=$(call PUT /api/profile -b "$JAR" "${JSON[@]}" -d '[]')
expect 400 "$s" "PUT with an array body"
[ "$(json .error)" = "Invalid profile." ] || die "array body message"
ok "array body message"
s=$(call PUT /api/profile -b "$JAR" "${JSON[@]}" -d '{"profile":"x"}')
expect 400 "$s" "PUT with a string profile"
[ "$(json .error)" = "Invalid profile." ] || die "string profile message"
ok "string profile message"
jq -nc '{profile:{fullName:("a" * 70000)}}' > "$WORK/huge.json"
s=$(call PUT /api/profile -b "$JAR" "${JSON[@]}" --data-binary "@$WORK/huge.json")
expect 400 "$s" "PUT with a body over 65,536 bytes"
[ "$(json .error)" = "Profile too large." ] || die "too-large message"
ok "too-large message"
s=$(call PUT /api/profile -b "$JAR" "${JSON[@]}" \
  -d '{"profile":{},"expectedEmail":"someone-else@example.com"}')
expect 409 "$s" "PUT with a different expectedEmail"
[ "$(json .error)" = "Signed in as a different account." ] || die "different-account message"
ok "different-account message"

echo "== 5. own resume"
cat > "$WORK/resume.pdf" <<'PDF'
%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>> endobj
4 0 obj <</Length 55>> stream
BT /F1 14 Tf 20 60 Td (Profile Verify - Java React SQL) Tj ET
endstream endobj
5 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj
trailer <</Root 1 0 R>>
%%EOF
PDF
s=$(call POST /api/resume-upload "${AUTH[@]}" \
  -F "resume=@$WORK/resume.pdf;type=application/pdf" -F "fullName=Profile Verify")
expect 200 "$s" "resume-upload"
OWN_ID=$(json .id)
{ [ -n "$OWN_ID" ] && [ "$OWN_ID" != null ]; } || die "resume-upload returned no id"
ok "own resume id $OWN_ID"

echo "== 6. valid PUT"
UPPER_EMAIL="$(printf '%s' "$EMAIL" | tr '[:lower:]' '[:upper:]')"
jq -nc --argjson own "$OWN_ID" --arg e "$UPPER_EMAIL" '{
  profile: {
    email: "someone-else@example.org",
    isAdmin: true,
    fullName: ("a" * 600),
    school: "Verify U",
    workAuthorization: "bogus",
    remotePreferences: ["remote", "moon"],
    targetRoles: [range(60) | "role \(.)"],
    resumes: [
      {id: "r-own", label: "Own", fileName: "own.pdf", uploadedAt: "2026-10-20", parsed: true, dbId: $own},
      {id: "r-foreign", label: "Foreign", fileName: "f.pdf", uploadedAt: "2026-10-20", parsed: false, dbId: 2147483000}
    ],
    primaryResumeId: "r-own"
  },
  prefFilters: false,
  expectedEmail: $e
}' > "$WORK/put.json"
s=$(call PUT /api/profile -b "$JAR" "${JSON[@]}" --data-binary "@$WORK/put.json")
expect 200 "$s" "PUT a full profile (cookie, upper-cased expectedEmail)"
check_arg "top-level email is the signed-in account" '.email == $v' email "$EMAIL"
check_arg "email is the account email, not the submitted one" '.profile.email == $v' email "$EMAIL"
check "isAdmin is dropped" '.profile | has("isAdmin") | not'
check "fullName is cut to 500 characters" '.profile.fullName | length == 500'
check "school is kept" '.profile.school == "Verify U"'
check "unknown workAuthorization becomes unspecified" '.profile.workAuthorization == "unspecified"'
check "unknown remote preference is dropped" '.profile.remotePreferences == ["remote"]'
check "targetRoles is cut to 50 items" '.profile.targetRoles | length == 50'
check_arg "own resume keeps its dbId" '.profile.resumes[0].dbId == ($v | tonumber)' dbId "$OWN_ID"
check "foreign resume loses its dbId" '.profile.resumes[1] | has("dbId") | not'
check "foreign resume entry is kept" '.profile.resumes[1].id == "r-foreign"'
check "prefFilters is false" '.prefFilters == false'
check "updatedAt is set" '.updatedAt != null'
no_store "PUT /api/profile"
jq '.profile' "$BODY" > "$WORK/saved.json"

echo "== 7. same profile both ways"
s=$(call GET /api/profile "${AUTH[@]}")
expect 200 "$s" "GET /api/profile (Bearer)"
[ "$(jq -S '.profile' "$BODY")" = "$(jq -S . "$WORK/saved.json")" ] || die "Bearer GET profile differs from what the cookie PUT saved"
ok "Bearer GET returns the saved profile"
jq -c '{profile: (. + {school: "Phone U"})}' "$WORK/saved.json" > "$WORK/put2.json"
s=$(call PUT /api/profile "${AUTH[@]}" "${JSON[@]}" --data-binary "@$WORK/put2.json")
expect 200 "$s" "PUT /api/profile (Bearer, no prefFilters, no expectedEmail)"
s=$(call GET /api/profile -b "$JAR")
expect 200 "$s" "GET /api/profile (cookie)"
check "cookie GET sees the Bearer edit" '.profile.school == "Phone U"'
check "missing prefFilters kept the stored value" '.prefFilters == false'

echo "== 8. deletion"
# The user_profiles row has a foreign key to login_users, so login_users cannot
# be deleted while that row exists. A 200 here therefore proves the account
# deletion also removed the profile row.
s=$(call POST /api/account/delete "${AUTH[@]}" "${JSON[@]}" -d "$(jq -nc --arg p "$PASSWORD" '{password:$p}')")
expect 200 "$s" "delete account with a saved profile"
s=$(call GET /api/profile "${AUTH[@]}")
expect 401 "$s" "GET /api/profile after deletion"

echo
echo "ALL $PASSED CHECKS PASSED — test account deleted (user id $USER_ID)."
