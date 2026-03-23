"use client"

import { useState, useCallback, useRef } from "react"
import { useConversation } from "@elevenlabs/react"
import type { SearchResult, SiteData, TranscriptItem } from "@/types"
import { answerFromSiteContext } from "@/lib/formatter"
import { speakText, stopSpeaking } from "@/lib/speak"
import { getCachedSite, setCachedSite, hasCachedSite } from "@/lib/site-cache"
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

  const currentSiteRef = useRef<SiteData | null>(null)
  currentSiteRef.current = currentSite
  const resultsRef = useRef<SearchResult[]>([])
  resultsRef.current = results

  function addToTranscript(role: "user" | "assistant", text: string) {
    setTranscript((prev) => [...prev, { role, text }])
  }

  // ─── Search (UI shows all results, voice only says count + top 1) ──────────

  const handleSearch = useCallback(async (q: string) => {
    setIsLoadingResults(true)
    setResults([])
    setCurrentSite(null)
    setSelectedResultId(null)
    addToTranscript("user", q)

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      })
      const data = await res.json()
      if (data.results?.length) {
        setResults(data.results)
        const top = data.results[0] as SearchResult
        const shortMsg = `Found ${data.results.length} results. Top: ${top.title}.`
        addToTranscript("assistant", shortMsg)
      } else {
        addToTranscript("assistant", "No results found.")
      }
    } catch {
      addToTranscript("assistant", "Search failed.")
    } finally {
      setIsLoadingResults(false)
    }
  }, [])

  // ─── Open result (with session cache) ──────────────────────────────────────

  const handleOpenResult = useCallback(async (result: SearchResult) => {
    setSelectedResultId(result.id)
    setIsLoadingSite(true)
    setCurrentSite(null)
    addToTranscript("user", `Open: ${result.title}`)

    // Cache hit — skip Firecrawl entirely
    const cached = getCachedSite(result.url)
    if (cached) {
      setCurrentSite(cached)
      setIsLoadingSite(false)
      const shortMsg = `${cached.siteName}. ${cached.summary.slice(0, 100)}`
      addToTranscript("assistant", shortMsg)
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
        const shortMsg = `${sd.siteName}. ${sd.summary.slice(0, 100)}`
        addToTranscript("assistant", shortMsg)
      } else {
        addToTranscript("assistant", "Could not read site.")
      }
    } catch {
      addToTranscript("assistant", "Failed to load site.")
    } finally {
      setIsLoadingSite(false)
    }
  }, [])

  // ─── Quick action (local logic + free browser TTS, no ElevenLabs) ──────────

  const handleQuickAction = useCallback(
    async (question: string) => {
      const sd = currentSiteRef.current
      if (!sd) {
        addToTranscript("assistant", "Open a result first.")
        return
      }

      addToTranscript("user", question)
      const answer = answerFromSiteContext(question, sd)
      addToTranscript("assistant", answer)
      setLastAnswer(answer)

      // Free TTS — no ElevenLabs credits
      speakText(answer)
    },
    []
  )

  // ─── ElevenLabs Agent (ultra-short responses, minimal tool returns) ────────

  const conversation = useConversation({
    clientTools: {
      search_web: async (params: { query: string }) => {
        await handleSearch(params.query)
        const r = resultsRef.current
        if (r.length === 0) return "No results."
        // Return ONLY top 3 titles — minimal text for agent to speak
        return r
          .slice(0, 3)
          .map((res) => `${res.id}. ${res.title}`)
          .join(". ")
      },

      open_result: async (params: { url?: string; result_id?: string }) => {
        let target: SearchResult | undefined
        if (params.result_id) {
          target = resultsRef.current.find((r) => r.id === params.result_id)
        }
        if (!target && params.url) {
          target = resultsRef.current.find((r) => r.url === params.url)
        }
        if (!target) target = resultsRef.current[0]
        if (!target) return "No result to open."

        await handleOpenResult(target)
        const sd = currentSiteRef.current
        if (!sd) return "Could not load site."
        // 1 sentence only
        return `${sd.siteName}: ${sd.summary.slice(0, 120)}`
      },

      ask_site: async (params: { question: string }) => {
        const sd = currentSiteRef.current
        if (!sd) return "No site open."
        // Local answer — no external API, just keyword match
        return answerFromSiteContext(params.question, sd)
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
    },
  })

  const isConnected = conversation.status === "connected"
  const isListening = isConnected && !conversation.isSpeaking

  async function toggleVoice() {
    if (isConnected) {
      stopSpeaking()
      await conversation.endSession()
    } else {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
        await conversation.startSession({
          agentId: AGENT_ID,
          connectionType: "webrtc",
          overrides: {
            agent: {
              prompt: {
                prompt: SYSTEM_PROMPT,
              },
              firstMessage: "Hi, I'm Navia. What would you like to find?",
            },
          },
        })
      } catch (e) {
        console.error("Failed to start voice session:", e)
        addToTranscript("assistant", "Microphone access required.")
      }
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <header className="nav">
        <span className="nav__logo">Navia</span>
        <span className="nav__tagline">Voice-first web access</span>
        <span className="nav__spacer" />
      </header>

      <main className="layout">
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

        <section className="col-right" aria-label="Site details">
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

// Ultra-short system prompt to minimize ElevenLabs output tokens
const SYSTEM_PROMPT = `You are Navia, a voice assistant for blind users to browse the web.

RULES — follow strictly:
- Maximum 2 sentences per response. Never more.
- Do not repeat information the user already heard.
- Do not list all search results. Say the count and top result only. Example: "Found 3 results. First is Amit Plumbing."
- When opening a site, say only the name and one sentence about it.
- When asked for phone/address/hours, answer with just the data. Example: "The phone number is 03-123-4567."
- Never say "I found the following results" or similar filler.
- Never ask "would you like to know more" unless the user seems lost.
- If you don't know, say "I don't have that info" — nothing more.
- Prefer answering from tool data. Do not guess or fabricate.
- Keep it short. The user relies on voice, every extra word costs time.

TOOLS:
- search_web: searches the web. Returns top results.
- open_result: opens a result and extracts site info.
- ask_site: answers a question from the currently open site.`
