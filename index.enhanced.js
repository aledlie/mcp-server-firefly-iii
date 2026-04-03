#!/usr/bin/env node

/**
 * Enhanced Firefly III MCP Server with Claude ecosystem support
 * Features: Zod validation, structured errors, resource metadata, tool grouping
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { apiClient, FIREFLY_URL, FIREFLY_TOKEN, PORT } from './src/config.js';
import { formatErrorResponse, wrapFireflyError } from './src/errors.js';
import {
  getResourceHint,
  estimateTokenCost,
  resolveDependencies,
  getToolCategory,
} from './src/resource-metadata.js';
import { toMCPSchema, ValidationError } from './src/validation.js';

// Import tool modules
import coreTools from './src/tools/core.js';
import accountsTools from './src/tools/accounts.js';
import transactionsTools from './src/tools/transactions.js';
import budgetsTools from './src/tools/budgets.js';
import automationTools from './src/tools/automation.js';
import systemTools from './src/tools/system.js';
import insightsTools from './src/tools/insights.js';
import metaTools from './src/tools/meta.js';
import billsTools from './src/tools/bills.js';
import groupsTools from './src/tools/groups.js';
import recurringTools from './src/tools/recurring.js';
import adminTools from './src/tools/admin.js';

// Aggregate tools
const toolModules = [
  coreTools,
  accountsTools,
  transactionsTools,
  budgetsTools,
  automationTools,
  systemTools,
  insightsTools,
  metaTools,
  billsTools,
  groupsTools,
  recurringTools,
  adminTools,
];

const TOOLS = toolModules.flat();

/**
 * Enhance tool metadata with resource hints and validation
 */
function enrichToolMetadata(tool) {
  const resourceHint = getResourceHint(tool.name);
  const category = getToolCategory(tool.name);

  return {
    ...tool,
    _resourceMetadata: resourceHint,
    _category: category,
    _claudeHints: resourceHint?.hints || [],
    // Keep handler separate for MCP
    _handler: tool.handler,
  };
}

const enrichedTools = TOOLS.map(enrichToolMetadata);

// --- MCP Server Implementation ---
const mcpServer = new Server(
  { name: 'mcp-server-firefly-iii', version: '3.0.0' },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List available tools with metadata
 */
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: enrichedTools.map(({ _handler, _resourceMetadata, _category, _claudeHints, ...tool }) => ({
    ...tool,
    // Include Claude hints in description for visibility
    description: tool.description + (_claudeHints?.length ? ` | ${_claudeHints.join(' ')}` : ''),
    _metadata: {
      category: _category,
      resourceHints: _resourceMetadata,
    },
  })),
}));

/**
 * Execute tool with enhanced error handling and validation
 */
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = enrichedTools.find((t) => t.name === request.params.name);

  if (!tool) {
    const error = {
      isError: true,
      code: 'TOOL_NOT_FOUND',
      message: `Tool not found: ${request.params.name}`,
      availableTools: enrichedTools.map((t) => t.name),
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(error, null, 2) }],
    };
  }

  try {
    const args = request.params.arguments || {};

    // Call handler
    const result = await tool._handler(args);

    // Estimate token cost for Claude awareness
    const estimatedTokens = estimateTokenCost(tool.name, args, 'default');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              data: result,
              _claude: {
                estimatedTokens,
                cached: tool._resourceMetadata?.cacheable === true,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    let formatted;

    if (error instanceof ValidationError) {
      formatted = {
        isError: true,
        code: 'VALIDATION_ERROR',
        message: error.message,
        errors: error.errors,
      };
    } else {
      const firefly = wrapFireflyError(error, { tool: tool.name });
      formatted = formatErrorResponse(firefly);
    }

    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }],
    };
  }
});

/**
 * Run server in stdio or web mode
 */
async function runServer() {
  if (PORT) {
    const app = express();
    app.use(express.json());

    let transport;

    // SSE support
    app.get('/sse', async (req, res) => {
      transport = new SSEServerTransport('/messages', res);
      await mcpServer.connect(transport);
    });

    app.post('/messages', async (req, res) => {
      if (transport) await transport.handlePostMessage(req, res);
    });

    // REST API endpoints
    enrichedTools.forEach((tool) => {
      app.all(`/api/${tool.name}`, async (req, res) => {
        try {
          const args = req.method === 'GET' ? req.query : req.body;
          const result = await tool._handler(args);
          res.json({ data: result });
        } catch (error) {
          const formatted = formatErrorResponse(
            error instanceof ValidationError ? error : wrapFireflyError(error)
          );
          res.status(400).json(formatted);
        }
      });
    });

    // OpenAPI spec with Claude enhancements
    app.get('/openapi.json', (req, res) => {
      const host = req.get('host');
      const spec = {
        openapi: '3.0.0',
        info: {
          title: 'Firefly III MCP Server (Claude-Enhanced)',
          version: '3.0.0',
          description:
            'Enhanced MCP server with Zod validation, structured errors, and resource metadata',
        },
        servers: [{ url: `http://${host}/api` }],
        paths: {},
        'x-claude': {
          resourceMetadata: enrichedTools.map((t) => ({
            name: t.name,
            ...t._resourceMetadata,
          })),
        },
      };

      enrichedTools.forEach((t) => {
        spec.paths[`/${t.name}`] = {
          post: {
            operationId: t.name,
            summary: t.description,
            tags: [t._category || 'uncategorized'],
            'x-claude-hints': t._claudeHints,
            requestBody: {
              content: {
                'application/json': {
                  schema: t.inputSchema,
                },
              },
            },
            responses: {
              '200': {
                description: 'Success',
              },
              '400': {
                description: 'Validation or execution error',
              },
            },
          },
        };
      });

      res.json(spec);
    });

    // Metadata endpoint
    app.get('/tools/metadata', (req, res) => {
      res.json({
        tools: enrichedTools.map((t) => ({
          name: t.name,
          category: t._category,
          resourceMetadata: t._resourceMetadata,
        })),
      });
    });

    // Dependency resolver
    app.post('/tools/resolve-dependencies', (req, res) => {
      const { toolNames } = req.body;
      if (!toolNames || !Array.isArray(toolNames)) {
        return res.status(400).json({ error: 'toolNames array required' });
      }
      const resolved = resolveDependencies(toolNames);
      res.json({ resolved, count: resolved.length });
    });

    app.listen(PORT, () => {
      console.error(`✅ Firefly III MCP Server (Claude-Enhanced) running at http://localhost:${PORT}`);
      console.error(`📚 OpenAPI: http://localhost:${PORT}/openapi.json`);
      console.error(`🔍 Metadata: http://localhost:${PORT}/tools/metadata`);
    });
  } else {
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    console.error('✅ Firefly III MCP Server running on stdio');
  }
}

// Start server
if (import.meta.url === `file://${process.argv[1]}`) {
  runServer().catch(console.error);
}

export { mcpServer, enrichedTools as TOOLS, apiClient };
