import { NextRequest, NextResponse } from "next/server"
import { scrapeUrl } from "@/lib/firecrawl"
import { extractSite } from "@/lib/gemini"
import { isBlockedPage } from "@/lib/blocked"
import type { SearchContext } from "@/types"

const DEFAULT_CONTEXT: SearchContext = {
  intent: "search",
  query: "",
  category: "general",
  extractFields: ["summary", "headings", "links", "contact"],
}

function cleanMarkdown(md: string): string {
  return md
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_`~]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 3000)
}

export async function POST(req: NextRequest) {
  try {
    const { url, context } = await req.json() as {
      url: string
      context?: SearchContext
    }

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 })
    }

    const raw = await scrapeUrl(url)
    const markdown = raw.markdown ?? ""

    if (!markdown) {
      return NextResponse.json({ siteData: null, blocked: true, error: "No content from site." })
    }

    if (isBlockedPage(markdown)) {
      console.warn("[/api/site] blocked page detected:", url)
      return NextResponse.json({ siteData: null, blocked: true, error: "Site is blocking automated access." })
    }

    const ctx = context ?? DEFAULT_CONTEXT
    const siteData = await extractSite(markdown, url, ctx)

    return NextResponse.json({
      siteData: {
        ...siteData,
        extractedText: cleanMarkdown(markdown),
      },
      blocked: false,
    })
  } catch (err) {
    console.error("[/api/site]", err)
    return NextResponse.json(
      { error: "Failed to read site.", blocked: true },
      { status: 500 }
    )
  }
}
