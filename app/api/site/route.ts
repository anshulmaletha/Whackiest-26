import { NextRequest, NextResponse } from "next/server"
import { scrapeUrl } from "@/lib/firecrawl"
import { extractSite } from "@/lib/gemini"
import { isBlockedPage } from "@/lib/blocked"
import { getSearchMarkdown } from "@/lib/markdown-cache"
import { extractFromSnippet, snippetInfoToRecord } from "@/lib/snippet-extract"
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

function extractHeadingsBasic(md: string): string[] {
  const headings: string[] = []
  for (const line of md.split("\n")) {
    const m = line.match(/^#{1,3}\s+(.+)$/)
    if (m && m[1].length > 2 && m[1].length < 100) {
      headings.push(m[1].replace(/[*_`\[\]()]/g, "").trim())
      if (headings.length >= 10) break
    }
  }
  return headings
}

function extractLinksBasic(md: string): { text: string; href: string }[] {
  const links: { text: string; href: string }[] = []
  const re = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(md)) !== null) {
    const text = m[1].trim()
    if (text.length > 2 && text.length < 80) {
      links.push({ text, href: m[2] })
      if (links.length >= 12) break
    }
  }
  return links
}

function safeHostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "") } catch { return url }
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
    const cleaned = cleanMarkdown(markdown)
    const ctx = context ?? DEFAULT_CONTEXT
    const hostname = safeHostname(url)

    // PRIMARY: Regex extraction on full markdown (always works, no API needed)
    const regexInfo = snippetInfoToRecord(extractFromSnippet(markdown.slice(0, 5000)))
    if (telNumbers.length > 0 && !regexInfo.phone) {
      regexInfo.phone = telNumbers[0]
    }

    // Build a solid base from regex + basic parsing
    const baseData = {
      siteName: hostname,
      summary: cleaned.slice(0, 200).replace(/\n/g, " ").trim() || "No description.",
      keyInfo: { ...regexInfo, ...cachedSnippetInfo },
      headings: extractHeadingsBasic(markdown),
      links: extractLinksBasic(markdown),
    }

    // ENHANCEMENT: Try Gemini extraction (may fail if quota exhausted)
    const geminiData = await extractSite(cleaned, url, ctx)

    // Merge: Gemini wins for siteName and summary, regex wins for keyInfo fields
    const mergedKeyInfo = { ...baseData.keyInfo }
    for (const [k, v] of Object.entries(geminiData.keyInfo)) {
      if (v && v.length > 0) mergedKeyInfo[k] = v
    }
    // Re-apply regex for high-confidence fields (regex > Gemini for phone/email)
    if (regexInfo.phone) mergedKeyInfo.phone = regexInfo.phone
    if (regexInfo.email) mergedKeyInfo.email = regexInfo.email

    const finalData = {
      siteName: geminiData.siteName !== hostname ? geminiData.siteName : baseData.siteName,
      summary: geminiData.summary !== baseData.summary && geminiData.summary.length > 10
        ? geminiData.summary
        : baseData.summary,
      keyInfo: mergedKeyInfo,
      headings: geminiData.headings.length > 0 ? geminiData.headings : baseData.headings,
      links: geminiData.links.length > 0 ? geminiData.links : baseData.links,
      extractedText: cleaned,
    }

    return NextResponse.json({ siteData: finalData, blocked: false })
  } catch (err) {
    console.error("[/api/site]", err)
    return NextResponse.json(
      { error: "Failed to read site.", blocked: true },
      { status: 500 }
    )
  }
}
