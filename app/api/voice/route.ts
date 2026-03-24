import { NextRequest, NextResponse } from "next/server"

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? ""
const API_KEY = process.env.ELEVENLABS_API_KEY ?? ""
const JUDGE_SECRET = process.env.JUDGE_SECRET ?? ""

// ── Per-IP session tracking (in-memory, resets on cold start) ──

interface SessionRecord {
  startTime: number
  durationSeconds: number
  sessionId: string
}

const ipSessions = new Map<string, SessionRecord[]>()

const MAX_SECONDS_PER_HOUR = 300
const HOUR_MS = 60 * 60 * 1000

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  )
}

function isJudge(req: NextRequest): boolean {
  if (!JUDGE_SECRET) return false
  const fromParam = req.nextUrl.searchParams.get("key")
  const fromHeader = req.headers.get("x-judge-key")
  return fromParam === JUDGE_SECRET || fromHeader === JUDGE_SECRET
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

function log(level: "info" | "warn" | "error", event: string, data: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), event, ...data }
  if (level === "error") console.error("[VOICE]", JSON.stringify(entry))
  else if (level === "warn") console.warn("[VOICE]", JSON.stringify(entry))
  else console.log("[VOICE]", JSON.stringify(entry))
}

// ── ElevenLabs signed URL ──

async function getSignedUrl() {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${AGENT_ID}`,
    { headers: { "xi-api-key": API_KEY }, cache: "no-store" }
  )

  if (!res.ok) {
    log("warn", "elevenlabs_signed_url_failed", { status: res.status })
    return null
  }

  const data = (await res.json()) as { signed_url?: string }
  return typeof data.signed_url === "string" ? data.signed_url : null
}

// ── GET: Issue a signed URL (rate-limited per IP, judge bypass) ──

export async function GET(req: NextRequest) {
  const ip = getIp(req)
  const judge = isJudge(req)

  if (!API_KEY || !AGENT_ID) {
    log("error", "not_configured", { ip })
    return NextResponse.json({ error: "ElevenLabs not configured" }, { status: 500 })
  }

  // Prune + check limit (skipped for judges)
  const records = pruneOldRecords(ipSessions.get(ip) || [])
  ipSessions.set(ip, records)
  const usedSeconds = getTotalSeconds(records)

  if (!judge && usedSeconds >= MAX_SECONDS_PER_HOUR) {
    const oldestStart = records.length > 0 ? records[0].startTime : Date.now()
    const retryAfterSeconds = Math.ceil((oldestStart + HOUR_MS - Date.now()) / 1000)
    log("warn", "rate_limited", { ip, usedSeconds, retryAfterSeconds })
    return NextResponse.json(
      {
        error: `Live voice limit reached. You've used ${Math.round(usedSeconds / 60)} minutes this hour. You can still explore the text demo. Try voice again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
        rateLimited: true,
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
      log("error", "signed_url_unavailable", { ip })
      return NextResponse.json({ error: "Could not get session URL" }, { status: 502 })
    }

    const sessionId = generateSessionId()
    records.push({ startTime: Date.now(), durationSeconds: 0, sessionId })
    ipSessions.set(ip, records)

    const remainingSeconds = MAX_SECONDS_PER_HOUR - usedSeconds
    log("info", "session_started", { ip, sessionId, usedSeconds, remainingSeconds, judge })

    return NextResponse.json({
      signedUrl,
      sessionId,
      remainingSeconds,
      maxSessionSeconds: 120,
    })
  } catch (err) {
    log("error", "get_error", { ip, err: String(err) })
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// ── POST: Report session end + duration ──

export async function POST(req: NextRequest) {
  const ip = getIp(req)
  try {
    const body = (await req.json()) as {
      sessionId?: string
      durationSeconds?: number
    }

    if (!body.sessionId || typeof body.durationSeconds !== "number") {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    const records = pruneOldRecords(ipSessions.get(ip) || [])
    const session = records.find((r) => r.sessionId === body.sessionId)

    const capped = Math.min(body.durationSeconds, 130)

    if (session) {
      session.durationSeconds = capped
    } else {
      records.push({
        startTime: Date.now() - capped * 1000,
        durationSeconds: capped,
        sessionId: body.sessionId,
      })
    }

    ipSessions.set(ip, records)
    const totalUsed = getTotalSeconds(records)

    log("info", "session_ended", {
      ip,
      sessionId: body.sessionId,
      durationSeconds: capped,
      totalUsedSeconds: totalUsed,
      remainingSeconds: Math.max(0, MAX_SECONDS_PER_HOUR - totalUsed),
    })

    return NextResponse.json({
      ok: true,
      usedSeconds: totalUsed,
      remainingSeconds: Math.max(0, MAX_SECONDS_PER_HOUR - totalUsed),
    })
  } catch (err) {
    log("error", "post_error", { ip, err: String(err) })
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
