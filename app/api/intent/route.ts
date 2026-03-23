import { NextRequest, NextResponse } from "next/server"
import { processVoice, resolveOpenTarget } from "@/lib/gemini"

export async function POST(req: NextRequest) {
  try {
    const { speech, hasResults, hasSiteOpen } = await req.json()

    if (!speech || typeof speech !== "string") {
      return NextResponse.json({ error: "speech is required" }, { status: 400 })
    }

    const context = await processVoice(speech, !!hasResults, !!hasSiteOpen)
    return NextResponse.json({ context })
  } catch (err) {
    console.error("[/api/intent]", err)
    return NextResponse.json({ error: "Intent processing failed" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { speech, results } = await req.json()
    const resultId = await resolveOpenTarget(speech, results ?? [])
    return NextResponse.json({ resultId })
  } catch (err) {
    console.error("[/api/intent PUT]", err)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
