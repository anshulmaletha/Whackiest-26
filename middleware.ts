import { NextRequest, NextResponse } from "next/server"

// Sliding-window rate limiter for API routes.
// 150 requests per minute per IP — generous for normal use (each voice
// interaction triggers 2-4 API calls), tight enough to block abuse.
// In-memory — resets on serverless cold start. Use Upstash for production.

const WINDOW_MS = 60_000
const MAX_REQUESTS = 150

const JUDGE_SECRET = process.env.JUDGE_SECRET ?? ""

const ipTimestamps = new Map<string, number[]>()

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

export function middleware(req: NextRequest) {
  const ip = getIp(req)

  if (isJudge(req)) return NextResponse.next()

  const now = Date.now()
  const cutoff = now - WINDOW_MS

  let timestamps = ipTimestamps.get(ip) || []
  timestamps = timestamps.filter((t) => t > cutoff)
  timestamps.push(now)
  ipTimestamps.set(ip, timestamps)

  if (timestamps.length > MAX_REQUESTS) {
    console.warn(`[MIDDLEWARE] 429 | IP=${ip} | count=${timestamps.length} | path=${req.nextUrl.pathname}`)
    return NextResponse.json(
      { error: "Rate limit exceeded. Please slow down." },
      { status: 429 }
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/api/search", "/api/site", "/api/ask", "/api/intent", "/api/voice"],
}
