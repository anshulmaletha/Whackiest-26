/**
 * Server-side cache for search result markdown and extracted snippetInfo.
 * Keyed by URL. Used by /api/site to skip re-scraping results we already fetched.
 */

interface CacheEntry {
  markdown: string
  snippetInfo: Record<string, string>
  timestamp: number
}

const TTL_MS = 10 * 60 * 1000 // 10 minutes
const cache = new Map<string, CacheEntry>()

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname}${u.pathname}`.replace(/\/+$/, "").toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

export function setSearchMarkdown(url: string, markdown: string, snippetInfo: Record<string, string>): void {
  cache.set(normalizeUrl(url), { markdown, snippetInfo, timestamp: Date.now() })
}

export function getSearchMarkdown(url: string): CacheEntry | null {
  const key = normalizeUrl(url)
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry
}

export function hasSearchMarkdown(url: string): boolean {
  return getSearchMarkdown(url) !== null
}
