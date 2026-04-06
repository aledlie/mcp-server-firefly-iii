# Backlog: mcp-server Enhancement Layer Issues

**Updated:** 2026-04-03
**Source:** Hallucination-checker + GenAI Quality Monitor + lib-audit + Code Review
**Completed items:** See [docs/changelog/CHANGELOG.md](changelog/CHANGELOG.md)

---

## Summary

| Priority | Total | Done | Deferred | Open |
|----------|-------|------|----------|------|
| P0 | 11 | 11 | 0 | 0 |
| P1 | 9 | 8 | 1 | 0 |
| P2 | 15 | 14 | 0 | 1 |
| P3 | 8 | 7 | 0 | 1 |
| **Total** | **43** | **40** | **1** | **2** |

---

## Open Items

### Issue #38: Add Pino for Structured Logging

**Priority:** P2
**Files:** `src/config.js:31`, `src/resource-metadata.js:191`, `index.enhanced.js:51`, `index.enhanced.js:270-272`
**Source:** lib-audit
**Related:** ENHANCEMENTS.md:305

**Problem:**
All logging uses `console.error`/`console.warn` with no structure, no levels, and no way to filter. This blocks the observability Phase 2 items.

**Recommendation:**
```javascript
const pino = require('pino');
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
logger.warn({ tool: toolName }, 'No metadata registered (Phase 2)');
```

Pino is the fastest Node.js logger, outputs JSON, and is <100KB.

**Trade-off:** Adds a dependency. Payoff is structured logs that integrate with any log aggregator.

**Estimate:** 45 minutes

---

### Issue #35: Replace Express with Hono or built-in `node:http`

**Priority:** P3
**Files:** `index.js`, `index.enhanced.js`
**Source:** lib-audit

**Problem:**
Express v5 (4.3MB installed) is heavyweight for ~6 routes with JSON body parsing and no middleware chain.

**Recommendation:**
Replace with `hono` + `@hono/node-server` (14KB, zero-dependency, type-safe), or use built-in `node:http` directly since routing is simple enough.

```javascript
const { Hono } = require('hono');
const { serve } = require('@hono/node-server');
const app = new Hono();
app.get('/sse', (c) => { /* ... */ });
app.post('/messages', (c) => { /* ... */ });
serve({ fetch: app.fetch, port: PORT });
```

**Trade-off:** Express v5 is fine functionally -- this is a size/startup time optimization. Skip if middleware-heavy features are planned.

**Estimate:** 1-2 hours

---

## Deferred Items

### Issue #23: upload_attachment Tool Uses Wrong API Pattern

**Priority:** P1
**Source:** Code Review

**Problem:**
Tool likely passes base64 content as JSON. Firefly III requires binary multipart upload via `multipart/form-data`. Current pattern will be rejected by the API.

**Solution:** Implement multipart upload with `form-data` library or remove the tool until supported.

**Deferred:** Needs multipart design decision.

**Estimate:** 1 day

---

### Issue #29: No `additionalProperties: false` in Tool Schemas — ✅ Done

**Priority:** P2
**Source:** Code Review
**Resolution:** `lockdownSchema()` in `src/tools/registry.js` recursively applies `additionalProperties: false` to all tool schemas at registration time. Covers all 66 tools including nested objects.

---

## Recommended Priority Order

1. **#38** Pino structured logging (45min) -- enables Phase 2 observability
2. **#35** Replace Express with Hono (1-2hr) -- size optimization only
3. **#23** upload_attachment multipart (1 day) -- when multipart design is decided

---

## Completed Items Reference

39 issues completed across P0-P3. Full details with commits, problem descriptions, and solutions in [docs/changelog/CHANGELOG.md](changelog/CHANGELOG.md).

### Quick Reference (IDs only)

**P0 (11):** #1, #2, #3, #4, #15, #16, #17, #18, #19, #20, #21
**P1 (8):** #5, #6, #7, #8, #22, #24, #25
**P2 (14):** #9, #10, #11, #12, #26, #27, #28, #29, #32, #33, #36, #37, #39, #40
**P3 (7):** #13, #14, #30, #31, #34
