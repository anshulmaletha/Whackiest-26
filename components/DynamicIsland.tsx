"use client"

import { useState, useEffect, useRef } from "react"
import type { TranscriptItem } from "@/types"

type VisualState = "idle" | "connecting" | "listening" | "speaking" | "expanded"

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

  // Derive visual state
  const visualState: VisualState = !isConnected
    ? "idle"
    : isExpanded
    ? "expanded"
    : isSpeaking
    ? "speaking"
    : "listening"

  // Flash answer when a new one arrives
  useEffect(() => {
    if (lastAnswer && lastAnswer !== prevAnswerRef.current) {
      prevAnswerRef.current = lastAnswer
      setFlashAnswer(true)
      setIsExpanded(true)
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = setTimeout(() => {
        setIsExpanded(false)
        setFlashAnswer(false)
      }, 4000)
    }
  }, [lastAnswer])

  function handleClick() {
    if (!isConnected) {
      onMicClick()
      return
    }
    if (isExpanded) {
      setIsExpanded(false)
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current)
    } else {
      setIsExpanded(true)
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current)
    }
  }

  function handleEndClick(e: React.MouseEvent) {
    e.stopPropagation()
    onMicClick()
    setIsExpanded(false)
  }

  const recentTranscript = transcript.slice(-4)

  return (
    <div
      className={`di di--${visualState}`}
      onClick={handleClick}
      role="button"
      aria-label={isConnected ? "Voice assistant active" : "Start voice assistant"}
    >
      {/* ── Idle ────────────────────────────────────────────────────── */}
      {visualState === "idle" && (
        <div className="di-inner di-inner--idle">
          <MicIcon />
          <span className="di-label">Navia</span>
        </div>
      )}

      {/* ── Listening ───────────────────────────────────────────────── */}
      {visualState === "listening" && (
        <div className="di-inner di-inner--mini">
          <div className="di-bars di-bars--green">
            {[0,1,2,3,4].map(i => (
              <span key={i} className="di-bar" style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
          <span className="di-label">Listening</span>
          <button className="di-end" onClick={handleEndClick} aria-label="End session">✕</button>
        </div>
      )}

      {/* ── Speaking ────────────────────────────────────────────────── */}
      {visualState === "speaking" && (
        <div className="di-inner di-inner--mini">
          <div className="di-bars di-bars--white">
            {[0,1,2,3,4,5,6].map(i => (
              <span key={i} className="di-bar di-bar--wave" style={{ animationDelay: `${i * 0.08}s` }} />
            ))}
          </div>
          <span className="di-label">Speaking</span>
          <button className="di-end" onClick={handleEndClick} aria-label="End session">✕</button>
        </div>
      )}

      {/* ── Expanded ────────────────────────────────────────────────── */}
      {visualState === "expanded" && (
        <div className="di-inner di-inner--expanded">
          <div className="di-expanded-header">
            <div className="di-expanded-status">
              {isSpeaking ? (
                <div className="di-bars di-bars--white di-bars--sm">
                  {[0,1,2,3,4].map(i => (
                    <span key={i} className="di-bar di-bar--wave" style={{ animationDelay: `${i * 0.08}s` }} />
                  ))}
                </div>
              ) : (
                <div className="di-bars di-bars--green di-bars--sm">
                  {[0,1,2,3].map(i => (
                    <span key={i} className="di-bar" style={{ animationDelay: `${i * 0.12}s` }} />
                  ))}
                </div>
              )}
              <span className="di-status-text">{isSpeaking ? "Speaking" : "Listening"}</span>
            </div>
            <button className="di-end di-end--sm" onClick={handleEndClick} aria-label="End session">✕</button>
          </div>

          {flashAnswer && lastAnswer ? (
            <div className="di-answer">
              <span className="di-answer__label">Navia</span>
              <p className="di-answer__text">{lastAnswer}</p>
            </div>
          ) : recentTranscript.length > 0 ? (
            <ul className="di-transcript">
              {recentTranscript.map((item, i) => (
                <li key={i} className={`di-msg di-msg--${item.role}`}>
                  <span className="di-msg__role">{item.role === "user" ? "You" : "Navia"}</span>
                  <span className="di-msg__text">{item.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="di-hint">Say something to get started…</p>
          )}
        </div>
      )}
    </div>
  )
}

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
    </svg>
  )
}
