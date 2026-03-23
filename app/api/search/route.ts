import { NextRequest, NextResponse } from "next/server"
import { searchWeb } from "@/lib/firecrawl"
import { formatSearchResults } from "@/lib/formatter"

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json()

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json({ error: "query is required" }, { status: 400 })
    }

    const raw = await searchWeb(query.trim())
    const data = (raw.data ?? []) as Array<{
      url?: string
      title?: string
      description?: string
      markdown?: string
    }>

    const results = formatSearchResults(data, query)

    return NextResponse.json({ results })
  } catch (err) {
    console.error("[/api/search]", err)
    return NextResponse.json(
      { error: "Search failed. Check your FIRECRAWL_API_KEY." },
      { status: 500 }
    )
  }
}
