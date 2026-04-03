# Phase 2 Roadmap — Pagination, Rate Limiting & Beyond

**Planned:** Q2 2026  
**Target Version:** 3.2.0  
**Status:** Planning phase

---

## Overview

Phase 1 established the Claude ecosystem foundation. Phase 2 focuses on operational robustness:

1. **Pagination builders** — Handle large result sets efficiently
2. **Rate limiting middleware** — Optional throttling with metrics
3. **Cache invalidation** — Smart invalidation rules per tool
4. **Enhanced examples** — Discoverability improvements
5. **Observability** — Metrics, traces, health checks

---

## 1. Pagination Builders

### Problem
Large responses (e.g., `get_spending_summary` over 12 months) can:
- Exceed Claude's token budget
- Cause timeouts
- Miss context due to truncation

### Solution
Pagination builders that handle pagination transparently:

```javascript
import { createPaginator } from './src/pagination.js';

// Option A: Auto-paginate with callback
const paginator = createPaginator('list_transactions', {
  filters: { start_date: '2026-01-01' },
  pageSize: 100,
  onPage: (items) => {
    console.log(`Got ${items.length} items`);
    // Process batch
  }
});

await paginator.paginate();

// Option B: Async iterator
for await (const batch of paginator) {
  // Handle batch (100 items at a time)
  // Can stop early without fetching all pages
}

// Option C: Streaming response
const stream = createPageStream('list_transactions', {...});
res.set('Content-Type', 'application/x-ndjson');
stream.pipe(res);  // One JSON per line
```

### Design Details

#### Tool Classification
```javascript
// Tools need pagination strategy
pageable: {
  'list_transactions': {
    strategy: 'limit_offset',
    defaultPageSize: 100,
    maxPageSize: 500,
    totalCountField: 'meta.total', // ← helps estimate
  },
  'list_accounts': {
    strategy: 'limit_offset',
    defaultPageSize: 50,
    maxPageSize: 200,
  },
  // Tools without pagination
  'get_account': { strategy: 'none' },
  'create_transaction': { strategy: 'none' },
}
```

#### Pagination Strategies
```javascript
// Firefly uses limit/offset for most endpoints
{
  type: 'limit_offset',
  params: { limit: 100, offset: 0 },
  next: { offset: offset + limit },
  hasMore: (response) => response.data.length === limit,
}

// Some endpoints use cursor-based
{
  type: 'cursor',
  params: { limit: 100, after: null },
  next: { after: response.meta.cursor },
  hasMore: (response) => response.meta.has_more,
}
```

### Implementation Plan

```javascript
// File: src/pagination.js

export class Paginator {
  constructor(toolName, options) {
    this.toolName = toolName;
    this.strategy = getPaginationStrategy(toolName);
    this.pageSize = options.pageSize || this.strategy.defaultPageSize;
    this.filters = options.filters;
    this.maxPages = options.maxPages || Infinity;
    this.onPage = options.onPage;
  }

  async paginate() {
    let params = this.strategy.initialParams;
    let pageNum = 0;

    while (pageNum < this.maxPages) {
      const response = await callTool(this.toolName, {
        ...this.filters,
        limit: this.pageSize,
        ...params,
      });

      const items = response.data || response;
      if (this.onPage) this.onPage(items, pageNum);

      if (!this.strategy.hasMore(response)) break;

      params = this.strategy.next(params, response);
      pageNum++;
    }
  }

  async *[Symbol.asyncIterator]() {
    let params = this.strategy.initialParams;

    while (true) {
      const response = await callTool(this.toolName, {
        ...this.filters,
        limit: this.pageSize,
        ...params,
      });

      const items = response.data || response;
      yield items;

      if (!this.strategy.hasMore(response)) break;
      params = this.strategy.next(params, response);
    }
  }
}

export function createPageStream(toolName, options) {
  // Returns Node.js stream for piping to HTTP response
  return new PaginationStream(toolName, options);
}
```

### REST API Integration

```javascript
// NEW: /api/{toolName}?_stream=true
// Returns NDJSON (one JSON object per line)
GET /api/list_transactions?_stream=true&start_date=2026-01-01

# Output:
{"id":"1","date":"2026-01-01",...}
{"id":"2","date":"2026-01-02",...}
...

// NEW: Pagination metadata in response
GET /api/list_transactions?limit=100&offset=0
{
  "data": [...],
  "_pagination": {
    "limit": 100,
    "offset": 0,
    "total": 5000,
    "hasMore": true,
    "nextOffset": 100,
    "totalPages": 50,
    "estimatedTokens": 15000  // Total for all pages
  }
}
```

### Testing Strategy
- [ ] Mock Firefly with large datasets (10k+ records)
- [ ] Test memory usage with streaming
- [ ] Verify offset/cursor calculation
- [ ] Edge cases (empty results, single page)

### Effort Estimate
- Design: 1 day
- Implementation: 2 days
- Testing: 1 day
- **Total: 4 days**

---

## 2. Rate Limiting Middleware

### Problem
Metadata indicates limits, but server doesn't enforce them. Claude might hammer API.

### Solution
Optional in-memory rate limiter (single-instance) with metrics:

```javascript
import { createRateLimiter } from './src/rate-limiting.js';

const limiter = createRateLimiter({
  mode: 'sliding_window',
  defaultPerMinute: 30,
  toolOverrides: {
    'create_transaction': { perMinute: 20 },
    'get_net_worth_summary': { perMinute: 10 },
  },
  onLimitExceeded: (tool, remaining) => {
    console.warn(`Rate limit for ${tool}: ${remaining}ms wait`);
  }
});

// Apply middleware
app.use('/api/:tool', limiter.middleware());

// Get metrics
const stats = limiter.getStats('create_transaction');
// { requests: 18, limit: 20, windowMs: 60000, resetAt: ... }
```

### Design Details

#### Sliding Window Counter
```javascript
// Most accurate for per-minute limits
{
  create_transaction: {
    requests: [t1, t2, ..., t18],  // timestamps in last 60s
    limit: 20,
    window: 60000, // 1 minute
  }
}
```

#### Token Bucket Alternative
```javascript
// Better for burst handling
{
  tool: {
    tokens: 15,      // Available tokens
    capacity: 20,    // Max tokens
    refill: 20,      // Tokens per minute
    lastRefill: t    // Last refill time
  }
}
```

**Recommendation:** Use sliding window (simpler, no burst complexity).

#### Configuration
```javascript
// defaults.js
const rateLimits = {
  // From resource-metadata.js
  'list_transactions': 30,
  'create_transaction': 20,
  'get_net_worth_summary': 10,
  // ... all other tools
};

// Configurable per deployment
const overrides = process.env.RATE_LIMIT_OVERRIDES
  ? JSON.parse(process.env.RATE_LIMIT_OVERRIDES)
  : {};
```

#### HTTP Response Headers
```
HTTP/1.1 200 OK
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 15
X-RateLimit-Reset: 1743667200

HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1743667260
Retry-After: 60
```

### Limitations
- **Single-instance only** — Distributed deployments need Redis
- **Memory-based** — Lost on restart (acceptable for MVP)
- **No persistence** — Use external storage for multi-instance

### Testing Strategy
- [ ] Verify counter increments correctly
- [ ] Test window reset
- [ ] Concurrent requests
- [ ] Header calculation

### Effort Estimate
- Design: 1 day
- Implementation: 1 day
- Testing: 1 day
- **Total: 3 days**

---

## 3. Cache Invalidation

### Problem
Metadata indicates what's cacheable, but no strategy for invalidation.

### Solution
Per-category invalidation rules + optional webhooks:

```javascript
// src/cache-invalidation.js

const invalidationRules = {
  // Transactions change frequently
  transactions: {
    invalidateOn: ['create_transaction', 'update_transaction', 'delete_transaction'],
    includes: ['list_transactions', 'search_transactions', 'get_spending_summary'],
    ttl: 60, // Short TTL
  },
  
  // Accounts change less often
  accounts: {
    invalidateOn: ['create_account', 'update_account', 'delete_account'],
    includes: ['list_accounts', 'get_account', 'get_net_worth_summary'],
    ttl: 300,
  },
  
  // Budgets change occasionally
  budgets: {
    invalidateOn: ['create_budget', 'update_budget', 'delete_budget', 'create_budget_limit'],
    includes: ['list_budgets', 'get_budget'],
    ttl: 180,
  },
};

// Usage
const cache = createCacheLayer();

// Invalidate on write
await tool.handler(args);
cache.invalidate('transactions');  // Clears related entries

// Check before read
if (cache.has('list_accounts')) {
  return cache.get('list_accounts');
}
```

### Design Details

#### Cache Key Generation
```javascript
// tool + params = key
const cacheKey = generateKey('list_transactions', {
  start_date: '2026-01-01',
  limit: 100,
});
// → 'list_transactions:start_date=2026-01-01&limit=100'
```

#### Invalidation Rules
```javascript
// Mutation triggers invalidation
create_transaction
  ↓
invalidate(['list_transactions', 'search_transactions', 'get_spending_summary'])
  ↓
Clears cache for dependent queries
```

#### Optional Webhook
```javascript
// POST /webhooks/invalidate
{
  "category": "transactions",
  "timestamp": "2026-04-02T12:34:56Z"
}

// Manual invalidation without code changes
```

### Testing Strategy
- [ ] Verify invalidation timing
- [ ] Cache hit/miss rates
- [ ] Memory usage
- [ ] Concurrent invalidation

### Effort Estimate
- Design: 1 day
- Implementation: 1 day
- Testing: 1 day
- **Total: 3 days**

---

## 4. Enhanced Examples

### Problem
Schemas lack concrete examples for discoverability.

### Solution
Add examples to Zod schemas → auto-export to OpenAPI:

```javascript
// src/validation.js

export const validators = {
  createTransaction: z.object({
    type: z.enum(['withdrawal', 'deposit', 'transfer'])
      .describe('Transaction type')
      .example('withdrawal'),
    amount: z.number().positive()
      .describe('Amount in cents')
      .example(5000),
    date: z.string().date()
      .describe('Transaction date (YYYY-MM-DD)')
      .example('2026-04-02'),
    description: z.string().optional()
      .describe('Transaction memo')
      .example('Groceries at Whole Foods'),
  }),
};

// Auto-exports to OpenAPI
GET /openapi.json
{
  "paths": {
    "/create_transaction": {
      "requestBody": {
        "schema": {
          "properties": {
            "type": {
              "type": "string",
              "enum": ["withdrawal", ...],
              "example": "withdrawal"
            },
            ...
          }
        }
      }
    }
  }
}
```

### Interactive Documentation
```javascript
// NEW: /docs endpoint with Swagger UI
GET /docs
→ Interactive OpenAPI explorer with examples
```

### Use Case Tutorials
```markdown
# Use Cases

## 1. Record a Coffee Purchase
GET /api/create_transaction
{
  "type": "withdrawal",
  "amount": 500,
  "date": "2026-04-02",
  "description": "Coffee at Starbucks"
}

## 2. Create a Monthly Budget
GET /api/create_budget
{
  "name": "Groceries",
  "period": "monthly",
  "amount": 50000
}
```

### Testing Strategy
- [ ] Verify examples in OpenAPI
- [ ] Test Swagger UI rendering
- [ ] Tutorial accuracy

### Effort Estimate
- Examples: 1 day
- Swagger UI: 1 day
- Tutorials: 1 day
- **Total: 3 days**

---

## 5. Observability

### Problem
No visibility into usage, performance, errors.

### Solution
Metrics, traces, and health checks:

```javascript
// src/observability.js

import { metrics, traces } from '@opentelemetry/api';

const toolDuration = metrics.createHistogram('tool_execution_duration_ms');
const toolErrors = metrics.createCounter('tool_errors_total');
const cacheHits = metrics.createCounter('cache_hits_total');

// In handler
const span = traces.startSpan(`tool:${toolName}`);
const start = Date.now();

try {
  const result = await tool.handler(args);
  toolDuration.record(Date.now() - start, { tool: toolName });
} catch (error) {
  toolErrors.add(1, { tool: toolName, code: error.code });
  span.recordException(error);
}
```

#### Health Check Endpoint
```bash
GET /health
{
  "status": "healthy",
  "firefly": "connected",
  "uptime": 3600,
  "errors_1m": 2,
  "rps": 45.5
}
```

#### Metrics Export
```bash
GET /metrics  # Prometheus format
tool_execution_duration_ms_bucket{tool="list_transactions",le="100"} 45
tool_errors_total{tool="create_transaction",code="RATE_LIMITED"} 3
cache_hits_total{tool="list_accounts"} 1200
```

### Effort Estimate
- OpenTelemetry integration: 2 days
- Health checks: 1 day
- Metrics export: 1 day
- **Total: 4 days**

---

## Summary

| Feature | Effort | Priority | Depends On |
|---------|--------|----------|-----------|
| Pagination | 4 days | P0 | None |
| Rate Limiting | 3 days | P1 | None |
| Cache Invalidation | 3 days | P1 | Pagination (optional) |
| Enhanced Examples | 3 days | P2 | Zod schemas |
| Observability | 4 days | P2 | None |

**Total Phase 2 Effort:** ~17 days (3 weeks)

### Recommended Timeline
1. **Week 1:** Pagination builders (most impactful)
2. **Week 2:** Rate limiting + cache invalidation
3. **Week 3:** Examples + observability

---

## Success Criteria

- [ ] Pagination handles 100k+ record sets without token overflow
- [ ] Rate limiter prevents abuse (< 1 request over limit in tests)
- [ ] Cache invalidation accuracy > 99%
- [ ] Examples improve discoverability (survey Claude users)
- [ ] Observability captures > 95% of errors
- [ ] All tests passing
- [ ] Performance benchmarks maintained (< 5% overhead)

---

## Open Questions

1. **Should rate limiting be enforced by default?** → Propose: optional (feature flag)
2. **Redis support in Phase 2 or later?** → Propose: Phase 3 for distributed
3. **Streaming protocol (Server-Sent Events vs NDJSON)?** → NDJSON preferred (simpler)
4. **Cache backend (memory vs Redis)?** → Memory in Phase 2; Redis in Phase 3

---

## Document Version
1.0 | April 2, 2026 | Planning phase
