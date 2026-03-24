"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type { TranscriptItem } from "@/types"

type VisualState = "idle" | "connecting" | "listening" | "speaking" | "expanded"

type BrowsingMode = "home" | "searching" | "results" | "opening" | "site"

interface Props {
  transcript: TranscriptItem[]
  isListening: boolean
  isSpeaking: boolean
  isConnected: boolean
  isConnecting?: boolean
  lastAnswer: string | null
  onMicClick: () => void
  browsingMode?: BrowsingMode
  resultCount?: number
  siteName?: string | null
}

function getModeLabel(mode: BrowsingMode, resultCount: number, siteName: string | null): string {
  switch (mode) {
    case "home": return "Ready"
    case "searching": return "Searching…"
    case "results": return `${resultCount} result${resultCount !== 1 ? "s" : ""}`
    case "opening": return "Opening…"
    case "site": return siteName || "Browsing"
  }
}

export default function DynamicIsland({
  transcript,
  isListening,
  isSpeaking,
  isConnected,
  isConnecting,
  lastAnswer,
  onMicClick,
  browsingMode = "home",
  resultCount = 0,
  siteName = null,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [flashAnswer, setFlashAnswer] = useState(false)
  const prevAnswerRef = useRef<string | null>(null)
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const islandRef = useRef<HTMLDivElement>(null)

  const visualState: VisualState = isConnecting
    ? "connecting"
    : !isConnected
    ? "idle"
    : isExpanded
    ? "expanded"
    : isSpeaking
    ? "speaking"
    : "listening"

  useEffect(() => {
    if (lastAnswer && lastAnswer !== prevAnswerRef.current) {
      prevAnswerRef.current = lastAnswer
      setFlashAnswer(true)
      setIsExpanded(true)
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = setTimeout(() => {
        setIsExpanded(false)
        setFlashAnswer(false)
      }, 5000)
    }
  }, [lastAnswer])

  function handlePillClick() {
    if (!isConnected) {
      onMicClick()
      return
    }
    setIsExpanded(!isExpanded)
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current)
  }

  function handleEndClick(e: React.MouseEvent) {
    e.stopPropagation()
    onMicClick()
    setIsExpanded(false)
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault()
        handlePillClick()
        break
      case "Escape":
        e.preventDefault()
        if (isExpanded) {
          setIsExpanded(false)
          if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current)
        } else if (isConnected) {
          onMicClick()
        }
        break
      case "q":
        if (isConnected) {
          e.preventDefault()
          onMicClick()
          setIsExpanded(false)
        }
        break
    }
  }, [isConnected, isExpanded, onMicClick])

  const recentTranscript = transcript.slice(-5)

  const ariaLabel = !isConnected
    ? "Voice assistant — press Enter to start"
    : isExpanded
    ? "Voice assistant expanded — press Escape to collapse, Q to end session"
    : isSpeaking
    ? "Navia is speaking — press Enter to see transcript, Escape to end"
    : "Navia is listening — press Enter to see transcript, Escape to end"

  return (
    <div
      ref={islandRef}
      className={`di di--${visualState}`}
      role="region"
      aria-label={ariaLabel}
      aria-live="polite"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="di-glow" aria-hidden="true" />

      <div className="di-content" onClick={handlePillClick}>
        {visualState === "idle" && (
          <div className="di-row di-row--center">
            <div className="di-mic-ring" aria-hidden="true">
              <MicIcon />
            </div>
            <span className="di-cta">Tap to start Navia</span>
          </div>
        )}

        {visualState === "connecting" && (
          <div className="di-row di-row--center">
            <div className="di-spinner" aria-hidden="true" />
            <span className="di-state-label">Connecting…</span>
          </div>
        )}

        {visualState === "listening" && (
          <div className="di-row di-row--between">
            <div className="di-left">
              <div className="di-pulse-ring" aria-hidden="true" />
              <WaveformBars count={5} variant="green" />
              <span className="di-state-label">Listening</span>
              <span className="di-mode-badge" aria-label={`Current mode: ${getModeLabel(browsingMode, resultCount, siteName)}`}>
                {getModeLabel(browsingMode, resultCount, siteName)}
              </span>
            </div>
            <button
              className="di-close"
              onClick={handleEndClick}
              aria-label="End voice session"
            >
              <XIcon />
            </button>
          </div>
        )}

        {visualState === "speaking" && (
          <div className="di-row di-row--between">
            <div className="di-left">
              <WaveformBars count={9} variant="accent" />
              <span className="di-state-label di-state-label--accent">Speaking</span>
              <span className="di-mode-badge" aria-label={`Current mode: ${getModeLabel(browsingMode, resultCount, siteName)}`}>
                {getModeLabel(browsingMode, resultCount, siteName)}
              </span>
            </div>
            <button
              className="di-close"
              onClick={handleEndClick}
              aria-label="End voice session"
            >
              <XIcon />
            </button>
          </div>
        )}

        {visualState === "expanded" && (
          <div className="di-expanded">
            <div className="di-expanded__top">
              <div className="di-left">
                {isSpeaking ? (
                  <WaveformBars count={7} variant="accent" />
                ) : (
                  <>
                    <div className="di-pulse-ring di-pulse-ring--sm" aria-hidden="true" />
                    <WaveformBars count={4} variant="green" />
                  </>
                )}
                <span className="di-state-label">
                  {isSpeaking ? "Speaking" : "Listening"}
                </span>
              </div>
              <button
                className="di-close"
                onClick={handleEndClick}
                aria-label="End voice session"
              >
                <XIcon />
              </button>
            </div>

            <div className="di-expanded__body" role="log" aria-label="Conversation transcript">
              {flashAnswer && lastAnswer ? (
                <div className="di-flash" role="status" aria-live="assertive">
                  <div className="di-flash__avatar" aria-hidden="true">N</div>
                  <p className="di-flash__text">{lastAnswer}</p>
                </div>
              ) : recentTranscript.length > 0 ? (
                <ul className="di-messages" aria-label="Recent messages">
                  {recentTranscript.map((item, i) => (
                    <li key={i} className={`di-bubble di-bubble--${item.role}`}>
                      {item.role === "assistant" && <div className="di-bubble__avatar" aria-hidden="true">N</div>}
                      <span className="di-bubble__text">
                        <span className="sr-only">{item.role === "user" ? "You said: " : "Navia said: "}</span>
                        {item.text}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="di-empty">Say something to search the web…</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function WaveformBars({ count, variant }: { count: number; variant: "green" | "accent" }) {
  return (
    <div className={`di-wave di-wave--${variant}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="di-wave__bar" style={{ animationDelay: `${i * 0.09}s` }} />
      ))}
    </div>
  )
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
