"use client"

import { useState, useCallback, useRef } from "react"
import { useConversation } from "@elevenlabs/react"
import type { SearchResult, SiteData, TranscriptItem } from "@/types"
import SearchBar from "@/components/SearchBar"
import ResultsList from "@/components/ResultsList"
import SitePanel from "@/components/SitePanel"
import TranscriptPanel from "@/components/TranscriptPanel"

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? ""

export default function Home() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const [currentSite, setCurrentSite] = useState<SiteData | null>(null)
  const [transcript, setTranscript] = useState<TranscriptItem[]>([])
  const [isLoadingResults, setIsLoadingResults] = useState(false)
  const [isLoadingSite, setIsLoadingSite] = useState(false)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [lastAnswer, setLastAnswer] = useState<string | null>(null)

  // Keep a ref to current site data so clientTools callbacks always read fresh state
  const currentSiteRef = useRef<SiteData | null>(null)
  currentSiteRef.current = currentSite
  const resultsRef = useRef<SearchResult[]>([])
  resultsRef.current = results

  // ─── Core actions ───────────────────────────────────────────────────────────

  const handleSearch = useCallback(async (q: string) => {
    setIsLoadingResults(true)
    setResults([])
    setCurrentSite(null)
    setSelectedResultId(null)
    setSelectedResult(null)
    addToTranscript("user", q)

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      })
      const data = await res.json()
      if (data.results) {
        setResults(data.results)
        const summary = data.results
          .map((r: SearchResult) => `Result ${r.id}: ${r.title}${r.source ? ` (${r.source})` : ""}`)
          .join(". ")
        addToTranscript("assistant", `Found ${data.results.length} results. ${summary}`)
      } else {
        addToTranscript("assistant", data.error ?? "No results found.")
      }
    } catch {
      addToTranscript("assistant", "Search failed. Please check your connection.")
    } finally {
      setIsLoadingResults(false)
    }
  }, [])

  const handleOpenResult = useCallback(async (result: SearchResult) => {
    setSelectedResultId(result.id)
    setSelectedResult(result)
    setIsLoadingSite(true)
    setCurrentSite(null)
    setTranscriptOpen(true)
    addToTranscript("user", `Opening: ${result.title}`)

    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: result.url }),
      })
      const data = await res.json()
      if (data.siteData) {
        setCurrentSite(data.siteData)
        const sd: SiteData = data.siteData
        const parts: string[] = [`This is ${sd.siteName}. ${sd.summary}`]
        if (sd.phone) parts.push(`Phone: ${sd.phone}.`)
        if (sd.address) parts.push(`Address: ${sd.address}.`)
        if (sd.hours) parts.push(`Hours: ${sd.hours}.`)
        addToTranscript("assistant", parts.join(" "))
      } else {
        addToTranscript("assistant", data.error ?? "Could not read the site.")
      }
    } catch {
      addToTranscript("assistant", "Failed to load site data.")
    } finally {
      setIsLoadingSite(false)
    }
  }, [])

  const handleAsk = useCallback(
    async (question: string) => {
      if (!currentSite) {
        addToTranscript("assistant", "Please open a result first.")
        return
      }
      addToTranscript("user", question)

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, siteContext: currentSite }),
        })
        const data = await res.json()
        const answer = data.answer ?? "I couldn't find an answer."
        addToTranscript("assistant", answer)
        setLastAnswer(answer)
        setTranscriptOpen(true)
      } catch {
        addToTranscript("assistant", "Failed to answer the question.")
      }
    },
    [currentSite]
  )

  function addToTranscript(role: "user" | "assistant", text: string) {
    setTranscript((prev) => [...prev, { role, text }])
  }

  // ─── ElevenLabs Conversational Agent ────────────────────────────────────────

  const conversation = useConversation({
    clientTools: {
      search_web: async (params: { query: string }) => {
        await handleSearch(params.query)
        const r = resultsRef.current
        if (r.length === 0) return "No results found."
        return r
          .map((res) => `Result ${res.id}: ${res.title}. ${res.description}`)
          .join(" | ")
      },

      open_result: async (params: { url?: string; result_id?: string }) => {
        let target: SearchResult | undefined

        if (params.result_id) {
          target = resultsRef.current.find((r) => r.id === params.result_id)
        }
        if (!target && params.url) {
          target = resultsRef.current.find((r) => r.url === params.url)
        }
        // Fall back to first result
        if (!target) target = resultsRef.current[0]

        if (!target) return "No result available to open."

        await handleOpenResult(target)
        const sd = currentSiteRef.current
        if (!sd) return "Could not load the site."

        const parts = [`${sd.siteName}: ${sd.summary}`]
        if (sd.phone) parts.push(`Phone: ${sd.phone}`)
        if (sd.address) parts.push(`Address: ${sd.address}`)
        return parts.join(". ")
      },

      ask_site: async (params: { question: string }) => {
        const sd = currentSiteRef.current
        if (!sd) return "No site is currently open."

        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: params.question, siteContext: sd }),
        })
        const data = await res.json()
        const answer = data.answer ?? "I couldn't find an answer."
        setLastAnswer(answer)
        addToTranscript("assistant", answer)
        return answer
      },
    },
    onMessage: (msg) => {
      if (msg.source === "user" && msg.message) {
        addToTranscript("user", msg.message)
      } else if (msg.source === "ai" && msg.message) {
        addToTranscript("assistant", msg.message)
      }
    },
    onError: (err) => {
      console.error("ElevenLabs error:", err)
      addToTranscript("assistant", "Voice assistant encountered an error.")
    },
  })

  const isConnected = conversation.status === "connected"
  const isListening = isConnected && !conversation.isSpeaking

  async function toggleVoice() {
    if (isConnected) {
      await conversation.endSession()
      setTranscriptOpen(false)
    } else {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
        await conversation.startSession({ agentId: AGENT_ID, connectionType: "webrtc" })
        setTranscriptOpen(true)
        addToTranscript("assistant", "Hello! I'm Navia. How can I help you today?")
      } catch (e) {
        console.error("Failed to start voice session:", e)
        addToTranscript("assistant", "Microphone access is required for voice mode.")
      }
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="app">
      {/* Nav */}
      <header className="nav">
        <span className="nav__logo">NAVIA</span>
        <span className="nav__tagline">Voice-first web access</span>
        {isConnected && (
          <span className="nav__badge">
            <span className="status-dot status-dot--listening" />
            Connected
          </span>
        )}
      </header>

      {/* Main layout */}
      <main className="layout">
        {/* Left column — search + results */}
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
          />
        </section>

        {/* Right column — site panel */}
        <section className="col-right" aria-label="Site details">
          <SitePanel
            siteData={currentSite}
            isLoading={isLoadingSite}
            onQuickAction={handleAsk}
          />
        </section>
      </main>

      {/* Floating transcript panel */}
      <TranscriptPanel
        transcript={transcript}
        isListening={isListening}
        isSpeaking={conversation.isSpeaking}
        isOpen={transcriptOpen}
        onToggle={() => setTranscriptOpen((v) => !v)}
        lastAnswer={lastAnswer}
      />
    </div>
  )
}
