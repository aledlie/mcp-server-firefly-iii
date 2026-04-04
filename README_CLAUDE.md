# Firefly III MCP Server

Universal AI bridge for [Firefly III](https://github.com/firefly-iii/firefly-iii) personal finance management. Provides 66 tools across 6 categories with built-in validation, caching, rate limiting, and retry.

**Version:** 3.0.0
**Base:** [fabianonetto/mcp-server-firefly-iii](https://github.com/fabianonetto/mcp-server-firefly-iii)
**License:** MIT

## Supported Platforms

| Platform | Protocol | Connection |
|----------|----------|------------|
| Claude / Cursor | MCP (native) | stdio or SSE |
| Gemini CLI | MCP | stdio |
| ChatGPT | OpenAPI (Actions) | REST / JSON |
| Custom apps | REST API | HTTP |

## Quick Start

```bash
npm install

# Stdio mode (MCP clients)
npm start                  # Original server
npm run start:enhanced     # Enhanced server with metadata

# Web mode (REST + SSE)
npm run start:web          # http://localhost:3000
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREFLY_URL` | Yes | Firefly III instance URL |
| `FIREFLY_TOKEN` | Yes | API personal access token |
| `PORT` | No | Set to enable SSE/REST mode (default: stdio only) |
| `DEBUG` | No | Enable verbose request logging |
| `NODE_ENV` | No | Set `production` to suppress dev warnings |

## Architecture

```
index.js                   Original MCP server (stdio + SSE)
index.enhanced.js          Enhanced server with metadata, REST API, OpenAPI

src/
  config.js                Axios client, auth, Firefly connection
  validation.js            Zod schemas, validators, ValidationError
  errors.js                FireflyError, toMCPErrorResult, error codes
  resource-metadata.js     Per-tool metadata: tokens, cache, rate limits
  rate-limiter.js           Per-tool rate limiting (p-queue)
  response-cache.js        LRU response cache (lru-cache)
  retry.js                 Automatic retry with backoff (p-retry)
  tools/
    registry.js            Tool aggregation (shared by both entry points)
    accounts.js            Account CRUD (5 tools)
    transactions.js        Transaction CRUD + search (7 tools)
    budgets.js             Budget + limit management (8 tools)
    insights.js            Spending/income analytics (3 tools)
    automation.js          Rules, rule groups, webhooks (10 tools)
    system.js              About, preferences, users (5 tools)
    bills.js               Bill management
    recurring.js           Recurring transactions
    groups.js              Object groups
    admin.js               Data export, admin ops
    meta.js                Tags, categories, currencies
    core.js                Shared helpers
```

**Total:** 66 tools, 13 tool modules, ~1600 lines of source

## Tool Categories

| Category | Count | Token Cost | Description |
|----------|-------|-----------|-------------|
| transactions | 7 | 100-600 | CRUD, search, split transactions |
| accounts | 5 | 100-200 | Account management |
| budgets | 8 | 100-400 | Budgets and limits |
| analytics | 3 | 500-800 | Net worth, spending, income summaries |
| automation | 10 | 150-400 | Rules, rule groups, webhooks |
| system | 5 | 100-200 | About, preferences, users |

38 tools are categorized in `toolGroups`; 12 have full `resourceMetadata` entries (token estimates, cache hints, rate limit hints). Remaining tools return 0 from `estimateTokenCost()`.

## Key Capabilities

### Input Validation (`src/validation.js`)

Zod-powered runtime validation with auto JSON schema generation:

```javascript
const { validators, createValidatedHandler } = require('./src/validation.js');

const handler = createValidatedHandler(validators.account, async (args) => {
  return await createAccount(args);  // args guaranteed valid
});
```

Pre-built validators: `listParams`, `dateRange`, `createTransaction`, `account`, `budget`

### Error Handling (`src/errors.js`)

Structured error codes with context:

```javascript
const { toMCPErrorResult, wrapFireflyError } = require('./src/errors.js');

// In handler:
try {
  return await tool.handler(args);
} catch (error) {
  return toMCPErrorResult(error);
}
```

Error codes: `RATE_LIMITED`, `TIMEOUT`, `NOT_FOUND`, `VALIDATION_FAILED`, `SERVER_ERROR`, `CONNECTION_FAILED`, `DNS_ERROR`, `AUTHENTICATION_FAILED`, `UNKNOWN_ERROR`

### Rate Limiting (`src/rate-limiter.js`)

Per-tool enforcement via p-queue with sliding-window token buckets. One queue per rate tier (not per tool) for memory efficiency.

```javascript
const { rateLimited } = require('./src/rate-limiter.js');

const result = await rateLimited('create_transaction', () => handler(args));
// Queued if over 20/min limit; never rejected
```

Limits are driven by `rateLimitHint.perMinute` in `resourceMetadata`. Default: 30/min for uncatalogued tools.

| Tier | Tools |
|------|-------|
| 10/min | `get_net_worth_summary`, `get_spending_summary` |
| 20/min | `create_transaction`, `update_transaction` |
| 30/min | Default for uncatalogued tools |
| 60/min | `list_accounts`, `list_transactions` |

### Response Caching (`src/response-cache.js`)

LRU cache with per-tool TTLs from `resourceMetadata`. Mutations bypass the cache.

```javascript
const { cachedCall, invalidateCache } = require('./src/response-cache.js');

const result = await cachedCall('list_accounts', args, () => handler(args));
// Returns cached response if within TTL
```

| Operation | TTL | Cacheable |
|-----------|-----|-----------|
| `list_accounts` | 5 min | Yes |
| `list_budgets` | 5 min | Yes |
| `get_about` | 1 hour | Yes |
| `create_transaction` | -- | No (mutation) |

Max 500 entries; stale entries evicted automatically.

### Automatic Retry (`src/retry.js`)

Transport-level retry via p-retry with exponential backoff:

- Retries on: 408, 429, 500, 502, 503, 504, network errors
- Max 3 retries with exponential backoff (1s minimum)
- Respects `Retry-After` headers

### Resource Metadata (`src/resource-metadata.js`)

Per-tool metadata for AI planning:

```javascript
const { getResourceHint, estimateTokenCost, resolveDependencies, getToolsByCategory }
  = require('./src/resource-metadata.js');

getResourceHint('get_net_worth_summary');
// { name, estimatedTokens: 500, cacheable: true, hints: [...] }

estimateTokenCost('list_transactions', { limit: 100 });
// 350

resolveDependencies(['update_transaction']);
// ['list_accounts', 'get_transaction', 'update_transaction']

getToolsByCategory('analytics');
// ['get_net_worth_summary', 'get_spending_summary', ...]
```

## REST API (Enhanced Server)

Available when running `npm run start:web`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/tools/metadata` | GET | All tools with metadata, categories, hints |
| `/tools/resolve-dependencies` | POST | Resolve execution order for tool list |
| `/openapi.json` | GET | OpenAPI spec with `x-claude` extensions |
| `/api/{toolName}` | POST | Execute a tool via REST |
| `/sse` | GET | SSE transport for MCP clients |
| `/messages` | POST | MCP message handler (session-based) |

SSE connections use session-keyed routing. Multiple clients can connect simultaneously without interference.

## Testing

```bash
npm test    # vitest, 4 tests passing
```

Test runner: vitest. Mock adapter: axios-mock-adapter.

## Dependencies

### Runtime
- `@modelcontextprotocol/sdk` -- MCP protocol
- `axios` -- HTTP client for Firefly III API
- `express` -- REST/SSE server
- `better-sse` -- SSE transport
- `zod` + `zod-to-json-schema` -- Validation + schema generation
- `lru-cache` -- Response caching
- `p-queue` -- Rate limiting
- `p-retry` -- Retry with backoff
- `dotenv` -- Environment config

### Dev
- `vitest` -- Test runner
- `axios-mock-adapter` -- HTTP mocking for tests

## Documentation

| Document | Purpose |
|----------|---------|
| [CLAUDE_INTEGRATION.md](CLAUDE_INTEGRATION.md) | Usage patterns, best practices, code examples |
| [ENHANCEMENTS.md](ENHANCEMENTS.md) | Technical architecture, implementation details |
| [docs/API.md](docs/API.md) | Complete tool reference (all 66 tools) |
| [docs/PROMPTS.md](docs/PROMPTS.md) | Example prompts for AI interaction |
| [docs/USE_CASES.md](docs/USE_CASES.md) | Strategic financial workflow guides |
| [docs/TESTING.md](docs/TESTING.md) | Test guide |
| [docs/roadmap/](docs/roadmap/) | Implementation status, Phase 2 roadmap, known gaps |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Issue tracker with status |

## Current Status

**Phase 1:** Complete -- validation, errors, metadata, tool organization, documentation
**Phase 2:** In progress -- rate limiting (done), caching (done), retry (done), pagination (planned), observability (planned)

### Open Items
- Pagination builders for large result sets
- Structured logging (Pino)
- Per-category cache invalidation rules
- Observability (OTEL, health checks, metrics)
- Enhanced schema examples

See [docs/BACKLOG.md](docs/BACKLOG.md) for the full tracked list.

---

**Last Updated:** April 3, 2026
