const { buildPaginationParams, extractPaginationMeta, DEFAULT_LIMIT } = require('./pagination.js');

describe('buildPaginationParams', () => {
  it('returns default limit when no args provided', () => {
    expect(buildPaginationParams({})).toEqual({ limit: DEFAULT_LIMIT });
  });

  it('uses provided limit', () => {
    expect(buildPaginationParams({ limit: 25 })).toEqual({ limit: 25 });
  });

  it('converts offset to page number', () => {
    expect(buildPaginationParams({ offset: 100 })).toEqual({ limit: DEFAULT_LIMIT, page: 3 });
  });

  it('converts offset to page with custom limit', () => {
    expect(buildPaginationParams({ limit: 10, offset: 30 })).toEqual({ limit: 10, page: 4 });
  });

  it('offset 0 produces no page param', () => {
    expect(buildPaginationParams({ offset: 0 })).toEqual({ limit: DEFAULT_LIMIT });
  });

  it('passes cursor directly', () => {
    expect(buildPaginationParams({ cursor: 'abc123' })).toEqual({ limit: DEFAULT_LIMIT, cursor: 'abc123' });
  });

  it('cursor takes precedence over offset', () => {
    const result = buildPaginationParams({ cursor: 'abc', offset: 100 });
    expect(result).toEqual({ limit: DEFAULT_LIMIT, cursor: 'abc' });
    expect(result.page).toBeUndefined();
  });

  it('uses custom limit with cursor', () => {
    expect(buildPaginationParams({ limit: 10, cursor: 'xyz' })).toEqual({ limit: 10, cursor: 'xyz' });
  });
});

describe('extractPaginationMeta', () => {
  it('returns null when no meta present', () => {
    expect(extractPaginationMeta({})).toBeNull();
    expect(extractPaginationMeta({ data: [] })).toBeNull();
    expect(extractPaginationMeta(null)).toBeNull();
    expect(extractPaginationMeta(undefined)).toBeNull();
  });

  it('extracts cursor pagination metadata', () => {
    const response = {
      data: [],
      meta: {
        cursor_pagination: {
          per_page: 50,
          next_cursor: 'eyJpZCI6MTAwfQ==',
          prev_cursor: null,
          has_more: true,
        },
      },
    };
    expect(extractPaginationMeta(response)).toEqual({
      has_more: true,
      next_cursor: 'eyJpZCI6MTAwfQ==',
      prev_cursor: null,
      per_page: 50,
    });
  });

  it('normalizes missing cursor values to null', () => {
    const response = {
      meta: {
        cursor_pagination: {
          per_page: 25,
          has_more: false,
        },
      },
    };
    const result = extractPaginationMeta(response);
    expect(result.next_cursor).toBeNull();
    expect(result.prev_cursor).toBeNull();
  });

  it('extracts offset pagination metadata', () => {
    const response = {
      data: [],
      meta: {
        pagination: {
          total: 150,
          per_page: 50,
          current_page: 2,
          total_pages: 3,
        },
      },
    };
    expect(extractPaginationMeta(response)).toEqual({
      has_more: true,
      total: 150,
      current_page: 2,
      per_page: 50,
    });
  });

  it('sets has_more false on last page', () => {
    const response = {
      meta: {
        pagination: {
          total: 100,
          per_page: 50,
          current_page: 2,
          total_pages: 2,
        },
      },
    };
    expect(extractPaginationMeta(response).has_more).toBe(false);
  });

  it('prefers cursor over offset when both present', () => {
    const response = {
      meta: {
        cursor_pagination: { per_page: 50, has_more: true, next_cursor: 'abc' },
        pagination: { total: 100, per_page: 50, current_page: 1, total_pages: 2 },
      },
    };
    const result = extractPaginationMeta(response);
    expect(result.next_cursor).toBe('abc');
    expect(result.total).toBeUndefined();
  });
});
