# Claude Ecosystem Integration Guide

Enhanced Firefly III MCP Server with native Claude support.

## Features

### 1. **Zod-Based Validation** (`src/validation.js`)
- Runtime input validation with descriptive error messages
- Auto-generated JSON schemas for MCP/OpenAPI
- Reusable validators (date ranges, accounts, transactions, etc.)
- `ValidationError` class with structured field-level feedback

**Usage:**
```javascript
import { validators, createValidatedHandler } from './src/validation.js';

const handler = createValidatedHandler(validators.account, async (args) => {
  // args is guaranteed valid
  return await createAccount(args);
});
```

### 2. **Structured Error Handling** (`src/errors.js`)
- Meaningful error codes (`RATE_LIMITED`, `TIMEOUT`, `AUTHENTICATION_FAILED`, etc.)
- Automatic retry guidance with suggested delays
- Context preservation without leaking sensitive data
- Axios interceptor wrapper for Firefly API errors

**Error Response Format:**
```json
{
  "isError": true,
  "code": "RATE_LIMITED",
  "message": "Rate limit exceeded",
  "retry": {
    "isRetryable": true,
    "suggestedDelayMs": 5000,
    "guidance": "Firefly III rate limit exceeded. Wait 5 seconds before retrying."
  }
}
```

### 3. **Resource Metadata** (`src/resource-metadata.js`)
Per-tool metadata for Claude context awareness:
- **estimatedTokens**: Approximate token cost
- **cacheable**: Can Claude cache this result?
- **cacheMaxAge**: How long is it valid (seconds)?
- **rateLimit**: Rate limits per minute
- **resultSize**: `minimal`, `small`, `medium`, `large`
- **dependencies**: Other tools required first
- **notes**: Usage guidance

**Example Metadata:**
```javascript
get_net_worth_summary: {
  estimatedTokens: 500,
  cacheable: true,
  cacheMaxAge: 600, // 10 min
  rateLimit: { perMinute: 10 },
  resultSize: 'medium',
  notes: 'Computation-heavy; avoid frequent calls',
}
```

**API Functions:**
```javascript
// Get hints for a tool
const hint = getResourceHint('get_net_worth_summary');
// { name, estimatedTokens, cacheable, hints: [...] }

// Estimate cost given input
const cost = estimateTokenCost('list_transactions', { limit: 100 });

// Resolve dependencies
const resolved = resolveDependencies(['update_transaction']);
// ['get_transaction', 'list_accounts', 'update_transaction']

// Categorize tools
getToolsByCategory('budgets');
// ['list_budgets', 'get_budget', 'create_budget', ...]
```

### 4. **Tool Grouping** (`src/resource-metadata.js`)
Tools organized by domain:
- **transactions**: CRUD + search operations
- **accounts**: Account management
- **budgets**: Budget and limit operations
- **analytics**: Reporting and insights (high-token)
- **automation**: Rules, webhooks
- **system**: Metadata operations

Use for context switching or workflow planning.

## Integration Points

### Enhanced Index (`index.enhanced.js`)
- ES module syntax (modern Node.js)
- Enriched tool metadata in responses
- Token cost estimation in every call
- Improved error formatting
- Tool dependency resolver endpoint
- Metadata endpoint for Claude discovery

### REST API Endpoints

#### List Tools with Metadata
```bash
GET /tools/metadata
```

Response includes category, resource hints, cacheability for each tool.

#### Resolve Tool Dependencies
```bash
POST /tools/resolve-dependencies
Content-Type: application/json

{ "toolNames": ["update_transaction", "create_budget"] }
```

#### OpenAPI with Claude Extensions
```bash
GET /openapi.json
```

Includes `x-claude-hints` and `x-claude` extensions for tool discovery.

## Usage Patterns

### Pattern 1: Avoid High-Token Operations
```javascript
// Check token cost before executing
const cost = estimateTokenCost('get_spending_summary', {
  start: '2026-01-01',
  end: '2026-12-31'
});

if (cost > 800) {
  // Suggest narrowing date range or using different tool
  console.warn('This may exceed token budget. Consider filtering.');
}
```

### Pattern 2: Cache-Aware Queries
```javascript
// Metadata tells Claude what to cache
const meta = getResourceHint('list_accounts');
// Returns: cacheable=true, cacheMaxAge=300

// Claude can avoid re-fetching for 5 minutes
```

### Pattern 3: Workflow Optimization
```javascript
// Resolve dependencies to plan optimal order
const tools = ['create_split_transaction', 'create_budget'];
const resolved = resolveDependencies(tools);

// Execute in dependency order
// [create_budget, create_split_transaction]
```

### Pattern 4: Rate Limit Awareness
```javascript
// Check rate limits before batch operations
const hint = getResourceHint('create_transaction');
// { rateLimit: { perMinute: 20 } }

// Plan batch: max 20 creates per minute
```

## File Structure

```
mcp-server/
├── index.enhanced.js          # Enhanced MCP server (ES modules)
├── src/
│   ├── config.js              # (existing) Firefly config
│   ├── validation.js           # NEW: Zod validators
│   ├── errors.js               # NEW: Structured error handling
│   ├── resource-metadata.js    # NEW: Tool metadata & hints
│   └── tools/                  # (existing) Tool modules
├── CLAUDE_INTEGRATION.md       # This file
└── package.json                # Added: zod, zod-to-json-schema
```

## Migration Path

### For Claude Projects
1. Use `index.enhanced.js` instead of `index.js`
2. Import validation schemas for tool input safety
3. Check tool metadata before executing expensive operations
4. Handle `FireflyError` types for intelligent retry logic

### For Custom Integrations
```javascript
import { formatErrorResponse, wrapFireflyError } from './src/errors.js';
import { getResourceHint, estimateTokenCost } from './src/resource-metadata.js';

try {
  const result = await tool.handler(args);
} catch (error) {
  const formatted = formatErrorResponse(wrapFireflyError(error));
  console.log(formatted);
  // { isError: true, code: '...', retry: {...} }
}
```

## Best Practices

✅ **DO:**
- Check `estimatedTokens` for expensive operations
- Use `resolveDependencies()` when building workflows
- Leverage `resourceMetadata.cacheable` for caching decisions
- Respect rate limits indicated in metadata
- Use validation schemas for input safety

❌ **DON'T:**
- Ignore token cost estimates
- Call rate-limited tools in tight loops (e.g., `get_net_worth_summary`)
- Assume all results fit in context; check `resultSize`
- Skip validation—let Zod catch errors early
- Cache non-cacheable operations

## Performance Tuning

### Token Budget
```javascript
// Estimate and plan
const tools = ['list_transactions', 'get_spending_summary'];
const totalCost = tools.reduce((sum, t) => sum + estimateTokenCost(t), 0);
if (totalCost > 1000) {
  // Warn or split across multiple requests
}
```

### Rate Limiting
```javascript
// Respect per-minute limits
const meta = getResourceHint('create_transaction');
// Can execute max 20 per minute
// Space calls 3000ms apart for safety
```

### Caching
```javascript
// Cache results for duration
if (meta.cacheable) {
  cache.set(key, result, meta.cacheMaxAge * 1000);
}
```

## Troubleshooting

### "Rate limit exceeded"
- Error code: `RATE_LIMITED`
- Check metadata for `rateLimit.perMinute`
- Use suggested `retryDelayMs` (usually 5000ms)

### "Large responses"
- Check `resultSize` in metadata
- Reduce `limit` parameter for list operations
- Use pagination/filtering

### "High token cost"
- Tool's `estimatedTokens` > budget
- Narrow time ranges or add filters
- Use cheaper alternative if available

### "Missing dependencies"
- Tool requires other tools first
- Call `resolveDependencies()` to get execution order
- Example: updating transaction requires fetching it first
