#!/usr/bin/env bash
GW=https://auth-gateway.satish-aradhya.workers.dev
set -u


grep -o '"destinationPath":"[^"]*"' ../packages/gateway/wrangler.jsonc   # must print @identity

echo "── a. health ──"
curl -i -s $GW/healthz
echo; echo

echo "── b. whoami without credential → expect 401 NO_CREDENTIAL ──"
curl -i -s $GW/api/whoami
echo; echo

echo "── c. sign-IN (not sign-up — test6 already exists; sign-up returns an error body) ──"
curl -i -s -c jar.txt -X POST $GW/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"test6@example.com","password":"TestPass123!"}'
echo; echo

echo "── d. get-session with cookie → 200 + user JSON ──"
curl -i -s -b jar.txt $GW/api/auth/get-session
echo; echo

echo "── e. whoami with cookie ──"
curl -i -s -b jar.txt $GW/api/whoami
echo; echo

echo "── f. whoami with BEARER (token from step c body or set-auth-token header) ──"
# TOKEN='paste-from-step-c'; then uncomment:
# curl -i -s $GW/api/whoami -H "Authorization: Bearer $TOKEN"
echo

echo "── g. negatives ──"
curl -i -s $GW/api/whoami -H 'Authorization: Bearer garbage'      # → 401 INVALID_SESSION
curl -i -s -b jar.txt $GW/api/whoami -H 'Authorization: Bearer x' # → 400 AMBIGUOUS_CREDENTIAL
