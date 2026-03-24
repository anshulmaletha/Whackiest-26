import { NextRequest, NextResponse } from "next/server"

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? ""
const API_KEY = process.env.ELEVENLABS_API_KEY ?? ""

// ── Per-IP session tracking (in-memory, resets on cold start) ──

interface SessionRecord {
  startTime: number
  durationSeconds: number
  sessionId: string
}

const ipSessions = new Map<string, SessionRecord[]>()

const MAX_SECONDS_PER_HOUR = 300 // 5 minutes total voice per IP per hour
const HOUR_MS = 60 * 60 * 1000

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  )
}

function pruneOldRecords(records: SessionRecord[]): SessionRecord[] {
  const cutoff = Date.now() - HOUR_MS
  return records.filter((r) => r.startTime > cutoff)
}

function getTotalSeconds(records: SessionRecord[]): number {
  return records.reduce((sum, r) => sum + r.durationSeconds, 0)
}

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ── ElevenLabs token fetchers ──

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

  const data = (await res.json()) as { signed_url?: string }
  return typeof data.signed_url === "string" ? data.signed_url : null
}

// ── GET: Issue a signed URL (rate-limited per IP) ──

export async function GET(req: NextRequest) {
  if (!API_KEY || !AGENT_ID) {
    return NextResponse.json(
      { error: "ElevenLabs not configured" },
      { status: 500 }
    )
  }

  const ip = getIp(req)

  // Prune + check limit
  const records = pruneOldRecords(ipSessions.get(ip) || [])
  ipSessions.set(ip, records)

  const usedSeconds = getTotalSeconds(records)
  if (usedSeconds >= MAX_SECONDS_PER_HOUR) {
    const oldestStart = records.length > 0 ? records[0].startTime : Date.now()
    const retryAfterSeconds = Math.ceil(
      (oldestStart + HOUR_MS - Date.now()) / 1000
    )
    console.warn(
      `[/api/voice] IP ${ip} rate limited: ${usedSeconds}s used of ${MAX_SECONDS_PER_HOUR}s`
    )
    return NextResponse.json(
      {
        error: `Session limit reached. You have used ${Math.round(usedSeconds / 60)} minutes this hour. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
        retryAfterSeconds,
        usedSeconds,
        maxSeconds: MAX_SECONDS_PER_HOUR,
      },
      { status: 429 }
    )
  }

  try {
    const signedUrl = await getSignedUrl()
    if (!signedUrl) {
      return NextResponse.json(
        { error: "Could not get session URL" },
        { status: 502 }
      )
    }

    const sessionId = generateSessionId()

    // Record a new session with 0 duration (will be updated via POST on end)
    records.push({ startTime: Date.now(), durationSeconds: 0, sessionId })
    ipSessions.set(ip, records)

    const remainingSeconds = MAX_SECONDS_PER_HOUR - usedSeconds
    console.log(
      `[/api/voice] IP ${ip}: session ${sessionId} started, ${remainingSeconds}s remaining`
    )

    return NextResponse.json({
      signedUrl,
      sessionId,
      remainingSeconds,
      maxSessionSeconds: 120,
    })
  } catch (err) {
    console.error("[/api/voice] GET error:", err)
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    )
  }
}

// ── POST: Report session end + duration ──

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      sessionId?: string
      durationSeconds?: number
    }

    if (!body.sessionId || typeof body.durationSeconds !== "number") {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    const ip = getIp(req)
    const records = pruneOldRecords(ipSessions.get(ip) || [])
    const session = records.find((r) => r.sessionId === body.sessionId)

    if (session) {
      // Cap reported duration to 130s (2min + buffer) to prevent abuse
      session.durationSeconds = Math.min(body.durationSeconds, 130)
      console.log(
        `[/api/voice] IP ${ip}: session ${body.sessionId} ended, duration=${session.durationSeconds}s`
      )
    } else {
      // Session not found (cold start / pruned) — still record it
      records.push({
        startTime: Date.now() - body.durationSeconds * 1000,
        durationSeconds: Math.min(body.durationSeconds, 130),
        sessionId: body.sessionId,
      })
      console.log(
        `[/api/voice] IP ${ip}: session ${body.sessionId} recorded retroactively, duration=${body.durationSeconds}s`
      )
    }

    ipSessions.set(ip, records)
    const totalUsed = getTotalSeconds(records)

    return NextResponse.json({
      ok: true,
      usedSeconds: totalUsed,
      remainingSeconds: Math.max(0, MAX_SECONDS_PER_HOUR - totalUsed),
    })
  } catch (err) {
    console.error("[/api/voice] POST error:", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
