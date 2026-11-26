"use client"

import React from "react"
import type { ErrorSituation, ErrorViewProps } from "@/types/wayfinder"
import "./wayfinder.css"

interface ErrorCopy {
  title: string
  message: string
  actionLabel: string
}

function getErrorCopy(
  situation: ErrorSituation,
  failedUtterance?: string,
  destinationLabel?: string
): ErrorCopy {
  switch (situation) {
    case "not_understood":
      return {
        title: "Destination not found",
        message: failedUtterance
          ? `I couldn't find a website called '${failedUtterance}'.`
          : "I couldn't find that website.",
        actionLabel: "Try another destination",
      }
    case "no_speech":
      return {
        title: "Didn't catch that",
        message: "I didn't hear anything.",
        actionLabel: "Speak again",
      }
    case "mic_unavailable":
      return {
        title: "Microphone unavailable",
        message: "Voice isn't available here. You can type your request below.",
        actionLabel: "Type request",
      }
    case "nav_failed":
      return {
        title: "Navigation issue",
        message: `I couldn't open ${destinationLabel || "the website"}. Check your connection and try again.`,
        actionLabel: "Try opening again",
      }
    case "engine_unreachable":
      return {
        title: "Engine unavailable",
        message: "Wayfinder can't reach its engine. Give it a moment, then try again.",
        actionLabel: "Retry connection",
      }
  }
}

/**
 * ErrorView
 * 
 * Calm, amber-themed error feedback for all 5 Wayfinder error situations:
 * 1. Destination not understood
 * 2. No speech detected
 * 3. Microphone unavailable
 * 4. Navigation failed or timed out
 * 5. Engine unreachable
 * 
 * Never displays raw stack traces or aggressive red.
 * 
 * Ownership: Saurabh Singh (UI/UX Specialist)
 */
export default function ErrorView({
  situation,
  failedUtterance,
  destinationLabel,
  suggestions = [],
  onRetryClick,
  onSelectSuggestion,
  onCancel,
  className = "",
}: ErrorViewProps) {
  const { title, message, actionLabel } = getErrorCopy(situation, failedUtterance, destinationLabel)

  return (
    <div className="wf-scope">
      <article
        className={`wf-card wf-error ${className}`}
        role="alert"
        aria-live="assertive"
        aria-label={`Error: ${title}`}
      >
        <div className="wf-error__header">
          {/* Calm amber warning icon */}
          <div className="wf-error__icon-box" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <div className="wf-error__body">
            <h3 className="wf-error__title">{title}</h3>
            <p className="wf-error__message">{message}</p>
          </div>
        </div>

        {/* Relevant suggestions when destination was not understood */}
        {suggestions.length > 0 && onSelectSuggestion && (
          <div className="wf-error__suggestions" role="group" aria-label="Suggested destinations">
            <span className="wf-error__suggestions-label">Try one of these:</span>
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                className="wf-chip-btn"
                onClick={() => onSelectSuggestion(s.id)}
                aria-label={`Navigate to ${s.label}`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Action controls */}
        <div className="wf-actions-row">
          {onCancel && (
            <button
              type="button"
              className="wf-btn wf-btn--secondary"
              onClick={onCancel}
              aria-label="Dismiss error and return"
            >
              Cancel
            </button>
          )}

          {onRetryClick && (
            <button
              type="button"
              className="wf-btn wf-btn--amber"
              onClick={onRetryClick}
              aria-label={actionLabel}
              autoFocus
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>{actionLabel}</span>
            </button>
          )}
        </div>
      </article>
    </div>
  )
}
