/**
 * ClockHost Caching Strategy
 * Response headers, stale-while-revalidate, CDN cache hints, Redis adapter.
 */

import { NextResponse } from "next/server";
import crypto from "crypto";

/**
 * Cache control header presets.
 */
export const CACHE_PRESETS = {
  /** No caching */
  noStore: {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  },

  /** Cache for 60 seconds, allow stale for 5 minutes */
  short: {
    "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
  },

  /** Cache for 5 minutes, allow stale for 30 minutes */
  medium: {
    "Cache-Control": "public, max-age=300, stale-while-revalidate=1800",
  },

  /** Cache for 1 hour, allow stale for 6 hours */
  long: {
    "Cache-Control": "public, max-age=3600, stale-while-revalidate=21600",
  },

  /** Cache for 24 hours */
  day: {
    "Cache-Control": "public, max-age=86400",
  },

  /** Cache for 7 days */
  week: {
    "Cache-Control": "public, max-age=604800",
  },

  /** Private, user-specific data */
  private: {
    "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
  },

  /** Private, user-specific, shorter cache */
  privateShort: {
    "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
  },

  /** Immutable assets */
  immutable: {
    "Cache-Control": "public, max-age=31536000, immutable",
  },

  /** CDN edge cache only, bypass browser */
  cdnOnly: {
    "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=1800",
  },
};

/**
 * Apply cache headers to a NextResponse.
 * @param {NextResponse} response
 * @param {object} preset - Cache preset from CACHE_PRESETS
 * @param {object} extra - Additional headers
 */
export function withCache(response, preset = CACHE_PRESETS.noStore, extra = {}) {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(preset)) {
    headers.set(key, value);
  }

  for (const [key, value] of Object.entries(extra)) {
    headers.set(key, value);
  }

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Wrap an API handler with caching.
 *
 * Usage:
 *   export const GET = withCacheHandler(async (request) => {
 *     return NextResponse.json({ data: [...] });
 *   }, CACHE_PRESETS.medium);
 */
export function withCacheHandler(handler, preset = CACHE_PRESETS.noStore) {
  return async (request, context) => {
    const response = await handler(request, context);

    if (response instanceof NextResponse) {
      return withCache(response, preset);
    }

    return response;
  };
}

/**
 * Generate ETag from content.
 */
export function generateETag(content) {
  return crypto
    .createHash("md5")
    .update(typeof content === "string" ? content : JSON.stringify(content))
    .digest("hex");
}

/**
 * Check if client's ETag matches (for 304 responses).
 */
export function checkETag(request, etag) {
  const ifNoneMatch = request.headers.get("if-none-match");
  return ifNoneMatch && ifNoneMatch === etag;
}

/**
 * Redis cache adapter.
 * Falls back to in-memory cache when Redis is not configured.
 */
export class RedisCache {
  constructor() {
    this.redis = null;
    this.memoryCache = new Map();
    this.init();
  }

  async init() {
    try {
      if (process.env.REDIS_URL) {
        // Dynamic import for Redis (optional dependency)
        const Redis = (await import("ioredis")).default;
        this.redis = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: 3,
          retryStrategy(times) {
            return Math.min(times * 100, 3000);
          },
        });

        this.redis.on("error", (err) => {
          console.error("[Redis] Error:", err.message);
          this.redis = null;
        });

        console.log("[Redis] Connected");
      }
    } catch (error) {
      console.warn("[Redis] Not available, using memory cache");
      this.redis = null;
    }
  }

  /**
   * Get a cached value.
   */
  async get(key) {
    if (this.redis) {
      try {
        const value = await this.redis.get(key);
        return value ? JSON.parse(value) : null;
      } catch {
        return null;
      }
    }

    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Set a cached value with TTL.
   */
  async set(key, value, ttlSeconds = 300) {
    if (this.redis) {
      try {
        await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
        return;
      } catch {
        // Fall through to memory cache
      }
    }

    this.memoryCache.set(key, {
      value,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  /**
   * Delete cached values by pattern.
   */
  async del(pattern) {
    if (this.redis) {
      try {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
        return;
      } catch {
        // Fall through to memory cache
      }
    }

    const regex = new RegExp(pattern.replace("*", ".*"));
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Get cache stats.
   */
  async stats() {
    if (this.redis) {
      try {
        const info = await this.redis.info("stats");
        return { backend: "redis", info };
      } catch {
        return { backend: "redis", error: "unavailable" };
      }
    }

    return {
      backend: "memory",
      keys: this.memoryCache.size,
    };
  }
}

/**
 * Global Redis cache instance.
 */
export const redisCache = new RedisCache();

/**
 * Cache key builders for consistent key naming.
 */
export const cacheKeys = {
  listing: (id) => `listing:${id}`,
  listingAvailability: (id, date) => `listing:${id}:avail:${date}`,
  listingSearch: (query) => `search:${query}`,
  userProfile: (id) => `user:${id}`,
  hostEarnings: (id) => `host:earnings:${id}`,
  adminStats: () => `admin:stats`,
  reviewSummary: (listingId) => `reviews:${listingId}`,
  notifications: (userId) => `notifications:${userId}`,
  calendar: (listingId, month) => `calendar:${listingId}:${month}`,
};

/**
 * Warm the cache with popular listings.
 * Call from a cron job or on deploy.
 */
export async function warmCache(supabase) {
  console.log("[Cache] Warming cache...");

  try {
    // Fetch top 50 listings by popularity
    const { data: listings } = await supabase
      .from("listings")
      .select("id, title, city, category, price_kobo")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (listings) {
      for (const listing of listings) {
        await redisCache.set(cacheKeys.listing(listing.id), listing, 3600);
      }
      console.log(`[Cache] Warmed ${listings.length} listings`);
    }

    // Warm admin stats
    const { data: stats } = await supabase.rpc("get_admin_stats").single();
    if (stats) {
      await redisCache.set(cacheKeys.adminStats(), stats, 300);
    }
  } catch (error) {
    console.error("[Cache] Warm failed:", error.message);
  }
}
