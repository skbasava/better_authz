# Better Auth Gateway

Two-Worker authentication middleware gateway: a public Hono gateway on
Cloudflare Workers in front of a binding-only Better Auth Worker backed by
D1. The gateway routes, coordinates authorization, and proxies; the Auth
Worker is the sole authority for sessions, users, roles, and organizations.

## Layout

- `packages/shared` — compile-time contracts only (no runtime code).
- `packages/gateway` — routing, credentials, authorization coordination,
  header sanitization, rate limiting, forwarding. **No D1 binding.**
- `packages/auth` — Better Auth integration, session resolution, policy
  evaluation, organization permissions. **Owns D1.**
- `packages/example-backend` — origin-auth + ownership example.

## Development

```sh
npm ci
npm run typecheck
npm test
```

Better Auth organization-plugin migrations are generated from the pinned CLI
**only after** compatibility gate B-01 passes (see
`docs/compatibility/gate-status.md`); until then `packages/auth/migrations/`
is intentionally empty and `getAuth()` fails closed with a gate error.

Integration tests require an isolated, non-production D1 database and the
recorded gate evidence — they fail loudly (never skip) while gates are open.

## Status

Implementation drafted; compatibility gates and release gates documented in
`docs/compatibility/gate-status.md` and `docs/runbook.md`. No production
deployment is authorized by this repository state.
