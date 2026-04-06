const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // MCP stdio mode uses stdin/stdout for protocol messages — log to stderr
  transport: undefined,
}, pino.destination(2));

module.exports = logger;
