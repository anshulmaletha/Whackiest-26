"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useConversation } from "@elevenlabs/react"
import type { SearchResult, SiteData, TranscriptItem, SearchContext } from "@/types"
import { speakText, stopSpeaking } from "@/lib/speak"
import { getCachedSite, setCachedSite } from "@/lib/site-cache"
import SearchBar from "@/components/SearchBar"
import ResultsList from "@/components/ResultsList"
import SitePanel from "@/components/SitePanel"
import DynamicIsland from "@/components/DynamicIsland"

// ── Types ──

type BrowsingMode = "home" | "searching" | "results" | "opening" | "site"
type OfferedAction = "open_current_result" | "try_next_result" | null

// ── Pure helpers (no state) ──

function buildOrientation(sd: SiteData): string {
  const parts: string[] = [`This is ${sd.siteName}.`]
  const keys = Object.keys(sd.keyInfo ?? {})
  if (keys.length > 0) {
    const labels = keys.slice(0, 3).map((k) => k.replace(/_/g, " "))
    parts.push(`I found ${labels.join(", ")}.`)
    parts.push("You can ask for any of them, or say go back.")
  } else if (sd.headings && sd.headings.length > 0) {
    parts.push(`${sd.headings.length} sections. You can ask me about this page, or say go back.`)
  } else {
    parts.push("Ask me anything about this page, or say go back.")
  }
  return parts.join(" ")
}

function describeSnippet(si: Record<string, string>): string {
  const priority = ["phone", "hours", "rating", "price", "address", "email"]
  const found = priority.filter((f) => si[f])
  if (found.length === 0) return ""
  return found.slice(0, 2).map((f) => f.replace(/_/g, " ")).join(" and ")
}

function isStrongResult(si?: Record<string, string>): boolean {
  if (!si) return false
  return Object.keys(si).length >= 3
}

function getHelp(m: BrowsingMode): string {
  const global = " You can always say repeat, stop, or help."
  switch (m) {
    case "home":
      return "You can search for anything. For example: find me a plumber in New York, or best laptops under 1000." + global
    case "searching":
      return "Searching now. Please wait."
    case "results":
      return "Say open this one, open the second result, try the next one, go back, or search for something new." + global
    case "opening":
      return "Opening the page. Please wait, or say cancel."
    case "site":
      return "You can ask: what is the phone number, what are the hours, read the headings, summarize, or say go back." + global
  }
}

// ── Ordinal + navigation parser ──

type NavTarget = "first" | "second" | "third" | "fourth" | "fifth" | "next" | "previous" | "current" | "last"

const ORDINALS: Record<string, number> = {
  first: 0, "1st": 0, one: 0, "1": 0,
  second: 1, "2nd": 1, two: 1, "2": 1,
  third: 2, "3rd": 2, three: 2, "3": 2,
  fourth: 3, "4th": 3, four: 3, "4": 3,
  fifth: 4, "5th": 4, five: 4, "5": 4,
}
const ORD_NAMES: Record<number, NavTarget> = { 0: "first", 1: "second", 2: "third", 3: "fourth", 4: "fifth" }

function parseNav(text: string): NavTarget | null {
  for (const [word, idx] of Object.entries(ORDINALS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return ORD_NAMES[idx] ?? null
  }
  const num = text.match(/\b(number|option|result|#)\s*(\d)\b/)
  if (num) { const i = parseInt(num[2]) - 1; return ORD_NAMES[i] ?? null }

  if (/\b(next|move on|skip|another|different)\b/.test(text)) return "next"
  if (/\b(previous|prev|before|back one)\b/.test(text)) return "previous"
  if (/\b(this one|that one|current)\b/.test(text)) return "current"
  if (/\b(last|final)\b/.test(text)) return "last"
  return null
}

function resolveIdx(target: NavTarget, cur: number, len: number): number {
  const m: Record<NavTarget, number> = {
    first: 0, second: 1, third: 2, fourth: 3, fifth: 4,
    next: cur + 1, previous: cur - 1, current: cur, last: len - 1,
  }
  return Math.max(0, Math.min(len - 1, m[target]))
}

// ── Component ──

export default function Home() {
  // ── UI state ──
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null)
  const [currentSite, setCurrentSite] = useState<SiteData | null>(null)
  const [transcript, setTranscript] = useState<TranscriptItem[]>([])
  const [isLoadingResults, setIsLoadingResults] = useState(false)
  const [isLoadingSite, setIsLoadingSite] = useState(false)
  const [lastAnswer, setLastAnswer] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [announcement, setAnnouncement] = useState("")
  const [voiceMode, setVoiceMode] = useState<"idle" | "connecting" | "listening" | "speaking">("idle")
  const [searchContext, setSearchContext] = useState<SearchContext | null>(null)

  // ── Browsing mode state machine ──
  const [mode, setMode] = useState<BrowsingMode>("home")
  const [lastOfferedAction, setLastOfferedAction] = useState<OfferedAction>(null)
  const [lastOrientation, setLastOrientation] = useState<string | null>(null)

  // ── Refs (for async callbacks) ──
  const currentSiteRef = useRef<SiteData | null>(null)
  currentSiteRef.current = currentSite
  const resultsRef = useRef<SearchResult[]>([])
  resultsRef.current = results
  const lastAnswerRef = useRef<string | null>(null)
  lastAnswerRef.current = lastAnswer
  const selectedResultIdRef = useRef<string | null>(null)
  selectedResultIdRef.current = selectedResultId
  const searchContextRef = useRef<SearchContext | null>(null)
  const modeRef = useRef<BrowsingMode>("home")
  modeRef.current = mode
  const offeredActionRef = useRef<OfferedAction>(null)
  offeredActionRef.current = lastOfferedAction
  const lastOrientationRef = useRef<string | null>(null)
  lastOrientationRef.current = lastOrientation
  const focusedIndexRef = useRef(-1)
  focusedIndexRef.current = focusedIndex

  const sitePanelRef = useRef<HTMLElement>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const endSessionRef = useRef<(() => Promise<void>) | null>(null)
  const isLoadingRef = useRef(false)
  const reconnectCountRef = useRef(0)
  const intentionalEndRef = useRef(false)
  const hasConnectedOnceRef = useRef(false)
  const timeLimitEndRef = useRef(false)

  // ── Session timer (2-min max) + duration tracking ──
  const sessionWarnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionStartTimeRef = useRef(0)
  const sessionIdRef = useRef<string | null>(null)
  const MAX_SESSION_MS = 120_000 // 2 minutes
  const WARN_BEFORE_MS = 10_000  // warn 10s before end

  function clearSessionTimers() {
    if (sessionWarnTimerRef.current) { clearTimeout(sessionWarnTimerRef.current); sessionWarnTimerRef.current = null }
    if (sessionEndTimerRef.current) { clearTimeout(sessionEndTimerRef.current); sessionEndTimerRef.current = null }
  }

  function reportSessionDuration() {
    if (!sessionIdRef.current || !sessionStartTimeRef.current) return
    const durationSeconds = Math.round((Date.now() - sessionStartTimeRef.current) / 1000)
    fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionIdRef.current, durationSeconds }),
    }).catch(() => {})
    console.log(`[SESSION] reported duration: ${durationSeconds}s for session ${sessionIdRef.current}`)
    sessionIdRef.current = null
    sessionStartTimeRef.current = 0
  }

  const routeInputRef = useRef<(text: string) => Promise<string>>(async () => "")
  const turnIdRef = useRef(0)
  const turnResponseRef = useRef<string | null>(null)
  const turnPromiseRef = useRef<Promise<string> | null>(null)
  const connectedRef = useRef(false)
  const searchPromiseRef = useRef<Promise<string> | null>(null)

  // ── Noise filter ──
  const FILLER_WORDS = /^(um+|uh+|hmm*|ah+|oh+|eh+|huh|mhm|like|so|well|right|hey|hi|hello|bye|you know|i see|got it|alright|hm|ha|ho)\.?$/i

  function isNoise(text: string): boolean {
    const trimmed = text.trim()
    if (trimmed.length < 2) return true
    if (FILLER_WORDS.test(trimmed)) return true
    if (/^[^a-zA-Z\u0590-\u05FF]*$/.test(trimmed)) return true
    return false
  }

  function announce(text: string) {
    setAnnouncement("")
    requestAnimationFrame(() => setAnnouncement(text))
  }

  function addToTranscript(role: "user" | "assistant", text: string) {
    setTranscript((prev) => [...prev, { role, text, timestamp: Date.now() }])
    if (role === "assistant") setLastAnswer(text)
  }

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [transcript])

  // Pre-warm API routes on page load to eliminate cold-start compilation penalty
  useEffect(() => {
    fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "" }) }).catch(() => {})
    fetch("/api/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "" }) }).catch(() => {})
  }, [])

  // ── Keyboard ──
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return
      if (e.key === "/") { e.preventDefault(); document.querySelector<HTMLInputElement>(".search-input")?.focus() }
      if (e.key === "Escape" && sitePanelRef.current?.contains(t)) {
        e.preventDefault()
        document.querySelector<HTMLElement>(".results-list__item--focused")?.focus()
          ?? document.querySelector<HTMLInputElement>(".search-input")?.focus()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [])

  // ══════════════════════════════════════════════════════════
  //  CORE ACTIONS — each returns a response string
  //  Each action manages its own mode transitions
  // ══════════════════════════════════════════════════════════

  async function doSearch(q: string): Promise<string> {
    // If a search is already in-flight, wait for its result instead of returning a useless "Already searching."
    if (isLoadingRef.current && searchPromiseRef.current) {
      console.log(`[SEARCH] joining in-flight search for "${q.slice(0, 30)}"`)
      return await searchPromiseRef.current
    }
    isLoadingRef.current = true
    const t0 = performance.now()
    setMode("searching")
    setLastOfferedAction(null)
    setLastOrientation(null)
    setQuery(q)
    setIsLoadingResults(true)
    setResults([])
    setCurrentSite(null)
    setSelectedResultId(null)
    setFocusedIndex(-1)

    const searchWork = async (): Promise<string> => {
      try {
        const tFetch = performance.now()
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        })
        const data = await res.json()
        console.log(`[SEARCH] fetch: ${(performance.now() - tFetch).toFixed(0)}ms`)
        if (data.results?.length) {
          setResults(data.results)
          setFocusedIndex(0)
          setMode("results")

          const top = data.results[0] as SearchResult
          const si = top.snippetInfo ?? {}
          const snippet = describeSnippet(si)
          const source = top.source ? ` from ${top.source}` : ""

          let msg = `I found ${data.results.length} results. The first is ${top.title}${source}.`
          if (snippet) msg += ` I found ${snippet}.`

          if (isStrongResult(si)) {
            msg += " Would you like me to open it?"
          } else {
            msg += " Say open this one, try the next, or the second result."
          }
          setLastOfferedAction("open_current_result")
          console.log(`[SEARCH] ✓ SUCCESS ${(performance.now() - t0).toFixed(0)}ms: "${msg.slice(0, 100)}"`)
          return msg
        }
        console.log(`[SEARCH] ✗ NO RESULTS ${(performance.now() - t0).toFixed(0)}ms`)
        setMode("home")
        return "No results found. Try a different search."
      } catch (e) {
        console.error(`[SEARCH] ✗ ERROR ${(performance.now() - t0).toFixed(0)}ms:`, e)
        setMode("home")
        return "Search failed. Please try again."
      } finally {
        setIsLoadingResults(false)
        isLoadingRef.current = false
        searchPromiseRef.current = null
      }
    }

    const promise = searchWork()
    searchPromiseRef.current = promise
    return await promise
  }

  const tryOpenSite = useCallback(async (url: string, ctx: SearchContext | null): Promise<{ ok: boolean; siteData?: SiteData }> => {
    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, context: ctx }),
      })
      const data = await res.json()
      if (data.blocked || !data.siteData) return { ok: false }
      return { ok: true, siteData: data.siteData as SiteData }
    } catch {
      return { ok: false }
    }
  }, [])

  function buildSnippetSiteData(result: SearchResult): SiteData | null {
    const si = result.snippetInfo
    if (!si || Object.keys(si).length === 0) return null
    return { siteName: result.source || result.title, summary: result.description, keyInfo: si }
  }

  function enrichSiteData(siteData: SiteData, result: SearchResult): SiteData {
    const si = result.snippetInfo
    if (!si) return siteData
    const merged = { ...siteData.keyInfo }
    for (const [k, v] of Object.entries(si)) {
      if (!merged[k]) merged[k] = v
    }
    return { ...siteData, keyInfo: merged }
  }

  async function doOpenResult(result: SearchResult): Promise<string> {
    const t0 = performance.now()
    console.log(`[OPEN] ▶ opening "${result.title}" (${result.url})`)
    setMode("opening")
    setLastOfferedAction(null)
    setSelectedResultId(result.id)
    setIsLoadingSite(true)
    setCurrentSite(null)
    announce(`Opening ${result.title}.`)

    const openPrefix = `Opening ${result.title}. `

    // Check cache first (instant)
    const cached = getCachedSite(result.url)
    if (cached) {
      const enriched = enrichSiteData(cached, result)
      setCurrentSite(enriched)
      setIsLoadingSite(false)
      sitePanelRef.current?.focus()
      const orient = buildOrientation(enriched)
      setLastOrientation(orient)
      setMode("site")
      console.log(`[OPEN] ✓ from cache ${(performance.now() - t0).toFixed(0)}ms`)
      return openPrefix + orient
    }

    const ctx = searchContextRef.current ?? {
      intent: "search" as const,
      query: query || result.title,
      category: "general",
      extractFields: ["phone", "address", "hours", "email", "price", "rating", "summary", "headings", "links"],
    }

    // Try primary site with a strict 6-second timeout
    const OPEN_TIMEOUT = 6_000
    let siteResult: { ok: boolean; siteData?: SiteData } = { ok: false }
    try {
      siteResult = await Promise.race([
        tryOpenSite(result.url, ctx),
        new Promise<{ ok: false }>((resolve) => setTimeout(() => resolve({ ok: false }), OPEN_TIMEOUT)),
      ])
    } catch { /* timeout or error */ }

    if (siteResult.ok && siteResult.siteData) {
      const enriched = enrichSiteData(siteResult.siteData, result)
      setCachedSite(result.url, enriched)
      setCurrentSite(enriched)
      setIsLoadingSite(false)
      sitePanelRef.current?.focus()
      const orient = buildOrientation(enriched)
      setLastOrientation(orient)
      setMode("site")
      console.log(`[OPEN] ✓ scraped ${(performance.now() - t0).toFixed(0)}ms`)
      return openPrefix + orient
    }

    console.log(`[OPEN] primary failed/timed out at ${(performance.now() - t0).toFixed(0)}ms`)

    // Fall back to snippet data from search preview (instant, no network)
    const snippetData = buildSnippetSiteData(result)
    if (snippetData) {
      setCurrentSite(snippetData)
      setIsLoadingSite(false)
      const keys = Object.keys(snippetData.keyInfo)
      const orient = `I found ${keys.map((k) => k.replace(/_/g, " ")).join(", ")} from the search preview. You can ask for any of these, or say go back.`
      setLastOrientation(orient)
      setMode("site")
      console.log(`[OPEN] ✓ snippet fallback ${(performance.now() - t0).toFixed(0)}ms`)
      return `Couldn't fully load ${result.title}, but ${orient}`
    }

    // Try ONE alternative result (strict timeout, no more)
    const remaining = resultsRef.current.filter((r) => r.id !== result.id)
    if (remaining.length > 0) {
      const alt = remaining[0]
      const altCached = getCachedSite(alt.url)
      if (altCached) {
        const enriched = enrichSiteData(altCached, alt)
        setSelectedResultId(alt.id)
        setCurrentSite(enriched)
        setIsLoadingSite(false)
        const orient = buildOrientation(enriched)
        setLastOrientation(orient)
        setMode("site")
        console.log(`[OPEN] ✓ alt from cache ${(performance.now() - t0).toFixed(0)}ms`)
        return `Couldn't read ${result.title}. Opening ${alt.title} instead. ${orient}`
      }

      try {
        const altRes = await Promise.race([
          tryOpenSite(alt.url, ctx),
          new Promise<{ ok: false }>((resolve) => setTimeout(() => resolve({ ok: false }), OPEN_TIMEOUT)),
        ])
        if (altRes.ok && altRes.siteData) {
          const enriched = enrichSiteData(altRes.siteData, alt)
          setSelectedResultId(alt.id)
          setCachedSite(alt.url, enriched)
          setCurrentSite(enriched)
          setIsLoadingSite(false)
          const orient = buildOrientation(enriched)
          setLastOrientation(orient)
          setMode("site")
          console.log(`[OPEN] ✓ alt scraped ${(performance.now() - t0).toFixed(0)}ms`)
          return `Couldn't read ${result.title}. Opening ${alt.title} instead. ${orient}`
        }
      } catch { /* alt also failed */ }
    }

    // Last resort: compile all snippet info from search results
    const allSnippetInfo: Record<string, string> = {}
    for (const r of resultsRef.current) {
      if (r.snippetInfo) {
        for (const [k, v] of Object.entries(r.snippetInfo)) {
          if (!allSnippetInfo[k]) allSnippetInfo[k] = `${v} (from ${r.source || r.title})`
        }
      }
    }
    if (Object.keys(allSnippetInfo).length > 0) {
      const combined: SiteData = {
        siteName: "Search results",
        summary: `Information gathered from search results for "${query}"`,
        keyInfo: allSnippetInfo,
      }
      setCurrentSite(combined)
      setIsLoadingSite(false)
      const keys = Object.keys(allSnippetInfo)
      const orient = `I found ${keys.map((k) => k.replace(/_/g, " ")).join(", ")} from search previews. You can ask for any of these, or say go back.`
      setLastOrientation(orient)
      setMode("site")
      console.log(`[OPEN] ✓ aggregated snippets ${(performance.now() - t0).toFixed(0)}ms`)
      return `Sites are blocking access, but ${orient}`
    }

    setIsLoadingSite(false)
    setMode("results")
    console.log(`[OPEN] ✗ all failed ${(performance.now() - t0).toFixed(0)}ms`)
    return "This site isn't accessible. Say next to try another result."
  }

  async function doAskSite(question: string): Promise<string> {
    const sd = currentSiteRef.current
    if (!sd) return "No website is open."
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, siteData: sd }),
      })
      const data = await res.json()
      return data.answer || "I couldn't find that on this page."
    } catch {
      return "I couldn't get that information."
    }
  }

  function cleanQuery(raw: string): string {
    return raw
      .replace(/^(i want to |i need |can you |could you |please |find me |search for |look for |look up |i('m| am) looking for )/i, "")
      .replace(/\b(please|just|actually|basically|really)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim()
  }

  async function doSearchWithRefine(text: string): Promise<string> {
    const cleaned = cleanQuery(text)
    const searchQ = cleaned || text

    const defaultCtx: SearchContext = {
      intent: "search",
      query: searchQ,
      category: "general",
      extractFields: ["phone", "address", "hours", "email", "price", "rating", "summary", "headings", "links"],
    }
    searchContextRef.current = defaultCtx
    setSearchContext(defaultCtx)

    // Fire Gemini intent in background (non-blocking) to enrich context for later site extraction
    fetch("/api/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speech: text, hasResults: false, hasSiteOpen: false }),
    })
      .then((r) => r.json())
      .then(({ context }) => {
        if (context?.category && context.category !== "general") {
          searchContextRef.current = context
          setSearchContext(context)
        }
      })
      .catch(() => {})

    return await doSearch(searchQ)
  }

  // ══════════════════════════════════════════════════════════
  //  MODE-AWARE HELPERS
  // ══════════════════════════════════════════════════════════

  function describeResultAtIndex(idx: number): string {
    const r = resultsRef.current
    if (idx < 0 || idx >= r.length) return "No result at that position."
    setFocusedIndex(idx)
    setSelectedResultId(r[idx].id)
    const si = r[idx].snippetInfo ?? {}
    const snippet = describeSnippet(si)
    const source = r[idx].source ? ` from ${r[idx].source}` : ""
    let msg = `Result ${idx + 1} of ${r.length}: ${r[idx].title}${source}.`
    if (snippet) msg += ` I found ${snippet}.`
    if (idx < r.length - 1) {
      msg += " Say open this one, or try the next."
    } else {
      msg += " Say open this one, or go back to search again."
    }
    setLastOfferedAction("open_current_result")
    return msg
  }

  function describeCurrentResult(): string {
    const r = resultsRef.current
    if (r.length === 0) return "No results to describe."
    const idx = Math.max(0, focusedIndexRef.current)
    if (!r[idx]) return "No results to describe."
    const si = r[idx].snippetInfo ?? {}
    const snippet = describeSnippet(si)
    const source = r[idx].source ? ` from ${r[idx].source}` : ""
    let msg = `Result ${idx + 1} of ${r.length}: ${r[idx].title}${source}.`
    if (snippet) msg += ` I found ${snippet}.`
    msg += " Say open this one, or try another."
    return msg
  }

  function advanceToNextResult(): string {
    const r = resultsRef.current
    if (r.length === 0) return "No results."
    const curIdx = r.findIndex((x) => x.id === selectedResultIdRef.current)
    const nextIdx = Math.min(curIdx + 1, r.length - 1)
    if (nextIdx !== curIdx) return describeResultAtIndex(nextIdx)
    return "That's the last result. Say go back to search again."
  }

  function goBackToResults(): string {
    setCurrentSite(null)
    setSelectedResultId(null)
    setLastOrientation(null)
    setLastOfferedAction(null)
    setMode("results")
    const r = resultsRef.current
    if (r.length > 0) {
      const idx = Math.max(0, focusedIndexRef.current)
      return `Back to ${r.length} results. ` + describeResultAtIndex(idx)
    }
    return goBackToHome()
  }

  function goBackToHome(): string {
    setCurrentSite(null)
    setSelectedResultId(null)
    setResults([])
    setQuery("")
    setLastOrientation(null)
    setLastOfferedAction(null)
    setMode("home")
    return "Starting fresh. What would you like to search for?"
  }

  function getRepeatText(): string {
    const m = modeRef.current
    switch (m) {
      case "home":
        return "What would you like to search for?"
      case "results":
        return describeCurrentResult()
      case "site":
        return lastOrientationRef.current || lastAnswerRef.current || "No website is open."
      default:
        return lastAnswerRef.current || "Nothing to repeat."
    }
  }

  // ══════════════════════════════════════════════════════════
  //  ROUTER — branches on mode, single decision per turn
  // ══════════════════════════════════════════════════════════

  async function routeInput(text: string): Promise<string> {
    const t0 = performance.now()
    const lower = text.toLowerCase().trim()
    if (!lower || lower.length < 2) return ""
    const m = modeRef.current

    // ── Global commands (any mode) ──
    if (/^(stop|quiet|shut up|be quiet|stop speaking)\b/.test(lower)) { stopSpeaking(); return "" }
    if (/^(help|what can i say|what are my options)\b/.test(lower)) return getHelp(m)
    if (/^(repeat|say that again|repeat that|say it again)\b/.test(lower)) return getRepeatText()
    if (/^(thanks|thank you|done)\.?$/i.test(lower)) return ""

    // ── Branch on mode ──
    console.log(`[ROUTE] mode="${m}" input="${lower.slice(0, 50)}"`)
    let result: string
    switch (m) {
      case "home":
        result = await doSearchWithRefine(text); break
      case "searching":
        result = "Already searching. Please wait."; break
      case "results":
        result = await routeResults(text, lower); break
      case "opening":
        result = /\b(cancel|go back|back|stop)\b/.test(lower) ? goBackToResults() : "Opening a page. Please wait, or say cancel."; break
      case "site":
        result = await routeSite(text, lower); break
      default:
        result = await doSearchWithRefine(text); break
    }

    console.log(`[ROUTE] mode=${m} ${(performance.now() - t0).toFixed(0)}ms → "${result.slice(0, 80)}"`)
    return result
  }

  async function routeResults(text: string, lower: string): Promise<string> {
    const r = resultsRef.current
    console.log(`[RESULTS] routing: "${lower.slice(0, 60)}" | results=${r.length} | focused=${focusedIndexRef.current} | offered=${offeredActionRef.current}`)

    // Yes/no / open via lastOfferedAction — accept multi-word affirmatives
    // Only match if there's NO specific ordinal (first/second/third) — those go to navigation
    const hasSpecificOrdinal = /\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|next|previous)\b/i.test(lower)
    if (!hasSpecificOrdinal && /\b(yes|yeah|yep|sure|ok(ay)?|open it|open this one|do it|go ahead|let's go|please open)\b/i.test(lower)) {
      if (offeredActionRef.current === "open_current_result" || /\bopen\b/i.test(lower)) {
        setLastOfferedAction(null)
        const idx = Math.max(0, focusedIndexRef.current)
        if (r[idx]) {
          console.log(`[RESULTS] → open via affirmative (focused), idx=${idx}`)
          return await doOpenResult(r[idx])
        }
      }
    }

    if (/\b(no|nah|nope|not this|not really|next one|try another|another one)\b/i.test(lower) && !/\b(open|first|second|third|fourth|fifth)\b/i.test(lower)) {
      setLastOfferedAction(null)
      console.log(`[RESULTS] → advance to next result`)
      return advanceToNextResult()
    }

    // Go back
    if (/\b(go back|start over|clear|new search)\b/.test(lower)) {
      console.log(`[RESULTS] → go back to home`)
      return goBackToHome()
    }

    // List results
    if (/\b(read (the )?results|list results|what are the results|all results)\b/.test(lower)) {
      if (r.length === 0) return "No results."
      return r.map((x, i) => `${i + 1}: ${x.title}`).join(". ")
    }

    // Navigation (first/second/next/previous + optional open)
    const nav = parseNav(lower)
    if (nav) {
      const curIdx = r.findIndex((x) => x.id === selectedResultIdRef.current)
      const idx = resolveIdx(nav, curIdx, r.length)
      const wantsOpen = nav === "current" || /\b(open|go|try|choose|select|visit|pick|switch|click)\b/.test(lower)
      console.log(`[RESULTS] → nav: ${nav}, idx=${idx}, wantsOpen=${wantsOpen}`)
      if (wantsOpen && r[idx]) return await doOpenResult(r[idx])
      return describeResultAtIndex(idx)
    }

    // Explicit new search
    if (/\b(search|find|look for|look up)\b/i.test(lower)) {
      console.log(`[RESULTS] → explicit new search`)
      return await doSearchWithRefine(text)
    }

    // Fallback: treat as new search
    console.log(`[RESULTS] → FALLBACK to new search for: "${text.slice(0, 40)}"`)
    return await doSearchWithRefine(text)
  }

  function answerFromKeyInfo(question: string, sd: SiteData): string | null {
    const lower = question.toLowerCase()
    const info = sd.keyInfo ?? {}

    if (/\b(phone|call|number|contact|dial)\b/.test(lower) && info.phone)
      return `The phone number is ${info.phone}.`
    if (/\b(address|location|where|located|directions?)\b/.test(lower) && info.address)
      return `The address is ${info.address}.`
    if (/\b(hours?|open|close|when|schedule|timing)\b/.test(lower) && info.hours)
      return `The hours are ${info.hours}.`
    if (/\b(email|e-mail|mail)\b/.test(lower) && info.email)
      return `The email is ${info.email}.`
    if (/\b(price|cost|how much|pricing|fee)\b/.test(lower) && info.price)
      return `The price is ${info.price}.`
    if (/\b(rating|review|stars?|score)\b/.test(lower) && info.rating)
      return `The rating is ${info.rating}.`
    if (/\b(menu|cuisine|food type)\b/.test(lower) && info.menu)
      return `The menu includes ${info.menu}.`
    if (/\b(services?|what do they (do|offer))\b/.test(lower) && info.services)
      return `They offer ${info.services}.`

    return null
  }

  async function routeSite(text: string, lower: string): Promise<string> {
    const sd = currentSiteRef.current
    const SUFFIX = " You can ask for more, or say go back."

    // Go back
    if (/^(go back|back)\b/.test(lower)) return goBackToResults()

    // Headings
    if (/^(read (the )?headings|what are the sections)\b/.test(lower)) {
      if (!sd?.headings?.length) return "No headings on this page." + SUFFIX
      return sd.headings.slice(0, 6).join(". ") + "." + SUFFIX
    }

    // Links
    if (/^(read (the )?links|what links)\b/.test(lower)) {
      if (!sd?.links?.length) return "No links on this page." + SUFFIX
      return sd.links.slice(0, 6).map((l) => l.text).join(". ") + "." + SUFFIX
    }

    // Orientation
    if (/^(what is this (website|page|site)|where am i|describe)\b/.test(lower)) {
      return sd ? buildOrientation(sd) : "No website is open."
    }

    // Summarize / read everything
    if (/^(only the important|summarize|summary|important details|read everything|tell me everything)\b/.test(lower)) {
      if (!sd) return "No website is open."
      const kv = Object.entries(sd.keyInfo ?? {}).slice(0, 5).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(". ")
      return (kv || sd.summary) + SUFFIX
    }

    // Local keyInfo Q&A — instant, no Gemini needed
    if (sd) {
      const local = answerFromKeyInfo(lower, sd)
      if (local) return local + SUFFIX
    }

    // New search (explicit keywords)
    if (/\b(search|find|look for|look up)\b/i.test(lower)) {
      return await doSearchWithRefine(text)
    }

    // Fall back to Gemini Q&A only if no local answer
    const answer = await doAskSite(text)
    return answer + SUFFIX
  }

  routeInputRef.current = routeInput

  // ══════════════════════════════════════════════════════════
  //  VOICE — single speaker architecture
  //  Connected:    ElevenLabs speaks (tool response is the only output)
  //  Disconnected: browser TTS speaks
  // ══════════════════════════════════════════════════════════

  function showResponse(response: string) {
    if (!response) return
    addToTranscript("assistant", response)
    announce(response)
    setLastAnswer(response)
  }

  async function precompute(text: string, turnId: number) {
    const t0 = performance.now()
    console.log(`[PRECOMPUTE] ▶ turn=${turnId} text="${text.slice(0, 50)}"`)
    const promise = routeInputRef.current(text)
      .catch((e) => { console.error("[PRECOMPUTE] caught error:", e); return "Something went wrong. Try again." })
    turnPromiseRef.current = promise
    const response = await promise
    if (turnId === turnIdRef.current) turnResponseRef.current = response
    console.log(`[PRECOMPUTE] ◀ turn=${turnId} ${(performance.now() - t0).toFixed(0)}ms result="${response.slice(0, 80)}"`)
    return response
  }

  const TOOL_TIMEOUT_MS = 3_000

  async function toolHandler(toolName: string, paramText?: string): Promise<string> {
    const t0 = performance.now()
    const ms = () => `${(performance.now() - t0).toFixed(0)}ms`

    console.log(`[TOOL] ▶ ${toolName} | param="${paramText?.slice(0, 50) ?? "NONE"}" | hasPending=${!!turnPromiseRef.current} | hasResponse=${turnResponseRef.current !== null} | turnId=${turnIdRef.current}`)

    // CRITICAL: If tool provides new input text, we must compute fresh.
    // The cached turnResponseRef might be STALE from a previous turn
    // (handle_input can fire BEFORE onMessage clears the old response).
    if (paramText) {
      // Always start a fresh computation for the provided text
      turnIdRef.current += 1
      const turnId = turnIdRef.current
      turnResponseRef.current = null
      turnPromiseRef.current = null
      console.log(`[TOOL] fresh compute from tool param, turn=${turnId}`)
      void precompute(paramText, turnId)
    }

    // If no paramText AND precompute already finished (onMessage path), return it
    if (!paramText && turnResponseRef.current) {
      const cached = turnResponseRef.current
      turnResponseRef.current = null
      showResponse(cached)
      console.log(`[TOOL] ◀ FINAL RETURN (pre-cached) ${ms()}: "${cached.slice(0, 100)}"`)
      return cached || "OK."
    }

    // If nothing pending and no param, wait briefly for onMessage to fire
    if (!turnPromiseRef.current) {
      console.log(`[TOOL] no pending, no param — waiting 300ms for onMessage`)
      await new Promise((r) => setTimeout(r, 300))
      if (turnResponseRef.current) {
        const cached = turnResponseRef.current
        turnResponseRef.current = null
        showResponse(cached)
        console.log(`[TOOL] ◀ FINAL RETURN (after wait) ${ms()}: "${cached.slice(0, 100)}"`)
        return cached || "OK."
      }
      if (!turnPromiseRef.current) {
        console.warn(`[TOOL] ◀ FINAL RETURN (no-input) ${ms()}: nothing to process`)
        return "I'm listening. What would you like to do?"
      }
    }

    // Await the pending promise with timeout
    const pending = turnPromiseRef.current!
    let timedOut = false
    const result = await Promise.race([
      pending,
      new Promise<null>((resolve) =>
        setTimeout(() => { timedOut = true; resolve(null) }, TOOL_TIMEOUT_MS)
      ),
    ])

    if (result !== null && result !== undefined && !timedOut) {
      showResponse(result)
      const final = result || "OK."
      console.log(`[TOOL] ◀ FINAL RETURN (success) ${ms()}: "${final.slice(0, 100)}"`)
      return final
    }

    // Timeout — still running. Return ack, deliver result when ready.
    const ack = paramText
      ? `Working on it. One moment please.`
      : "One moment please."
    console.warn(`[TOOL] ◀ FINAL RETURN (timeout) ${ms()} > ${TOOL_TIMEOUT_MS}ms. Returning ack: "${ack}"`)

    pending.then(async (response) => {
      if (!response) return
      console.log(`[TOOL] LATE response at +${ms()}: "${response.slice(0, 80)}"`)
      showResponse(response)
      await new Promise((r) => setTimeout(r, 2000))
      console.log(`[TOOL] delivering late result via browser TTS`)
      void speakText(response)
    })

    return ack
  }

  const conversation = useConversation({
    clientTools: {
      handle_input: async (params: { text?: string }) => toolHandler("handle_input", params.text),
      search_web: async (params: { query?: string }) => toolHandler("search_web", params.query),
      open_result: async () => toolHandler("open_result"),
      ask_site: async (params: { question?: string }) => toolHandler("ask_site", params.question),
    },
    onConnect: () => {
      console.log("[navia] CONNECTED")
      reconnectCountRef.current = 0
      hasConnectedOnceRef.current = true
      connectedRef.current = true
      timeLimitEndRef.current = false
      setVoiceMode("listening")
      announce("Listening.")

      // Start 2-minute session timer
      sessionStartTimeRef.current = Date.now()
      clearSessionTimers()
      sessionWarnTimerRef.current = setTimeout(() => {
        announce("Your session will end in 10 seconds.")
        if (connectedRef.current) void speakText("Your session will end in 10 seconds.")
      }, MAX_SESSION_MS - WARN_BEFORE_MS)
      sessionEndTimerRef.current = setTimeout(async () => {
        console.log("[SESSION] 2-minute limit reached, ending session")
        timeLimitEndRef.current = true
        intentionalEndRef.current = true
        clearSessionTimers()
        reportSessionDuration()
        stopSpeaking()
        try { await conversation.endSession() } catch {}
        setVoiceMode("idle")
        announce("Session ended. You can start a new one anytime.")
      }, MAX_SESSION_MS)
      console.log(`[SESSION] timer started: ${MAX_SESSION_MS / 1000}s max`)
    },
    onDisconnect: () => {
      console.log("[navia] DISCONNECTED")
      connectedRef.current = false
      setVoiceMode("idle")
      clearSessionTimers()
      reportSessionDuration()

      if (intentionalEndRef.current) { intentionalEndRef.current = false; return }
      // Don't auto-reconnect if session ended due to time limit
      if (timeLimitEndRef.current) { timeLimitEndRef.current = false; return }
      if (reconnectCountRef.current < 3 && hasConnectedOnceRef.current && !sessionStartingRef.current) {
        reconnectCountRef.current++
        console.log(`[navia] auto-reconnect #${reconnectCountRef.current}`)
        setTimeout(() => startSession(), 1500)
      }
    },
    onModeChange: ({ mode: m }) => {
      console.log(`[navia] VOICE MODE: ${m}`)
      if (m === "speaking") setVoiceMode("speaking")
      else if (m === "listening") setVoiceMode("listening")
    },
    onMessage: (msg) => {
      try {
        if (msg?.source === "user" && msg?.message) {
          const text = msg.message
          console.log(`[MSG] USER: "${text}" | currentTurn=${turnIdRef.current} | hasPending=${!!turnPromiseRef.current}`)
          if (isNoise(text)) { console.log("[MSG] filtered as noise"); return }

          // If toolHandler already started a fresh precompute for this text, don't duplicate
          if (turnPromiseRef.current) {
            console.log(`[MSG] precompute already running for turn ${turnIdRef.current}, skipping duplicate`)
            addToTranscript("user", text)
            return
          }

          turnIdRef.current += 1
          const turnId = turnIdRef.current
          turnResponseRef.current = null
          turnPromiseRef.current = null

          addToTranscript("user", text)
          console.log(`[MSG] starting precompute turn ${turnId}`)
          void precompute(text, turnId)
        }
        if (msg?.source === "ai" && msg?.message) {
          console.log(`[MSG] AGENT SPEAKS: "${msg.message.slice(0, 100)}"`)
        }
      } catch (e) { console.error("[MSG] onMessage error:", e) }
    },
    onError: (err) => console.error("[navia] ERROR:", err),
    onUnhandledClientToolCall: (p) => console.warn("[navia] UNHANDLED TOOL:", JSON.stringify(p)),
    onStatusChange: ({ status }) => console.log("[navia] STATUS:", status),
  })

  endSessionRef.current = conversation.endSession
  connectedRef.current = conversation.status === "connected"
  const isConnected = conversation.status === "connected"

  const sessionStartingRef = useRef(false)

  async function startSession() {
    if (sessionStartingRef.current || conversation.status === "connected") return
    sessionStartingRef.current = true
    setVoiceMode("connecting")
    announce("Connecting.")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())

      // Pass judge key from URL if present (e.g. ?key=secret)
      const judgeKey = new URLSearchParams(window.location.search).get("key")
      const voiceUrl = judgeKey ? `/api/voice?key=${encodeURIComponent(judgeKey)}` : "/api/voice"

      const voiceRes = await fetch(voiceUrl)
      if (voiceRes.status === 429) {
        const data = await voiceRes.json()
        setVoiceMode("idle")
        const msg = data.error ?? "Live voice limit reached. You can still explore the text demo. Try voice again later."
        announce(msg)
        addToTranscript("assistant", msg)
        return
      }
      if (!voiceRes.ok) {
        setVoiceMode("idle")
        announce("Could not start voice session.")
        return
      }

      const { signedUrl, sessionId } = await voiceRes.json()
      if (!signedUrl) throw new Error("No signed URL received")

      sessionIdRef.current = sessionId ?? null
      await conversation.startSession({ signedUrl })
    } catch {
      setVoiceMode("idle")
      announce("Could not connect. Check microphone.")
    } finally {
      sessionStartingRef.current = false
    }
  }

  async function toggleVoice() {
    if (isConnected) {
      intentionalEndRef.current = true
      clearSessionTimers()
      reportSessionDuration()
      stopSpeaking()
      await conversation.endSession()
      setVoiceMode("idle")
      announce("Voice ended.")
    } else {
      reconnectCountRef.current = 0
      await startSession()
    }
  }

  const handleTypedSearch = useCallback(async (q: string) => {
    addToTranscript("user", q)
    const response = await doSearchWithRefine(q)
    addToTranscript("assistant", response)
    announce(response)
    if (!connectedRef.current) void speakText(response)
  }, [])

  const handleClickResult = useCallback(async (result: SearchResult) => {
    const response = await doOpenResult(result)
    addToTranscript("assistant", response)
    announce(response)
    if (!connectedRef.current) void speakText(response)
  }, [])

  return (
    <div className="app">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <div className="sr-only" role="status" aria-live="assertive" aria-atomic="true">
        {announcement}
      </div>

      <header className="nav" role="banner">
        <span className="nav__logo">Navia</span>
        <span className="nav__tagline" aria-label="Voice-first web assistant">Search, understand, use — by voice</span>
        <span className="nav__spacer" />
        <kbd className="nav__shortcut" aria-label="Press slash to search" title="Press / to search">/</kbd>
      </header>

      <main id="main-content" className="layout" role="main">
        <section className="col-left" aria-label="Search and results">
          <SearchBar
            query={query}
            onChange={setQuery}
            onSearch={handleTypedSearch}
            isLoading={isLoadingResults}
            isListening={voiceMode === "listening"}
            onMicClick={toggleVoice}
          />
          <ResultsList
            results={results}
            selectedResultId={selectedResultId}
            isLoadingSite={isLoadingSite}
            onOpen={handleClickResult}
            focusedIndex={focusedIndex}
            onFocusedIndexChange={setFocusedIndex}
            isSearching={isLoadingResults}
          />
        </section>

        <section ref={sitePanelRef} className="col-right" aria-label="Website details" tabIndex={-1}>
          <SitePanel
            siteData={currentSite}
            isLoading={isLoadingSite}
            onQuickAction={(q) => doAskSite(q).then((a) => {
              const full = a + " You can ask for more, or say go back."
              addToTranscript("assistant", full)
              announce(full)
            })}
            category={searchContext?.category}
          />
        </section>
      </main>

      <div className="transcript-bar" role="log" aria-label="Conversation" aria-live="polite">
        <div className="transcript-bar__inner">
          {transcript.length === 0 ? (
            <p className="transcript-bar__empty">Conversation appears here</p>
          ) : (
            <div className="transcript-bar__messages">
              {transcript.slice(-8).map((item, i) => (
                <div key={i} className={`transcript-msg transcript-msg--${item.role}`}>
                  <span className="transcript-msg__role">{item.role === "user" ? "You" : "Navia"}</span>
                  <span className="transcript-msg__text">{item.text}</span>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>
      </div>

      <DynamicIsland
        transcript={transcript}
        isListening={voiceMode === "listening"}
        isSpeaking={voiceMode === "speaking"}
        isConnected={isConnected}
        isConnecting={voiceMode === "connecting"}
        lastAnswer={lastAnswer}
        onMicClick={toggleVoice}
        browsingMode={mode}
        resultCount={results.length}
        siteName={currentSite?.siteName ?? null}
      />
    </div>
  )
}
