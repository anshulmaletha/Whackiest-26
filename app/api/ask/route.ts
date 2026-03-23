import { NextRequest, NextResponse } from "next/server"
import { answerFromSiteContext } from "@/lib/formatter"
import type { SiteData } from "@/types"

export async function POST(req: NextRequest) {
  try {
    const { question, siteContext } = await req.json() as {
      question: string
      siteContext: SiteData
    }

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 })
    }
    if (!siteContext || typeof siteContext !== "object") {
      return NextResponse.json({ error: "siteContext is required" }, { status: 400 })
    }

    const answer = answerFromSiteContext(question, siteContext)

    return NextResponse.json({ answer })
  } catch (err) {
    console.error("[/api/ask]", err)
    return NextResponse.json({ error: "Failed to answer question." }, { status: 500 })
  }
}
