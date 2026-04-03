/**
 * Structured error handling for Claude ecosystem
 * Provides context, retry info, and suggestions
 */

class FireflyError extends Error {
  constructor(code, message, context = {}) {
    super(message);
    this.name = 'FireflyError';
    this.code = code;
    this.context = context;
    this.isRetryable = this.determineRetryability();
    this.suggestedRetryDelay = this.determineSuggestedDelay();
  }

  determineRetryability() {
    const retryableCodes = ['TIMEOUT', 'RATE_LIMITED', 'NETWORK', 'TEMP_UNAVAILABLE'];
    return retryableCodes.includes(this.code);
  }

  determineSuggestedDelay() {
    // Rate limit: exponential backoff
    if (this.code === 'RATE_LIMITED') return 5000;
    // Timeout: wait and retry
    if (this.code === 'TIMEOUT') return 3000;
    // Network: aggressive backoff
    if (this.code === 'NETWORK') return 10000;
    return null;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      context: this.context,
      isRetryable: this.isRetryable,
      suggestedRetryDelayMs: this.suggestedRetryDelay,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Wrap API errors with context
 */
const wrapFireflyError = (error, context = {}) => {
  if (error.response) {
    const status = error.response.status;
    let code = 'API_ERROR';
    let message = error.response.data?.message || 'API request failed';

    if (status === 401 || status === 403) {
      code = 'AUTHENTICATION_FAILED';
      message = 'Invalid or expired Firefly III credentials';
    } else if (status === 404) {
      code = 'NOT_FOUND';
      message = error.response.data?.message || 'Resource not found';
    } else if (status === 422) {
      code = 'VALIDATION_FAILED';
      message = 'Request validation failed';
      context.errors = error.response.data?.errors || {};
    } else if (status === 429) {
      code = 'RATE_LIMITED';
      message = 'Rate limit exceeded';
      context.retryAfter = error.response.headers['retry-after'];
    } else if (status >= 500) {
      code = 'SERVER_ERROR';
      message = 'Firefly III server error';
    }

    return new FireflyError(code, message, {
      ...context,
      httpStatus: status,
      firefly_errors: error.response.data?.errors,
    });
  }

  if (error.code === 'ECONNREFUSED') {
    return new FireflyError('CONNECTION_FAILED', 'Cannot connect to Firefly III', {
      ...context,
      firefly_url: process.env.FIREFLY_URL,
    });
  }

  if (error.code === 'ENOTFOUND') {
    return new FireflyError('DNS_ERROR', 'Cannot resolve Firefly III hostname', context);
  }

  if (error.code === 'ETIMEDOUT') {
    return new FireflyError('TIMEOUT', 'Request timeout', context);
  }

  // Generic
  return new FireflyError('UNKNOWN_ERROR', error.message, {
    ...context,
    originalError: error.constructor.name,
  });
};

/**
 * Safe error response for Claude
 * Excludes sensitive data, includes guidance
 */
const formatErrorResponse = (error) => {
  const fireflyError = error instanceof FireflyError
    ? error
    : wrapFireflyError(error);

  const response = {
    isError: true,
    code: fireflyError.code,
    message: fireflyError.message,
  };

  // Exclude sensitive context in certain cases
  if (fireflyError.code !== 'AUTHENTICATION_FAILED') {
    response.context = fireflyError.context;
  }

  if (fireflyError.isRetryable) {
    response.retry = {
      isRetryable: true,
      suggestedDelayMs: fireflyError.suggestedRetryDelay,
      guidance: getRetryGuidance(fireflyError.code),
    };
  }

  return response;
};

/**
 * Get Claude-friendly retry guidance
 */
function getRetryGuidance(code) {
  const guidance = {
    RATE_LIMITED: 'Firefly III rate limit exceeded. Wait a few seconds before retrying.',
    TIMEOUT: 'Request timed out. Firefly III may be slow. Retry with a shorter query.',
    NETWORK: 'Network issue. Check your connection and Firefly III availability.',
    TEMP_UNAVAILABLE: 'Firefly III temporarily unavailable. Retry in a moment.',
    AUTHENTICATION_FAILED: 'Fix FIREFLY_URL and FIREFLY_TOKEN environment variables.',
    NOT_FOUND: 'Resource does not exist. Verify the ID.',
  };
  return guidance[code] || 'An error occurred. Check the context for details.';
}

/**
 * Axios error interceptor
 */
const createErrorInterceptor = () => {
  return (error) => {
    throw wrapFireflyError(error);
  };
};

module.exports = {
  FireflyError,
  wrapFireflyError,
  formatErrorResponse,
  createErrorInterceptor,
};
