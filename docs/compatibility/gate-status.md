# Compatibility gate status — 2026-10-18

Per the implementation plan, Tasks 1–7 code is drafted, but **no gate is
claimed passed in this environment**. The Task 0 probe evidence
(`docs/compatibility/probe/worker.ts.txt`, `run-functional.mjs.txt`) must be
executed and reviewed before any COMPATIBILITY GATE throw below is removed.

| Gate | Subject | Status |
| --- | --- | --- |
| B-01 | better-auth 1.7.10 pin; adapter + plugin export names; migrations | **BLOCKED** — `getAuth()` throws until verified |
| B-02 | admin plugin API (platform roles, user management) | **BLOCKED** — plugin import commented, policy uses structural role field |
| B-03 | organization plugin: memberships, custom roles, dynamic roles | **BLOCKED** — `createBetterAuthOrgReader()` throws |
| B-04 | `headers.getSetCookie()` in Workers runtime; compatibility date | **BLOCKED** — both wrangler configs carry `TO_BE_DETERMINED` |
| B-05 | bearer token issuance endpoint/header | **BLOCKED** — bearer plugin import commented |
| B-06 | `auth.api.getSession({ headers })` contract incl. returnHeaders | **BLOCKED** — renewal cookie capture is a documented stub |
| B-07 | D1 transaction support for owner-invariant test | **BLOCKED** — §10.27 test gated |

Do not remove a gate throw without recording the passing probe command and
result in this file.
