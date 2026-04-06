# Known Gaps & Future Considerations

**Document Date:** April 3, 2026  
**Status:** Living document — updated as gaps are discovered

---

## Completed (Phase 2)

All high-priority Phase 2 gaps resolved. Full details in [`docs/changelog/CHANGELOG.md`](../changelog/CHANGELOG.md).

| # | Gap | Resolution | Key Files |
|---|-----|------------|-----------|
| 1 | Pagination for large result sets | Cursor/offset pagination wired into all list tools; PHP API cursor endpoints | `src/pagination.js`, `src/tools/*.js` |
| 2 | Rate limit enforcement | Client-side p-queue + server-side Laravel 3-tier throttle | `src/rate-limiter.js`, `src/retry.js` |
| 3 | Cache invalidation strategy | Per-category write invalidation rules + PHP Redis tag-based cache | `src/response-cache.js` |

---

## Open Gaps

### Phase 3 — Medium Priority

#### 4. Distributed Rate Limiting (Redis)
**Gap:** In-memory rate limiter only works for single instance. Horizontal scaling causes cumulative limits to exceed API limits.

**Workaround:** Deploy behind API gateway with rate limiting (Nginx, Envoy, etc.)

**Planned Solution:** Redis-backed rate limiter  
**Effort:** 2 days  
**Blocked By:** None

---

#### 5. Streaming / Server-Sent Events (SSE)
**Gap:** Large responses transferred as single JSON blob, not streamed.

**Workaround:** Pagination + async iteration reduces payload size per request.

**Planned Solution:** NDJSON streaming endpoint  
**Effort:** 2 days  
**Blocked By:** None

---

#### 6. GraphQL Query Layer
**Gap:** REST API requires multiple round-trips for composite queries.

**Workaround:** Dependency resolver plans call sequences.

**Planned Solution:** Optional GraphQL endpoint  
**Effort:** 5+ days  
**Rationale:** Lower priority; REST + pagination sufficient

---

#### 7. Request/Response Compression
**Gap:** Large JSON responses not compressed (gzip, brotli).

**Workaround:** Axios handles HTTP compression transparently.

**Planned Solution:** Automatic compression  
**Effort:** 1 day  
**Impact:** Estimated 10-50% bandwidth reduction (varies by payload)

---

### Out of Scope

| # | Gap | Reason |
|---|-----|--------|
| 8 | Batch operations | Firefly API limitation |
| 9 | Webhooks for data changes | Firefly feature, not MCP server |
| 10 | Audit logging | Recommend application-level logging |
| 11 | Multi-tenant support | Architectural decision; run separate instances |

---

## Design Trade-Offs

- **Client-side caching and rate limiting:** Handler wrappers (not middleware) keep the server stateless for stdio mode. Trade-off: single-instance only.
- **No streaming in MVP:** Pagination achieves same benefit with simpler architecture.
- **No GraphQL:** REST + dependency resolver sufficient. GraphQL adds query parsing overhead.

---

## Risk Register

| Risk | Probability | Impact | Mitigation | Status |
|------|-------------|--------|------------|--------|
| Large result sets overflow token budget | Low | Claude can't use tools | Pagination module in all list handlers | Mitigated |
| Rate limit hammering | Low | API blocks requests | Per-tool fixed-window token bucket + exponential backoff | Mitigated (single-instance) |
| Cache staleness | Low | Outdated data | LRU + per-category write invalidation | Mitigated |
| Distributed deployment issues | Medium | Rate limit bypass; cache inconsistency | Redis support (Phase 3) | Tracked |

---

## Feature Request Template

```markdown
## Gap: [Title]

**Description:** What's missing?
**Current Limitation:** How does it affect users?
**Impact:** Functionality / Performance / Security / Usability
**Workaround:** Temporary solution?
**Proposed Solution:** How to fix?
**Effort Estimate:** Days/weeks?
**Priority:** P0 (blocks MVP) / P1 (valuable) / P2 (nice-to-have)?
```

---

## Document Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-02 | Initial gaps inventory |
| 1.1 | 2026-04-03 | Gap #2 implemented (client-side p-queue only); Gap #3 partially addressed; risks 2-3 mitigated |
| 1.2 | 2026-04-05 | Gap #1 partially addressed (PHP API cursor pagination). Gap #2 updated with PHP API 3-tier rate limiting. Gap #3 updated with PHP API Redis tag-based cache |
| 2.0 | 2026-04-05 | Phase 2 complete. Gaps #1, #2, #3 migrated to CHANGELOG.md. Document condensed; open gaps only |

---

**Last Updated:** April 5, 2026  
**Next Review:** After Phase 3 planning
