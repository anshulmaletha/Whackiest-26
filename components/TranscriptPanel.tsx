"use client"

import { useEffect, useRef } from "react"
import type { TranscriptItem } from "@/types"

interface Props {
  transcript: TranscriptItem[]
  isListening: boolean
  isSpeaking: boolean
  isOpen: boolean
  onToggle: () => void
  lastAnswer: string | null
}

export default function TranscriptPanel({
  transcript,
  isListening,
  isSpeaking,
  isOpen,
  onToggle,
  lastAnswer,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [transcript])

  const statusLabel = isListening
    ? "Listening…"
    : isSpeaking
    ? "Speaking…"
    : "Voice assistant"

  return (
    <div className={`transcript-panel ${isOpen ? "transcript-panel--open" : ""}`}>
      <button
        className="transcript-toggle"
        onClick={onToggle}
        aria-label={isOpen ? "Close transcript" : "Open transcript"}
        aria-expanded={isOpen}
      >
        <MicStatusDot isListening={isListening} isSpeaking={isSpeaking} />
        <span className="transcript-toggle__label">{statusLabel}</span>
        <span className="transcript-toggle__chevron">{isOpen ? "▼" : "▲"}</span>
      </button>

      {isOpen && (
        <div className="transcript-body">
          {transcript.length === 0 ? (
            <p className="transcript-empty">
              Press the mic button or use the agent to start a conversation.
            </p>
          ) : (
            <ul className="transcript-list">
              {transcript.map((item, i) => (
                <li key={i} className={`transcript-item transcript-item--${item.role}`}>
                  <span className="transcript-item__role">
                    {item.role === "user" ? "You" : "Navia"}
                  </span>
                  <span className="transcript-item__text">{item.text}</span>
                </li>
              ))}
            </ul>
          )}

          {lastAnswer && (
            <div className="transcript-answer">
              <span className="transcript-answer__label">Last answer</span>
              <p className="transcript-answer__text">{lastAnswer}</p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}

function MicStatusDot({
  isListening,
  isSpeaking,
}: {
  isListening: boolean
  isSpeaking: boolean
}) {
  return (
    <span
      className={`status-dot ${isListening ? "status-dot--listening" : isSpeaking ? "status-dot--speaking" : ""}`}
      aria-hidden="true"
    />
  )
}
