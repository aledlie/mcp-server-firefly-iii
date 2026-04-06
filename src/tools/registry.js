/**
 * Tool registry — zero side effects
 * Assembles all tool definitions without creating any Server instances.
 * Both index.js and index.enhanced.js import from here.
 */

const coreTools = require('./core.js');
const accountsTools = require('./accounts.js');
const transactionsTools = require('./transactions.js');
const budgetsTools = require('./budgets.js');
const automationTools = require('./automation.js');
const systemTools = require('./system.js');
const insightsTools = require('./insights.js');
const metaTools = require('./meta.js');
const billsTools = require('./bills.js');
const groupsTools = require('./groups.js');
const recurringTools = require('./recurring.js');
const adminTools = require('./admin.js');

/**
 * Recursively sets additionalProperties: false on all object-type schemas.
 * Prevents unexpected fields from being silently forwarded to the Firefly API.
 * See BACKLOG.md #29.
 */
function lockdownSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;

  if (schema.type === 'object' && schema.properties) {
    schema.additionalProperties = false;
    for (const prop of Object.values(schema.properties)) {
      lockdownSchema(prop);
    }
  }

  if (schema.items) {
    lockdownSchema(schema.items);
  }

  return schema;
}

const TOOLS = [
  ...coreTools,
  ...accountsTools,
  ...transactionsTools,
  ...budgetsTools,
  ...automationTools,
  ...systemTools,
  ...insightsTools,
  ...metaTools,
  ...billsTools,
  ...groupsTools,
  ...recurringTools,
  ...adminTools,
].map((tool) => ({
  ...tool,
  inputSchema: lockdownSchema({ ...tool.inputSchema }),
}));

module.exports = { TOOLS };
