# Roadmap & Status

## Documents

### [CHANGELOG.md](../changelog/CHANGELOG.md)
Single source of truth for all completed work — Phase 1 features, Phase 2 infrastructure, bug fixes, and dependency changes.

### [PHASE_2_ROADMAP.md](./PHASE_2_ROADMAP.md)
Phase 2 completion summary (pagination, rate limiting, cache invalidation). Deferred items listed with links to KNOWN_GAPS.md.

### [KNOWN_GAPS.md](./KNOWN_GAPS.md)
Open gaps for Phase 3: distributed rate limiting, streaming, GraphQL, compression. Includes design trade-offs and risk register.

### [BACKLOG.md](../BACKLOG.md)
Tracked issues with priority and status. 40/42 complete, 1 deferred, 1 open.

---

## Quick Status

| Phase | Status | Date |
|-------|--------|------|
| Phase 1 | Complete | 2026-04-02 |
| Phase 2 | Complete | 2026-04-05 |
| Phase 3 | Planned | TBD |

---

## Phase Summary

**Phase 1** — Claude ecosystem foundation: Zod validation, structured errors, resource metadata (12/66 tools), tool organization (6 categories), retry/backoff, documentation. 7/8 gaps closed; schema examples deferred.

**Phase 2** — Transport-level resilience: cursor/offset pagination in all list tools, per-tool rate limiting (p-queue), LRU response cache with per-category write invalidation. PHP API: 3-tier throttle, Redis tag-based cache, cursor pagination, Spatie QueryBuilder.

**Phase 3** — Planned: distributed rate limiting (Redis), NDJSON streaming, enhanced schema examples, observability (OTEL/Prometheus), request compression, optional GraphQL.

---

## For Contributors

1. Check [CHANGELOG.md](../changelog/CHANGELOG.md) for what's been done
2. Check [KNOWN_GAPS.md](./KNOWN_GAPS.md) for open gaps
3. Report new gaps using the template in KNOWN_GAPS.md
4. Run `npm test` before submitting PRs

---

**Last Updated:** April 5, 2026
