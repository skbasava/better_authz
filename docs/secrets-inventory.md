# Secrets inventory

| Secret | Bound to | Purpose | Rotation |
| --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | auth-worker | better-auth core signing secret | Rotate on suspected compromise; script + verify sessions still validate |
| `ORIGIN_<NAME>_SECRET` (one per `OriginConfig.secretEnvVar`, e.g. `ORIGIN_BILLING_SECRET`) | gateway | `Gateway-Origin-Auth` credential for that origin | Scripted rotation; **old and new values may overlap at most one hour** (§10.25) |
| D1 `database_id` reference | auth-worker | Auth database binding | Not a secret; treat as topology — never expose via health endpoints |

## Rotation procedure (origin secret)

1. Generate the new secret; `wrangler secret put ORIGIN_BILLING_SECRET` with
   the new value on the gateway Worker.
2. Deploy the matching value to the backend's `ORIGIN_SECRET` env.
3. Verify end-to-end: one authorized request returns 200 with the new
   credential chain.
4. Revoke the old value after verification and within one hour of overlap.
5. Record the rotation in the runbook log.

## Rules

- Secrets are never stored in `vars`, never in `GATEWAY_CONFIG`, never logged.
- The gateway reads origin secrets only via `env[OriginConfig.secretEnvVar]`.
- `Gateway-Origin-Auth` is a trusted gateway-to-backend credential: it is
  stripped from every inbound client request and never accepted from clients.
