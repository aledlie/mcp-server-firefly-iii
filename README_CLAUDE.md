# Firefly III MCP Server — Claude-Enhanced Edition

Production-ready MCP server for Firefly III with native Claude AI support.

**Key Features:**
- **Zod validation** — Type-safe input handling
- **Structured errors** — Retry guidance & context
- **Resource metadata** — Token cost awareness
- **Tool organization** — Workflow optimization
- **REST + SSE APIs** — Web-ready deployment

## Quick Start

### Install
```bash
npm install
```

### Run Enhanced Server
```bash
# Stdio mode (for Claude)
npm run start:enhanced

# Web mode with REST API
npm run start:web  # http://localhost:3000
```

### Environment
```bash
FIREFLY_URL=http://localhost:8000
FIREFLY_TOKEN=your_token_here
PORT=3000  # Optional; omit for stdio mode
```

## For Claude Users

### Get Tool Metadata
```bash
curl http://localhost:3000/tools/metadata
```

Response includes token costs, caching policy, rate limits per tool.

### Resolve Dependencies
```bash
curl -X POST http://localhost:3000/tools/resolve-dependencies \
  -H "Content-Type: application/json" \
  -d '{"toolNames": ["create_split_transaction"]}'
```

Returns optimal execution order with dependencies.

### OpenAPI Spec
```bash
curl http://localhost:3000/openapi.json | jq '.x-claude'
```

Includes Claude-specific hints and resource metadata.

### Call a Tool
```bash
curl -X POST http://localhost:3000/api/list_accounts \
  -H "Content-Type: application/json" \
  -d '{"type": "asset"}'
```

Response includes estimated token cost:
```json
{
  "data": {...},
  "_claude": {
    "estimatedTokens": 150,
    "cached": true
  }
}
```

## Documentation

- **CLAUDE_INTEGRATION.md** — Usage patterns & best practices
- **ENHANCEMENTS.md** — Technical details & changes
- **docs/API.md** — Complete tool reference

## Architecture

```
src/
├── validation.js          Zod schemas + validators
├── errors.js              Structured error handling
├── resource-metadata.js   Tool metadata & hints
├── tools/                 Tool implementations (12 modules)
└── config.js              Firefly config & auth

index.enhanced.js          Main MCP server (ES modules)
```

## Error Handling

All errors follow this structure:

```json
{
  "isError": true,
  "code": "RATE_LIMITED",
  "message": "Rate limit exceeded",
  "context": {...},
  "retry": {
    "isRetryable": true,
    "suggestedDelayMs": 5000,
    "guidance": "Wait before retrying"
  }
}
```

Retry codes: `RATE_LIMITED`, `TIMEOUT`, `NETWORK`, `TEMP_UNAVAILABLE`

## Tool Categories

| Category | Tools | Token Cost |
|----------|-------|-----------|
| transactions | 7 | 100–600 |
| accounts | 5 | 100–200 |
| budgets | 8 | 100–400 |
| **analytics** | 4 | **500–800** |
| automation | 10 | 150–400 |
| system | 5 | 100–200 |

*Analytics tools are computation-heavy; use sparingly.*

## Performance Tips

1. **Check token budget** — Use `estimateTokenCost()`
2. **Cache when possible** — Metadata indicates cacheable operations
3. **Respect rate limits** — Max requests per minute indicated
4. **Resolve dependencies** — Get optimal execution order
5. **Narrow results** — Use filters and pagination

## Rate Limits

Default per-minute limits (from metadata):

| Tool | Limit |
|------|-------|
| `get_net_worth_summary` | 10 |
| `get_spending_summary` | 10 |
| `create_transaction` | 20 |
| Others | 20–60 |

See `/tools/metadata` for full limits.

## Caching Strategy

Claude can cache results based on metadata:

```
Cacheable operations:
- list_accounts (5 min)
- list_budgets (5 min)
- get_about (1 hour)

Non-cacheable (mutations):
- create_transaction
- update_account
- delete_budget
```

## Troubleshooting

### "Rate limit exceeded"
```json
{
  "code": "RATE_LIMITED",
  "retry": {"suggestedDelayMs": 5000}
}
```
→ Wait 5 seconds, retry

### "Large response"
```
"resultSize": "large"
```
→ Add filters or reduce `limit` parameter

### "Token budget exceeded"
```
"estimatedTokens": 1200
```
→ Plan query better or use cheaper alternative

## License

MIT

---

**Version:** 3.0.0  
**Base:** fabianonetto/mcp-server-firefly-iii  
**Last Updated:** April 2026
