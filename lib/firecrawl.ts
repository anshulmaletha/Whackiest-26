import FirecrawlApp from "@mendable/firecrawl-js"

const apiKey = process.env.FIRECRAWL_API_KEY
if (!apiKey) {
  console.warn("FIRECRAWL_API_KEY is not set")
}

const firecrawl = new FirecrawlApp({ apiKey: apiKey ?? "" })

export async function searchWeb(query: string) {
  const response = await firecrawl.search(query, { limit: 5 })
  if (!response || typeof response !== "object") return { success: false, data: [] }
  const r = response as { success?: boolean; data?: unknown[]; error?: string }
  if (!r.success || !Array.isArray(r.data)) {
    console.warn("[firecrawl:search] failed:", r.error ?? "no data")
    return { success: false, data: [] }
  }
  return r
}

export async function scrapeUrl(url: string) {
  const response = await firecrawl.scrapeUrl(url, {
    formats: ["markdown", "html"],
    onlyMainContent: true,
  })
  if (!response || typeof response !== "object") return { success: false, markdown: "", html: "" }
  const r = response as { success?: boolean; markdown?: string; html?: string; error?: string }
  if (!r.success) {
    console.warn("[firecrawl:scrape] failed:", r.error ?? "unknown")
    return { success: false, markdown: "", html: "" }
  }
  return r
}
