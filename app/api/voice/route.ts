import { NextResponse } from "next/server"

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? ""
const API_KEY = process.env.ELEVENLABS_API_KEY ?? ""

export async function GET() {
  if (!API_KEY || !AGENT_ID) {
    return NextResponse.json(
      { error: "ElevenLabs not configured" },
      { status: 500 }
    )
  }

  try {
    const signedUrlRes = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${AGENT_ID}`,
      { headers: { "xi-api-key": API_KEY } }
    )

    if (signedUrlRes.ok) {
      const data = await signedUrlRes.json()
      return NextResponse.json({ signedUrl: data.signed_url })
    }

    console.warn("[/api/voice] signed URL failed, status:", signedUrlRes.status)
    return NextResponse.json({ signedUrl: null })
  } catch (err) {
    console.error("[/api/voice]", err)
    return NextResponse.json({ signedUrl: null })
  }
}
