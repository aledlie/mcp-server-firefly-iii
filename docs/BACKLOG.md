# Backlog: mcp-server Enhancement Layer Issues

**Report Date:** 2026-04-03  
**Source:** Hallucination-checker + GenAI Quality Monitor  
**Status:** All items pending  

---

## P0 — Critical (Blocks Functionality)

### Issue #1: Zod v4 API Breaking Change — ValidationError Constructor Crash

**File:** `src/validation.js:61`  
**Severity:** CRITICAL — Every validation failure throws `TypeError`

**Problem:**
```javascript
constructor(message, zodErrors) {
  // ...
  this.errors = zodErrors.map(e => ({  // ❌ zodErrors is ZodIssue[] in v4
    // ...
  }));
}
```

Zod v4 changed `ZodError.errors` to `ZodError.issues`. The field is `undefined`, causing:
```
TypeError: Cannot read properties of undefined (reading 'map')
```

**Solution:**
```javascript
constructor(message, zodErrors) {
  // ...
  this.errors = (zodErrors || []).map(e => ({
    field: e.path.join('.') || 'root',
    message: e.message,
    code: e.code,
  }));
}
```

**Acceptance Criteria:**
- [ ] ValidationError handles both v3 `error.errors` and v4 `error.issues`
- [ ] Test: `npm test` passes validation error scenario
- [ ] Test: Zod v4 validation failure does not crash handler

**Estimate:** 0.5 day

---

### Issue #2: Missing `src/tools/` Directory — Server Cannot Start

**File:** `index.enhanced.js:38-49`  
**Severity:** CRITICAL — Module import failures

**Problem:**
```javascript
const tools = {
  core: require('./src/tools/core.js'),      // ❌ Does not exist
  accounts: require('./src/tools/accounts.js'),
  transactions: require('./src/tools/transactions.js'),
  // ... 9 more missing modules
};
```

Directory `/Users/alyshialedlie/code/is-internal/firefly-finance/mcp-server/src/tools/` does not exist. Server fails on startup.

**Solution:** Either:
- **A)** Implement stub tool modules in `src/tools/` exporting tool definitions, OR
- **B)** Remove tool imports from `index.enhanced.js` and rely on upstream tool loading

**Decision Required:** Clarify whether tool organization is in-scope for Phase 1.

**Acceptance Criteria:**
- [ ] `npm run start:enhanced` succeeds without module-not-found errors
- [ ] Tool list endpoint returns non-empty array
- [ ] At least one tool is callable

**Estimate:** 1–3 days (depends on tool implementation scope)

---

### Issue #3: Mixed Module Syntax in `src/validation.js` — Fragile Import

**File:** `src/validation.js:10-119`  
**Severity:** CRITICAL — Incorrect module semantics

**Problem:**
```javascript
// Lines 10–68: ES module syntax
export const schemas = { ... };
export const validators = { ... };
export class ValidationError { ... }

// Line 113: CommonJS syntax
module.exports = {
  schemas,
  validators,
  ValidationError,
  createValidatedHandler,
  toMCPSchema,
};
```

Node.js CJS loader tolerates this because `export` is treated as undefined assignment. But this breaks if `"type": "module"` is added to `package.json`. Mixed syntax is fragile and incorrect.

**Solution:**
Replace all `export const` and `export class` with function/const definitions:
```javascript
const schemas = { ... };
const validators = { ... };
class ValidationError { ... }
function createValidatedHandler(schema, handler) { ... }
function toMCPSchema(zodSchema) { ... }

module.exports = {
  schemas,
  validators,
  ValidationError,
  createValidatedHandler,
  toMCPSchema,
};
```

**Acceptance Criteria:**
- [ ] No `export` keyword in file
- [ ] All symbols exported via `module.exports = {...}`
- [ ] `require('./src/validation.js')` works correctly
- [ ] `node -c src/validation.js` reports no syntax errors

**Estimate:** 0.25 day

---

### Issue #4: `resolveDependencies()` Returns Inverted Order

**File:** `src/resource-metadata.js:200-214`  
**Severity:** CRITICAL — Algorithmic bug

**Problem:**
```javascript
function resolveDependencies(toolNames) {
  const resolved = new Set();
  const queue = [...toolNames];

  while (queue.length > 0) {
    const tool = queue.shift();
    if (resolved.has(tool)) continue;

    const deps = resourceMetadata[tool]?.dependencies || [];
    queue.push(...deps);
    resolved.add(tool);  // ❌ Tool added BEFORE processing deps
  }

  return Array.from(resolved);
}
```

**Example failure:**
- Input: `['update_transaction']`
- Expected: `['list_accounts', 'get_transaction', 'update_transaction']` (deps first)
- Actual: `['update_transaction', 'list_accounts', 'get_transaction']` (dependent first)

This violates the documented contract: "Returns optimal execution order with dependencies" and will cause a Claude planner to attempt operations before their prerequisites.

**Solution:**
Implement topological sort or move the `resolved.add(tool)` to after processing dependencies.

**Acceptance Criteria:**
- [ ] `resolveDependencies(['update_transaction'])` returns dependencies before dependent
- [ ] All dependencies of each tool appear before the tool itself in output
- [ ] Test: `npm test` includes order validation for sample tool graphs
- [ ] Documentation examples match actual behavior

**Estimate:** 0.5 day

---

## P1 — High (Correctness / Trust)

### Issue #5: Fabricated "66 Tools Catalogued" Claim

**Files:** `docs/roadmap/IMPLEMENTATION_STATUS.md:45`, `ENHANCEMENTS.md:18`  
**Severity:** HIGH — Hallucination / misleading coverage claim

**Problem:**
```
"66 tools catalogued with verified metadata" ✅
"Covers all 66 tools"
```

**Actual state:**
- `resourceMetadata` object: 12 entries (`list_accounts`, `get_account`, `list_transactions`, `get_transaction`, `create_transaction`, `update_transaction`, `delete_transaction`, `list_budgets`, `create_budget`, `get_net_worth_summary`, `get_spending_summary`, `get_about`)
- `toolGroups` object: 39 tools total across 6 categories
- **Gap:** 27 tools have zero metadata entry (no token estimate, no cache hints, no rate limits)

**Solution:**
Correct all claims to reflect actual coverage:
- "12 core tools catalogued in resourceMetadata"
- "39 tools organized in 6 categories; 12 with metadata coverage (31%)"
- Add a note: "Tools without metadata entries return `null` from `getResourceHint()` and `0` tokens from `estimateTokenCost()`"

**Acceptance Criteria:**
- [ ] All "X tools catalogued" claims match actual `resourceMetadata` entries (12)
- [ ] All "X tools in category Y" claims match `toolGroups` actual counts
- [ ] Coverage percentage stated as 31% (12/39)
- [ ] Gap document created: which 27 tools lack metadata

**Estimate:** 0.5 day

---

### Issue #6: Unsubstantiated "Empirical Testing" Claim for Token Estimates

**File:** `src/resource-metadata.js:5-11`  
**Severity:** HIGH — Hallucination / faithfulness issue

**Problem:**
```javascript
/**
 * Token Cost Estimation
 * ---------------------
 * Base estimates derived from:
 * - Tool complexity (read vs write)
 * - Typical response size from Firefly III API
 * - Empirical testing with real Firefly instances  // ❌ NO TEST ARTIFACTS
 */
```

**Actual state:**
- No test suite for token estimation
- No benchmark fixtures with real Firefly data
- `IMPLEMENTATION_STATUS.md` marks E2E tests as `[  ] In progress`
- Token values are round numbers (150, 200, 300, 500, 600) with no measurement justification

**Solution:**
Replace claim with honest description:
```javascript
/**
 * Token Cost Estimation (Heuristic)
 * ----------------------------------
 * Estimates are conservative approximations based on:
 * - Tool complexity: read (1x multiplier) vs write (2x multiplier)
 * - Response size categories: minimal, small, medium, large
 * - MCP protocol overhead (10-15% of payload)
 *
 * These are NOT empirically measured and should be verified
 * against actual token usage in production. Adjust ONLY after
 * collecting real Claude SDK telemetry.
 */
```

**Acceptance Criteria:**
- [ ] "Empirical testing" phrase removed from all files
- [ ] Token estimates labeled as "heuristic" or "estimated"
- [ ] Caveat added: "Verify against actual production token usage"
- [ ] Future task created: "Collect token measurement baseline" (Phase 2+)

**Estimate:** 0.25 day

---

### Issue #7: Rate Limits Presented as API Constraints (Not Documented by Firefly III)

**File:** `src/resource-metadata.js:22-125`  
**Severity:** HIGH — Misleading constraints

**Problem:**
```javascript
resourceMetadata = {
  list_accounts: {
    rateLimit: { perMinute: 60 },  // ❌ WHERE IS THIS CONSTRAINT?
  },
  get_net_worth_summary: {
    rateLimit: { perMinute: 10 },  // ❌ FIREFLY III DOESN'T PUBLISH PER-ENDPOINT LIMITS
  },
};
```

Firefly III is self-hosted. Rate limiting behavior depends on the host's web server (nginx, Apache) and PHP-FPM configuration, not the API itself. These numbers have no published source.

**Solution:**
Reframe rate limits as "recommended" or "default" rather than API constraints:
```javascript
list_accounts: {
  rateLimitHint: {  // Renamed from rateLimit
    perMinute: 60,
    rationale: 'Recommended default for bulk operations; adjust per server configuration'
  },
},
```

Add documentation:
```markdown
### Rate Limits

Rate limits in this metadata are **operator-configurable defaults**, not enforced by
Firefly III. Configure based on your deployment's web server and PHP-FPM settings.
See [Firefly III docs on rate limiting](https://docs.firefly-iii.org/deployment/) for guidance.
```

**Acceptance Criteria:**
- [ ] `rateLimit` field renamed to `rateLimitHint` in `resourceMetadata`
- [ ] Documentation clarifies these are configurable defaults, not API constraints
- [ ] Link added to Firefly III deployment docs
- [ ] Code comment explains operator should adjust per server

**Estimate:** 0.5 day

---

### Issue #8: Version Inconsistencies (3.1.0 vs 3.0.0)

**Files:** `package.json:3`, `index.enhanced.js:8`, `README_CLAUDE.md:2`, `ENHANCEMENTS.md:1`  
**Severity:** HIGH — Version mismatch breaks trust

**Problem:**
- `package.json`: `"version": "3.0.0"`
- `index.enhanced.js:8`: `server.version = '3.1.0'`
- `README_CLAUDE.md:2`: `## Version 3.1.0`
- `ENHANCEMENTS.md:1`: `# Version 3.1.0`

**Solution:** Pick one version and apply consistently. Options:
- **A)** Revert to 3.0.0 everywhere (conservative, matches upstream)
- **B)** Bump to 3.1.0 everywhere and tag a release (aggressive)

**Recommendation:** Option A (revert to 3.0.0) to avoid surprise version bump.

**Acceptance Criteria:**
- [ ] `package.json` version: chosen consistently
- [ ] `index.enhanced.js` server.version: matches package.json
- [ ] All docs (.md) use same version
- [ ] No other version strings in codebase

**Estimate:** 0.25 day

---

## P2 — Medium (Quality / Discoverability)

### Issue #9: ESM Import Examples in Docs (After CJS Refactor)

**Files:** `CLAUDE_INTEGRATION.md:14-18, 196-201`, `ENHANCEMENTS.md:31-36`, `README_CLAUDE.md:44-49`  
**Severity:** MEDIUM — Examples break if followed

**Problem:**
```javascript
// CLAUDE_INTEGRATION.md line 14
import { formatErrorResponse } from 'mcp-server-firefly-iii/src/errors.js';
import { estimateTokenCost } from 'mcp-server-firefly-iii/src/resource-metadata.js';
```

But actual modules are CommonJS. Following these examples will produce:
```
SyntaxError: Cannot use import statement outside a module
```

**Solution:**
Update all code examples to use CommonJS:
```javascript
const { formatErrorResponse } = require('./src/errors.js');
const { estimateTokenCost } = require('./src/resource-metadata.js');
```

**Acceptance Criteria:**
- [ ] All `import` statements replaced with `require()`
- [ ] All `export` statements converted to `module.exports = {...}`
- [ ] Examples tested: `node -c` syntax check on each snippet
- [ ] Code blocks tagged `<!-- language: javascript -->` or `javascript cjs`

**Estimate:** 0.5 day

---

### Issue #10: Automation Tool Count Discrepancy (9 vs 10)

**Files:** `ENHANCEMENTS.md:21`, `README_CLAUDE.md:15`  
**Severity:** MEDIUM — Counting error

**Problem:**
Documentation claims "automation (9 tools)" but `src/resource-metadata.js:252-262` defines:
```javascript
automation: [
  'list_rules',
  'get_rule',
  'create_rule',
  'update_rule',
  'delete_rule',
  'list_rule_groups',
  'run_rule_group',
  'list_webhooks',
  'create_webhook',
  'delete_webhook',  // 10 total
];
```

**Solution:**
Update all references from "9" to "10".

**Acceptance Criteria:**
- [ ] All references to "automation (9)" changed to "automation (10)"
- [ ] Count verified by inspecting `toolGroups.automation.length`

**Estimate:** 0.1 day

---

### Issue #11: Broken `test:enhanced` Script

**File:** `package.json:16`  
**Severity:** MEDIUM — CI/testing will fail

**Problem:**
```json
"test:enhanced": "NODE_OPTIONS='--loader=./src/test-loader.js' jest"
```

File `./src/test-loader.js` does not exist. Any CI run or local test attempt will fail.

**Solution:** Either:
- **A)** Create `src/test-loader.js` (ESM test harness)
- **B)** Remove the script and use default `jest` instead
- **C)** Update script to not reference test-loader

**Recommendation:** Option B (remove) — test infrastructure is incomplete anyway (Phase 2 item).

**Acceptance Criteria:**
- [ ] `npm test` runs without error
- [ ] `npm run test:enhanced` either works or is removed
- [ ] `package.json` has no dangling references

**Estimate:** 0.25 day

---

### Issue #12: Uncatalogued Tools Return 0 Tokens Silently

**File:** `src/resource-metadata.js:130-195`  
**Severity:** MEDIUM — Silent failure, hidden gap

**Problem:**
27 of 39 tools have no `resourceMetadata` entry. Calling:
```javascript
estimateTokenCost('search_transactions')  // Not in resourceMetadata
```
Returns `0` silently, with no warning. Callers won't know the estimate is absent.

**Solution:**
Add a log or throw an optional warning:
```javascript
function estimateTokenCost(toolName, inputArgs = {}, resultSize = 'default') {
  const meta = resourceMetadata[toolName];
  if (!meta) {
    console.warn(`⚠️ No token estimate for tool: ${toolName} (returning 0)`);
    return 0;
  }
  // ... rest of function
}
```

Or update `getResourceHint()` to emit a note for uncatalogued tools.

**Acceptance Criteria:**
- [ ] Uncatalogued tools either: (a) emit a warning, or (b) are added to `resourceMetadata`
- [ ] Documentation states which tools have zero coverage
- [ ] Claude users are warned if a tool's token estimate is unavailable

**Estimate:** 0.5 day

---

## P3 — Low (Polish)

### Issue #13: `dotenv` Version Mismatch

**File:** `package.json:30`  
**Severity:** LOW — Will fail on fresh install if pinned version doesn't exist

**Problem:**
```json
"dotenv": "^17.3.1"
```

As of knowledge cutoff (Aug 2025), dotenv latest was v16.x. Version 17 may not exist. Current install works (probably using caret range to pull latest), but fresh installs on future dates may fail.

**Solution:**
Pin to known good version:
```json
"dotenv": "^16.3.1"
```

**Estimate:** 0.1 day

---

### Issue #14: Sensitive Data Leak in ConnectionFailed Error

**File:** `src/errors.js:79-82`  
**Severity:** LOW — leaks environment variable

**Problem:**
```javascript
if (error.code === 'ECONNREFUSED') {
  return new FireflyError('CONNECTION_FAILED', 'Cannot connect to Firefly III', {
    context,
    firefly_url: process.env.FIREFLY_URL,  // ❌ LEAKS HOSTNAME
  });
}
```

If `CONNECTION_FAILED` is logged or sent to Claude, it reveals the Firefly III server's URL. Generally acceptable for server-side logs but should be noted in security docs.

**Solution:**
Add a comment explaining the leak and when it occurs:
```javascript
// Note: firefly_url is included in context for server-side debugging only.
// Ensure CONNECTION_FAILED errors are NOT sent to untrusted clients.
firefly_url: process.env.FIREFLY_URL,
```

**Estimate:** 0.1 day

---

---

## P0 (Critical) — Additional Findings from Code Review

### Issue #15: Dual Server Instantiation on Startup

**File:** `index.enhanced.js:41` + `index.js` (both instantiate Server)  
**Severity:** CRITICAL — Creates hidden zombie instance

**Problem:**
`index.enhanced.js` calls `require('./index.js')` to load `TOOLS`. This triggers the upstream Server initialization in `index.js`, which:
1. Creates a `Server` instance (`mcpServer` in index.js)
2. Registers two `setRequestHandler` callbacks for the same schemas
3. Never connects this server to a transport

Result: two `Server` instances in same process, one is orphaned. If `index.enhanced.js` is restarted in tests, orphaned instances accumulate.

**Solution:**
Extract only the tool registry from `index.js` into a dedicated `src/tools/registry.js` module that performs no side effects. Both entry points should import only tools, not the server.

**Acceptance Criteria:**
- [x] No `Server` instantiation in `src/` modules
- [x] `index.js` and `index.enhanced.js` each create exactly one Server
- [x] No orphaned handlers or instances in process

**Status: Done** — commit `5ea614c` — `src/tools/registry.js` created; both index files import from it.

**Estimate:** 1 day

---

### Issue #16: Missing Source Files Break Server on Startup

**Files:** `src/validation.js` (referenced line 32–35), `src/resource-metadata.js` (referenced line 22–28)  
**Severity:** CRITICAL — Prevents server startup

**Problem:**
`index.enhanced.js` unconditionally imports:
```javascript
const { ... } = require('./src/validation.js');        // ❌ MISSING
const { ... } = require('./src/resource-metadata.js'); // ❌ MISSING
```

Running `npm run start:enhanced` or `node index.enhanced.js` fails with `MODULE_NOT_FOUND` before any handler is registered.

**Status:** P0 issue #2 was marked "Done (Option B)" by selecting upstream tool loading. However, `src/validation.js` and `src/resource-metadata.js` are STILL referenced and STILL missing.

**Solution:**
Either:
- **A)** Commit the missing files (validation.js, resource-metadata.js) with complete implementations
- **B)** Remove all imports of missing modules from `index.enhanced.js` and provide alternatives

**Recommendation:** Option A — these files have fixes applied (Zod v4 compat, topological sort). Commit them.

**Acceptance Criteria:**
- [x] `src/validation.js` exists and exports all required symbols
- [x] `src/resource-metadata.js` exists and exports all required symbols
- [x] `npm run start:enhanced` starts without MODULE_NOT_FOUND
- [x] File sizes: validation.js > 100 lines (124), resource-metadata.js > 200 lines (304)

**Status: Done** — files exist and verified via `node -e "require(...)"`. Both export all required symbols. Server starts without MODULE_NOT_FOUND.

**Estimate:** 0.5 day (commit existing files)

---

### Issue #17: MCP ListTools Response Violates Spec

**File:** `index.enhanced.js:82–91`  
**Severity:** HIGH — Breaks spec compliance

**Problem:**
```javascript
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: enrichedTools.map(({ _handler, ..., ...tool }) => ({
    ...tool,
    description: tool.description + (_claudeHints?.length ? `...` : ''),  // ❌ Mutates field
    _metadata: {                                                           // ❌ Non-standard field
      category: _category,
      resourceHints: _resourceMetadata,
    },
  })),
}));
```

The MCP spec for `ListToolsResult` does not include `_metadata`. Injecting custom fields violates the schema and may cause clients to reject the response. The `description` mutation breaks the original tool description semantics.

**Solution:**
- Do NOT inject `_metadata` into tool objects
- Use the `/tools/metadata` REST endpoint for structured metadata instead
- Keep tool descriptions unmodified
- Store hints in a separate mapping or serve via REST only

**Acceptance Criteria:**
- [x] `ListToolsResponse` contains only: `name`, `description`, `inputSchema` per spec
- [x] No custom `_metadata` field in response
- [x] Descriptions are original, unmodified
- [x] Metadata available via `/tools/metadata` REST endpoint only

**Status: Done** — commit `19f8a81`

**Estimate:** 0.5 day

---

### Issue #18: SSE Transport Connection Not Safe for Multiple Clients

**File:** `index.enhanced.js:171–178`  
**Severity:** HIGH — Leaks connections, routes to wrong client

**Problem:**
```javascript
let transport;  // ❌ Single shared variable

app.get('/sse', async (req, res) => {
  transport = new SSEServerTransport('/messages', res);  // ❌ Overwrites previous
  await mcpServer.connect(transport);
});
```

If Client A connects, then Client B connects before A disconnects, Client B's assignment overwrites the transport. All future messages go to Client B only. Client A's connection leaks.

**Solution:**
Use a session-based map:
```javascript
const sessions = new Map();  // sessionId → transport

app.get('/sse', async (req, res) => {
  const sessionId = req.query.sessionId || crypto.randomUUID();
  const transport = new SSEServerTransport(`/messages?sessionId=${sessionId}`, res);
  sessions.set(sessionId, transport);
  await mcpServer.connect(transport);
  res.on('close', () => sessions.delete(sessionId));
});

app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = sessions.get(sessionId);
  if (transport) await transport.handlePostMessage(req, res);
  else res.status(400).json({ error: 'Session not found' });
});
```

**Acceptance Criteria:**
- [x] Multiple simultaneous SSE clients can connect without overwriting each other
- [x] Each client's messages route to the correct transport
- [x] Closed connections are cleaned up from session map
- [ ] Test: two concurrent SSE clients send requests, verify responses go to correct client

**Status: Done** — commit `9971398` — session Map implemented in both index.js and index.enhanced.js. Integration test deferred to Phase 2.

**Estimate:** 0.5 day

---

### Issue #19: Request Interceptor Logs Params in Production

**File:** `src/config.js:28–32`  
**Severity:** HIGH — Leaks potential credentials

**Problem:**
```javascript
apiClient.interceptors.request.use((config) => {
  console.error(`[API] ${config.method.toUpperCase()} ${config.baseURL + config.url}`);
  if (config.params) console.error('Params:', config.params);  // ❌ NO GATE
  return config;
});
```

This interceptor:
1. Logs to stderr unconditionally (no `NODE_ENV !== 'production'` check)
2. Logs `config.params` in full, which could contain credentials if future code passes them
3. MCP stdio uses stderr for protocol, so these logs pollute the transport

**Solution:**
```javascript
apiClient.interceptors.request.use((config) => {
  if (process.env.DEBUG || process.env.NODE_ENV !== 'production') {
    console.error(`[API] ${config.method.toUpperCase()} ${config.baseURL + config.url}`);
    // NEVER log params without whitelist
  }
  return config;
});
```

**Acceptance Criteria:**
- [ ] Request logging disabled by default in production
- [ ] Logging only active when `DEBUG=true` or `NODE_ENV === 'development'`
- [ ] Never log `config.params` without an explicit allowlist
- [ ] Startup messages (✅ Server running...) still print unconditionally

**Estimate:** 0.25 day

---

### Issue #20: formatErrorResponse Output Not MCP-Compliant

**File:** `src/errors.js:104–128` + `index.enhanced.js:151–156`  
**Severity:** HIGH — Error contract diverges between entry points

**Problem:**
- `index.enhanced.js` (enhanced server):  
  Returns `{ isError: true, content: [{ type: 'text', text: JSON.stringify(formatted) }] }`
- `index.js` (upstream server):  
  Returns `{ isError: true, content: [{ type: 'text', text: error.message }] }`

Two entry points have divergent error surfaces. `formatErrorResponse` returns plain object, not a fully formed `CallToolResult`.

**Solution:**
Create a single `toMCPErrorResult(error)` function in `src/errors.js`:
```javascript
function toMCPErrorResult(error) {
  const formatted = formatErrorResponse(error);
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }],
  };
}
```

Both entry points use it:
```javascript
// index.enhanced.js & index.js
catch (error) {
  return toMCPErrorResult(error);
}
```

**Acceptance Criteria:**
- [ ] Single `toMCPErrorResult` function in `src/errors.js`
- [ ] Both `index.js` and `index.enhanced.js` use it
- [ ] Error response shape is identical from both entry points
- [ ] Response always valid `CallToolResult` per MCP spec

**Estimate:** 0.25 day

---

### Issue #21: Tool Handlers Use String Interpolation for URLs

**File:** `src/tools/insights.js:40, 53, 65` (if it exists)  
**Severity:** HIGH — Bypasses axios URL encoding, breaks malformed URLs

**Problem:**
```javascript
apiClient.get(`/charts/account/overview?start=${args.start}&end=${args.end}`)
```

Does not URL-encode `args.start` or `args.end`. Special characters (spaces, `&`, `=`) produce malformed URLs. Query params should use axios's `params` option for proper serialization.

**Solution:**
```javascript
apiClient.get('/charts/account/overview', { params: { start: args.start, end: args.end } })
```

**Acceptance Criteria:**
- [ ] All `apiClient.get/post/put/delete` calls use `{ params: {...} }` config
- [ ] No string interpolation for query parameters
- [ ] Test: passing date like `2024-01-01` is correctly encoded in URL

**Estimate:** 0.5 day

---

### Issue #22: Tool-Not-Found Throws Error Instead of Returning Error Result

**File:** `index.js:54`  
**Severity:** MEDIUM — Protocol-level error instead of tool-level

**Problem:**
```javascript
if (!tool) {
  throw new Error(`Tool not found: ${request.params.name}`);  // ❌ THROWS
}
```

Throwing inside a `setRequestHandler` callback causes the SDK to emit a JSON-RPC `-32603` (Internal Error) protocol-level error, breaking the client connection. Should return a graceful tool-level error.

**Solution:**
```javascript
if (!tool) {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({
      code: 'TOOL_NOT_FOUND',
      message: `Tool not found: ${request.params.name}`,
      availableTools: enrichedTools.map(t => t.name),
    }, null, 2) }],
  };
}
```

**Acceptance Criteria:**
- [ ] Missing tool returns `{ isError: true, content: [...] }`
- [ ] No exceptions thrown from request handlers
- [ ] Response includes list of available tools for discoverability

**Estimate:** 0.25 day

---

## P1 (High) — Additional Findings

### Issue #23: upload_attachment Tool Uses Wrong API Pattern

**File:** If `src/tools/` exists, check for `upload_attachment`  
**Severity:** MEDIUM — Tool doesn't match Firefly API

**Problem:**
The tool likely passes base64 content as a JSON field:
```javascript
POST /attachments
{ "filename": "...", "content": "base64..." }
```

Firefly III requires binary multipart upload:
```javascript
POST /attachments
Content-Type: multipart/form-data
[binary data]
```

The current pattern will be rejected by the API.

**Solution:**
Either implement multipart upload with `form-data` library or remove the tool until multipart is supported.

**Estimate:** 1 day

---

### Issue #24: CommonJS/ESM Documentation Mismatch

**Files:** `CLAUDE_INTEGRATION.md`, `ENHANCEMENTS.md`, `README_CLAUDE.md`  
**Severity:** MEDIUM — Docs show ESM, code is CJS

**Problem:**
Commit `2d64a19` converted all files to CommonJS, but documentation examples still show ES module `import` syntax. Following examples will fail with `SyntaxError: Cannot use import statement outside a module`.

**Solution:**
Already documented as P2 issue #9. Ensure all code examples show `require()` and `module.exports`.

**Estimate:** 0.5 day

---

### Issue #25: Test Assertion References Stale Tool Count

**File:** `index.test.js:14`  
**Severity:** MEDIUM — Fragile, masking tool changes

**Problem:**
```javascript
expect(TOOLS.length).toBe(65);  // ❌ Hardcoded count
```

If tool count changes (tools added/removed), test silently breaks. Assertion is not documenting coverage, just matching a number.

**Solution:**
Replace with meaningful assertions:
```javascript
expect(TOOLS.length).toBeGreaterThan(0);
TOOLS.forEach(tool => {
  expect(tool).toHaveProperty('name');
  expect(tool).toHaveProperty('description');
  expect(tool).toHaveProperty('inputSchema');
  expect(tool).toHaveProperty('handler');
});
```

**Estimate:** 0.25 day

---

## P2 (Medium) — Additional Findings

### Issue #26: ValidationError instanceof Check Across Module Boundary

**File:** `index.enhanced.js:141`  
**Severity:** LOW-MEDIUM — Check will fail if validation.js missing

**Problem:**
```javascript
if (error instanceof ValidationError) {
  // ...
}
```

If `src/validation.js` is missing (Issue #16), this code is unreachable. Even if the file exists, Zod error shapes changed in v4, and `instanceof` checks can fail silently across module boundaries. Better to use name-based guard.

**Solution:**
```javascript
if (error.name === 'ValidationError' || error instanceof ValidationError) {
  // ...
}
```

**Estimate:** 0.1 day

---

### Issue #27: Schema Fields Use `default` Keyword Without Enforcement

**File:** Tool definitions in `src/tools/` (if they exist)  
**Severity:** LOW — Misleading schema, no actual default

**Problem:**
```javascript
const inputSchema = {
  properties: {
    limit: { type: 'number', default: 10 },  // ❌ NOT ENFORCED BY MCP SDK
  },
};
```

JSON Schema `default` is not enforced by MCP's validator. Handlers must apply defaults manually with `args.limit || 10`. This creates two sources of truth and confuses callers.

**Solution:**
Remove `default` from schema, rely only on handler-level defaults:
```javascript
const inputSchema = {
  properties: {
    limit: { type: 'number', description: 'Max results (default: 10)' },
  },
};

// In handler:
const limit = args.limit ?? 10;
```

**Estimate:** 0.5 day (across all tools)

---

### Issue #28: update_transaction Schema Incomplete

**File:** Tool definition (if it exists)  
**Severity:** LOW — Can't update all fields

**Problem:**
If `update_transaction` only documents `id` and `description` as updatable, Claude cannot update amount, date, category, or splits. This will cause unexpected failures.

**Solution:**
Expand schema to match `create_transaction` with all fields optional except `id`:
```javascript
{
  id: string,           // Required
  type: enum,          // Optional
  source_id: string,   // Optional
  destination_id: string,  // Optional
  amount: number,      // Optional
  date: date,          // Optional
  // ... etc
}
```

**Estimate:** 0.25 day

---

### Issue #29: No additionalProperties: false in Tool Schemas

**File:** All tool definitions  
**Severity:** LOW — Allows parameter injection

**Problem:**
Without `additionalProperties: false`, Claude can pass arbitrary extra fields that are silently forwarded to Firefly API. This may trigger unexpected behavior.

**Solution:**
Add to all `inputSchema` objects:
```javascript
const inputSchema = {
  type: 'object',
  additionalProperties: false,  // ← Add this
  properties: { ... },
};
```

**Estimate:** 0.25 day (automated script across all tools)

---

## P3 (Low) — Additional Findings

### Issue #30: Emoji in Startup Messages Violates Style Guide

**File:** `index.enhanced.js:268–271`  
**Severity:** LOW — Violates CLAUDE.md "no emojis" rule

**Problem:**
```javascript
console.error(`✅ Firefly III MCP Server (Claude-Enhanced) running at http://localhost:${PORT}`);
console.error(`📚 OpenAPI: http://localhost:${PORT}/openapi.json`);
```

Your CLAUDE.md explicitly states: "Only use emojis if the user explicitly requests it. Avoid using emojis in all communication unless asked."

**Solution:**
Remove emoji, use plain text:
```javascript
console.error(`Firefly III MCP Server (Claude-Enhanced) running at http://localhost:${PORT}`);
console.error(`OpenAPI: http://localhost:${PORT}/openapi.json`);
```

**Estimate:** 0.05 day

---

### Issue #31: Debug Logging Always Enabled

**File:** `src/config.js:28–32`  
**Severity:** LOW — Noise in production logs

**Problem:**
Axios request interceptor logs all API calls to stderr unconditionally, including in production. This creates noise and pollutes the MCP stdio transport.

**Solution:** (Duplicate of Issue #19)
Gate on `DEBUG` or `NODE_ENV !== 'production'`.

---

## Summary Table (Updated)

| Priority | ID | Title | Status | Est. | Source |
|---|---|---|---|---|---|
| **P0** | #1 | Zod v4 API Breaking Change | ✅ Done | 0.5d | Backlog |
| **P0** | #2 | Missing `src/tools/` Directory | ✅ Done (B) | 1–3d | Backlog |
| **P0** | #3 | Mixed Module Syntax | ✅ Done | 0.25d | Backlog |
| **P0** | #4 | `resolveDependencies()` Order Bug | ✅ Done | 0.5d | Backlog |
| **P0** | #15 | Dual Server Instantiation | ✅ Done | 1d | Code Review |
| **P0** | #16 | Missing Source Files (validation, metadata) | ✅ Done | 0.5d | Code Review |
| **P0** | #17 | MCP ListTools Violates Spec | ✅ Done | 0.5d | Code Review |
| **P0** | #18 | SSE Transport Connection Unsafe | ✅ Done | 0.5d | Code Review |
| **P0** | #19 | Request Interceptor Logs in Prod | ❌ Pending | 0.25d | Code Review |
| **P0** | #20 | formatErrorResponse Not MCP-Compliant | ❌ Pending | 0.25d | Code Review |
| **P0** | #21 | String Interpolation in URLs | ❌ Pending | 0.5d | Code Review |
| **P1** | #5 | Fabricated "66 Tools" Claim | ❌ Pending | 0.5d | Backlog |
| **P1** | #6 | Unsubstantiated "Empirical Testing" | ❌ Pending | 0.25d | Backlog |
| **P1** | #7 | Rate Limits Misframed as Constraints | ❌ Pending | 0.5d | Backlog |
| **P1** | #8 | Version Inconsistencies | ❌ Pending | 0.25d | Backlog |
| **P1** | #22 | Tool-Not-Found Throws Error | ❌ Pending | 0.25d | Code Review |
| **P1** | #23 | upload_attachment Wrong API Pattern | ❌ Pending | 1d | Code Review |
| **P1** | #24 | CJS/ESM Documentation Mismatch | ❌ Pending | 0.5d | Code Review |
| **P1** | #25 | Stale Tool Count Assertion | ❌ Pending | 0.25d | Code Review |
| **P2** | #9 | ESM Examples in Docs | ❌ Pending | 0.5d | Backlog |
| **P2** | #10 | Automation Count (9 vs 10) | ❌ Pending | 0.1d | Backlog |
| **P2** | #11 | Broken `test:enhanced` Script | ❌ Pending | 0.25d | Backlog |
| **P2** | #12 | Uncatalogued Tools Silent Fail | ❌ Pending | 0.5d | Backlog |
| **P2** | #26 | ValidationError instanceof Check | ⚠️ Minor | 0.1d | Code Review |
| **P2** | #27 | Schema Default Keyword Not Enforced | ❌ Pending | 0.5d | Code Review |
| **P2** | #28 | update_transaction Schema Incomplete | ❌ Pending | 0.25d | Code Review |
| **P2** | #29 | No additionalProperties: false | ❌ Pending | 0.25d | Code Review |
| **P3** | #13 | `dotenv` Version Mismatch | ❌ Pending | 0.1d | Backlog |
| **P3** | #14 | Sensitive Data Leak in Error | ❌ Pending | 0.1d | Backlog |
| **P3** | #30 | Emoji in Startup Messages | ❌ Pending | 0.05d | Code Review |
| **P3** | #31 | Debug Logging Always Enabled | ❌ Pending | 0.1d | Code Review |

**Summary:**
- **P0 (Critical):** 11 issues (4 fixed, 7 pending) — Blocks functionality
- **P1 (High):** 9 issues (pending) — Correctness/Trust
- **P2 (Medium):** 9 issues (pending) — Quality/Discoverability
- **P3 (Low):** 4 issues (pending) — Polish

**Total Estimated Effort:** ~11 days (P0+P1+P2+P3, excluding #2 and #23 which require design decisions)

---

## Recommended Priority Order

1. **CRITICAL FIRST:** Fix #15, #16, #17, #18, #19, #20, #21 (P0 blockers) — ~4 days
2. **High Trust:** Fix #5–8, #22–25 (P1 correctness) — ~3.5 days
3. **Quality:** Fix #9–12, #26–29 (P2 discoverability) — ~3 days
4. **Polish:** Fix #13, #14, #30, #31 (P3) — ~0.5 days

---

## Next Steps

1. **Immediately:** Address P0 issues #15–21 (architectural/protocol fixes)
2. **Then:** Address P1 issues #5–8, #22–25 (correctness and trust)
3. **Then:** Address P2/P3 issues (documentation, quality, polish)

