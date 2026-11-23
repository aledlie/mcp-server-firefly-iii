# Changelog

All completed work for mcp-server-firefly-iii, organized by phase and category.

**Generated:** April 3, 2026
**Version:** 3.0.0

---

## Phase 2 — Transport-Level Resilience (2026-04-03 to 2026-04-05)

### Features

| ID | Title | Commit | Files |
|----|-------|--------|-------|
| #40 | Per-tool rate limiting via p-queue | `abaa334`, `aa54be0` | `src/rate-limiter.js` |
| #36 | LRU response caching via lru-cache | `8cc877c` | `src/response-cache.js` |
| #39 | Automatic retry via p-retry | `8cc877c`, `2ba5c8b` | `src/retry.js` |
| #37 | Replace Jest with Vitest | `2ba5c8b` | `package.json` |
| — | Cursor/offset pagination module | `a623b3a` | `src/pagination.js`, `src/tools/*.js`, `src/validation.js` |
| — | Per-category cache invalidation rules | `8cc877c` | `src/response-cache.js` |

### Pagination (Gap #1 — Resolved)

`src/pagination.js`: `buildPaginationParams()` converts `limit`/`offset`/`cursor` args into Firefly API query params. `extractPaginationMeta()` normalizes both cursor-based and offset-based response formats into `{ has_more, next_cursor, prev_cursor }`.

Wired into all 6 list tool categories: accounts, bills, budgets, insights, recurring, transactions. `validators.listParams` updated with optional `limit`/`offset` and new `cursor` field.

**PHP API side:** Cursor pagination on transaction endpoints (`?cursor=`), Spatie QueryBuilder on account/budget endpoints (`?filter[]=`, `?sort=`). Implemented in parent repo commits `ffab0183ed`, `bc7e1cd3f1`.

### Rate Limiting (Gap #2 — Resolved)

**MCP server (client-side):** Per-tool fixed-window token bucket via p-queue (`src/rate-limiter.js`). Exponential backoff retry on 429/5xx/network errors (`src/retry.js`).

**PHP API (server-side):** 3-tier Laravel throttle middleware: `api-read` (120/min), `api-write` (60/min), `api-analytics` (20/min). Configurable via `API_RATE_LIMIT_*` env vars. Implemented in parent repo commit `3a818d1b78`.

**Remaining limitation:** Single-instance only; distributed (Redis) rate limiting tracked as Phase 3.

### Cache Invalidation (Gap #3 — Resolved)

**MCP server:** `WRITE_INVALIDATES` map in `src/response-cache.js` defines per-category rules. Write operations (create/update/delete) automatically flush related read caches. Coverage: accounts, transactions, budgets, budget limits.

**PHP API:** Redis cache with tag-based invalidation via `TaggableCache` helper. Tags: `config`, `preferences`, `exchange_rates`, `user:{id}`. Implemented in parent repo commit `eebd710b82`.

### Infrastructure Details

- **Rate Limiter** (`src/rate-limiter.js`): Fixed-window enforcement using p-queue `intervalCap`. One queue per rate tier (10, 20, 30, 60/min) for memory efficiency. Default 30/min for uncatalogued tools. Wired into MCP handlers and REST routes.
- **Response Cache** (`src/response-cache.js`): LRU cache with max 500 entries. Per-tool TTLs from `resourceMetadata.cacheMaxAge`. Mutations bypass cache. Deterministic cache keys from tool name + sorted args. Per-category write invalidation via `WRITE_INVALIDATES` map.
- **Retry** (`src/retry.js`): p-retry with max 3 attempts, exponential backoff (1s minimum). Retries on 408/429/5xx and network errors (ECONNREFUSED, ENOTFOUND, ETIMEDOUT, ECONNRESET). Respects `Retry-After` headers.
- **Vitest**: Replaced Jest as test runner. Removed broken `test:enhanced` script. Run `npm test` for current test count.

**Dependency changes:**
- Added: `lru-cache ^11.2.7`, `p-queue ^6.6.2`, `p-retry ^4.6.2`, `better-sse ^0.16.1`, `vitest ^4.1.2`
- Removed: `axios-retry` (replaced by p-retry at application layer)

---

## Phase 1 — Claude Ecosystem Integration (2026-04-02 to 2026-04-03)

### P0 Critical Fixes

| ID | Title | Commit | Category |
|----|-------|--------|----------|
| #1 | Zod v4 API breaking change — ValidationError constructor crash | `2d64a19` | Bug fix |
| #2 | Missing `src/tools/` directory — server cannot start | `de92425` | Bug fix |
| #3 | Mixed ESM/CJS syntax in `src/validation.js` | `2d64a19` | Bug fix |
| #4 | `resolveDependencies()` returns inverted order | `0521d40` | Bug fix |
| #15 | Dual server instantiation on startup | `5ea614c` | Refactor |
| #16 | Missing source files (validation.js, resource-metadata.js) | `19f8a81` | Bug fix |
| #17 | MCP ListTools response violates spec | `19f8a81` | Spec compliance |
| #18 | SSE transport unsafe for multiple clients | `9971398` | Bug fix |
| #19 | Request interceptor logs params in production | `47c93cc` | Security |
| #20 | formatErrorResponse not MCP-compliant | `7b345be` | Spec compliance |
| #21 | String interpolation for URLs bypasses encoding | `a234826` | Bug fix |

**#1 — Zod v4 ValidationError crash**
`src/validation.js:61` — Zod v4 changed `ZodError.errors` to `ZodError.issues`. Constructor called `.map()` on undefined. Fix: handle both v3 and v4 shapes with `(zodErrors || []).map(...)`.

**#2 — Missing `src/tools/` directory**
`index.enhanced.js` imported 9 non-existent tool modules. Resolution: removed imports, rely on upstream tool loading via `src/tools/registry.js`.

**#3 — Mixed module syntax**
`src/validation.js` used `export const` (ESM) alongside `module.exports` (CJS). Converted all to CJS.

**#4 — Dependency resolution order bug**
`resolveDependencies()` added tools to resolved set before processing dependencies, producing inverted order. Fixed with proper topological sort.

**#15 — Dual server instantiation**
`index.enhanced.js` called `require('./index.js')` which triggered a second `Server` instantiation. Extracted tool registry into `src/tools/registry.js` (no side effects). Both entry points import tools only.

**#16 — Missing source files**
`src/validation.js` and `src/resource-metadata.js` were referenced but not committed. Files committed with full implementations (124 and 304 lines respectively).

**#17 — ListTools spec violation**
Response injected non-standard `_metadata` field and mutated `description`. Removed custom fields; metadata served only via `/tools/metadata` REST endpoint.

**#18 — SSE connection overwrites**
Single `let transport` variable meant Client B overwrites Client A. Replaced with session-keyed `Map` in both `index.js` and `index.enhanced.js`. Cleanup handlers on `close` and `error` events.

**#19 — Production logging leak**
Axios request interceptor logged all API calls (including params) unconditionally. Gated on `DEBUG=true` or `NODE_ENV !== 'production'`. Params never logged.

**#20 — Error surface divergence**
`index.js` and `index.enhanced.js` had different error response shapes. Created `toMCPErrorResult()` in `src/errors.js`, used by both entry points.

**#21 — URL string interpolation**
`src/tools/insights.js` used template literals for query params. Replaced with axios `{ params: {...} }` config for proper URL encoding.

### P1 High Priority

| ID | Title | Commit | Category |
|----|-------|--------|----------|
| #5 | Fabricated "66 tools catalogued" claim | `f6453fe` | Documentation |
| #6 | Unsubstantiated "empirical testing" claim | `f6453fe` | Documentation |
| #7 | Rate limits misframed as API constraints | `f6453fe` | Documentation |
| #8 | Version inconsistencies (3.0.0 vs 3.1.0) | `f6453fe`, `111c210` | Documentation |
| #22 | Tool-not-found throws instead of returning error | `3700ce7` | Bug fix |
| #24 | CJS/ESM documentation mismatch | `5c5887c` | Documentation |
| #25 | Stale tool count assertion in tests | `a234826` | Test quality |

**#5 — Fabricated coverage claim**
Docs claimed "66 tools catalogued with verified metadata". Actual: 12 tools in `resourceMetadata`, 38 in `toolGroups`. Corrected all claims to match reality.

**#6 — "Empirical testing" claim**
Token cost comments cited "empirical testing with real Firefly instances" — no test artifacts exist. Reworded as heuristic estimates with caveat to verify in production.

**#7 — Rate limits as constraints**
`rateLimit` field implied API-enforced constraints. Firefly III is self-hosted; limits depend on operator config. Renamed to `rateLimitHint`, added documentation clarifying these are recommended defaults.

**#8 — Version mismatch**
`package.json`: 3.0.0, `index.enhanced.js`: 3.1.0, docs: mixed. Unified to 3.0.0 everywhere.

**#22 — Tool-not-found throws**
`throw new Error()` inside `setRequestHandler` caused JSON-RPC protocol error. Changed to return `{ isError: true, content: [...] }` with list of available tools.

**#24 — ESM examples in CJS codebase**
All docs showed `import` syntax after CJS conversion. Replaced with `require()` / `module.exports`.

**#25 — Hardcoded tool count assertion**
`expect(TOOLS.length).toBe(65)` — fragile, masks changes. Replaced with structural assertions (`toHaveProperty('name')`, etc.).

### P2 Medium Priority

| ID | Title | Commit | Category |
|----|-------|--------|----------|
| #9 | ESM import examples in docs | `5c5887c` | Documentation |
| #10 | Automation tool count (9 vs 10) | `f6453fe` | Documentation |
| #11 | Broken `test:enhanced` script | `3700ce7` | Build |
| #12 | Uncatalogued tools return 0 tokens silently | `3700ce7` | Observability |
| #26 | ValidationError instanceof check fragile | `c464650` | Bug fix |
| #27 | Schema `default` keyword not enforced | `5c5887c` | Spec compliance |
| #28 | update_transaction schema incomplete | `5c5887c` | Feature |
| #32 | Analytics count wrong (4 vs 3) | `77b2112`, `111c210` | Documentation |
| #33 | Version 3.1.0 in roadmap files | `111c210` | Documentation |

**#11 — Broken test:enhanced script**
Referenced non-existent `src/test-loader.js`. Script removed from `package.json`.

**#12 — Silent zero token estimates**
`estimateTokenCost()` returned 0 with no warning for uncatalogued tools. Added warn-once tracking using a bounded `LRUCache` (max 200 entries) — logs warning once per tool per session.

**#27 — Unenforced schema defaults**
`default: 10` in JSON schemas was ignored by MCP SDK. Removed `default` from schemas; defaults applied in handler logic (`args.limit ?? 10`). Documentation updated.

**#28 — Incomplete update_transaction schema**
Only `id` and `description` were documented as updatable. Expanded to include all fields (amount, date, type, source_id, etc.) as optional.

### P3 Low Priority

| ID | Title | Commit | Category |
|----|-------|--------|----------|
| #13 | dotenv version mismatch | `3700ce7` | Dependency |
| #14 | Sensitive data in CONNECTION_FAILED error | `3700ce7` | Security |
| #30 | Emoji in startup messages | `3700ce7` | Style |
| #31 | Debug logging always enabled | `47c93cc` | Security |
| #34 | Emojis in README_CLAUDE.md | `111c210` | Style |

**#14 — Firefly URL leak**
`CONNECTION_FAILED` error included `process.env.FIREFLY_URL` in context. Added comment: server-side debugging only, do not forward to untrusted clients.

---

## Phase 1 — Initial Enhancement Layer (2026-04-02)

### Features Added

| Feature | Commit | Files |
|---------|--------|-------|
| Enhanced MCP server with metadata | `f8f51b0` | `index.enhanced.js` |
| Zod input validation | `f8f51b0` | `src/validation.js` |
| Structured error handling | `f8f51b0` | `src/errors.js` |
| Resource metadata system | `f8f51b0` | `src/resource-metadata.js` |
| CJS conversion | `8c8fd1b` | All `src/` files |
| Documentation suite | `4c6c933` | `CLAUDE_INTEGRATION.md`, `ENHANCEMENTS.md`, roadmap docs |
| Zod + schema deps | `3dfa885` | `package.json` |

### Feature Details

**1. Input Validation** (`src/validation.js`): Zod-powered runtime validation with auto JSON schema generation. Pre-built validators: `listParams`, `dateRange`, `createTransaction`, `account`, `budget`. Includes field-level error messages and type coercion (string → enum).

**2. Error Handling** (`src/errors.js`): `FireflyError` class with error codes (`AUTHENTICATION_FAILED` 403/401, `RATE_LIMITED` 429, `TIMEOUT`, `NOT_FOUND` 404, `VALIDATION_FAILED` 422, `SERVER_ERROR` 500+, `CONNECTION_FAILED`, `DNS_ERROR`, `UNKNOWN_ERROR`). `toMCPErrorResult()` for MCP-compliant responses. Automatic retryability detection, suggested retry delays, sensitive data redaction.

**3. Resource Metadata** (`src/resource-metadata.js`): Per-tool metadata for 12 core tools (token estimates, cacheability, rate limit hints, dependency graph). 66 total tools; 38 organized into 6 categories in `toolGroups`. Metadata coverage: 12/66 (18%) — remaining tools return null from `getResourceHint()` and 0 from `estimateTokenCost()`. Caching and rate limiting now functional via `src/response-cache.js` and `src/rate-limiter.js`.

**4. Tool Organization** (`src/resource-metadata.js` + `index.enhanced.js`): 6 categories — transactions (7), accounts (5), budgets (8), analytics (3), automation (10), system (5). Functions: `getToolsByCategory()`, `getToolCategory()`, `resolveDependencies()`.

**5. Claude Documentation**: `CLAUDE_INTEGRATION.md` (usage patterns), `ENHANCEMENTS.md` (technical architecture), `README_CLAUDE.md` (quick reference). Covers integration guide, error handling patterns, resource metadata usage, best practices, performance tuning, troubleshooting.

**6. Retry & Backoff** (`src/errors.js` + `src/retry.js`): p-retry with exponential backoff. Error classification with retryability detection and suggested delays: `RATE_LIMITED` 5000ms, `TIMEOUT` 3000ms, `NETWORK` 10000ms.

**7. Enhanced Schemas** (`src/validation.js`, partial): Type safety via Zod, auto JSON schema generation, field descriptions, enum/min/max constraints, required fields. Missing: per-field examples, pattern constraints (deferred to Phase 3).

**Enhanced Server** (`index.enhanced.js`): REST API with `/tools/metadata`, `/tools/resolve-dependencies`, `/openapi.json`, `/api/{toolName}`. SSE support with session-keyed routing.

---

## v3.0.0 Upstream (2026-03-30)

| Commit | Description |
|--------|-------------|
| `094b48e` | Final 100% synchronization for stable v3.0.0 |
| `77d504e` | Complete system mastery documentation |
| `802797e` | Add SECURITY.md |

Upstream v3.0.0 claimed 66 tools; audited count is 38 tool groups with 12 having full metadata (see Phase 1 fix #5). Full CRUD coverage across: accounts, transactions, budgets, piggy banks, bills, recurring transactions, rules, rule groups, webhooks, attachments, categories, tags, currencies, object groups, data export, system preferences.

---

## Remaining Limitations

| Limitation | Workaround | Phase 3 |
|------------|------------|---------|
| Schema examples not auto-generated | Zod `.describe()` provides inline docs | Enhanced examples planned |
| No streaming support | Pagination reduces payload per request | NDJSON streaming planned |
| Rate limiting single-instance only | Deploy behind API gateway | Redis-backed limiter planned |
| Metadata coverage 12/66 tools | Uncatalogued tools get defaults (30/min, no cache) | Expand coverage |

## Testing Status

**Runner:** vitest (`npm test`)

- ✅ Validation layer (Zod)
- ✅ Error wrapping (FireflyError)
- ✅ Pagination helpers (`src/pagination.test.js`)
- ⏳ Integration tests (mock Firefly) — not started
- ⏳ E2E tests (real Firefly instance) — not started

---

## Open Items

| ID | Priority | Title | Status |
|----|----------|-------|--------|
| #23 | P1 | upload_attachment wrong API pattern (multipart) | Deferred |
| #29 | P2 | No `additionalProperties: false` in schemas | ✅ Done |
| #35 | P3 | Replace Express with Hono/node:http | Open |
| #38 | P2 | Add Pino structured logging | ✅ Done |

### Phase 3 Planned
- Distributed rate limiting (Redis-backed)
- NDJSON streaming for large responses
- Enhanced schema examples + OpenAPI interactive docs
- Observability: OTEL integration, health checks, Prometheus metrics
- Request/response compression (gzip/brotli)
- Optional GraphQL query layer

---

**Maintained by:** Claude Code
**Source:** Consolidated from BACKLOG.md, KNOWN_GAPS.md, PHASE_2_ROADMAP.md
