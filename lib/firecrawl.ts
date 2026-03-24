import FirecrawlApp from "@mendable/firecrawl-js"

const apiKey = process.env.FIRECRAWL_API_KEY
if (!apiKey) {
  console.warn("FIRECRAWL_API_KEY is not set")
}

const firecrawl = new FirecrawlApp({ apiKey: apiKey ?? "" })

function withTimeout<T>(promise: Promise<T>, fallback: T, label: string, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    promise.then((v) => { clearTimeout(timer); return v }),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => {
        console.warn(`[firecrawl] ${label} timed out after ${timeoutMs}ms`)
        resolve(fallback)
      }, timeoutMs)
    }),
  ])
}

/**
 * Fast search — no markdown scraping, no scrapeOptions.
 * Returns results in ~1-2 seconds. Used by /api/search for voice responsiveness.
 */
export async function searchWebFast(query: string) {
  const t0 = Date.now()
  const fallback = { success: false as const, data: [] as unknown[] }

  const raw = await withTimeout(
    firecrawl.search(query, { limit: 5 }),
    null,
    "fast-search",
    3_500
  )

  console.log(`[firecrawl] fast search took ${Date.now() - t0}ms`)

  if (!raw || typeof raw !== "object") return fallback
  const r = raw as { success?: boolean; data?: unknown[]; error?: string }
  if (!r.success || !Array.isArray(r.data)) {
    console.warn("[firecrawl:fast-search] failed:", r.error ?? "no data")
    return fallback
  }
  return r
}

/**
 * Enriched search — includes markdown scraping via scrapeOptions.
 * Slower (~3-8s) but returns full page content for deep extraction.
 * Used only when we need markdown (e.g., background enrichment).
 */
export async function searchWebEnriched(query: string) {
  const t0 = Date.now()
  const fallback = { success: false as const, data: [] as unknown[] }

  const raw = await withTimeout(
    firecrawl.search(query, {
      limit: 5,
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true,
      },
    }),
    null,
    "enriched-search",
    8_000
  )

  console.log(`[firecrawl] enriched search took ${Date.now() - t0}ms`)

  if (raw && typeof raw === "object") {
    const r = raw as { success?: boolean; data?: unknown[]; error?: string }
    if (r.success && Array.isArray(r.data) && r.data.length > 0) return r
  }

  return fallback
}

/**
 * Legacy combined search — tries enriched first, falls back to fast.
 * Kept for backward compatibility but prefer searchWebFast for voice flows.
 */
export async function searchWeb(query: string) {
  const enriched = await searchWebEnriched(query)
  if (enriched.success && Array.isArray(enriched.data) && enriched.data.length > 0) return enriched
  console.log("[firecrawl] enriched search failed, falling back to fast search")
  return await searchWebFast(query)
}

export async function scrapeUrl(url: string) {
  const t0 = Date.now()
  const fallback = { success: false as const, markdown: "", html: "" }
  const raw = await withTimeout(
    firecrawl.scrapeUrl(url, { formats: ["markdown"], onlyMainContent: true }),
    null,
    "scrape",
    10_000
  )

  console.log(`[firecrawl] scrape took ${Date.now() - t0}ms`)

  if (!raw || typeof raw !== "object") return fallback
  const r = raw as { success?: boolean; markdown?: string; html?: string; error?: string }
  if (!r.success) {
    console.warn("[firecrawl:scrape] failed:", r.error ?? "unknown")
    return fallback
  }
  return r
}
