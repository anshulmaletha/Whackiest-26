"use client"

import React from "react"
import type { SuccessViewProps } from "@/types/wayfinder"
import NavigationProgressTrack from "./NavigationProgressTrack"
import "./wayfinder.css"

/**
 * SuccessView
 * 
 * Displayed upon successful navigation to destination.
 * Key responsibilities:
 * - Visually confirms destination reached ("You're on Amazon.")
 * - Reassures the user with the hard STOP guarantee:
 *   "I've stopped here. Nothing else will happen unless you ask."
 * - Persists until the user takes action ("Go somewhere else").
 * 
 * Ownership: Saurabh Singh (UI/UX Specialist)
 */
export default function SuccessView({
  destination,
  elapsedMs,
  onReset,
  onOpenAgain,
  className = "",
}: SuccessViewProps) {
  const elapsedSec = typeof elapsedMs === "number" ? (elapsedMs / 1000).toFixed(1) : null

  return (
    <div className="wf-scope">
      <section
        className={`wf-card wf-success ${className}`}
        role="status"
        aria-live="polite"
        aria-label={`Arrived at ${destination.label}`}
      >
        {/* Completed Progress Track */}
        <NavigationProgressTrack currentStep="completed" />

        {/* Animated Green Checkmark Ring */}
        <div className="wf-success__ring" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        {/* Core Feedback & STOP Guarantee */}
        <div className="wf-success__content">
          <h2 className="wf-success__title">You&apos;re on {destination.label}.</h2>
          <p className="wf-success__guarantee">
            I&apos;ve stopped here. Nothing else will happen unless you ask.
          </p>

          <div className="wf-success__meta">
            <span className="wf-success__host-chip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              {destination.host}
            </span>
            {elapsedSec && <span>Opened in {elapsedSec}s</span>}
          </div>
        </div>

        {/* Action Controls */}
        <div className="wf-actions-row" style={{ width: "100%", maxWidth: "340px" }}>
          {onOpenAgain && (
            <button
              type="button"
              className="wf-btn wf-btn--secondary"
              onClick={onOpenAgain}
              aria-label={`Open ${destination.label} in a new tab again`}
            >
              Open again
            </button>
          )}
          <button
            type="button"
            className="wf-btn wf-btn--primary"
            onClick={onReset}
            aria-label="Go somewhere else — start new request"
            autoFocus
          >
            <span>Go somewhere else</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </section>
    </div>
  )
}
