import { NextResponse } from "next/server"

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? ""
const API_KEY = process.env.ELEVENLABS_API_KEY ?? ""

async function getConversationToken() {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${AGENT_ID}`,
    {
      headers: { "xi-api-key": API_KEY },
      cache: "no-store",
    }
  )

  if (!res.ok) {
    console.warn("[/api/voice] conversation token failed, status:", res.status)
    return null
  }

  const data = await res.json() as { token?: string }
  return typeof data.token === "string" ? data.token : null
}

async function getSignedUrl() {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${AGENT_ID}`,
    {
      headers: { "xi-api-key": API_KEY },
      cache: "no-store",
    }
  )

  if (!res.ok) {
    console.warn("[/api/voice] signed URL failed, status:", res.status)
    return null
  }

  const data = await res.json() as { signed_url?: string }
  return typeof data.signed_url === "string" ? data.signed_url : null
}

export async function GET() {
  if (!API_KEY || !AGENT_ID) {
    return NextResponse.json(
      { error: "ElevenLabs not configured" },
      { status: 500 }
    )
  }

  try {
    const conversationToken = await getConversationToken()
    if (conversationToken) {
      return NextResponse.json({ conversationToken, signedUrl: null })
    }

    const signedUrl = await getSignedUrl()
    if (signedUrl) {
      return NextResponse.json({ conversationToken: null, signedUrl })
    }

    return NextResponse.json(
      { conversationToken: null, signedUrl: null },
      { status: 502 }
    )
  } catch (err) {
    console.error("[/api/voice]", err)
    return NextResponse.json(
      { conversationToken: null, signedUrl: null },
      { status: 500 }
    )
  }
}
