import { NextRequest, NextResponse } from "next/server"
import { searchWebFast } from "@/lib/firecrawl"
import { formatSearchResults } from "@/lib/formatter"

export async function POST(req: NextRequest) {
  const t0 = Date.now()
  try {
    const { query } = await req.json()

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json({ error: "query is required" }, { status: 400 })
    }

    const tSearch0 = Date.now()
    const raw = await searchWebFast(query.trim())
    const tSearch1 = Date.now()

    const data = (raw.data ?? []) as Array<{
      url?: string
      title?: string
      description?: string
      markdown?: string
    }>

    const tFormat0 = Date.now()
    const results = formatSearchResults(data, query)
    const tFormat1 = Date.now()

    console.log(
      `[/api/search] LATENCY: firecrawl=${tSearch1 - tSearch0}ms, format=${tFormat1 - tFormat0}ms, total=${Date.now() - t0}ms, results=${results.length}`
    )

    return NextResponse.json({ results })
  } catch (err) {
    console.error("[/api/search]", err)
    console.log(`[/api/search] FAILED after ${Date.now() - t0}ms`)
    return NextResponse.json(
      { error: "Search failed. Check your FIRECRAWL_API_KEY." },
      { status: 500 }
    )
  }
}
