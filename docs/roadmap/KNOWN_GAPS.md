# Known Gaps & Future Considerations

**Document Date:** April 2, 2026  
**Status:** Living document — updated as gaps are discovered

---

## Currently Unaddressed

### High Priority (Phase 2)

#### 1. Pagination for Large Result Sets
**Gap:** Tools like `get_spending_summary` can return 100+ KB, exceeding token budgets.

**Current Workaround:** 
```javascript
// Use metadata to guide filtering
const meta = getResourceHint('get_spending_summary');
if (meta.resultSize === 'large') {
  // Claude can add filters or narrow date range
}
```

**Planned Solution:** Pagination builders (Phase 2)  
**Effort:** 4 days  
**Blocked By:** None

---

#### 2. Rate Limit Enforcement
**Gap:** Metadata indicates limits (e.g., 10/min for `get_net_worth_summary`), but server doesn't throttle.

**Current Behavior:**
- Metadata warns of limits
- Error codes + retry guidance provided
- Claude respects suggested delays

**Current Workaround:** 
```javascript
// Manual spacing
await sleep(suggestedRetryDelay);
await tool.handler(args);
```

**Planned Solution:** Optional rate limiting middleware (Phase 2)  
**Effort:** 3 days  
**Rationale:** Stateful throttling complicates distributed deployments

---

#### 3. Cache Invalidation Strategy
**Gap:** Metadata indicates what's cacheable, but no rules for when to invalidate.

**Current Workaround:**
```javascript
// Manual: cache invalidation TTLs only
cache.set(key, result, 300000); // 5 min
```

**Planned Solution:** Per-category invalidation rules (Phase 2)  
**Effort:** 3 days  
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
**Blocked By:** Rate limiting MVP (Phase 2)

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

### Why No Client-Side Caching?
Claude handles HTTP caching; server provides metadata. Avoids duplication.

### Why No Rate Limiting in MVP?
Stateful throttling complicates deployment. Metadata + error codes sufficient.

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
**Probability:** Medium  
**Impact:** API blocks requests  
**Mitigation:** Error codes + retry guidance + Phase 2 enforcer  
**Status:** Tracked

### Risk 3: Cache Staleness
**Probability:** Medium  
**Impact:** Claude uses outdated data  
**Mitigation:** Short TTLs + invalidation rules (Phase 2)  
**Status:** Tracked

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
| TBD | TBD | Phase 2 validation |

---

**Last Updated:** April 2, 2026  
**Next Review:** After Phase 2 completion
