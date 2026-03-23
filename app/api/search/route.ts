import { NextRequest, NextResponse } from "next/server"
import { searchWeb } from "@/lib/firecrawl"
import { formatSearchResults } from "@/lib/formatter"
import { enrichSearchResults } from "@/lib/gemini"
import { setSearchMarkdown } from "@/lib/markdown-cache"

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

    // Cache each result's full markdown server-side (for /api/site to reuse)
    for (const item of data) {
      if (item.url && item.markdown && item.markdown.length > 100) {
        setSearchMarkdown(item.url, item.markdown, {})
      }
    }

    // Step 1: Format + deep regex extraction on full markdown
    const results = formatSearchResults(data, query)

    // Step 2: Gemini batch enrichment (fills missing fields only)
    // Run in parallel — if it fails or times out, we continue with regex-only results
    try {
      const geminiInput = data
        .filter((d) => d.url)
        .slice(0, 5)
        .map((d) => ({
          title: d.title ?? "",
          url: d.url!,
          markdownExcerpt: d.markdown?.slice(0, 1500) ?? d.description ?? "",
        }))

      const geminiResults = await enrichSearchResults(geminiInput)

      // Step 3: Merge — regex wins, Gemini only fills missing fields
      for (let i = 0; i < results.length; i++) {
        const geminiInfo = geminiResults[i]
        if (!geminiInfo || Object.keys(geminiInfo).length === 0) continue

        const existing = results[i].snippetInfo ?? {}
        const merged = { ...existing }
        for (const [key, value] of Object.entries(geminiInfo)) {
          if (!merged[key] && value) {
            merged[key] = value
          }
        }
        results[i].snippetInfo = Object.keys(merged).length > 0 ? merged : undefined

        // Update server-side cache with enriched snippetInfo
        if (results[i].url && results[i].snippetInfo) {
          const cachedMd = data.find((d) => d.url === results[i].url)?.markdown ?? ""
          if (cachedMd) {
            setSearchMarkdown(results[i].url, cachedMd, results[i].snippetInfo!)
          }
        }
      }
    } catch (e) {
      console.warn("[/api/search] Gemini enrichment failed, continuing with regex-only:", e)
    }

    return NextResponse.json({ results })
  } catch (err) {
    console.error("[/api/search]", err)
    return NextResponse.json(
      { error: "Search failed. Check your FIRECRAWL_API_KEY." },
      { status: 500 }
    )
  }
}
