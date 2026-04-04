const axios = require("axios");
const axiosRetry = require("axios-retry").default;
require("dotenv").config();

// Configuration
const FIREFLY_URL = process.env.FIREFLY_URL;
const FIREFLY_TOKEN = process.env.FIREFLY_TOKEN;
const PORT = process.env.PORT; 

if (!FIREFLY_URL || !FIREFLY_TOKEN) {
  // If we are in test mode, we bypass the error
  if (process.env.NODE_ENV !== "test") {
    console.error("Error: FIREFLY_URL and FIREFLY_TOKEN are required.");
    process.exit(1);
  }
}

const baseUrl = (FIREFLY_URL || "").replace(/\/+$/, "");
const apiClient = axios.create({
  baseURL: `${baseUrl}/api/v1`,
  headers: {
    Authorization: `Bearer ${FIREFLY_TOKEN}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

// Retry: exponential backoff for transient failures (429, 5xx, network errors)
const RETRY_COUNT = 3;
axiosRetry(apiClient, {
  retries: RETRY_COUNT,
  retryDelay: (retryCount, error) => {
    const retryAfter = error.response?.headers?.['retry-after'];
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (!Number.isNaN(seconds)) return seconds * 1000;
    }
    return axiosRetry.exponentialDelay(retryCount);
  },
  retryCondition: (error) => {
    if (axiosRetry.isNetworkOrIdempotentRequestError(error)) return true;
    const status = error.response?.status;
    return status === 429 || (status >= 500 && status < 600);
  },
});

// Debug interceptor — only active when DEBUG=true or NODE_ENV=development
// Never log params (may contain credentials)
apiClient.interceptors.request.use(config => {
  if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
    console.error(`[API] ${config.method.toUpperCase()} ${config.baseURL}${config.url}`);
  }
  return config;
});

module.exports = {
  FIREFLY_URL,
  FIREFLY_TOKEN,
  PORT,
  apiClient
};
