import { NextRequest, NextResponse } from "next/server"

// Sliding-window rate limiter: 60 requests per minute per IP for API routes.
// In-memory — resets on serverless cold start. Acceptable for MVP; use
// Upstash / Vercel KV for production persistence across instances.

const WINDOW_MS = 60_000
const MAX_REQUESTS = 60

const ipTimestamps = new Map<string, number[]>()

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  )
}

export function middleware(req: NextRequest) {
  const ip = getIp(req)
  const now = Date.now()
  const cutoff = now - WINDOW_MS

  let timestamps = ipTimestamps.get(ip) || []
  timestamps = timestamps.filter((t) => t > cutoff)
  timestamps.push(now)
  ipTimestamps.set(ip, timestamps)

  if (timestamps.length > MAX_REQUESTS) {
    console.warn(`[middleware] rate limit hit: IP=${ip} count=${timestamps.length}`)
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
