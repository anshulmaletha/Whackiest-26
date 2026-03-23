import { NextRequest, NextResponse } from "next/server"
import { scrapeUrl } from "@/lib/firecrawl"
import { extractSiteData } from "@/lib/extractor"

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 })
    }

    const raw = await scrapeUrl(url)

    const markdown: string = (raw as { markdown?: string }).markdown ?? ""
    const html: string = (raw as { html?: string }).html ?? ""

    const siteData = extractSiteData(markdown, html, url)

    return NextResponse.json({ siteData })
  } catch (err) {
    console.error("[/api/site]", err)
    return NextResponse.json(
      { error: "Failed to read site. Check your FIRECRAWL_API_KEY." },
      { status: 500 }
    )
  }
}
