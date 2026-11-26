"use client"

import React, { FormEvent, useCallback } from "react"
import type { RetryViewProps } from "@/types/wayfinder"
import "./wayfinder.css"

/**
 * RetryView
 * 
 * Reusable, controlled input component for retrying failed requests.
 * Features:
 * - Preserves previous utterance in controlled editable input.
 * - Prevents duplicate submissions while in-flight (`isSubmitting`).
 * - Emits clean events (`onRetry`, `onRetryUtteranceChange`, `onCancel`).
 * - Minimum 44x44px interactive targets.
 * 
 * Ownership: Saurabh Singh (UI/UX Specialist)
 */
export default function RetryView({
  retryUtterance,
  onRetryUtteranceChange,
  onRetry,
  onCancel,
  isSubmitting = false,
  errorMessage,
  placeholder = "e.g. Open Amazon, Open Orion Mall",
  suggestions = [],
  onSelectSuggestion,
  className = "",
}: RetryViewProps) {
  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      if (!isSubmitting && retryUtterance.trim()) {
        onRetry()
      }
    },
    [isSubmitting, retryUtterance, onRetry]
  )

  const isBlank = !retryUtterance.trim()

  return (
    <div className="wf-scope">
      <div
        className={`wf-card wf-retry ${className}`}
        role="region"
        aria-label="Retry destination request"
      >
        <div className="wf-destination-info">
          <h3 className="wf-destination-info__name" style={{ fontSize: "17px" }}>
            Try another destination
          </h3>
          <span className="wf-destination-info__host">
            Edit your request or choose an available website below.
          </span>
        </div>

        {/* Controlled Form */}
        <form onSubmit={handleSubmit} className="wf-retry__form" role="search" aria-label="Retry search">
          <div className="wf-retry__input-wrap">
            <input
              type="text"
              value={retryUtterance}
              onChange={(e) => onRetryUtteranceChange(e.target.value)}
              placeholder={placeholder}
              className="wf-retry__input"
              aria-label="Destination query"
              autoComplete="off"
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || isBlank}
            className="wf-btn wf-btn--primary"
            aria-label={isSubmitting ? "Submitting request..." : "Submit retry"}
          >
            {isSubmitting ? (
              <>
                <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                <span>Retrying...</span>
              </>
            ) : (
              <>
                <span>Try again</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>
        </form>

        {errorMessage && (
          <p className="wf-retry__hint" role="status" style={{ color: "var(--wf-amber)" }}>
            {errorMessage}
          </p>
        )}

        {/* Quick Suggestion Pills */}
        {suggestions.length > 0 && onSelectSuggestion && (
          <div className="wf-error__suggestions" role="group" aria-label="Popular websites">
            <span className="wf-error__suggestions-label">Popular websites:</span>
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                className="wf-chip-btn"
                onClick={() => onSelectSuggestion(s.label)}
                disabled={isSubmitting}
                aria-label={`Select ${s.label}`}
              >
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Cancel button */}
        {onCancel && (
          <div className="wf-actions-row" style={{ justifyContent: "flex-end", marginTop: "2px" }}>
            <button
              type="button"
              className="wf-btn wf-btn--secondary"
              onClick={onCancel}
              disabled={isSubmitting}
              aria-label="Cancel retry"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
