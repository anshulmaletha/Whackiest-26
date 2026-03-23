import { NextRequest, NextResponse } from "next/server"
import { scrapeUrl } from "@/lib/firecrawl"
import { extractSite } from "@/lib/gemini"
import { isBlockedPage } from "@/lib/blocked"
import { getSearchMarkdown } from "@/lib/markdown-cache"
import type { SearchContext } from "@/types"

const DEFAULT_CONTEXT: SearchContext = {
  intent: "search",
  query: "",
  category: "general",
  extractFields: ["phone", "address", "hours", "email", "price", "rating", "summary", "headings", "links"],
}

function extractTelNumbers(md: string): string[] {
  const phones: string[] = []
  const telRe = /tel:\+?([\d\-().]+)/g
  let m: RegExpExecArray | null
  while ((m = telRe.exec(md)) !== null) {
    const digits = m[1].replace(/[^0-9]/g, "")
    if (digits.length >= 7) phones.push(m[1])
  }
  return [...new Set(phones)]
}

function cleanMarkdown(md: string): string {
  return md
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]*)\]\((https?:[^)]*|tel:[^)]*|mailto:[^)]*)\)/g, "$1")
    .replace(/tel:\+?[\d\-().]+/g, "")
    .replace(/mailto:[^\s"')]+/g, "")
    .replace(/https?:\/\/[^\s"')]+/g, "")
    .replace(/""\s*/g, "")
    .replace(/[#*_`~]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 8000)
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

    // Check server-side cache first — skip Firecrawl scrape if we have it from search
    let markdown = ""
    let cachedSnippetInfo: Record<string, string> = {}
    const cached = getSearchMarkdown(url)

    if (cached && cached.markdown.length > 100) {
      console.log("[/api/site] using cached markdown for:", url)
      markdown = cached.markdown
      cachedSnippetInfo = cached.snippetInfo
    } else {
      const raw = await scrapeUrl(url)
      markdown = raw.markdown ?? ""
    }

    if (!markdown) {
      return NextResponse.json({ siteData: null, blocked: true, error: "No content from site." })
    }

    if (isBlockedPage(markdown)) {
      console.warn("[/api/site] blocked page detected:", url)
      return NextResponse.json({ siteData: null, blocked: true, error: "Site is blocking automated access." })
    }

    const telNumbers = extractTelNumbers(markdown)

    const ctx = context ?? DEFAULT_CONTEXT
    const cleaned = cleanMarkdown(markdown)
    const siteData = await extractSite(cleaned, url, ctx)

    // Inject tel: phone numbers if Gemini missed them
    if (telNumbers.length > 0 && !siteData.keyInfo.phone) {
      siteData.keyInfo.phone = telNumbers[0]
    }

    // Merge in cached snippetInfo from search enrichment (fill gaps)
    for (const [k, v] of Object.entries(cachedSnippetInfo)) {
      if (!siteData.keyInfo[k] && v) {
        siteData.keyInfo[k] = v
      }
    }

    return NextResponse.json({
      siteData: {
        ...siteData,
        extractedText: cleaned,
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
