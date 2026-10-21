GW=https://auth-gateway.satish-aradhya.workers.dev

# a. Health — pipeline alive, no config needed
curl -i $GW/healthz
# → 200 {"status":"ok"}

# b. Protected route without credential — credential boundary works
curl -i $GW/api/whoami
# → 401 {"code":"NO_CREDENTIAL",...}

# c. Sign up through the gateway (auth proxy path)
curl -i -c jar.txt -X POST $GW/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"test3@example.com","password":"TestPass123!","name":"Test3 User"}'
# → 200 + Set-Cookie better-auth.session_token=...

# d. Session check through the gateway
curl -i -b jar.txt $GW/api/auth/get-session
# → 200 with user JSON

# e. THE token-verification test — protected route with the session
curl -i -b jar.txt $GW/api/whoami
# → 200, body is httpbin's echo showing:
#    "Gateway-User-Id", "Gateway-Session-Id", "Gateway-Policy-Id": "whoami",
#    "Gateway-Origin-Auth": "<your secret>"
