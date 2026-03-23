import FirecrawlApp from "@mendable/firecrawl-js"

const apiKey = process.env.FIRECRAWL_API_KEY
if (!apiKey) {
  console.warn("FIRECRAWL_API_KEY is not set")
}

const firecrawl = new FirecrawlApp({ apiKey: apiKey ?? "" })

function withTimeout<T>(promise: Promise<T>, fallback: T, label: string, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) =>
      setTimeout(() => {
        console.warn(`[firecrawl] ${label} timed out after ${timeoutMs}ms`)
        resolve(fallback)
      }, timeoutMs)
    ),
  ])
}

export async function searchWeb(query: string) {
  const fallback = { success: false as const, data: [] as unknown[] }

  // Phase 1: Try enriched search with markdown (longer timeout)
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
    18_000
  )

  if (raw && typeof raw === "object") {
    const r = raw as { success?: boolean; data?: unknown[]; error?: string }
    if (r.success && Array.isArray(r.data) && r.data.length > 0) return r
  }

  // Phase 2: Fast fallback without markdown scraping
  console.log("[firecrawl] enriched search failed, trying fast search")
  const fast = await withTimeout(
    firecrawl.search(query, { limit: 5 }),
    null,
    "fast-search",
    10_000
  )
  if (!fast || typeof fast !== "object") return fallback
  const fr = fast as { success?: boolean; data?: unknown[]; error?: string }
  if (!fr.success || !Array.isArray(fr.data)) {
    console.warn("[firecrawl:search] fast search also failed:", fr.error ?? "no data")
    return fallback
  }
  return fr
}

export async function scrapeUrl(url: string) {
  const fallback = { success: false as const, markdown: "", html: "" }
  const raw = await withTimeout(
    firecrawl.scrapeUrl(url, { formats: ["markdown"], onlyMainContent: true }),
    null,
    "scrape",
    10_000
  )
  if (!raw || typeof raw !== "object") return fallback
  const r = raw as { success?: boolean; markdown?: string; html?: string; error?: string }
  if (!r.success) {
    console.warn("[firecrawl:scrape] failed:", r.error ?? "unknown")
    return fallback
  }
  return r
}
