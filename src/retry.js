const pRetry = require('p-retry');
const { resourceMetadata } = require('./resource-metadata.js');

const MAX_RETRIES = 3;
const MIN_TIMEOUT_MS = 1000;

/**
 * HTTP status codes that are safe to retry.
 */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Determine if an error is transient and retryable.
 */
function isRetryable(error) {
  // Network-level errors
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(error.code)) {
    return true;
  }
  const status = error.response?.status;
  if (status && RETRYABLE_STATUSES.has(status)) return true;
  return false;
}

/**
 * Extract delay from retry-after header (seconds or HTTP-date).
 */
function getRetryAfterMs(error) {
  const header = error.response?.headers?.['retry-after'];
  if (!header) return 0;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return 0;
}

/**
 * Wrap a tool handler with retry logic.
 * - Read operations: retry up to MAX_RETRIES
 * - Write operations (non-cacheable): no retry (mutations must not be replayed)
 * - Respects retry-after headers from 429 responses
 */
function withRetry(toolName, fn) {
  const meta = resourceMetadata[toolName];
  const isWrite = meta && meta.cacheable === false;

  if (isWrite) return fn();

  return pRetry(fn, {
    retries: MAX_RETRIES,
    minTimeout: MIN_TIMEOUT_MS,
    onFailedAttempt: (error) => {
      if (!isRetryable(error)) {
        throw error;
      }
      const retryAfterMs = getRetryAfterMs(error);
      if (retryAfterMs > 0) {
        error.retryAfterMs = retryAfterMs;
        return new Promise((resolve) => setTimeout(resolve, retryAfterMs));
      }
    },
  });
}

module.exports = { withRetry, isRetryable };
