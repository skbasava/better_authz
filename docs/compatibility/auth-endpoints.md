# Verified auth endpoint inventory (Task 0 output)

Replace every row's **Status** with probe evidence before enabling the
corresponding allowlist entry or gate. Unknown endpoints are denied.

| Endpoint | Method | Required | Org-context resolution (Review Focus 2) | Status |
| --- | --- | --- | --- | --- |
| /api/auth/sign-in/email | POST | yes | n/a | PENDING |
| /api/auth/sign-up/email | POST | yes | n/a | PENDING |
| /api/auth/sign-out | POST | yes | n/a | PENDING |
| /api/auth/get-session | GET | yes | n/a | PENDING |
| /api/auth/request-password-reset | POST | yes | n/a | PENDING |
| /api/auth/reset-password | POST | yes | n/a | PENDING |
| /api/auth/token | POST | bearer issuance (B-05) | n/a | PENDING |
| organization-plugin endpoints | — | TBD | each must declare authoritative org resolution | PENDING |
| admin-plugin endpoints | — | TBD | none expose unrestricted admin surface | PENDING |

Rules:
- Exact path + method matching only; no prefix matching.
- Any endpoint whose body selects organization/member/invitation IDs needs a
  recorded resolution decision (authoritative ID from membership/invitation
  lookup, serialized mutation scope, deny on unresolved context).
- Bearer issuance header names feed `packages/gateway/src/credential/adapter.ts`
  documentation and gate B-05.
