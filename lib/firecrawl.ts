import FirecrawlApp from "@mendable/firecrawl-js"

const apiKey = process.env.FIRECRAWL_API_KEY
if (!apiKey) {
  console.warn("FIRECRAWL_API_KEY is not set")
}

export const firecrawl = new FirecrawlApp({ apiKey: apiKey ?? "" })

export async function searchWeb(query: string) {
  const response = await firecrawl.search(query, { limit: 5 })
  return response
}

export async function scrapeUrl(url: string) {
  const response = await firecrawl.scrapeUrl(url, {
    formats: ["markdown", "html"],
  })
  return response
}
