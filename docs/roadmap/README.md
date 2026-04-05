# Roadmap & Status

Complete tracking of Claude ecosystem integration enhancements.

## Documents

### [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)
**What was done in Phase 1?**

- Executive summary (8 proposed improvements)
- Detailed status of each feature
- Known limitations & workarounds
- What's not in scope

**Key Takeaway:** 6 of 8 gaps fully addressed. Phase 1 is production-ready.

---

### [PHASE_2_ROADMAP.md](./PHASE_2_ROADMAP.md)
**What's coming next?**

- Pagination builders for large result sets
- Rate limiting middleware
- Cache invalidation rules
- Enhanced schema examples
- Observability (metrics, traces, health checks)

**Timeline:** ~3 weeks effort (17 days)  
**Status:** Planning phase

---

### [KNOWN_GAPS.md](./KNOWN_GAPS.md)
**What's not addressed yet?**

- 11 unaddressed gaps (prioritized)
- Design trade-offs & rationale
- Risk register
- Feature request template
- How to contribute

**Key Takeaway:** Low-priority items deferred; core gaps addressed in Phase 1 or Phase 2.

---

## Quick Status

| Phase | Status | Version | Date |
|-------|--------|---------|------|
| Phase 1 | Complete | 3.0.0 | 2026-04-02 |
| Phase 2 | In Progress | 3.1.0 | Q2 2026 (~3 weeks) |
| Phase 3+ | Future | 3.2.0+ | TBD |

---

## Phase 1 Summary (Completed)

**6 Features Implemented:**
1. ✅ Input validation (Zod + JSON schemas)
2. ✅ Structured error handling (retry guidance)
3. ✅ Resource metadata (token cost, cacheability, rate limits)
4. ✅ Tool organization (6 categories + dependency resolver)
5. ✅ Retry & backoff logic
6. ✅ Claude documentation (3 guides)

**1 Partially Implemented:**
- Schema examples (Zod provides type safety; examples deferred)

**1 Deferred to Phase 2:**
- Pagination builders (complex, depends on implementation strategy)

**Quality:** Production-ready. No known critical issues.

---

## Phase 2 Overview (Planned)

### Top Priority
1. **Pagination Builders** (2 days remaining) -- PARTIAL
   - PHP API now supports cursor pagination (`?cursor=`) and Spatie QueryBuilder (`?filter[]`, `?sort=`)
   - MCP server tool handlers still need to pass pagination params to the API
   - Async iterator + streaming support: not started

2. **Rate Limiting Middleware** (3 days) -- DONE
   - MCP server: in-memory throttling via p-queue
   - PHP API: 3-tier throttle (120/60/20 per min) via Laravel RateLimiter
   - Laravel's `throttle` middleware automatically emits `X-RateLimit-*` and `Retry-After` headers

### Secondary Priority
3. **Response Caching** (3 days) -- PARTIAL
   - TTL-based caching via lru-cache
   - Retry logic via p-retry
   - Per-category invalidation rules: not started
   - Optional webhook support: not started

4. **Enhanced Examples** (3 days)
   - Schema examples in OpenAPI
   - Interactive Swagger UI
   - Use case tutorials

5. **Observability** (4 days)
   - OpenTelemetry integration
   - Health checks endpoint
   - Prometheus metrics export

**Total Effort:** ~17 days (3 weeks)

---

## Known Gaps

### Currently Addressed
- [x] Input validation
- [x] Error handling
- [x] Resource metadata
- [x] Tool organization
- [x] Documentation
- [x] Rate limiting (p-queue)
- [~] Response caching (TTL-based via lru-cache; full invalidation not done)
- [x] Retry logic (p-retry)

### Phase 2 Roadmap (remaining)
- [~] Pagination builders (PHP API done; MCP server tool handlers need update)
- [~] Full cache invalidation (PHP API has Redis tags; MCP per-category rules pending)
- [ ] Schema examples
- [ ] Observability

### Future Consideration
- [ ] Distributed rate limiting (Redis)
- [ ] Streaming via SSE
- [ ] GraphQL query layer
- [ ] Request compression
- [ ] Batch operations (Firefly limitation)
- [ ] Webhooks (Firefly feature)
- [ ] Audit logging (external service)
- [ ] Multi-tenant support (architectural)

**See [KNOWN_GAPS.md](./KNOWN_GAPS.md) for details.**

---

## How to Use This Roadmap

### For Users
1. Read [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) to understand Phase 1
2. Check [KNOWN_GAPS.md](./KNOWN_GAPS.md) to see what's not covered
3. Monitor [PHASE_2_ROADMAP.md](./PHASE_2_ROADMAP.md) for upcoming features

### For Contributors
1. Test Phase 1 enhancements
2. Report gaps using template in [KNOWN_GAPS.md](./KNOWN_GAPS.md)
3. Submit PRs for Phase 2 items (when planning begins)
4. Help with observability, testing, documentation

---

## Key Metrics

**Phase 1:**
- 8 gaps identified
- 6 fully addressed
- 1 partially addressed (examples)
- 1 deferred (pagination)
- 0 critical issues

**Phase 2 Progress:**
- Rate limiting: done (MCP: p-queue + PHP API: 3-tier throttle)
- Response caching: partial (MCP: lru-cache TTL; PHP API: Redis with tag-based invalidation)
- Retry logic: done (p-retry)
- Pagination builders: partial (PHP API: cursor pagination + QueryBuilder; MCP tool handlers: not started)
- Observability: not started
- Enhanced examples: not started

**Code Quality:**
- [x] No breaking changes
- [x] Backward compatible
- [x] Type-safe (Zod)
- [x] Well-documented
- [x] 4 unit tests passing (vitest)

---

## Questions?

- **Phase 1 features** → See [CLAUDE_INTEGRATION.md](../CLAUDE_INTEGRATION.md) + [ENHANCEMENTS.md](../ENHANCEMENTS.md)
- **Phase 2 plans** → See [PHASE_2_ROADMAP.md](./PHASE_2_ROADMAP.md)
- **Known gaps** → See [KNOWN_GAPS.md](./KNOWN_GAPS.md)
- **Implementation details** → See [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)

---

**Document Version:** 1.2  
**Last Updated:** April 5, 2026  
**Next Review:** Q2 2026 (Phase 2 completion)
