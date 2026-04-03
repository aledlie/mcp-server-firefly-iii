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

## Summary Table

| Priority | ID | Title | Status | Est. | 
|---|---|---|---|---|
| P0 | #1 | Zod v4 API Breaking Change | Pending | 0.5d |
| P0 | #2 | Missing `src/tools/` Directory | **Decision Needed** | 1–3d |
| P0 | #3 | Mixed Module Syntax | Pending | 0.25d |
| P0 | #4 | `resolveDependencies()` Order Bug | Pending | 0.5d |
| P1 | #5 | Fabricated "66 Tools" Claim | Pending | 0.5d |
| P1 | #6 | Unsubstantiated "Empirical Testing" | Pending | 0.25d |
| P1 | #7 | Rate Limits Misframed as Constraints | Pending | 0.5d |
| P1 | #8 | Version Inconsistencies | Pending | 0.25d |
| P2 | #9 | ESM Examples in Docs | Pending | 0.5d |
| P2 | #10 | Automation Count (9 vs 10) | Pending | 0.1d |
| P2 | #11 | Broken `test:enhanced` Script | Pending | 0.25d |
| P2 | #12 | Uncatalogued Tools Silent Fail | Pending | 0.5d |
| P3 | #13 | `dotenv` Version Mismatch | Pending | 0.1d |
| P3 | #14 | Sensitive Data Leak in Error | Pending | 0.1d |

**Total Estimated Effort:** ~5.5 days (excluding #2 which requires architectural decision)

---

## Next Steps

1. **Decision Required:** Issue #2 — resolve whether `src/tools/` should be implemented in Phase 1 or deferred
2. **Execute P0 fixes:** Issues #1, #3, #4 (2 days)
3. **Execute P1 fixes:** Issues #5–8 (1.5 days)
4. **Execute P2 fixes:** Issues #9–12 (1.25 days)
5. **Regression test:** Run full suite after each priority level

