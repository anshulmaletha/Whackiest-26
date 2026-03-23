import FirecrawlApp from "@mendable/firecrawl-js"

const apiKey = process.env.FIRECRAWL_API_KEY
if (!apiKey) {
  console.warn("FIRECRAWL_API_KEY is not set")
}

const firecrawl = new FirecrawlApp({ apiKey: apiKey ?? "" })

const TIMEOUT_MS = 10_000

function withTimeout<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) =>
      setTimeout(() => {
        console.warn(`[firecrawl] ${label} timed out after ${TIMEOUT_MS}ms`)
        resolve(fallback)
      }, TIMEOUT_MS)
    ),
  ])
}

export async function searchWeb(query: string) {
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
    "search"
  )
  if (!raw || typeof raw !== "object") return fallback
  const r = raw as { success?: boolean; data?: unknown[]; error?: string }
  if (!r.success || !Array.isArray(r.data)) {
    console.warn("[firecrawl:search] failed:", r.error ?? "no data")
    return fallback
  }
  return r
}

export async function scrapeUrl(url: string) {
  const fallback = { success: false as const, markdown: "", html: "" }
  const raw = await withTimeout(
    firecrawl.scrapeUrl(url, { formats: ["markdown"], onlyMainContent: true }),
    null,
    "scrape"
  )
  if (!raw || typeof raw !== "object") return fallback
  const r = raw as { success?: boolean; markdown?: string; html?: string; error?: string }
  if (!r.success) {
    console.warn("[firecrawl:scrape] failed:", r.error ?? "unknown")
    return fallback
  }
  return r
}
