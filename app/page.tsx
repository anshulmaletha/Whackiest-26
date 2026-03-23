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
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  function addToTranscript(role: "user" | "assistant", text: string) {
    setTranscript((prev) => [...prev, { role, text, timestamp: Date.now() }])
    if (role === "assistant") setLastAnswer(text)
  }

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [transcript])

  function announce(text: string) {
    setAnnouncement("")
    requestAnimationFrame(() => setAnnouncement(text))
  }

  // ─── Global keyboard shortcuts ──────────────────────────────────────────

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
        const msg = `Found ${data.results.length} results. Top result: ${top.title}.`
        addToTranscript("assistant", msg)
        announce(`${data.results.length} results found. ${top.title} is first. Use arrow keys to browse, Enter to open.`)
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
    addToTranscript("user", `Opening: ${result.title}`)
    announce(`Opening ${result.title}...`)

    const cached = getCachedSite(result.url)
    if (cached) {
      setCurrentSite(cached)
      setIsLoadingSite(false)
      const msg = `${cached.siteName} — ${cached.summary.slice(0, 120)}`
      addToTranscript("assistant", msg)
      announce(`${cached.siteName} loaded. Use Tab to explore details and quick actions.`)
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
        const msg = `${sd.siteName} — ${sd.summary.slice(0, 120)}`
        addToTranscript("assistant", msg)
        announce(`${sd.siteName} loaded. Use Tab to explore details and quick actions.`)
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

  // ─── Quick action (local logic + free TTS, no credits) ──────────────────

  const handleQuickAction = useCallback(async (question: string) => {
    const sd = currentSiteRef.current
    if (!sd) {
      announce("Open a result first.")
      return
    }

    addToTranscript("user", question)
    const answer = answerFromSiteContext(question, sd)
    addToTranscript("assistant", answer)
    announce(answer)
    speakText(answer)
  }, [])

  // ─── ElevenLabs Agent (minimal credit usage) ────────────────────────────

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
      <a href="#main-content" className="skip-link">Skip to main content</a>

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
        {/* ── Left column: search + results ── */}
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

        {/* ── Right column: site details ── */}
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

      {/* ── Transcript bar (always visible, shows all text) ── */}
      <div className="transcript-bar" role="log" aria-label="Conversation history" aria-live="polite">
        <div className="transcript-bar__inner">
          {transcript.length === 0 ? (
            <p className="transcript-bar__empty">
              Your conversation with Navia will appear here — everything spoken is also shown as text.
            </p>
          ) : (
            <div className="transcript-bar__messages">
              {transcript.map((item, i) => (
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
        isListening={isListening}
        isSpeaking={conversation.isSpeaking}
        isConnected={isConnected}
        lastAnswer={lastAnswer}
        onMicClick={toggleVoice}
      />
    </div>
  )
}

const SYSTEM_PROMPT = `You are Navia, a voice assistant that helps blind and visually impaired users browse ANY website on the internet.

RULES — follow strictly:
- Maximum 2 sentences per response. Never more.
- Do not repeat information the user already heard.
- Do not list all search results. Say the count and top result only.
- When opening a site, say only the name and one sentence about it.
- When asked for specific info, answer with just the data.
- Never use filler phrases.
- If you don't know, say "I don't have that info."
- You help with EVERY kind of website — news, Wikipedia, shopping, government, health, education, forums, articles, anything.
- You are a general web browsing assistant. Not limited to businesses or services.
- Always speak the answer. The user cannot see text.

TOOLS:
- search_web: searches the web for anything the user asks.
- open_result: opens a search result and reads the website.
- ask_site: answers a question about the currently open website.`
