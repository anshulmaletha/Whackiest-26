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

const HELP_TEXT =
  "You can say: Search for something. Open first result. " +
  "What is this website? Give me the phone number. What is the address? " +
  "Read the headings. Read the links. Repeat. Go back. Next. Stop. Help."

function buildOrientation(sd: SiteData): string {
  const parts: string[] = [`This is ${sd.siteName}.`]
  const keys = Object.keys(sd.keyInfo ?? {})
  if (keys.length > 0) {
    parts.push(`I found ${keys.slice(0, 4).map((k) => k.replace(/_/g, " ")).join(", ")}.`)
  }
  if (sd.headings && sd.headings.length > 0) {
    parts.push(`${sd.headings.length} sections.`)
  }
  parts.push("Ask for any of these, or say help.")
  return parts.join(" ")
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
  if (/\b(not? this|no,?\s)/i.test(text)) return "next"
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

  const currentSiteRef = useRef<SiteData | null>(null)
  currentSiteRef.current = currentSite
  const resultsRef = useRef<SearchResult[]>([])
  resultsRef.current = results
  const lastAnswerRef = useRef<string | null>(null)
  lastAnswerRef.current = lastAnswer
  const selectedResultIdRef = useRef<string | null>(null)
  selectedResultIdRef.current = selectedResultId
  const searchContextRef = useRef<SearchContext | null>(null)
  const sitePanelRef = useRef<HTMLElement>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const endSessionRef = useRef<(() => Promise<void>) | null>(null)
  const isLoadingRef = useRef(false)
  const reconnectCountRef = useRef(0)
  const intentionalEndRef = useRef(false)
  const hasConnectedOnceRef = useRef(false)

  // Routing mutex: prevents double-execution of the same utterance
  const routeInputRef = useRef<(text: string) => Promise<string>>(async () => "")
  const pendingTextRef = useRef<string | null>(null)
  const pendingResponseRef = useRef<string | null>(null)
  const routingInFlightRef = useRef(false)
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Voice lock — ensures only one voice output at a time
  const toolInFlightRef = useRef(false)
  const agentSpeakingRef = useRef(false)

  // ── Noise filter — ONLY actual filler/garbage, NOT valid short queries ──
  const FILLER_WORDS = /^(um+|uh+|hmm*|ah+|oh+|eh+|huh|mhm|like|so|well|right|hey|hi|hello|bye|you know|i see|got it|alright|hm|ha|ho)\.?$/i

  function isNoise(text: string): boolean {
    const trimmed = text.trim()
    if (trimmed.length < 2) return true
    if (FILLER_WORDS.test(trimmed)) return true
    // Only filter single-char or pure punctuation
    if (/^[^a-zA-Z\u0590-\u05FF]*$/.test(trimmed)) return true
    return false
  }

  // ── Agent garbage filter — only clear-cut agent filler/refusals ──
  function isAgentGarbage(text: string): boolean {
    const t = text.trim().toLowerCase()
    if (t.length < 3) return true
    if (t === "not found" || t === "not found.") return true
    if (/^(please speak|say something|are you still there|still listening|are you there|can you hear me)\.?$/.test(t)) return true
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

  useEffect(() => {
    return () => { if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current) }
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
  // ══════════════════════════════════════════════════════════

  async function doSearch(q: string): Promise<string> {
    if (isLoadingRef.current) return "Already searching."
    isLoadingRef.current = true
    setQuery(q)
    setIsLoadingResults(true)
    setResults([])
    setCurrentSite(null)
    setSelectedResultId(null)
    setFocusedIndex(-1)
    announce("Searching.")

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      })
      const data = await res.json()
      if (data.results?.length) {
        setResults(data.results)
        setFocusedIndex(0)
        const top = data.results[0] as SearchResult
        const si = top.snippetInfo ?? {}
        const fields = Object.keys(si)
        let msg = `Found ${data.results.length} results. First is ${top.title}.`
        // Announce at most 2 most important fields — keep it short and natural
        const priority = ["phone", "hours", "rating", "price", "address", "email"]
        const found = priority.filter((f) => si[f])
        if (found.length > 0) {
          const labels = found.slice(0, 2).map((f) => f.replace(/_/g, " "))
          msg += ` I found ${labels.join(" and ")}.`
        }
        msg += " Say open this one, or try the next."
        return msg
      }
      return "No results found. Try a different search."
    } catch {
      return "Search failed. Please try again."
    } finally {
      setIsLoadingResults(false)
      isLoadingRef.current = false
    }
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
    return {
      siteName: result.source || result.title,
      summary: result.description,
      keyInfo: si,
    }
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
    setSelectedResultId(result.id)
    setIsLoadingSite(true)
    setCurrentSite(null)
    announce(`Opening ${result.title}.`)

    const cached = getCachedSite(result.url)
    if (cached) {
      const enriched = enrichSiteData(cached, result)
      setCurrentSite(enriched)
      setIsLoadingSite(false)
      sitePanelRef.current?.focus()
      return buildOrientation(enriched)
    }

    const ctx = searchContextRef.current ?? {
      intent: "search" as const,
      query: query || result.title,
      category: "general",
      extractFields: ["phone", "address", "hours", "email", "price", "rating", "summary", "headings", "links"],
    }
    const { ok, siteData } = await tryOpenSite(result.url, ctx)
    if (ok && siteData) {
      const enriched = enrichSiteData(siteData, result)
      setCachedSite(result.url, enriched)
      setCurrentSite(enriched)
      setIsLoadingSite(false)
      sitePanelRef.current?.focus()
      return buildOrientation(enriched)
    }

    // Blocked — check snippet info first
    const snippetData = buildSnippetSiteData(result)
    if (snippetData) {
      setCurrentSite(snippetData)
      setIsLoadingSite(false)
      const keys = Object.keys(snippetData.keyInfo)
      return `Couldn't fully open ${result.title}, but I found ${keys.map((k) => k.replace(/_/g, " ")).join(", ")} from the search results. Ask for any of these.`
    }

    // Try ONE alternative only — don't iterate through all results
    const remaining = resultsRef.current.filter((r) => r.id !== result.id)
    if (remaining.length > 0) {
      const alt = remaining[0]
      const altCached = getCachedSite(alt.url)
      if (altCached) {
        const enriched = enrichSiteData(altCached, alt)
        setSelectedResultId(alt.id)
        setCurrentSite(enriched)
        setIsLoadingSite(false)
        return `Couldn't read ${result.title}. Trying ${alt.title}. ${buildOrientation(enriched)}`
      }
      const altRes = await tryOpenSite(alt.url, ctx)
      if (altRes.ok && altRes.siteData) {
        const enriched = enrichSiteData(altRes.siteData, alt)
        setSelectedResultId(alt.id)
        setCachedSite(alt.url, enriched)
        setCurrentSite(enriched)
        setIsLoadingSite(false)
        return `Couldn't read ${result.title}. Trying ${alt.title}. ${buildOrientation(enriched)}`
      }
    }

    // Last resort: aggregate snippet info
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
      return `Sites are blocking access, but I found ${keys.map((k) => k.replace(/_/g, " ")).join(", ")} from the search results.`
    }

    setIsLoadingSite(false)
    return "This site isn't accessible. Try saying next to try another result."
  }

  async function doAskSite(question: string): Promise<string> {
    const sd = currentSiteRef.current
    if (!sd) return "No website is open."
    announce("Checking.")
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

  async function doSearchWithRefine(text: string): Promise<string> {
    try {
      const intentRes = await fetch("/api/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speech: text,
          hasResults: resultsRef.current.length > 0,
          hasSiteOpen: !!currentSiteRef.current,
        }),
      })
      const { context } = await intentRes.json() as { context: SearchContext }
      if (context) {
        searchContextRef.current = context
        setSearchContext(context)
      }
      return await doSearch(context?.query || text)
    } catch {
      return await doSearch(text)
    }
  }

  // ══════════════════════════════════════════════════════════
  //  LOCAL COMMAND PARSER — instant, returns string or null
  // ══════════════════════════════════════════════════════════

  function handleLocalCommand(lower: string): string | null {
    if (/^(help|what can i say|what are my options)\b/.test(lower)) return HELP_TEXT
    if (/^(stop|quiet|shut up|cancel|be quiet|stop speaking)\b/.test(lower)) { stopSpeaking(); return "" }
    if (/^(repeat|say that again|repeat that|say it again)\b/.test(lower)) return lastAnswerRef.current || "Nothing to repeat."

    if (/^(go back|back|start over|clear)\b/.test(lower)) {
      setCurrentSite(null)
      setSelectedResultId(null)
      if (resultsRef.current.length > 0) return `Back to ${resultsRef.current.length} results.`
      setResults([])
      setQuery("")
      return "Starting fresh. What would you like to search for?"
    }

    if (/^(read (the )?results|list results|what are the results)\b/.test(lower)) {
      const r = resultsRef.current
      if (r.length === 0) return "No results yet."
      return r.map((x, i) => `${i + 1}: ${x.title}`).join(". ")
    }

    if (/^(read (the )?headings|what are the sections)\b/.test(lower)) {
      const sd = currentSiteRef.current
      if (!sd?.headings?.length) return "No headings."
      return sd.headings.slice(0, 6).join(". ")
    }

    if (/^(read (the )?links|what links)\b/.test(lower)) {
      const sd = currentSiteRef.current
      if (!sd?.links?.length) return "No links."
      return sd.links.slice(0, 6).map((l) => l.text).join(". ")
    }

    if (/^(what is this (website|page|site)|where am i|describe)\b/.test(lower)) {
      const sd = currentSiteRef.current
      return sd ? buildOrientation(sd) : "No website is open."
    }

    if (/^(only the important|summarize|summary|important details)\b/.test(lower)) {
      const sd = currentSiteRef.current
      if (!sd) return "No website is open."
      const kv = Object.entries(sd.keyInfo ?? {}).slice(0, 5).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(". ")
      return kv || sd.summary
    }

    // Simple yes/ok/sure/thanks — acknowledge, don't trigger anything
    if (/^(ok(ay)?|sure|yes|yeah|yep|no|nah|nope|thanks|thank you|done|alright)\.?$/i.test(lower)) return ""

    return null
  }

  // ══════════════════════════════════════════════════════════
  //  THE ROUTER — one function, one decision, one response
  //  Prefix with spoken acknowledgment for async operations
  // ══════════════════════════════════════════════════════════

  async function routeInput(text: string): Promise<string> {
    const lower = text.toLowerCase().trim()
    if (!lower || lower.length < 2) return ""

    // 1. Local commands (instant, no async)
    const cmd = handleLocalCommand(lower)
    if (cmd !== null) return cmd

    // 2. Result navigation (when results exist)
    const r = resultsRef.current
    if (r.length > 0) {
      const nav = parseNav(lower)
      if (nav) {
        const curIdx = r.findIndex((x) => x.id === selectedResultIdRef.current)
        const idx = resolveIdx(nav, curIdx, r.length)
        if (nav === "current" || /\b(open|go|try|choose|select|visit|pick|switch|click)\b/.test(lower)) {
          return `Opening ${r[idx].title}. ` + await doOpenResult(r[idx])
        }
        setFocusedIndex(idx)
        setSelectedResultId(r[idx].id)
        return `Result ${idx + 1}: ${r[idx].title}. Say open to go there.`
      }
    }

    // 3. If site is open and not obviously a new search → ask about site
    if (currentSiteRef.current && !/\b(search|find|look for|look up)\b/i.test(lower)) {
      return `Checking. ` + await doAskSite(text)
    }

    // 4. Default: search (with Gemini refinement)
    return `Searching. ` + await doSearchWithRefine(text)
  }

  routeInputRef.current = routeInput

  // ══════════════════════════════════════════════════════════
  //  ELEVENLABS — single tool, mutex-protected routing
  // ══════════════════════════════════════════════════════════

  function cancelSafety() {
    pendingTextRef.current = null
    if (safetyTimerRef.current) { clearTimeout(safetyTimerRef.current); safetyTimerRef.current = null }
  }

  // Wait for in-flight proactive routing to finish (max 12s to avoid deadlock)
  async function waitForRouting(): Promise<string | null> {
    if (!routingInFlightRef.current) return pendingResponseRef.current
    return new Promise((resolve) => {
      const start = Date.now()
      const iv = setInterval(() => {
        if (!routingInFlightRef.current || Date.now() - start > 12000) {
          clearInterval(iv)
          resolve(pendingResponseRef.current)
        }
      }, 50)
    })
  }

  async function toolRoute(text: string): Promise<string> {
    cancelSafety()
    toolInFlightRef.current = true

    try {
      // If proactive routing already computed the answer, use it (no double execution)
      const cached = await waitForRouting()
      if (cached) {
        pendingResponseRef.current = null
        routingInFlightRef.current = false
        if (cached) setLastAnswer(cached)
        return cached
      }

      // Proactive route wasn't started or failed — route now (only execution)
      const response = await routeInputRef.current(text)
      pendingResponseRef.current = null
      routingInFlightRef.current = false
      if (response) setLastAnswer(response)
      return response || "Done."
    } finally {
      toolInFlightRef.current = false
    }
  }

  const conversation = useConversation({
    clientTools: {
      handle_input: async (params: { text: string }) => toolRoute(params.text),

      // Legacy tools — ALL delegate to toolRoute to prevent double execution
      search_web: async (params: { query?: string }) =>
        toolRoute(params.query || pendingTextRef.current || "search"),
      open_result: async (params: { index?: number }) =>
        toolRoute(pendingTextRef.current || `open result ${params.index ?? 1}`),
      ask_site: async (params: { question?: string }) =>
        toolRoute(params.question || pendingTextRef.current || "tell me about this site"),
    },
    onConnect: () => {
      reconnectCountRef.current = 0
      hasConnectedOnceRef.current = true
      setVoiceMode("listening")
      announce("Listening.")
    },
    onDisconnect: () => {
      setVoiceMode("idle")
      agentSpeakingRef.current = false
      toolInFlightRef.current = false
      if (intentionalEndRef.current) { intentionalEndRef.current = false; return }
      if (reconnectCountRef.current < 3 && hasConnectedOnceRef.current && !sessionStartingRef.current) {
        reconnectCountRef.current++
        setTimeout(() => startSession(), 1500)
      }
    },
    onModeChange: ({ mode }) => {
      if (mode === "speaking") {
        stopSpeaking()
        agentSpeakingRef.current = true
        setVoiceMode("speaking")
        // Agent is now talking — cancel safety timer, it's handled
        cancelSafety()
      } else if (mode === "listening") {
        agentSpeakingRef.current = false
        setVoiceMode("listening")
      }
    },
    onMessage: (msg) => {
      try {
        if (msg?.source === "user" && msg?.message) {
          const text = msg.message

          if (isNoise(text)) {
            console.log("[voice] filtered noise:", text)
            return
          }

          addToTranscript("user", text)

          // Proactive routing: start computing the answer immediately
          // The tool handler will pick up the result via pendingResponseRef
          pendingTextRef.current = text
          pendingResponseRef.current = null
          routingInFlightRef.current = true
          routeInputRef.current(text).then((response) => {
            pendingResponseRef.current = response
            routingInFlightRef.current = false
          }).catch(() => { routingInFlightRef.current = false })

          // Safety: if no tool is called within 5s AND agent isn't already speaking
          if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current)
          safetyTimerRef.current = setTimeout(async () => {
            // Don't fire if: agent is speaking, tool is in flight, or text was already handled
            if (agentSpeakingRef.current || toolInFlightRef.current) return
            const pending = pendingTextRef.current
            if (!pending) return
            pendingTextRef.current = null

            let response = pendingResponseRef.current
            pendingResponseRef.current = null
            routingInFlightRef.current = false
            if (!response) response = await routeInputRef.current(pending)

            if (response) {
              addToTranscript("assistant", response)
              announce(response)
              // Only use browser TTS if ElevenLabs is NOT connected
              if (conversation.status !== "connected") {
                speakText(response)
              }
            }
          }, 5000)
        }
        if (msg?.source === "ai" && msg?.message) {
          if (isAgentGarbage(msg.message)) {
            console.warn("[voice] filtered agent garbage:", msg.message)
            return
          }
          addToTranscript("assistant", msg.message)
          setLastAnswer(msg.message)
        }
      } catch { /* protect against SDK errors */ }
    },
    onError: (err) => console.error("[voice]", err),
    onUnhandledClientToolCall: (p) => console.warn("[voice] unhandled tool:", p),
    onStatusChange: ({ status }) => console.log("[voice]", status),
  })

  endSessionRef.current = conversation.endSession
  const isConnected = conversation.status === "connected"

  const sessionStartingRef = useRef(false)

  async function startSession() {
    // Prevent double session starts
    if (sessionStartingRef.current || conversation.status === "connected") return
    sessionStartingRef.current = true
    setVoiceMode("connecting")
    announce("Connecting.")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      await conversation.startSession({
        agentId: process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? "",
        connectionType: "webrtc",
      })
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
      stopSpeaking()
      await conversation.endSession()
      setVoiceMode("idle")
      announce("Voice ended.")
    } else {
      reconnectCountRef.current = 0
      await startSession()
    }
  }

  // ── Typed search (from search bar) ──
  const handleTypedSearch = useCallback(async (q: string) => {
    addToTranscript("user", q)
    const response = await doSearchWithRefine(q)
    addToTranscript("assistant", response)
    announce(response)
  }, [])

  // ── Clicked result (from UI) ──
  const handleClickResult = useCallback(async (result: SearchResult) => {
    const response = await doOpenResult(result)
    addToTranscript("assistant", response)
    announce(response)
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
            onQuickAction={(q) => doAskSite(q).then((a) => { addToTranscript("assistant", a); announce(a) })}
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
      />
    </div>
  )
}
