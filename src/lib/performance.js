/**
 * ClockHost Performance Utilities
 * Query caching, connection pooling awareness, N+1 prevention.
 */

/**
 * Simple in-memory cache with TTL support.
 * For production, use Redis or Upstash.
 */
class MemoryCache {
  constructor() {
    this.store = new Map();
    this.timers = new Map();
  }

  /**
   * Get a cached value by key.
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * Set a cached value with optional TTL.
   * @param {string} key
   * @param {*} value
   * @param {number} ttlMs - Time to live in milliseconds (0 = no expiry)
   */
  set(key, value, ttlMs = 0) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    const entry = {
      value,
      expiresAt: ttlMs > 0 ? Date.now() + ttlMs : null,
    };

    this.store.set(key, entry);

    if (ttlMs > 0) {
      const timer = setTimeout(() => this.delete(key), ttlMs);
      this.timers.set(key, timer);
    }
  }

  /**
   * Delete a cached value.
   */
  delete(key) {
    this.store.delete(key);
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
  }

  /**
   * Clear all cached values.
   */
  clear() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.store.clear();
    this.timers.clear();
  }

  /**
   * Get cache stats.
   */
  stats() {
    let valid = 0;
    let expired = 0;
    const now = Date.now();

    for (const [, entry] of this.store) {
      if (entry.expiresAt && now > entry.expiresAt) {
        expired++;
      } else {
        valid++;
      }
    }

    return { total: this.store.size, valid, expired };
  }
}

// Global cache instance
export const cache = new MemoryCache();

/**
 * Cache a function result with TTL.
 * @param {string} key - Cache key
 * @param {number} ttlMs - TTL in milliseconds
 * @param {Function} fn - Function to cache
 * @returns {*} Cached or fresh result
 */
export async function cached(key, ttlMs, fn) {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const result = await fn();
  cache.set(key, result, ttlMs);
  return result;
}

/**
 * Invalidate cache entries matching a pattern.
 */
export function invalidatePattern(pattern) {
  const regex = new RegExp(pattern);
  for (const key of cache.store.keys()) {
    if (regex.test(key)) {
      cache.delete(key);
    }
  }
}

/**
 * Batch loader for N+1 prevention.
 * Groups individual lookups into a single batch query.
 *
 * Usage:
 *   const loader = new BatchLoader(async (ids) => {
 *     return await supabase.from('listings').select('*').in('id', ids);
 *   });
 *   const listing1 = await loader.load(id1);
 *   const listing2 = await loader.load(id2);
 *   // Both are fetched in one query
 */
export class BatchLoader {
  constructor(batchFn, options = {}) {
    this.batchFn = batchFn;
    this.maxBatchSize = options.maxBatchSize || 100;
    this.cache = new Map();
    this.pending = new Map();
  }

  /**
   * Load a single item by key.
   */
  async load(key) {
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // Check pending batch
    if (this.pending.has(key)) {
      return this.pending.get(key);
    }

    // Create a promise for this key
    const promise = new Promise((resolve, reject) => {
      this.pending.set(key, { resolve, reject });
    });

    // If this is the first pending item, schedule a batch
    if (this.pending.size === 1) {
      setTimeout(() => this._executeBatch(), 0);
    }

    return promise;
  }

  /**
   * Load multiple items by keys.
   */
  async loadMany(keys) {
    return Promise.all(keys.map((k) => this.load(k)));
  }

  /**
   * Execute the pending batch.
   */
  async _executeBatch() {
    const pending = new Map(this.pending);
    this.pending.clear();

    const keys = [...pending.keys()].slice(0, this.maxBatchSize);

    try {
      const results = await this.batchFn(keys);

      // Map results back to promises
      for (const key of keys) {
        const result = results.find((r) => r.id === key || r.key === key);
        const entry = pending.get(key);

        if (result) {
          this.cache.set(key, result);
          entry.resolve(result);
        } else {
          entry.resolve(null);
        }
      }
    } catch (error) {
      // Reject all pending promises
      for (const key of keys) {
        const entry = pending.get(key);
        entry.reject(error);
      }
    }
  }

  /**
   * Clear the loader cache.
   */
  clear() {
    this.cache.clear();
  }
}

/**
 * Rate limiter using sliding window.
 * More accurate than fixed window.
 */
export class SlidingWindowRateLimiter {
  constructor(windowMs = 60000, maxRequests = 60) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.requests = new Map();
  }

  /**
   * Check if a request is allowed.
   * @param {string} key - Rate limit key (e.g., IP, user ID)
   * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
   */
  check(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get existing requests
    const timestamps = (this.requests.get(key) || []).filter((t) => t > windowStart);

    if (timestamps.length >= this.maxRequests) {
      const resetAt = timestamps[0] + this.windowMs;
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: resetAt - now,
      };
    }

    // Record this request
    timestamps.push(now);
    this.requests.set(key, timestamps);

    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
      resetAt: now + this.windowMs,
    };
  }

  /**
   * Clean up expired entries.
   */
  cleanup() {
    const now = Date.now() - this.windowMs;
    for (const [key, timestamps] of this.requests) {
      const valid = timestamps.filter((t) => t > now);
      if (valid.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, valid);
      }
    }
  }
}

/**
 * Query performance tracker.
 * Logs slow queries for optimization.
 */
export class QueryTracker {
  constructor(slowThresholdMs = 1000) {
    this.slowThresholdMs = slowThresholdMs;
    this.queries = [];
  }

  /**
   * Track a query execution.
   */
  track(queryName, fn) {
    const start = Date.now();
    const result = fn();
    const duration = Date.now() - start;

    this.queries.push({
      name: queryName,
      duration,
      timestamp: new Date().toISOString(),
    });

    if (duration > this.slowThresholdMs) {
      console.warn(`[SLOW QUERY] ${queryName} took ${duration}ms`);
    }

    return result;
  }

  /**
   * Get query stats.
   */
  stats() {
    if (this.queries.length === 0) return null;

    const durations = this.queries.map((q) => q.duration);
    return {
      total: this.queries.length,
      avg: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      max: Math.max(...durations),
      min: Math.min(...durations),
      slow: this.queries.filter((q) => q.duration > this.slowThresholdMs).length,
    };
  }
}

export const queryTracker = new QueryTracker();

/**
 * Pagination helper with cursor support.
 */
export function paginate(query, { page = 1, pageSize = 20, cursor = null, sortBy = "created_at", sortOrder = "desc" }) {
  const limit = Math.min(100, Math.max(1, pageSize));
  const offset = cursor ? 0 : (Math.max(1, page) - 1) * limit;

  return query
    .order(sortBy, { ascending: sortOrder === "asc" })
    .range(offset, offset + limit - 1);
}
