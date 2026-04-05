# Known Gaps & Future Considerations

**Document Date:** April 3, 2026  
**Status:** Living document — updated as gaps are discovered

---

## Currently Unaddressed

### High Priority (Phase 2)

#### 1. Pagination for Large Result Sets — PARTIALLY ADDRESSED
**Gap:** ~~Tools like `get_spending_summary` can return 100+ KB, exceeding token budgets.~~

**Status:** Partially resolved. The Firefly III PHP API now supports cursor-based pagination on transaction endpoints via `?cursor=` parameter (April 2026). The MCP server tool handlers do not yet pass cursor/offset params to the API — they only send `limit`.

**PHP API support (implemented):**
- `GET /api/v1/accounts/{id}/transactions?cursor=` — cursor pagination with `next_cursor`, `prev_cursor`
- `GET /api/v1/accounts?filter[name]=...&sort=-name` — Spatie QueryBuilder filtering/sorting
- Standard offset pagination (`?page=&limit=`) remains available on all list endpoints

**Remaining MCP server work:**
- Update tool handlers in `src/tools/` to pass `offset` or `cursor` params to the Firefly API
- Wire up `validators.listParams` (already defined in `src/validation.js`) to tool schemas
- Implement pagination iteration in tool responses for large result sets

**Effort:** 2 days (reduced from 4; PHP API work is done)  
**Blocked By:** None

---

#### 2. Rate Limit Enforcement — IMPLEMENTED
**Gap:** ~~Metadata indicates limits (e.g., 10/min for `get_net_worth_summary`), but server doesn't throttle.~~

**Status:** Resolved at both layers.

**MCP server (client-side):** Per-tool rate limiting in `src/rate-limiter.js` using p-queue with sliding window and tier-based queues. Retry logic in `src/retry.js` uses p-retry with exponential backoff, handling 429/5xx/network errors.

**Firefly III PHP API (server-side, April 2026):** 3-tier rate limiting via Laravel `RateLimiter` + `throttle` middleware:
- `api-read`: 120 req/min (all GET endpoints)
- `api-write`: 60 req/min (POST/PUT/DELETE — defined, ready for per-route use)
- `api-analytics`: 20 req/min (chart, insight, summary endpoints)
- Laravel's `throttle` middleware automatically emits `X-RateLimit-*` and `Retry-After` headers
- Configurable via `API_RATE_LIMIT_*` env vars; scoped per user ID or IP

**Implementation:**
```javascript
// MCP server (client-side):
// src/rate-limiter.js — per-tool sliding window via p-queue
// src/retry.js — p-retry with exponential backoff on 429/5xx/network

// PHP API (server-side):
// app/Providers/AppServiceProvider.php — RateLimiter::for() definitions
// bootstrap/app.php — throttle:api-read in api middleware group
// routes/api.php — throttle:api-analytics on chart/insight/summary groups
```

**Remaining Limitation:** MCP server rate limiting is single-instance only; see Gap #4 for distributed (Redis) support.

**Original Planned Solution:** ~~Optional rate limiting middleware (Phase 2)~~  
**Effort:** 3 days  
**Completed:** April 2026

---

#### 3. Cache Invalidation Strategy — PARTIALLY ADDRESSED
**Gap:** ~~Metadata indicates what's cacheable, but no rules for when to invalidate.~~

**Status:** Partially resolved at both layers.

**MCP server:** Response caching in `src/response-cache.js` using lru-cache with per-tool TTLs from resourceMetadata. Smart per-category invalidation rules (e.g., invalidate account cache on transaction create) still planned.

**Firefly III PHP API (April 2026):** Redis cache with tag-based invalidation via `TaggableCache` helper. Tags: `config`, `preferences`, `exchange_rates`, `user:{id}`. Exchange rate changes flush only the `exchange_rates` tag instead of the entire cache. Graceful fallback to untagged cache when using file driver.

**Implementation:**
```javascript
// src/response-cache.js — LRU cache with per-tool TTLs from resourceMetadata
// Wraps tool handlers (client-side, not middleware)
```

**Remaining Gap:** Per-category invalidation rules (e.g., write to accounts invalidates account-list cache).

**Planned Solution:** Per-category invalidation rules (Phase 2, remaining work)  
**Effort:** 1-2 days (reduced from 3; foundation in place)  
**Blocked By:** None

---

### Medium Priority (Phase 3+)

#### 4. Distributed Rate Limiting (Redis)
**Gap:** In-memory rate limiter only works for single instance.

**Current Limitation:** 
- Horizontal scaling requires multiple servers
- Each instance has independent rate limit counter
- Cumulative limit can exceed API limits

**Current Workaround:**
```javascript
// Deploy behind API gateway with rate limiting
// (e.g., Nginx, Envoy, API Gateway)
```

**Planned Solution:** Redis-backed rate limiter (Phase 3)  
**Effort:** 2 days  
**Blocked By:** ~~Rate limiting MVP (Phase 2)~~ None (rate limiting implemented)

---

#### 5. Streaming / Server-Sent Events (SSE)
**Gap:** Large responses still transferred as single JSON blob, not streamed.

**Current Limitation:**
```javascript
// Blocks until entire response received
const result = await handler(args);  // 100+ KB
return JSON.stringify(result);
```

**Current Workaround:**
```javascript
// Use pagination + async iteration (Phase 2)
for await (const batch of paginator) {
  // Process incrementally
}
```

**Planned Solution:** NDJSON streaming endpoint (Phase 2+)  
**Effort:** 2 days (if paginator built)  
**Blocked By:** Pagination builders

---

#### 6. GraphQL Query Layer
**Gap:** REST API requires multiple calls; GraphQL could reduce chatty interactions.

**Current Limitation:**
```javascript
// Multiple round-trips for composite queries
const accounts = await getAccounts();
for (const account of accounts) {
  const balance = await getBalance(account.id);
  // ...
}
```

**Current Workaround:**
```javascript
// Use dependency resolver to plan calls
const resolved = resolveDependencies(['getBalance']);
```

**Planned Solution:** Optional GraphQL endpoint (Phase 3+)  
**Effort:** 5+ days  
**Rationale:** Lower priority; REST + pagination sufficient for MVP

---

#### 7. Request/Response Compression
**Gap:** Large JSON responses not compressed (gzip, brotli).

**Current Limitation:**
- Increases data transfer size
- Slight CPU overhead on decompression

**Current Workaround:**
```javascript
// Firefly/Axios handles transparently for HTTP
// Paid for by bandwidth, not latency
```

**Planned Solution:** Automatic compression (Phase 2+)  
**Effort:** 1 day  
**Impact:** 10–50% bandwidth reduction

---

### Low Priority / Out of Scope

#### 8. Batch Operations
**Gap:** No bulk endpoint for creating/updating multiple entities.

**Current Limitation:**
```javascript
// Create 100 transactions → 100 API calls
for (const tx of transactions) {
  await createTransaction(tx);
}
```

**Current Workaround:**
```javascript
// Rate limiter + pagination aware spacing
const limiter = createRateLimiter();
```

**Status:** Out of scope (Firefly API limitation, not MCP server)

---

#### 9. Webhooks for Data Changes
**Gap:** No push notifications when Firefly data changes.

**Current Limitation:**
- Must poll for updates
- Cache staleness risk

**Current Workaround:**
```javascript
// Cache invalidation on retry
// Metadata indicates TTLs
```

**Status:** Out of scope (Firefly feature, not MCP server)

---

#### 10. Audit Logging
**Gap:** No request/response logging for compliance.

**Current Limitation:**
```javascript
// No built-in audit trail
```

**Current Workaround:**
```javascript
// Use external logging service (DataDog, Splunk, etc.)
```

**Status:** Out of scope; recommend application-level logging

---

#### 11. Multi-Tenant Support
**Gap:** Server assumes single Firefly instance (one FIREFLY_URL, FIREFLY_TOKEN).

**Current Limitation:**
```javascript
// Can't serve multiple Firefly instances
```

**Current Workaround:**
```javascript
// Run separate server instances per tenant
```

**Status:** Out of scope (architectural decision)

---

## Design Trade-Offs

### Why Client-Side Caching and Rate Limiting?
Both response caching (`src/response-cache.js`) and rate limiting (`src/rate-limiter.js`) are implemented as client-side handler wrappers, not middleware. This keeps the server stateless for stdio mode and avoids coupling to a specific HTTP framework. Trade-off: single-instance only (no shared state across processes).

### Why No Streaming in MVP?
Pagination builders achieve same benefit with simpler architecture. SSE adds complexity.

### Why Not GraphQL?
REST + dependency resolver sufficient. GraphQL adds query parsing overhead.

---

## Risk Register

### Risk 1: Large Result Sets Overflow Token Budget
**Probability:** High  
**Impact:** Claude can't use tool effectively  
**Mitigation:** Pagination builders (Phase 2)  
**Status:** Tracked

### Risk 2: Rate Limit Hammering
**Probability:** Low (mitigated)  
**Impact:** API blocks requests  
**Mitigation:** Per-tool sliding window rate limiter (`src/rate-limiter.js`) + exponential backoff retry (`src/retry.js`). Handles 429/5xx/network errors automatically.  
**Status:** Mitigated (single-instance). Distributed deployments still at risk (see Risk 4).

### Risk 3: Cache Staleness
**Probability:** Low-Medium (partially mitigated)  
**Impact:** Claude uses outdated data  
**Mitigation:** LRU response cache (`src/response-cache.js`) with per-tool TTLs from resourceMetadata. Smart per-category invalidation rules still planned.  
**Status:** Partially mitigated. TTL-based expiry in place; category-aware invalidation pending.

### Risk 4: Distributed Deployment Issues
**Probability:** Medium (post-MVP)  
**Impact:** Rate limit bypass; cache inconsistency  
**Mitigation:** Redis support (Phase 3)  
**Status:** Tracked

---

## Feature Request Template

For reporting new gaps:

```markdown
## Gap: [Title]

**Description:** What's missing?

**Current Limitation:** How does it affect users?

**Impact:** 
- [ ] Functionality
- [ ] Performance
- [ ] Security
- [ ] Usability

**Workaround:** Temporary solution?

**Proposed Solution:** How to fix?

**Effort Estimate:** Days/weeks?

**Priority:** P0 (blocks MVP) / P1 (valuable) / P2 (nice-to-have)?
```

---

## How to Contribute

1. Test Phase 1 enhancements
2. Report gaps via issue template above
3. Propose Phase 2 priorities based on usage
4. Submit PRs for bug fixes or documentation

---

## Document Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-02 | Initial gaps inventory |
| 1.1 | 2026-04-03 | Updated gaps #2 (rate limiting implemented), #3 (caching partially addressed); risks 2-3 mitigated; design trade-offs revised; vitest replaces Jest |
| 1.2 | 2026-04-05 | Gap #1 partially addressed (PHP API cursor pagination). Gap #2 updated with PHP API 3-tier rate limiting. Gap #3 updated with PHP API Redis tag-based cache |

---

**Last Updated:** April 5, 2026  
**Next Review:** After Phase 2 completion
