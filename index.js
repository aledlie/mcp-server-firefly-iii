#!/usr/bin/env node
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const express = require("express");
const { FIREFLY_URL, FIREFLY_TOKEN, PORT, apiClient } = require("./src/config.js");
const { FireflyError, toMCPErrorResult, wrapFireflyError } = require("./src/errors.js");
const { rateLimited } = require("./src/rate-limiter.js");
const responseCache = require("./src/response-cache.js");
const { withRetry } = require("./src/retry.js");
const logger = require("./src/logger.js");

// Import tool registry (no side effects — no Server instantiation)
const { TOOLS } = require('./src/tools/registry.js');

// --- MCP Server Implementation ---
const mcpServer = new Server(
  { name: "mcp-server-firefly-iii", version: "3.0.0" },
  { capabilities: { tools: {} } }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ handler, ...tool }) => tool)
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = TOOLS.find(t => t.name === request.params.name);
  if (!tool) {
    const toolNotFoundError = new FireflyError(
      "TOOL_NOT_FOUND",
      `Tool not found: ${request.params.name}`,
      { availableTools: TOOLS.map(t => t.name) }
    );
    return toMCPErrorResult(toolNotFoundError);
  }

  try {
    const args = request.params.arguments || {};

    const cached = responseCache.get(tool.name, args);
    if (cached !== undefined) {
      return { content: [{ type: "text", text: JSON.stringify(cached, null, 2) }] };
    }

    const result = await rateLimited(tool.name, () => withRetry(tool.name, () => tool.handler(args)));
    responseCache.set(tool.name, args, result);
    responseCache.invalidateAfterWrite(tool.name);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return toMCPErrorResult(wrapFireflyError(error, { tool: request.params.name }));
  }
});

// --- Universal Web API (Express) ---
async function runServer() {
  if (PORT) {
    const app = express();
    app.use(express.json());

    // Session-keyed transports — prevents connection overwrites when multiple clients connect
    const sessions = new Map();
    app.get("/sse", async (req, res) => {
      const sessionId = req.query.sessionId || require("crypto").randomUUID();
      const transport = new SSEServerTransport(`/messages?sessionId=${sessionId}`, res);
      sessions.set(sessionId, transport);

      const cleanup = () => sessions.delete(sessionId);
      res.on("close", cleanup);
      res.on("error", cleanup);

      try {
        await mcpServer.connect(transport);
      } catch (error) {
        cleanup();
        throw error;
      }
    });
    app.post("/messages", async (req, res) => {
      const sessionId = req.query.sessionId;
      const transport = sessions.get(sessionId);
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(400).json({ error: "Session not found" });
      }
    });

    TOOLS.forEach(tool => {
      app.all(`/api/${tool.name}`, async (req, res) => {
        try {
          const args = req.method === 'GET' ? req.query : req.body;
          const result = await rateLimited(tool.name, () => withRetry(tool.name, () => tool.handler(args)));
          res.json(result);
        } catch (e) {
          res.status(500).json({ error: e.message });
        }
      });
    });

    app.get("/openapi.json", (req, res) => {
      const host = req.get('host');
      const spec = {
        openapi: "3.0.0",
        info: { title: "Firefly III AI Bridge", version: "3.0.0" },
        servers: [{ url: `http://${host}/api` }],
        paths: {}
      };
      TOOLS.forEach(t => {
        spec.paths[`/${t.name}`] = {
          post: {
            operationId: t.name,
            summary: t.description,
            requestBody: { content: { "application/json": { schema: t.inputSchema } } },
            responses: { "200": { description: "Success" } }
          }
        };
      });
      res.json(spec);
    });

    app.listen(PORT, () => {
      logger.info({ port: PORT }, 'Universal AI Bridge listening');
    });
  } else {
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    logger.info("Firefly III MCP Server running on stdio");
  }
}

if (require.main === module) {
  runServer().catch((err) => { logger.fatal(err, 'server failed to start'); process.exit(1); });
}

module.exports = { mcpServer, TOOLS, apiClient };
