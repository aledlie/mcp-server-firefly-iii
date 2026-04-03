import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Enhanced validation layer with Zod + JSON Schema generation
 * Provides runtime safety and auto-generated schemas for Claude
 */

// Common reusable schemas
export const schemas = {
  id: z.string().min(1, 'ID required').describe('Unique identifier'),
  uuid: z.string().uuid('Invalid UUID').describe('UUID identifier'),
  iso8601: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'YYYY-MM-DD format').describe('ISO 8601 date'),
  iso8601DateTime: z.string().datetime().describe('ISO 8601 datetime'),
  currency: z.string().length(3).toUpperCase().describe('3-letter currency code (e.g., USD)'),
  amount: z.number().describe('Monetary amount'),
  percentage: z.number().min(0).max(100).describe('Percentage 0-100'),
  url: z.string().url().optional().describe('Valid URL'),
  email: z.string().email().describe('Email address'),
  accountType: z.enum(['asset', 'expense', 'revenue', 'liabilities', 'loan', 'debt', 'equity']),
  transactionType: z.enum(['withdrawal', 'deposit', 'transfer', 'opening-balance']),
  accountRole: z.enum(['defaultAsset', 'savingsAccount', 'cc', 'loan']),
};

/**
 * Create validated handler wrapper
 * Catches and structures validation errors with helpful context
 */
export const createValidatedHandler = (schema, handler) => {
  return async (args) => {
    try {
      const validated = await schema.parseAsync(args);
      return await handler(validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError('Input validation failed', error.errors);
      }
      throw error;
    }
  };
};

/**
 * Convert Zod schema to MCP-compatible JSON schema
 * Includes descriptions, examples, and constraints
 */
export const toMCPSchema = (zodSchema) => {
  return zodToJsonSchema(zodSchema, {
    target: 'draft2020-12',
    $refStrategy: 'none',
  });
};

/**
 * Validation error with structured context
 */
export class ValidationError extends Error {
  constructor(message, zodErrors) {
    super(message);
    this.name = 'ValidationError';
    this.errors = zodErrors.map(e => ({
      field: e.path.join('.') || 'root',
      message: e.message,
      code: e.code,
      expected: e.expected,
      received: e.received,
    }));
  }
}

/**
 * Pre-built common validators
 */
export const validators = {
  listParams: z.object({
    limit: z.number().int().positive().max(500).default(50).describe('Max results to return'),
    offset: z.number().int().nonnegative().default(0).describe('Pagination offset'),
  }),

  dateRange: z.object({
    start: schemas.iso8601.describe('Start date (YYYY-MM-DD)'),
    end: schemas.iso8601.describe('End date (YYYY-MM-DD)'),
  }),

  createTransaction: z.object({
    type: schemas.transactionType,
    source_id: schemas.id.describe('Source account ID'),
    destination_id: schemas.id.describe('Destination account ID'),
    amount: schemas.amount.describe('Transaction amount'),
    date: schemas.iso8601,
    description: z.string().max(1000).optional(),
    tags: z.array(z.string()).default([]),
    category_id: schemas.id.optional(),
  }),

  account: z.object({
    name: z.string().min(1).max(100),
    type: schemas.accountType,
    account_role: schemas.accountRole.optional(),
    currency_code: schemas.currency.default('USD'),
    initial_balance: schemas.amount.default(0),
    notes: z.string().optional(),
  }),

  budget: z.object({
    name: z.string().min(1).max(100),
    period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']),
    amount: schemas.amount.describe('Budget limit amount'),
    start_date: schemas.iso8601.optional(),
  }),
};
