const { apiClient } = require("../config.js");
const { buildPaginationParams, extractPaginationMeta } = require("../pagination.js");

const PAGINATION_PROPERTIES = {
  limit: { type: "number", description: "Max results (default: 50)" },
  offset: { type: "number", description: "Pagination offset" },
  cursor: { type: "string", description: "Cursor from previous response for cursor-based pagination" },
};

const budgetsTools = [
  {
    name: "list_budgets",
    description: "List all budgets.",
    inputSchema: {
      type: "object",
      properties: { ...PAGINATION_PROPERTIES },
    },
    handler: async (args) => {
      const params = buildPaginationParams(args);
      const response = (await apiClient.get("/budgets", { params })).data;
      const pagination = extractPaginationMeta(response);
      return pagination ? { ...response, _pagination: pagination } : response;
    }
  },
  {
    name: "get_budget",
    description: "Get a single budget by ID.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (args) => (await apiClient.get(`/budgets/${args.id}`)).data
  },
  {
    name: "create_budget",
    description: "Create a new budget.",
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    handler: async (args) => (await apiClient.post("/budgets", args)).data
  },
  {
    name: "update_budget",
    description: "Update a budget.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" }, active: { type: "boolean" } },
      required: ["id"]
    },
    handler: async (args) => {
      const { id, ...data } = args;
      return (await apiClient.put(`/budgets/${id}`, data)).data;
    }
  },
  {
    name: "delete_budget",
    description: "Delete a budget.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (args) => {
      await apiClient.delete(`/budgets/${args.id}`);
      return { message: "Budget deleted successfully." };
    }
  },
  {
    name: "list_budget_limits",
    description: "List monetary limits for a budget.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        ...PAGINATION_PROPERTIES,
      },
      required: ["id"],
    },
    handler: async (args) => {
      const params = buildPaginationParams(args);
      const response = (await apiClient.get(`/budgets/${args.id}/limits`, { params })).data;
      const pagination = extractPaginationMeta(response);
      return pagination ? { ...response, _pagination: pagination } : response;
    }
  },
  {
    name: "create_budget_limit",
    description: "Set a monetary limit for a budget period.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        amount: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
        currency_code: { type: "string" }
      },
      required: ["id", "amount", "start", "end"]
    },
    handler: async (args) => {
      const { id, ...data } = args;
      return (await apiClient.post(`/budgets/${id}/limits`, data)).data;
    }
  },
  {
    name: "delete_budget_limit",
    description: "Delete a budget limit.",
    inputSchema: { type: "object", properties: { budget_id: { type: "string" }, limit_id: { type: "string" } }, required: ["budget_id", "limit_id"] },
    handler: async (args) => {
      await apiClient.delete(`/budgets/${args.budget_id}/limits/${args.limit_id}`);
      return { message: "Budget limit deleted successfully." };
    }
  }
];

module.exports = budgetsTools;
