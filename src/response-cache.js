const { LRUCache } = require('lru-cache');
const { resourceMetadata } = require('./resource-metadata.js');

const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 500;

const cache = new LRUCache({
  max: MAX_ENTRIES,
  ttl: DEFAULT_TTL_MS,
  allowStale: false,
});

/**
 * Build a cache key from tool name + sorted args.
 * Deterministic: same args in any order produce the same key.
 */
function cacheKey(toolName, args) {
  const sorted = Object.keys(args)
    .sort()
    .reduce((acc, k) => { acc[k] = args[k]; return acc; }, {});
  return `${toolName}:${JSON.stringify(sorted)}`;
}

/**
 * Get the TTL for a tool based on its resource metadata.
 * Returns 0 (uncacheable) for write operations or tools without metadata.
 */
function getTTL(toolName) {
  const meta = resourceMetadata[toolName];
  if (!meta || !meta.cacheable) return 0;
  return (meta.cacheMaxAge || 60) * 1000;
}

/**
 * Look up a cached response. Returns undefined on miss.
 */
function get(toolName, args) {
  const ttl = getTTL(toolName);
  if (ttl === 0) return undefined;
  return cache.get(cacheKey(toolName, args));
}

/**
 * Store a response in cache if the tool is cacheable.
 */
function set(toolName, args, result) {
  const ttl = getTTL(toolName);
  if (ttl === 0) return;
  cache.set(cacheKey(toolName, args), result, { ttl });
}

/**
 * Invalidate all entries for a tool (e.g. after a mutation).
 * Scans keys with matching prefix — bounded by MAX_ENTRIES.
 */
function invalidate(toolName) {
  const prefix = `${toolName}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/**
 * Invalidate related read caches after a write operation.
 * Uses the dependency graph: if create_transaction depends on list_accounts,
 * then after create_transaction we invalidate list_transactions (sibling reads).
 */
const WRITE_INVALIDATES = {
  create_transaction: ['list_transactions'],
  update_transaction: ['list_transactions', 'get_transaction'],
  delete_transaction: ['list_transactions', 'get_transaction'],
  create_account: ['list_accounts'],
  update_account: ['list_accounts', 'get_account'],
  delete_account: ['list_accounts', 'get_account'],
  create_budget: ['list_budgets'],
  update_budget: ['list_budgets', 'get_budget'],
  delete_budget: ['list_budgets', 'get_budget'],
  create_budget_limit: ['list_budget_limits'],
  delete_budget_limit: ['list_budget_limits'],
};

function invalidateAfterWrite(toolName) {
  const targets = WRITE_INVALIDATES[toolName];
  if (!targets) return;
  for (const target of targets) {
    invalidate(target);
  }
}

function stats() {
  return { size: cache.size, max: MAX_ENTRIES };
}

function clear() {
  cache.clear();
}

module.exports = { get, set, invalidate, invalidateAfterWrite, stats, clear };
