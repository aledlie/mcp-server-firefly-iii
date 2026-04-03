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
];

module.exports = { TOOLS };
