"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useConversation } from "@elevenlabs/react"
import type { SearchResult, SiteData, TranscriptItem } from "@/types"
import { answerFromSiteContext } from "@/lib/formatter"
import { speakText, stopSpeaking } from "@/lib/speak"
import { getCachedSite, setCachedSite } from "@/lib/site-cache"
import SearchBar from "@/components/SearchBar"
import ResultsList from "@/components/ResultsList"
import SitePanel from "@/components/SitePanel"
import DynamicIsland from "@/components/DynamicIsland"

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? ""

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

  const currentSiteRef = useRef<SiteData | null>(null)
  currentSiteRef.current = currentSite
  const resultsRef = useRef<SearchResult[]>([])
  resultsRef.current = results
  const sitePanelRef = useRef<HTMLElement>(null)

  function addToTranscript(role: "user" | "assistant", text: string) {
    setTranscript((prev) => [...prev, { role, text }])
  }

  function announce(text: string) {
    setAnnouncement("")
    requestAnimationFrame(() => setAnnouncement(text))
  }

  // ─── Global keyboard shortcuts ──────────────────────────────────────────

  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable

      // Slash focuses search (if not already in input)
      if (e.key === "/" && !isInput) {
        e.preventDefault()
        document.querySelector<HTMLInputElement>(".search-input")?.focus()
        return
      }

      // Escape from site panel goes back to results
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

  // ─── Search ──────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async (q: string) => {
    setIsLoadingResults(true)
    setResults([])
    setCurrentSite(null)
    setSelectedResultId(null)
    setFocusedIndex(-1)
    addToTranscript("user", q)
    announce("Searching...")

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
        const msg = `Found ${data.results.length} results. Top: ${top.title}.`
        addToTranscript("assistant", msg)
        announce(`${data.results.length} results found. ${top.title} is first. Use arrow keys to browse results, Enter to open.`)
      } else {
        addToTranscript("assistant", "No results found.")
        announce("No results found. Try a different search.")
      }
    } catch {
      addToTranscript("assistant", "Search failed.")
      announce("Search failed. Please try again.")
    } finally {
      setIsLoadingResults(false)
    }
  }, [])

  // ─── Open result ─────────────────────────────────────────────────────────

  const handleOpenResult = useCallback(async (result: SearchResult) => {
    setSelectedResultId(result.id)
    setIsLoadingSite(true)
    setCurrentSite(null)
    addToTranscript("user", `Open: ${result.title}`)
    announce(`Opening ${result.title}...`)

    const cached = getCachedSite(result.url)
    if (cached) {
      setCurrentSite(cached)
      setIsLoadingSite(false)
      const msg = `${cached.siteName}. ${cached.summary.slice(0, 100)}`
      addToTranscript("assistant", msg)
      announce(`${cached.siteName} loaded. ${cached.summary.slice(0, 120)}. Use Tab to reach site details and quick actions.`)
      sitePanelRef.current?.focus()
      return
    }

    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: result.url }),
      })
      const data = await res.json()
      if (data.siteData) {
        const sd: SiteData = data.siteData
        setCachedSite(result.url, sd)
        setCurrentSite(sd)
        const msg = `${sd.siteName}. ${sd.summary.slice(0, 100)}`
        addToTranscript("assistant", msg)
        announce(`${sd.siteName} loaded. ${sd.summary.slice(0, 120)}. Use Tab to reach site details and quick actions.`)
        sitePanelRef.current?.focus()
      } else {
        addToTranscript("assistant", "Could not read site.")
        announce("Could not read this site.")
      }
    } catch {
      addToTranscript("assistant", "Failed to load site.")
      announce("Failed to load site.")
    } finally {
      setIsLoadingSite(false)
    }
  }, [])

  // ─── Quick action (local logic + free TTS) ──────────────────────────────

  const handleQuickAction = useCallback(async (question: string) => {
    const sd = currentSiteRef.current
    if (!sd) {
      announce("Open a result first.")
      return
    }

    addToTranscript("user", question)
    const answer = answerFromSiteContext(question, sd)
    addToTranscript("assistant", answer)
    setLastAnswer(answer)
    announce(answer)
    speakText(answer)
  }, [])

  // ─── ElevenLabs Agent ────────────────────────────────────────────────────

  const conversation = useConversation({
    clientTools: {
      search_web: async (params: { query: string }) => {
        await handleSearch(params.query)
        const r = resultsRef.current
        if (r.length === 0) return "No results."
        return r.slice(0, 3).map((res) => `${res.id}. ${res.title}`).join(". ")
      },
      open_result: async (params: { url?: string; result_id?: string }) => {
        let target: SearchResult | undefined
        if (params.result_id) target = resultsRef.current.find((r) => r.id === params.result_id)
        if (!target && params.url) target = resultsRef.current.find((r) => r.url === params.url)
        if (!target) target = resultsRef.current[0]
        if (!target) return "No result to open."
        await handleOpenResult(target)
        const sd = currentSiteRef.current
        if (!sd) return "Could not load site."
        return `${sd.siteName}: ${sd.summary.slice(0, 120)}`
      },
      ask_site: async (params: { question: string }) => {
        const sd = currentSiteRef.current
        if (!sd) return "No site open."
        return answerFromSiteContext(params.question, sd)
      },
    },
    onMessage: (msg) => {
      if (msg.source === "user" && msg.message) addToTranscript("user", msg.message)
      else if (msg.source === "ai" && msg.message) addToTranscript("assistant", msg.message)
    },
    onError: (err) => console.error("ElevenLabs error:", err),
  })

  const isConnected = conversation.status === "connected"
  const isListening = isConnected && !conversation.isSpeaking

  async function toggleVoice() {
    if (isConnected) {
      stopSpeaking()
      await conversation.endSession()
      announce("Voice session ended.")
    } else {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
        await conversation.startSession({
          agentId: AGENT_ID,
          connectionType: "webrtc",
          overrides: {
            agent: {
              prompt: { prompt: SYSTEM_PROMPT },
              firstMessage: "Hi, I'm Navia. What would you like to find?",
            },
          },
        })
        announce("Voice session started. Navia is listening.")
      } catch {
        announce("Microphone access is required for voice mode.")
      }
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="app">
      {/* Skip link */}
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* Screen reader announcements */}
      <div className="sr-only" role="status" aria-live="assertive" aria-atomic="true">
        {announcement}
      </div>

      <header className="nav" role="banner">
        <span className="nav__logo">Navia</span>
        <span className="nav__tagline" aria-label="Voice-first web access for everyone">Voice-first web access</span>
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
            isListening={isListening && isConnected}
            onMicClick={toggleVoice}
          />
          <ResultsList
            results={results}
            selectedResultId={selectedResultId}
            isLoadingSite={isLoadingSite}
            onOpen={handleOpenResult}
            focusedIndex={focusedIndex}
            onFocusedIndexChange={setFocusedIndex}
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
          />
        </section>
      </main>

      <DynamicIsland
        transcript={transcript}
        isListening={isListening}
        isSpeaking={conversation.isSpeaking}
        isConnected={isConnected}
        lastAnswer={lastAnswer}
        onMicClick={toggleVoice}
      />
    </div>
  )
}

const SYSTEM_PROMPT = `You are Navia, a voice assistant for blind and visually impaired users to browse any website on the internet.

RULES — follow strictly:
- Maximum 2 sentences per response. Never more.
- Do not repeat information the user already heard.
- Do not list all search results. Say the count and top result only.
- When opening a site, say only the name and one sentence about it.
- When asked for specific info, answer with just the data.
- Never use filler phrases.
- If you don't know, say "I don't have that info."
- You help with ANY website — news, shopping, government, education, health, anything.
- You are a general web browsing assistant, not limited to businesses.

TOOLS:
- search_web: searches the web for anything.
- open_result: opens a result and extracts site info.
- ask_site: answers a question from the currently open site.`
