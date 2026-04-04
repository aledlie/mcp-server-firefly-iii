const PQueue = require('p-queue').default;
const { resourceMetadata } = require('./resource-metadata.js');

const DEFAULT_PER_MINUTE = 30;
const INTERVAL_MS = 60_000;

// One queue per distinct perMinute tier — avoids creating a queue per tool
const queues = new Map();

function getQueue(perMinute) {
  if (queues.has(perMinute)) return queues.get(perMinute);

  const queue = new PQueue({
    intervalCap: perMinute,
    interval: INTERVAL_MS,
    carryoverConcurrencyCount: true,
  });
  queues.set(perMinute, queue);
  return queue;
}

/**
 * Execute a tool handler through the rate-limited queue.
 * Uses the tool's rateLimitHint.perMinute if catalogued, otherwise DEFAULT_PER_MINUTE.
 */
function rateLimited(toolName, fn) {
  const perMinute = resourceMetadata[toolName]?.rateLimitHint?.perMinute || DEFAULT_PER_MINUTE;
  return getQueue(perMinute).add(fn);
}

module.exports = { rateLimited, DEFAULT_PER_MINUTE };
