import { NextRequest, NextResponse } from "next/server"
import { answerQuestion } from "@/lib/gemini"
import type { SiteData } from "@/types"

export async function POST(req: NextRequest) {
  try {
    const { question, siteData } = await req.json() as {
      question: string
      siteData: SiteData
    }

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 })
    }

    if (!siteData) {
      return NextResponse.json({ error: "siteData is required" }, { status: 400 })
    }

    const answer = await answerQuestion(
      question,
      siteData.extractedText ?? siteData.summary,
      siteData.siteName,
      siteData.keyInfo ?? {}
    )

    return NextResponse.json({ answer })
  } catch (err) {
    console.error("[/api/ask]", err)
    return NextResponse.json({ error: "Failed to answer." }, { status: 500 })
  }
}
