"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useConversation } from "@elevenlabs/react"
import type { SearchResult, SiteData, TranscriptItem, SearchContext } from "@/types"
import { speakText, stopSpeaking, setSpeechRate, getSpeechRate } from "@/lib/speak"
import { getCachedSite, setCachedSite } from "@/lib/site-cache"
import SearchBar from "@/components/SearchBar"
import ResultsList from "@/components/ResultsList"
import SitePanel from "@/components/SitePanel"
import DynamicIsland from "@/components/DynamicIsland"

const MAX_RECONNECT = 3
const RECONNECT_DELAY = 1500

const HELP_TEXT =
  "You can say: Search for something. Open first result. " +
  "What is this website? Give me the phone number. What is the address? " +
  "What are the opening hours? Read the headings. Read the links. " +
  "Repeat that. Go back. Next result. Stop. Speak slower. Help."

function buildOrientation(sd: SiteData): string {
  const parts: string[] = [`This is ${sd.siteName}.`]
  const keys = Object.keys(sd.keyInfo ?? {})
  if (keys.length > 0) {
    const labels = keys.slice(0, 4).map((k) => k.replace(/_/g, " "))
    parts.push(`I found ${labels.join(", ")}.`)
  }
  if (sd.headings && sd.headings.length > 0) {
    parts.push(`The page has ${sd.headings.length} sections.`)
  }
  parts.push("You can ask for any of them, or say help for options.")
  return parts.join(" ")
}

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

  // ── Refs for stable access from stale closures (useConversation caches callbacks) ──
  const currentSiteRef = useRef<SiteData | null>(null)
  currentSiteRef.current = currentSite
  const resultsRef = useRef<SearchResult[]>([])
  resultsRef.current = results
  const lastAnswerRef = useRef<string | null>(null)
  lastAnswerRef.current = lastAnswer
  const voiceModeRef = useRef(voiceMode)
  voiceModeRef.current = voiceMode
  const selectedResultIdRef = useRef<string | null>(null)
  selectedResultIdRef.current = selectedResultId

  const sitePanelRef = useRef<HTMLElement>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const reconnectCountRef = useRef(0)
  const intentionalEndRef = useRef(false)
  const hasConnectedOnceRef = useRef(false)
  const toolCalledRef = useRef(false)
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLoadingRef = useRef(false)
  const endSessionRef = useRef<(() => Promise<void>) | null>(null)
  const searchContextRef = useRef<SearchContext | null>(null)

  // Ref wrappers for functions called from useConversation (stale closure protection)
  const handleSearchRef = useRef<(q: string, skipTranscript?: boolean) => Promise<void>>(async () => {})
  const handleOpenResultRef = useRef<(r: SearchResult) => Promise<void>>(async () => {})
  const handleQuickActionRef = useRef<(q: string) => Promise<void>>(async () => {})
  const handleVoiceFallbackRef = useRef<(text: string) => void>(() => {})

  // ── Helpers ──

  function announce(text: string) {
    setAnnouncement("")
    requestAnimationFrame(() => setAnnouncement(text))
  }

  const idleCountRef = useRef(0)

  function resetIdleTimer() {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleCountRef.current = 0
    scheduleIdleCheck()
  }

  function scheduleIdleCheck() {
    idleTimerRef.current = setTimeout(() => {
      if (voiceModeRef.current === "idle") return
      idleCountRef.current++
      if (idleCountRef.current >= 3) {
        intentionalEndRef.current = true
        endSessionRef.current?.()
        setVoiceMode("idle")
        const msg = "Ending voice to save resources. Click the mic to start again."
        announce(msg)
        speakText(msg)
        return
      }
      const text = idleCountRef.current === 1
        ? "I'm still here. You can search, ask a question, or say help."
        : "Still listening. Say something or I'll disconnect soon."
      announce(text)
      speakText(text)
      scheduleIdleCheck()
    }, 30000)
  }

  function addToTranscript(role: "user" | "assistant", text: string) {
    setTranscript((prev) => [...prev, { role, text, timestamp: Date.now() }])
    if (role === "assistant") setLastAnswer(text)
    resetIdleTimer()
  }

  /** Speak via browser TTS unless the ElevenLabs agent is actively talking (avoids audio overlap) */
  function speakSystem(text: string) {
    if (voiceModeRef.current !== "speaking") {
      speakText(text)
    }
  }

  /** Always speak — for local commands the agent doesn't handle */
  function speakLocal(text: string) {
    stopSpeaking()
    speakText(text)
  }

  function speakAndAnnounce(text: string, transcriptRole?: "assistant") {
    announce(text)
    speakLocal(text)
    if (transcriptRole) addToTranscript(transcriptRole, text)
  }

  // ── Cleanup timers on unmount ──
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
    }
  }, [])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [transcript])

  // ── Keyboard ──
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable

      if (e.key === "/" && !isInput) {
        e.preventDefault()
        document.querySelector<HTMLInputElement>(".search-input")?.focus()
        return
      }

      if (e.key === "Escape" && sitePanelRef.current?.contains(target)) {
        e.preventDefault()
        if (focusedIndex >= 0) {
          document.querySelector<HTMLElement>(".results-list__item--focused")?.focus()
        } else {
          document.querySelector<HTMLInputElement>(".search-input")?.focus()
        }
      }
    }

    window.addEventListener("keydown", handleGlobalKey)
    return () => window.removeEventListener("keydown", handleGlobalKey)
  }, [focusedIndex])

  // ── Core actions ──

  const handleSearch = useCallback(async (q: string, skipTranscript = false) => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true

    setQuery(q)
    setIsLoadingResults(true)
    setResults([])
    setCurrentSite(null)
    setSelectedResultId(null)
    setFocusedIndex(-1)
    if (!skipTranscript) addToTranscript("user", q)
    announce("Searching.")
    speakSystem("Searching.")

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
        const msg = `Found ${data.results.length} results. First: ${top.title}.`
        addToTranscript("assistant", msg)
        announce(msg)
        speakSystem(`Found ${data.results.length} results. First is ${top.title}. You can say open this one, try the next one, or the second result.`)
      } else {
        const noMsg = "No results found. Try a different search."
        addToTranscript("assistant", noMsg)
        announce(noMsg)
        speakSystem(noMsg)
      }
    } catch {
      const errMsg = "I couldn't complete the search. Please try again."
      addToTranscript("assistant", errMsg)
      announce(errMsg)
      speakSystem(errMsg)
    } finally {
      setIsLoadingResults(false)
      isLoadingRef.current = false
    }
  }, [])

  const tryOpenSite = useCallback(async (url: string, context: SearchContext | null): Promise<{ ok: boolean; siteData?: SiteData }> => {
    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, context }),
      })
      const data = await res.json()
      if (data.blocked || !data.siteData) return { ok: false }
      return { ok: true, siteData: data.siteData as SiteData }
    } catch {
      return { ok: false }
    }
  }, [])

  const handleOpenResult = useCallback(async (result: SearchResult) => {
    setSelectedResultId(result.id)
    setIsLoadingSite(true)
    setCurrentSite(null)
    addToTranscript("user", `Open: ${result.title}`)
    announce(`Opening ${result.title}.`)
    speakSystem("Opening website.")

    const cached = getCachedSite(result.url)
    if (cached) {
      setCurrentSite(cached)
      setIsLoadingSite(false)
      const orient = buildOrientation(cached)
      addToTranscript("assistant", orient)
      announce(orient)
      speakSystem(orient)
      sitePanelRef.current?.focus()
      return
    }

    const ctx = searchContextRef.current
    const { ok, siteData } = await tryOpenSite(result.url, ctx)

    if (ok && siteData) {
      setCachedSite(result.url, siteData)
      setCurrentSite(siteData)
      const orient = buildOrientation(siteData)
      addToTranscript("assistant", orient)
      announce(orient)
      speakSystem(orient)
      sitePanelRef.current?.focus()
      setIsLoadingSite(false)
      return
    }

    // Fallback chain — try other results
    const remaining = resultsRef.current.filter((r) => r.id !== result.id)
    speakSystem("That page isn't accessible. Trying another result.")

    for (const alt of remaining) {
      announce(`Trying ${alt.title}...`)

      const altCached = getCachedSite(alt.url)
      if (altCached) {
        setSelectedResultId(alt.id)
        setCurrentSite(altCached)
        setIsLoadingSite(false)
        const orient = buildOrientation(altCached)
        addToTranscript("assistant", `Couldn't read ${result.title}. Opened ${altCached.siteName} instead.`)
        announce(orient)
        speakSystem(orient)
        sitePanelRef.current?.focus()
        return
      }

      const altResult = await tryOpenSite(alt.url, ctx)
      if (altResult.ok && altResult.siteData) {
        setSelectedResultId(alt.id)
        setCachedSite(alt.url, altResult.siteData)
        setCurrentSite(altResult.siteData)
        const orient = buildOrientation(altResult.siteData)
        addToTranscript("assistant", `Couldn't read ${result.title}. Opened ${altResult.siteData.siteName} instead.`)
        announce(orient)
        speakSystem(orient)
        sitePanelRef.current?.focus()
        setIsLoadingSite(false)
        return
      }
    }

    const allBlockedMsg = "I couldn't read any of these results. They're all blocking access. Try a different search."
    addToTranscript("assistant", allBlockedMsg)
    announce(allBlockedMsg)
    speakSystem(allBlockedMsg)
    setIsLoadingSite(false)
  }, [tryOpenSite])

  const handleQuickAction = useCallback(async (question: string) => {
    const sd = currentSiteRef.current
    if (!sd) {
      speakAndAnnounce("Open a website first, then ask me questions about it.", "assistant")
      return
    }

    addToTranscript("user", question)
    announce("Looking for that.")

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, siteData: sd }),
      })
      const data = await res.json()
      const answer = data.answer || "I couldn't find that on this page."
      addToTranscript("assistant", answer)
      announce(answer)
      speakSystem(answer)
    } catch {
      const errMsg = "I couldn't get that information. Try asking differently."
      addToTranscript("assistant", errMsg)
      announce(errMsg)
      speakSystem(errMsg)
    }
  }, [])

  // ── Local command handler — instant, zero API calls ──

  function tryLocalCommand(text: string): boolean {
    const lower = text.toLowerCase().trim()

    if (/^(help|what can i say|what are my options)\b/.test(lower)) {
      toolCalledRef.current = true
      speakAndAnnounce(HELP_TEXT, "assistant")
      return true
    }

    if (/^(stop|quiet|shut up|cancel|be quiet|stop speaking)\b/.test(lower)) {
      toolCalledRef.current = true
      stopSpeaking()
      announce("Stopped.")
      return true
    }

    if (/^(repeat|say that again|repeat that|say it again)\b/.test(lower)) {
      toolCalledRef.current = true
      const last = lastAnswerRef.current
      if (last) {
        speakAndAnnounce(last)
      } else {
        speakAndAnnounce("Nothing to repeat yet.", "assistant")
      }
      return true
    }

    if (/^(speak slower|slow down|say that slower|slower)\b/.test(lower)) {
      toolCalledRef.current = true
      const rate = Math.max(0.6, getSpeechRate() - 0.15)
      setSpeechRate(rate)
      speakAndAnnounce("Speaking slower now.", "assistant")
      return true
    }

    if (/^(speak faster|speed up|faster)\b/.test(lower)) {
      toolCalledRef.current = true
      const rate = Math.min(1.5, getSpeechRate() + 0.15)
      setSpeechRate(rate)
      speakAndAnnounce("Speaking faster now.", "assistant")
      return true
    }

    if (/^(go back|back|start over|clear)\b/.test(lower)) {
      toolCalledRef.current = true
      setCurrentSite(null)
      setSelectedResultId(null)
      if (resultsRef.current.length > 0) {
        speakAndAnnounce(`Back to ${resultsRef.current.length} results. Say open and a number, or search again.`, "assistant")
      } else {
        setResults([])
        setQuery("")
        speakAndAnnounce("Starting fresh. What would you like to search for?", "assistant")
      }
      return true
    }

    if (/^(read (the )?results|list results|what are the results)\b/.test(lower)) {
      toolCalledRef.current = true
      const r = resultsRef.current
      if (r.length === 0) {
        speakAndAnnounce("No results yet. Try searching first.", "assistant")
        return true
      }
      const list = r.map((x, i) => `${i + 1}: ${x.title}`).join(". ")
      speakAndAnnounce(list, "assistant")
      return true
    }

    if (/^(read (the )?headings|what are the sections)\b/.test(lower)) {
      toolCalledRef.current = true
      const sd = currentSiteRef.current
      if (!sd) { speakAndAnnounce("Open a website first.", "assistant"); return true }
      if (!sd.headings || sd.headings.length === 0) {
        speakAndAnnounce("No headings found on this page.", "assistant")
        return true
      }
      speakAndAnnounce(sd.headings.slice(0, 6).join(". "), "assistant")
      return true
    }

    if (/^(read (the )?links|what links are there)\b/.test(lower)) {
      toolCalledRef.current = true
      const sd = currentSiteRef.current
      if (!sd) { speakAndAnnounce("Open a website first.", "assistant"); return true }
      if (!sd.links || sd.links.length === 0) {
        speakAndAnnounce("No links found on this page.", "assistant")
        return true
      }
      speakAndAnnounce(sd.links.slice(0, 6).map((l) => l.text).join(". "), "assistant")
      return true
    }

    if (/^(what is this (website|page|site)|where am i|describe this)\b/.test(lower)) {
      toolCalledRef.current = true
      const sd = currentSiteRef.current
      if (!sd) { speakAndAnnounce("No website is open. Try opening a result first.", "assistant"); return true }
      speakAndAnnounce(buildOrientation(sd), "assistant")
      return true
    }

    if (/^(only the important parts|summarize|summary|important details)\b/.test(lower)) {
      toolCalledRef.current = true
      const sd = currentSiteRef.current
      if (!sd) { speakAndAnnounce("No website is open.", "assistant"); return true }
      const keyParts = Object.entries(sd.keyInfo ?? {}).slice(0, 5)
        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(". ")
      speakAndAnnounce(keyParts || sd.summary, "assistant")
      return true
    }

    // ── Natural-language result navigation parser ──
    const nav = parseResultIntent(lower)
    if (nav && resultsRef.current.length > 0) {
      toolCalledRef.current = true
      const r = resultsRef.current
      const curIdx = r.findIndex((x) => x.id === selectedResultIdRef.current)

      if (nav.action === "open") {
        const idx = resolveTargetIndex(nav.target, curIdx, r.length)
        if (idx >= 0 && idx < r.length) {
          speakAndAnnounce(`Opening result ${idx + 1}.`, "assistant")
          handleOpenResultRef.current(r[idx])
        } else {
          speakAndAnnounce("No results to open.", "assistant")
        }
        return true
      }

      if (nav.action === "select") {
        const idx = resolveTargetIndex(nav.target, curIdx, r.length)
        if (idx >= 0 && idx < r.length) {
          setFocusedIndex(idx)
          setSelectedResultId(r[idx].id)
          speakAndAnnounce(`Result ${idx + 1}: ${r[idx].title}. Say open this one to go there.`, "assistant")
        }
        return true
      }
    }

    return false
  }

  // ── Natural-language intent parser for result navigation ──

  type ResultNavIntent = {
    action: "open" | "select"
    target: "first" | "second" | "third" | "fourth" | "fifth" | "next" | "previous" | "current" | "last" | number
  }

  function parseResultIntent(text: string): ResultNavIntent | null {
    const ORDINAL_MAP: Record<string, number> = {
      first: 0, "1st": 0, one: 0, "1": 0,
      second: 1, "2nd": 1, two: 1, "2": 1,
      third: 2, "3rd": 2, three: 2, "3": 2,
      fourth: 3, "4th": 3, four: 3, "4": 3,
      fifth: 4, "5th": 4, five: 4, "5": 4,
    }
    const ORDINAL_NAMES: Record<number, ResultNavIntent["target"]> = {
      0: "first", 1: "second", 2: "third", 3: "fourth", 4: "fifth",
    }

    const hasOpenVerb = /\b(open|go to|try|choose|select|switch to|show|take|visit|click|pick|check out|let'?s? (try|go|see|open))\b/.test(text)
    const hasNegation = /\b(not? (this|that)|don'?t|no,? )\b/.test(text)
    const hasAnother = /\b(another|different|other|else)\b/.test(text)

    // Detect ordinal
    let ordinalIdx: number | null = null
    for (const [word, idx] of Object.entries(ORDINAL_MAP)) {
      const re = new RegExp(`\\b(${word})(\\s+(one|result|option|choice|item|website|site|link))?\\b`)
      if (re.test(text)) {
        ordinalIdx = idx
        break
      }
    }
    // "number X" / "option X" / "result X"
    const numMatch = text.match(/\b(number|option|result|#)\s*(\d)\b/)
    if (numMatch) ordinalIdx = parseInt(numMatch[2]) - 1

    // Detect next/previous
    const isNext = /\b(next|move on|skip|forward)\b/.test(text) || (hasAnother && ordinalIdx === null)
    const isPrevious = /\b(previous|prev|before|back one|go back one|preceding)\b/.test(text)
    const isCurrent = /\b(this one|this result|that one|current|same)\b/.test(text) && !hasNegation
    const isLast = /\b(last|final|bottom)\b/.test(text)

    // "not this one" / "no, the other one" → means next
    const negatesCurrent = hasNegation && (isCurrent || /\b(one|this|that)\b/.test(text))

    let target: ResultNavIntent["target"] | null = null

    if (ordinalIdx !== null && ordinalIdx >= 0 && ordinalIdx <= 4) {
      target = ORDINAL_NAMES[ordinalIdx] ?? ordinalIdx
    } else if (isNext || negatesCurrent) {
      target = "next"
    } else if (isPrevious) {
      target = "previous"
    } else if (isCurrent && !hasNegation) {
      target = "current"
    } else if (isLast) {
      target = "last"
    }

    if (target === null) return null

    const action: ResultNavIntent["action"] = (hasOpenVerb || target === "current") ? "open" : "select"

    // "the second one" without a verb → still open if results are visible
    const isBareMention = !hasOpenVerb && ordinalIdx !== null
    if (isBareMention && resultsRef.current.length > 0) {
      return { action: "open", target }
    }

    return { action, target }
  }

  function resolveTargetIndex(target: ResultNavIntent["target"], curIdx: number, length: number): number {
    if (typeof target === "number") return Math.max(0, Math.min(length - 1, target))
    switch (target) {
      case "first": return 0
      case "second": return Math.min(1, length - 1)
      case "third": return Math.min(2, length - 1)
      case "fourth": return Math.min(3, length - 1)
      case "fifth": return Math.min(4, length - 1)
      case "next": return Math.min(curIdx + 1, length - 1)
      case "previous": return Math.max(curIdx - 1, 0)
      case "current": return Math.max(curIdx, 0)
      case "last": return length - 1
      default: return 0
    }
  }

  // ── Voice fallback: fires if agent doesn't handle speech within 1.5s ──

  function handleVoiceFallback(userText: string) {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
    toolCalledRef.current = false

    const text = userText.trim()
    if (!text || text.length < 3) return

    if (tryLocalCommand(text)) return

    fallbackTimerRef.current = setTimeout(async () => {
      if (toolCalledRef.current || isLoadingRef.current) return

      console.log("[fallback] processing:", text)

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
        console.log("[fallback] context:", context)

        if (context.intent === "ignore") return

        if (context.intent === "ask" && currentSiteRef.current) {
          handleQuickActionRef.current(context.query || text)
          return
        }

        if (context.intent === "open" && resultsRef.current.length > 0) {
          const openRes = await fetch("/api/intent", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              speech: text,
              results: resultsRef.current.map((r) => ({ id: r.id, title: r.title })),
            }),
          })
          const { resultId } = await openRes.json()
          const target = resultsRef.current.find((r) => r.id === resultId) ?? resultsRef.current[0]
          handleOpenResultRef.current(target)
          return
        }

        // Search intent — keep session alive so user can chain commands
        searchContextRef.current = context
        setSearchContext(context)
        handleSearchRef.current(context.query || text, true)
      } catch (e) {
        console.error("[fallback] error:", e)
        handleSearchRef.current(text, true)
      }
    }, 1500)
  }

  // Keep refs pointing to latest function versions
  handleSearchRef.current = handleSearch
  handleOpenResultRef.current = handleOpenResult
  handleQuickActionRef.current = handleQuickAction
  handleVoiceFallbackRef.current = handleVoiceFallback

  // ── ElevenLabs conversation ──

  const conversation = useConversation({
    clientTools: {
      search_web: async (params: { query: string }) => {
        try {
          toolCalledRef.current = true
          if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
          console.log("[tool] search_web called:", params.query)
          const intentRes = await fetch("/api/intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ speech: params.query, hasResults: false, hasSiteOpen: false }),
          })
          const { context } = await intentRes.json()
          if (context) {
            searchContextRef.current = context
            setSearchContext(context)
          }
          // Do NOT end session — let the agent speak the results
          await handleSearchRef.current(context?.query || params.query, true)
          const r = resultsRef.current
          if (r.length === 0) return "No results found."
          return `Found ${r.length} results. Top result: ${r[0].title}. ${r[0].description?.slice(0, 60) ?? ""}`
        } catch (e) {
          console.error("search_web tool error:", e)
          return "Search failed."
        }
      },
      open_result: async (params: { url?: string; result_id?: string }) => {
        try {
          toolCalledRef.current = true
          if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
          console.log("[tool] open_result called:", params)
          let target: SearchResult | undefined
          if (params.result_id) target = resultsRef.current.find((r) => r.id === params.result_id)
          if (!target && params.url) target = resultsRef.current.find((r) => r.url === params.url)
          if (!target) target = resultsRef.current[0]
          if (!target) return "No results available."
          await handleOpenResultRef.current(target)
          const sd = currentSiteRef.current
          if (!sd) return "The site is blocking access. I tried alternatives but none worked."
          return buildOrientation(sd)
        } catch (e) {
          console.error("open_result tool error:", e)
          return "I couldn't open that page."
        }
      },
      ask_site: async (params: { question: string }) => {
        try {
          toolCalledRef.current = true
          if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
          console.log("[tool] ask_site called:", params.question)
          const sd = currentSiteRef.current
          if (!sd) return "No website is open. Search first, then open a result."
          const res = await fetch("/api/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: params.question, siteData: sd }),
          })
          const data = await res.json()
          return data.answer || "I couldn't find that on this page."
        } catch (e) {
          console.error("ask_site tool error:", e)
          return "I couldn't get that information."
        }
      },
    },
    onConnect: () => {
      console.log("[voice] connected")
      reconnectCountRef.current = 0
      hasConnectedOnceRef.current = true
      setVoiceMode("listening")
      announce("Listening. Say help for options.")
    },
    onDisconnect: () => {
      console.log("[voice] disconnected, intentional:", intentionalEndRef.current)
      setVoiceMode("idle")
      if (intentionalEndRef.current) {
        intentionalEndRef.current = false
        return
      }
      if (reconnectCountRef.current < MAX_RECONNECT && hasConnectedOnceRef.current) {
        reconnectCountRef.current++
        console.log("[voice] auto-reconnecting, attempt:", reconnectCountRef.current)
        setTimeout(() => startSession(), RECONNECT_DELAY)
      }
    },
    onModeChange: ({ mode }) => {
      console.log("[voice] mode:", mode)
      if (mode === "speaking") {
        stopSpeaking() // Silence browser TTS when agent starts speaking (prevents overlap)
        setVoiceMode("speaking")
      } else if (mode === "listening") {
        setVoiceMode("listening")
      }
    },
    onMessage: (msg) => {
      try {
        console.log("[voice] message:", msg?.source, msg?.message?.slice(0, 80))
        if (msg?.source === "user" && msg?.message) {
          addToTranscript("user", msg.message)
          handleVoiceFallbackRef.current(msg.message)
        } else if (msg?.source === "ai" && msg?.message) {
          addToTranscript("assistant", msg.message)
        }
      } catch {
        /* protect against SDK errors */
      }
    },
    onError: (err) => {
      console.error("[voice] error:", err)
    },
    onUnhandledClientToolCall: (params) => {
      console.warn("[voice] UNHANDLED tool call:", params)
    },
    onStatusChange: ({ status }) => {
      console.log("[voice] status:", status)
    },
  })

  endSessionRef.current = conversation.endSession
  const isConnected = conversation.status === "connected"

  async function startSession() {
    setVoiceMode("connecting")
    announce("Connecting.")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())

      const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? ""
      console.log("[voice] starting session, agentId:", agentId)
      await conversation.startSession({ agentId, connectionType: "webrtc" })
    } catch (e) {
      console.error("[voice] failed to start:", e)
      setVoiceMode("idle")
      const errMsg = "Could not connect to voice. Please check your microphone and try again."
      announce(errMsg)
      speakText(errMsg)
    }
  }

  async function toggleVoice() {
    if (isConnected) {
      intentionalEndRef.current = true
      stopSpeaking()
      await conversation.endSession()
      setVoiceMode("idle")
      announce("Voice session ended.")
    } else {
      reconnectCountRef.current = 0
      await startSession()
    }
  }

  return (
    <div className="app">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <div className="sr-only" role="status" aria-live="assertive" aria-atomic="true">
        {announcement}
      </div>

      <header className="nav" role="banner">
        <span className="nav__logo">Navia</span>
        <span className="nav__tagline" aria-label="Navia helps blind users search, understand, and use websites by voice">Search, understand, use — by voice</span>
        <span className="nav__spacer" />
        <kbd className="nav__shortcut" aria-label="Press slash to search" title="Press / to search">/</kbd>
      </header>

      <main id="main-content" className="layout" role="main">
        <section className="col-left" aria-label="Search and results">
          <SearchBar
            query={query}
            onChange={setQuery}
            onSearch={handleSearch}
            isLoading={isLoadingResults}
            isListening={voiceMode === "listening"}
            onMicClick={toggleVoice}
          />
          <ResultsList
            results={results}
            selectedResultId={selectedResultId}
            isLoadingSite={isLoadingSite}
            onOpen={handleOpenResult}
            focusedIndex={focusedIndex}
            onFocusedIndexChange={setFocusedIndex}
            isSearching={isLoadingResults}
          />
        </section>

        <section
          ref={sitePanelRef}
          className="col-right"
          aria-label="Website details"
          tabIndex={-1}
        >
          <SitePanel
            siteData={currentSite}
            isLoading={isLoadingSite}
            onQuickAction={handleQuickAction}
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
