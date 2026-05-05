/**
 * In-memory LRU cache for search-query embeddings (M-16).
 *
 * Why this exists: OpenAI's embeddings API takes ~300-800ms for a single
 * call, plus Vercel cold-start can add 1-3s. Repeat searches for the same
 * query string burn that latency every time even though the embedding
 * doesn't change. This module memoizes the most-recent N query embeddings
 * for a short TTL so repeat searches return in ~5ms.
 *
 * Scope: deliberately scoped to the search-query path only — NOT used by
 * the indexing pipeline (lib/embeddings is the canonical client there,
 * and we don't want to mask real content changes during indexing).
 *
 * Eviction: LRU. The Map iteration order is insertion order, so we
 * delete-then-set on a hit to bump it to "most recent."
 */
import { embedText, EmbeddingError } from "@/lib/embeddings";

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 200;
const FETCH_TIMEOUT_MS = 4000; // hard fail-fast for the search path

interface CacheEntry {
  vector: number[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Wrapped embedText for the search path. Cache key is the trimmed,
 * lower-cased query string — so "Raelynn" and "raelynn " hit the same
 * cache slot.
 *
 * Throws EmbeddingError on OpenAI auth/server failures (caller is the
 * /api/search route, which already maps EmbeddingError → 503).
 */
export async function cachedEmbedQuery(query: string): Promise<number[] | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;

  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    // Bump to most-recent.
    cache.delete(key);
    cache.set(key, hit);
    return hit.vector;
  }
  // Stale — drop it so we don't keep iterating over expired entries.
  if (hit) cache.delete(key);

  // Miss — call OpenAI with a hard timeout. AbortController cancels the
  // fetch in lib/embeddings/client.ts via the global signal route.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // embedText() doesn't take an AbortSignal in V1, but we still set a
    // race so the search path doesn't wait beyond the timeout. If the
    // race times out we throw EmbeddingError so /api/search returns 503.
    const vector = await Promise.race([
      embedText(query),
      new Promise<null>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new EmbeddingError(
                `Embedding request exceeded ${FETCH_TIMEOUT_MS}ms timeout`,
              ),
            ),
          FETCH_TIMEOUT_MS,
        ),
      ),
    ]);
    if (!vector) return null;

    // Insert + LRU-evict if over capacity.
    cache.set(key, { vector, expiresAt: now + TTL_MS });
    if (cache.size > MAX_ENTRIES) {
      // Map's first key is the oldest insertion — drop it.
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }

    return vector;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
