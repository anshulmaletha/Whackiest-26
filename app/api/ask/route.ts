import { NextRequest, NextResponse } from "next/server"
import { answerQuestion } from "@/lib/gemini"
import type { SiteData } from "@/types"

function localAnswer(question: string, keyInfo: Record<string, string>): string | null {
  const lower = question.toLowerCase()
  if (/\b(phone|call|number|contact|dial)\b/.test(lower) && keyInfo.phone)
    return `The phone number is ${keyInfo.phone}.`
  if (/\b(address|location|where|located|directions?)\b/.test(lower) && keyInfo.address)
    return `The address is ${keyInfo.address}.`
  if (/\b(hours?|open|close|when|schedule|timing)\b/.test(lower) && keyInfo.hours)
    return `The hours are ${keyInfo.hours}.`
  if (/\b(email|e-mail|mail)\b/.test(lower) && keyInfo.email)
    return `The email is ${keyInfo.email}.`
  if (/\b(price|cost|how much|pricing|fee)\b/.test(lower) && keyInfo.price)
    return `The price is ${keyInfo.price}.`
  if (/\b(rating|review|stars?|score)\b/.test(lower) && keyInfo.rating)
    return `The rating is ${keyInfo.rating}.`
  if (/\b(menu|cuisine|food)\b/.test(lower) && keyInfo.menu)
    return keyInfo.menu
  if (/\b(services?|what do they)\b/.test(lower) && keyInfo.services)
    return keyInfo.services
  return null
}

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

    // Try local keyInfo lookup first (instant, no API needed)
    const local = localAnswer(question, siteData.keyInfo ?? {})
    if (local) return NextResponse.json({ answer: local })

    // Fall back to Gemini for complex questions
    const answer = await answerQuestion(
      question,
      siteData.extractedText ?? siteData.summary,
      siteData.siteName,
      siteData.keyInfo ?? {}
    )

    return NextResponse.json({ answer: answer || "I couldn't find that on this page." })
  } catch (err) {
    console.error("[/api/ask]", err)
    return NextResponse.json({ error: "Failed to answer." }, { status: 500 })
  }
}
