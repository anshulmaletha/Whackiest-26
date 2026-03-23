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
    const labels = keys.slice(0, 3).map((k) => k.replace(/_/g, " "))
    parts.push(`I found ${labels.join(", ")}.`)
    parts.push("You can ask for any of them, or say go back.")
  } else if (sd.headings && sd.headings.length > 0) {
    parts.push(`${sd.headings.length} sections. You can ask me about this page, or say go back.`)
  } else {
    parts.push("Ask me anything about this page.")
  }
  return parts.join(" ")
}

function describeSnippet(si: Record<string, string>): string {
  const priority = ["phone", "hours", "rating", "price", "address", "email"]
  const found = priority.filter((f) => si[f])
  if (found.length === 0) return ""
  const labels = found.slice(0, 2).map((f) => f.replace(/_/g, " "))
  return labels.join(" and ")
}

function isStrongResult(si?: Record<string, string>): boolean {
  if (!si) return false
  return Object.keys(si).length >= 3
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

  const routeInputRef = useRef<(text: string) => Promise<string>>(async () => "")
  const turnIdRef = useRef(0)
  const turnResponseRef = useRef<string | null>(null)
  const turnPromiseRef = useRef<Promise<string> | null>(null)
  const connectedRef = useRef(false)

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
        const snippet = describeSnippet(si)

        let msg = `I found ${data.results.length} results. The first is ${top.title}.`
        if (snippet) msg += ` I found ${snippet}.`

        if (isStrongResult(si)) {
          msg += " Would you like me to open it?"
        } else {
          msg += " You can say open this one, try the next, or open the second result."
        }
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

    // Thanks/done — just acknowledge
    if (/^(thanks|thank you|done)\.?$/i.test(lower)) return ""

    // "no" / "nah" — if results exist, treat as "next"; otherwise ignore
    if (/^(no|nah|nope|not this|not really)\.?$/i.test(lower)) {
      const r = resultsRef.current
      if (r.length > 0 && !currentSiteRef.current) {
        const curIdx = r.findIndex((x) => x.id === selectedResultIdRef.current)
        const nextIdx = Math.min(curIdx + 1, r.length - 1)
        if (nextIdx !== curIdx) {
          setFocusedIndex(nextIdx)
          setSelectedResultId(r[nextIdx].id)
          const si = r[nextIdx].snippetInfo ?? {}
          const snippet = describeSnippet(si)
          let msg = `The next result is ${r[nextIdx].title}.`
          if (snippet) msg += ` I found ${snippet}.`
          msg += " You can say open this one, or try another."
          return msg
        }
        return "That's the last result. You can say go back to search again."
      }
      return ""
    }

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

    const r = resultsRef.current
    const hasResults = r.length > 0
    const hasSiteOpen = !!currentSiteRef.current

    // 2. Affirmative responses — context-aware
    //    "yes" / "sure" / "open it" / "do it" / "go ahead"
    if (hasResults && !hasSiteOpen && /^(yes|yeah|yep|sure|ok(ay)?|open it|do it|go ahead|please|go for it)\.?$/i.test(lower)) {
      const idx = Math.max(0, focusedIndex)
      return `Opening ${r[idx].title}. ` + await doOpenResult(r[idx])
    }

    // 3. Result navigation (when results exist)
    if (hasResults) {
      const nav = parseNav(lower)
      if (nav) {
        const curIdx = r.findIndex((x) => x.id === selectedResultIdRef.current)
        const idx = resolveIdx(nav, curIdx, r.length)
        const wantsOpen = nav === "current" || /\b(open|go|try|choose|select|visit|pick|switch|click)\b/.test(lower)
        if (wantsOpen) {
          return `Opening ${r[idx].title}. ` + await doOpenResult(r[idx])
        }
        // Move focus — describe the result conversationally
        setFocusedIndex(idx)
        setSelectedResultId(r[idx].id)
        const si = r[idx].snippetInfo ?? {}
        const snippet = describeSnippet(si)
        let msg = `Result ${idx + 1} is ${r[idx].title}.`
        if (snippet) msg += ` I found ${snippet}.`
        msg += " You can say open this one, or try another."
        return msg
      }
    }

    // 4. If site is open and not obviously a new search → ask about site
    if (hasSiteOpen && !/\b(search|find|look for|look up)\b/i.test(lower)) {
      return `Checking. ` + await doAskSite(text)
    }

    // 5. Default: search (with Gemini refinement)
    return `Searching. ` + await doSearchWithRefine(text)
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
    const promise = routeInputRef.current(text)
      .catch(() => "Something went wrong. Try again.")
    turnPromiseRef.current = promise
    const response = await promise
    if (turnId === turnIdRef.current) turnResponseRef.current = response
    return response
  }

  async function toolHandler(paramText?: string): Promise<string> {
    if (!turnPromiseRef.current && paramText) {
      void precompute(paramText, turnIdRef.current)
    }
    const response = turnPromiseRef.current
      ? await turnPromiseRef.current
      : (turnResponseRef.current || "Ready. What would you like to do?")
    showResponse(response)
    return response || "Ready. What would you like to do?"
  }

  const conversation = useConversation({
    clientTools: {
      handle_input: async (params: { text?: string }) => toolHandler(params.text),
      search_web: async (params: { query?: string }) => toolHandler(params.query),
      open_result: async () => toolHandler(),
      ask_site: async (params: { question?: string }) => toolHandler(params.question),
    },
    onConnect: () => {
      reconnectCountRef.current = 0
      hasConnectedOnceRef.current = true
      connectedRef.current = true
      setVoiceMode("listening")
      announce("Listening.")
    },
    onDisconnect: () => {
      connectedRef.current = false
      setVoiceMode("idle")
      if (intentionalEndRef.current) { intentionalEndRef.current = false; return }
      if (reconnectCountRef.current < 3 && hasConnectedOnceRef.current && !sessionStartingRef.current) {
        reconnectCountRef.current++
        setTimeout(() => startSession(), 1500)
      }
    },
    onModeChange: ({ mode }) => {
      if (mode === "speaking") setVoiceMode("speaking")
      else if (mode === "listening") setVoiceMode("listening")
    },
    onMessage: (msg) => {
      try {
        if (msg?.source === "user" && msg?.message) {
          const text = msg.message
          if (isNoise(text)) return

          turnIdRef.current += 1
          const turnId = turnIdRef.current
          turnResponseRef.current = null
          turnPromiseRef.current = null

          addToTranscript("user", text)
          void precompute(text, turnId)
        }
      } catch {}
    },
    onError: (err) => console.error("[voice]", err),
    onUnhandledClientToolCall: (p) => console.warn("[voice] unhandled tool:", p),
    onStatusChange: ({ status }) => console.log("[voice]", status),
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

  // ── Typed search (from search bar) — browser TTS only when no session ──
  const handleTypedSearch = useCallback(async (q: string) => {
    addToTranscript("user", q)
    const response = await doSearchWithRefine(q)
    addToTranscript("assistant", response)
    announce(response)
    if (!connectedRef.current) void speakText(response)
  }, [])

  // ── Clicked result (from UI) — browser TTS only when no session ──
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
