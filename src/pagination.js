const DEFAULT_LIMIT = 50;

/**
 * Build Firefly III API query params from pagination args.
 * Supports offset-based (limit + page) and cursor-based pagination.
 *
 * @param {object} args - Tool input args (may include limit, offset, cursor)
 * @returns {object} Query params for apiClient.get()
 */
function buildPaginationParams(args) {
  const limit = args.limit || DEFAULT_LIMIT;
  const params = { limit };

  if (args.cursor) {
    params.cursor = args.cursor;
  } else if (args.offset) {
    params.page = Math.floor(args.offset / limit) + 1;
  }

  return params;
}

/**
 * Extract normalized pagination metadata from a Firefly III API response.
 * Handles both cursor-based and offset-based response formats.
 *
 * @param {object} responseData - Full API response data
 * @returns {object|null} Normalized pagination info, or null if absent
 */
function extractPaginationMeta(responseData) {
  const cursorMeta = responseData?.meta?.cursor_pagination;
  if (cursorMeta) {
    return {
      has_more: cursorMeta.has_more,
      next_cursor: cursorMeta.next_cursor || null,
      prev_cursor: cursorMeta.prev_cursor || null,
      per_page: cursorMeta.per_page,
    };
  }

  const offsetMeta = responseData?.meta?.pagination;
  if (offsetMeta) {
    return {
      has_more: offsetMeta.current_page < offsetMeta.total_pages,
      total: offsetMeta.total,
      current_page: offsetMeta.current_page,
      per_page: offsetMeta.per_page,
    };
  }

  return null;
}

module.exports = { buildPaginationParams, extractPaginationMeta, DEFAULT_LIMIT };
