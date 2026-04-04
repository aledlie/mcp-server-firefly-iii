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
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      context: this.context,
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
      // Note: firefly_url is included for server-side debugging only.
      // Ensure CONNECTION_FAILED errors are NOT forwarded to untrusted clients.
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

  return response;
};

/**
 * Produce a fully-formed MCP CallToolResult for an error.
 * Both index.js and index.enhanced.js use this to ensure consistent error surfaces.
 */
const toMCPErrorResult = (error) => {
  const formatted = formatErrorResponse(error);
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }],
  };
};

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
  toMCPErrorResult,
  createErrorInterceptor,
};
