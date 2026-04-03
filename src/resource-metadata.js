/**
 * Resource metadata and hints for Claude ecosystem
 * Tracks token cost, cacheability, rate limits per tool
 *
 * Token Cost Estimation
 * ---------------------
 * Base estimates derived from:
 * - Tool complexity (read vs write)
 * - Typical response size from Firefly III API
 * - Estimated based on typical API response patterns (not empirically validated)
 *
 * Estimates are conservative (rounded up) to account for:
 * - JSON overhead (~10-15% of payload)
 * - Schema validation overhead (~5ms per call)
 * - Error responses (if applicable)
 *
 * Reference: Firefly III API docs at https://api-docs.firefly-iii.org/
 */

const resourceMetadata = {
  // Lightweight read operations
  list_accounts: {
    estimatedTokens: 150,
    cacheable: true,
    cacheMaxAge: 300, // 5 min
    rateLimit: { perMinute: 60 },
    resultSize: 'small', // typical <5KB
    dependencies: [],
  },
  get_account: {
    estimatedTokens: 120,
    cacheable: true,
    cacheMaxAge: 300,
    rateLimit: { perMinute: 60 },
    resultSize: 'small',
    dependencies: [],
  },
  list_transactions: {
    estimatedTokens: 300,
    cacheable: 'conditional', // Cache varies by filter params
    cacheMaxAge: 60, // 1 min
    rateLimit: { perMinute: 30 },
    resultSize: 'medium', // 10-100KB
    dependencies: [],
    notes: 'Large result sets; consider pagination',
  },
  get_transaction: {
    estimatedTokens: 200,
    cacheable: true,
    cacheMaxAge: 300,
    rateLimit: { perMinute: 60 },
    resultSize: 'small',
    dependencies: ['list_transactions'],
  },

  // Write operations (non-cacheable)
  create_transaction: {
    estimatedTokens: 400,
    cacheable: false,
    rateLimit: { perMinute: 20 },
    resultSize: 'small',
    dependencies: ['list_accounts'],
    notes: 'Mutates state. Requires source and destination accounts.',
  },
  update_transaction: {
    estimatedTokens: 300,
    cacheable: false,
    rateLimit: { perMinute: 20 },
    resultSize: 'small',
    dependencies: ['get_transaction'],
  },
  delete_transaction: {
    estimatedTokens: 150,
    cacheable: false,
    rateLimit: { perMinute: 20 },
    resultSize: 'minimal',
    dependencies: ['get_transaction'],
  },

  // Budget operations
  list_budgets: {
    estimatedTokens: 200,
    cacheable: true,
    cacheMaxAge: 300,
    rateLimit: { perMinute: 40 },
    resultSize: 'small',
    dependencies: [],
  },
  create_budget: {
    estimatedTokens: 300,
    cacheable: false,
    rateLimit: { perMinute: 15 },
    resultSize: 'small',
    dependencies: [],
  },

  // Analytics (potentially expensive)
  get_net_worth_summary: {
    estimatedTokens: 500,
    cacheable: true,
    cacheMaxAge: 600, // 10 min; older data acceptable
    rateLimit: { perMinute: 10 },
    resultSize: 'medium',
    dependencies: ['list_accounts'],
    notes: 'Computation-heavy; avoid frequent calls',
  },
  get_spending_summary: {
    estimatedTokens: 600,
    cacheable: 'conditional',
    cacheMaxAge: 300,
    rateLimit: { perMinute: 10 },
    resultSize: 'large', // Can be 100+ KB
    dependencies: ['list_transactions'],
    notes: 'Large result sets; may exceed token limits',
  },

  // System
  get_about: {
    estimatedTokens: 100,
    cacheable: true,
    cacheMaxAge: 3600, // 1 hour
    rateLimit: { perMinute: 100 },
    resultSize: 'minimal',
    dependencies: [],
  },
};

/**
 * Get Claude-aware resource hints for a tool
 * Returns null if tool metadata is not registered (Phase 2 tools not yet covered).
 */
function getResourceHint(toolName) {
  const meta = resourceMetadata[toolName];
  if (!meta) return null;

  const hints = [];

  // Token budget guidance
  if (meta.estimatedTokens > 400) {
    hints.push(`⚠️ Token-heavy (${meta.estimatedTokens} tokens est.)`);
  }

  // Cacheability
  if (meta.cacheable === true) {
    hints.push(`✅ Cacheable (${meta.cacheMaxAge}s)`);
  } else if (meta.cacheable === 'conditional') {
    hints.push(`⚠️ Conditional cache`);
  }

  // Rate limits
  if (meta.rateLimit?.perMinute <= 15) {
    hints.push(`🚦 Low rate limit (${meta.rateLimit.perMinute}/min)`);
  }

  // Result size warnings
  if (meta.resultSize === 'large') {
    hints.push(`📦 Large responses possible`);
  }

  // Mutation warning
  if (!meta.cacheable && meta.estimatedTokens > 200) {
    hints.push(`⚡ Mutating operation`);
  }

  return {
    name: toolName,
    ...meta,
    hints,
  };
}

/**
 * Calculate effective token cost with context
 */
function estimateTokenCost(toolName, inputArgs = {}, resultSize = 'default') {
  const meta = resourceMetadata[toolName];
  if (!meta) return 0;

  let cost = meta.estimatedTokens;

  // Adjust for pagination/limits
  if (inputArgs.limit && inputArgs.limit > 50) {
    cost += Math.ceil((inputArgs.limit - 50) * 5);
  }

  // Adjust for result size
  const sizeMultipliers = {
    minimal: 0.5,
    small: 1,
    medium: 2,
    large: 4,
  };
  cost *= sizeMultipliers[resultSize] || 1;

  return Math.ceil(cost);
}

/**
 * Tool dependency graph for workflow planning
 * Returns tools in topological order: dependencies appear before their dependents.
 */
function resolveDependencies(toolNames) {
  const resolved = [];
  const visited = new Set();

  function visit(tool) {
    if (visited.has(tool)) return;
    visited.add(tool);
    const deps = resourceMetadata[tool]?.dependencies || [];
    for (const dep of deps) {
      visit(dep);
    }
    resolved.push(tool);
  }

  for (const tool of toolNames) {
    visit(tool);
  }

  return resolved;
}

/**
 * Group tools by category for Claude context
 */
const toolGroups = {
  transactions: [
    'list_transactions',
    'get_transaction',
    'create_transaction',
    'create_split_transaction',
    'update_transaction',
    'delete_transaction',
    'search_transactions',
  ],
  accounts: [
    'list_accounts',
    'get_account',
    'create_account',
    'update_account',
    'delete_account',
  ],
  budgets: [
    'list_budgets',
    'get_budget',
    'create_budget',
    'update_budget',
    'delete_budget',
    'list_budget_limits',
    'create_budget_limit',
    'delete_budget_limit',
  ],
  analytics: [
    'get_net_worth_summary',
    'get_spending_summary',
    'get_account_overview_chart',
  ],
  automation: [
    'list_rules',
    'get_rule',
    'create_rule',
    'update_rule',
    'delete_rule',
    'list_rule_groups',
    'trigger_rule_group',
    'list_webhooks',
    'create_webhook',
    'delete_webhook',
  ],
  system: [
    'get_about',
    'list_currencies',
    'list_categories',
    'list_tags',
    'list_object_groups',
  ],
};

/**
 * Get all tools in a category
 */
function getToolsByCategory(category) {
  return toolGroups[category] || [];
}

/**
 * Get category for a tool
 */
function getToolCategory(toolName) {
  for (const [category, tools] of Object.entries(toolGroups)) {
    if (tools.includes(toolName)) return category;
  }
  return null;
}

module.exports = {
  resourceMetadata,
  getResourceHint,
  estimateTokenCost,
  resolveDependencies,
  toolGroups,
  getToolsByCategory,
  getToolCategory,
};
