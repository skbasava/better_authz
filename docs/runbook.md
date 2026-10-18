# Runbook

## Deployment sequence

1. **Auth database**: create/verify the isolated D1 database; apply
   better-auth migrations generated from the pinned CLI **after** gate B-01
   passes (see `packages/auth/migrations/`).
2. **Auth Worker**: set secrets (`BETTER_AUTH_SECRET`), vars
   (`BETTER_AUTH_URL`, `ALLOWED_ORIGINS`, `PERMISSION_CATALOG`), D1 binding;
   `wrangler deploy`. Public ingress stays un-routed — the Worker is only
   reachable via the gateway's service binding (§10.19 is a release gate
   requiring deployed-environment evidence).
3. **Gateway Worker**: set `GATEWAY_CONFIG`, `PERMISSION_CATALOG` vars; bind
   `AUTH_WORKER`; set per-origin secrets; `wrangler deploy`.
4. **Origins**: distribute each `ORIGIN_<NAME>_SECRET` to its backend.
5. **Example backend**: set `ORIGIN_SECRET`; start.

## Compatibility date

Both Workers must share the compatibility date proven by the passing
`headers.getSetCookie()` runtime test (gate B-04). Record the test name and
date in `docs/compatibility/gate-status.md` when filled in; until then both
wrangler configs intentionally carry `TO_BE_DETERMINED` and will not deploy.

## Credential rotation

See `docs/secrets-inventory.md`. Maximum one-hour overlap between old and new
origin credentials.

## Revocation vs in-flight writes (Review Focus 1)

Session revocation and role removal fail all **subsequent fresh**
authorization checks. An already-authorized in-flight backend write is **not**
rolled back and is never claimed to be — backends own business invariants.

## Streaming uploads (Review Focus 3)

`maxBodyBytes` is enforced pre-flight on `Content-Length` and en route on
streamed bytes. When the limit trips mid-stream the upstream request is
aborted; **partial upstream writes may exist**. This is documented behavior,
not a rollback.

## Rate limiter (G-03)

The Durable Object is a fixed-window counter per the specification. Fail-closed:
any DO failure or non-200 yields 503 `RATE_LIMITED` on **all** rate-limited
routes — authenticated and public alike. Capacity: one DO instance per
`{clientIp}:{routeId}` key; size the namespace for your key cardinality.

## Durable Object capacity notes

- `RATE_LIMITER`: fan-out is client-IP × route. Expect high instance counts;
  instances are lightweight but monitor storage operations per window reset.
- Organization mutation coordinator (Task 0 Step 3 amendment): **not
  adopted** — pending architecture review. If adopted, one instance per
  organization ID serializes security-sensitive mutations.

## Release gates (not claimed passed locally)

- Account capacity verification (deployed).
- Deployed-ingress test: direct auth Worker ingress rejected (§10.19).
- `/_internal/*` unreachable via any public route (§10.18, deployed).
