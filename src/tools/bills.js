const { apiClient } = require("../config.js");
const { buildPaginationParams, extractPaginationMeta } = require("../pagination.js");

const PAGINATION_PROPERTIES = {
  limit: { type: "number", description: "Max results (default: 50)" },
  offset: { type: "number", description: "Pagination offset" },
  cursor: { type: "string", description: "Cursor from previous response for cursor-based pagination" },
};

const billsTools = [
  {
    name: "list_bills",
    description: "List all bills.",
    inputSchema: {
      type: "object",
      properties: { ...PAGINATION_PROPERTIES },
    },
    handler: async (args) => {
      const params = buildPaginationParams(args);
      const response = (await apiClient.get("/bills", { params })).data;
      const pagination = extractPaginationMeta(response);
      return pagination ? { ...response, _pagination: pagination } : response;
    }
  },
  {
    name: "create_bill",
    description: "Create a new bill.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        amount_min: { type: "string" },
        amount_max: { type: "string" },
        date: { type: "string" },
        repeat_freq: { type: "string" }
      },
      required: ["name", "amount_min", "amount_max", "date", "repeat_freq"]
    },
    handler: async (args) => (await apiClient.post("/bills", args)).data
  },
  {
    name: "delete_bill",
    description: "Delete a bill.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (args) => {
      await apiClient.delete(`/bills/${args.id}`);
      return { message: "Bill deleted successfully." };
    }
  },
  {
    name: "list_piggy_banks",
    description: "List all piggy banks.",
    inputSchema: {
      type: "object",
      properties: { ...PAGINATION_PROPERTIES },
    },
    handler: async (args) => {
      const params = buildPaginationParams(args);
      const response = (await apiClient.get("/piggy-banks", { params })).data;
      const pagination = extractPaginationMeta(response);
      return pagination ? { ...response, _pagination: pagination } : response;
    }
  },
  {
    name: "create_piggy_bank",
    description: "Create a new piggy bank.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        target_amount: { type: "string" },
        account_id: { type: "string" }
      },
      required: ["name", "target_amount", "account_id"]
    },
    handler: async (args) => (await apiClient.post("/piggy-banks", args)).data
  },
  {
    name: "update_piggy_bank",
    description: "Add/remove money from goal.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, amount: { type: "string" } },
      required: ["id", "amount"]
    },
    handler: async (args) => {
      await apiClient.post(`/piggy-banks/${args.id}/events`, { amount: args.amount });
      return { message: "Piggy bank updated successfully." };
    }
  },
  {
    name: "delete_piggy_bank",
    description: "Delete a piggy bank.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (args) => {
      await apiClient.delete(`/piggy-banks/${args.id}`);
      return { message: "Piggy bank deleted successfully." };
    }
  }
];

module.exports = billsTools;
