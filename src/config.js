const axios = require("axios");
require("dotenv").config();
const logger = require("./logger.js");

// Configuration
const FIREFLY_URL = process.env.FIREFLY_URL;
const FIREFLY_TOKEN = process.env.FIREFLY_TOKEN;
const PORT = process.env.PORT;

if (!FIREFLY_URL || !FIREFLY_TOKEN) {
  // If we are in test mode, we bypass the error
  if (process.env.NODE_ENV !== "test") {
    logger.fatal("FIREFLY_URL and FIREFLY_TOKEN are required");
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

// Debug interceptor — never log params (may contain credentials)
apiClient.interceptors.request.use(config => {
  logger.debug({ method: config.method.toUpperCase(), url: `${config.baseURL}${config.url}` }, 'api request');
  return config;
});

module.exports = {
  FIREFLY_URL,
  FIREFLY_TOKEN,
  PORT,
  apiClient
};
