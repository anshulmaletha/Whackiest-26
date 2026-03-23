"use client"

import { useState, useEffect, useRef } from "react"
import type { TranscriptItem } from "@/types"

type VisualState = "idle" | "listening" | "speaking" | "expanded"

interface Props {
  transcript: TranscriptItem[]
  isListening: boolean
  isSpeaking: boolean
  isConnected: boolean
  lastAnswer: string | null
  onMicClick: () => void
}

export default function DynamicIsland({
  transcript,
  isListening,
  isSpeaking,
  isConnected,
  lastAnswer,
  onMicClick,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [flashAnswer, setFlashAnswer] = useState(false)
  const prevAnswerRef = useRef<string | null>(null)
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const visualState: VisualState = !isConnected
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

  const recentTranscript = transcript.slice(-5)

  return (
    <div className={`di di--${visualState}`}>
      {/* Glow ring behind the island */}
      <div className="di-glow" />

      {/* Main content area */}
      <div className="di-content" onClick={handlePillClick}>
        {/* ── IDLE ──────────────────────────────────────────────── */}
        {visualState === "idle" && (
          <div className="di-row di-row--center">
            <div className="di-mic-ring">
              <MicIcon />
            </div>
            <span className="di-cta">Tap to start Navia</span>
          </div>
        )}

        {/* ── LISTENING ─────────────────────────────────────────── */}
        {visualState === "listening" && (
          <div className="di-row di-row--between">
            <div className="di-left">
              <div className="di-pulse-ring" />
              <WaveformBars count={5} variant="green" />
              <span className="di-state-label">Listening…</span>
            </div>
            <button className="di-close" onClick={handleEndClick} aria-label="End session">
              <XIcon />
            </button>
          </div>
        )}

        {/* ── SPEAKING ──────────────────────────────────────────── */}
        {visualState === "speaking" && (
          <div className="di-row di-row--between">
            <div className="di-left">
              <WaveformBars count={9} variant="accent" />
              <span className="di-state-label di-state-label--accent">Navia is speaking</span>
            </div>
            <button className="di-close" onClick={handleEndClick} aria-label="End session">
              <XIcon />
            </button>
          </div>
        )}

        {/* ── EXPANDED ──────────────────────────────────────────── */}
        {visualState === "expanded" && (
          <div className="di-expanded">
            <div className="di-expanded__top">
              <div className="di-left">
                {isSpeaking ? (
                  <WaveformBars count={7} variant="accent" />
                ) : (
                  <>
                    <div className="di-pulse-ring di-pulse-ring--sm" />
                    <WaveformBars count={4} variant="green" />
                  </>
                )}
                <span className="di-state-label">
                  {isSpeaking ? "Speaking" : "Listening"}
                </span>
              </div>
              <button className="di-close" onClick={handleEndClick} aria-label="End">
                <XIcon />
              </button>
            </div>

            <div className="di-expanded__body">
              {flashAnswer && lastAnswer ? (
                <div className="di-flash">
                  <div className="di-flash__avatar">N</div>
                  <p className="di-flash__text">{lastAnswer}</p>
                </div>
              ) : recentTranscript.length > 0 ? (
                <ul className="di-messages">
                  {recentTranscript.map((item, i) => (
                    <li key={i} className={`di-bubble di-bubble--${item.role}`}>
                      {item.role === "assistant" && <div className="di-bubble__avatar">N</div>}
                      <span className="di-bubble__text">{item.text}</span>
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
    <div className={`di-wave di-wave--${variant}`}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="di-wave__bar"
          style={{ animationDelay: `${i * 0.09}s` }}
        />
      ))}
    </div>
  )
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
