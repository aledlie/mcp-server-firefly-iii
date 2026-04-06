const { apiClient } = require("../config.js");
const { buildPaginationParams, extractPaginationMeta } = require("../pagination.js");

const PAGINATION_PROPERTIES = {
  limit: { type: "number", description: "Max results (default: 50)" },
  offset: { type: "number", description: "Pagination offset" },
  cursor: { type: "string", description: "Cursor from previous response for cursor-based pagination" },
};

const accountsTools = [
  {
    name: "list_accounts",
    description: "List all accounts.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["asset", "expense", "revenue", "liabilities"] },
        ...PAGINATION_PROPERTIES,
      },
    },
    handler: async (args) => {
      const params = { type: args.type || "asset", ...buildPaginationParams(args) };
      const response = (await apiClient.get("/accounts", { params })).data;
      const pagination = extractPaginationMeta(response);
      return pagination ? { ...response, _pagination: pagination } : response;
    }
  },
  {
    name: "get_account",
    description: "Get a single account by ID.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (args) => (await apiClient.get(`/accounts/${args.id}`)).data
  },
  {
    name: "create_account",
    description: "Create a new account.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        type: { type: "string", enum: ["asset", "expense", "revenue", "liabilities"] },
        account_role: { type: "string", enum: ["defaultAsset", "sharedAsset", "savingAsset", "ccAsset", "cashAsset"] },
        currency_code: { type: "string" },
        opening_balance: { type: "string" },
        opening_balance_date: { type: "string", description: "YYYY-MM-DD" },
        credit_card_type: { type: "string", enum: ["monthlyFull", "interest"] },
        monthly_payment_date: { type: "string", description: "YYYY-MM-DD" }
      },
      required: ["name", "type"]
    },
    handler: async (args) => (await apiClient.post("/accounts", args)).data
  },
  {
    name: "update_account",
    description: "Update an existing account.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" }, active: { type: "boolean" } },
      required: ["id"]
    },
    handler: async (args) => {
      const { id, ...data } = args;
      return (await apiClient.put(`/accounts/${id}`, data)).data;
    }
  },
  {
    name: "delete_account",
    description: "Permanently delete an account.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (args) => {
      await apiClient.delete(`/accounts/${args.id}`);
      return { message: "Account deleted successfully." };
    }
  }
];

module.exports = accountsTools;
