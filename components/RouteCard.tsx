"use client"

import React, { useCallback } from "react"
import type { RouteCardProps } from "@/types/wayfinder"
import "./wayfinder.css"

/**
 * RouteCard
 * 
 * Confirmation card displayed before navigation occurs.
 * Strictly stateless and prop-driven:
 * - Aryanand owns the countdown timer; remaining time is received via `countdownRemainingMs`.
 * - No internal setTimeout or setInterval.
 * 
 * Ownership: Saurabh Singh (UI/UX Specialist)
 */
export default function RouteCard({
  destination,
  heardUtterance,
  isLowConfidence = false,
  countdownRemainingMs,
  countdownTotalMs = 1500, // 1.5s per PRD
  isPaused = false,
  onConfirm,
  onCancel,
  className = "",
}: RouteCardProps) {
  // Determine avatar letter and variant style
  const avatarLetter = (destination.label?.[0] || destination.id?.[0] || "W").toUpperCase()
  const isAmazon = destination.id.toLowerCase().includes("amazon")
  const isOrion = destination.id.toLowerCase().includes("orion")
  const avatarClass = isAmazon
    ? "wf-avatar--amazon"
    : isOrion
    ? "wf-avatar--orion"
    : "wf-avatar--default"

  // Calculate countdown percentage purely from props
  const hasCountdown = typeof countdownRemainingMs === "number"
  const remainingClamped = hasCountdown ? Math.max(0, Math.min(countdownTotalMs, countdownRemainingMs)) : 0
  const progressPercent = hasCountdown ? (remainingClamped / countdownTotalMs) * 100 : 0
  const remainingSecText = hasCountdown ? (remainingClamped / 1000).toFixed(1) : null

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onCancel()
      } else if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") {
        e.preventDefault()
        onConfirm()
      }
    },
    [onCancel, onConfirm]
  )

  return (
    <div className="wf-scope">
      <article
        className={`wf-card wf-route-card ${isLowConfidence ? "wf-route-card--low-confidence" : ""} ${className}`}
        role="region"
        aria-label={`Route confirmation for ${destination.label}`}
        aria-live="polite"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {/* Low-confidence badge if speech was ambiguous */}
        {isLowConfidence && (
          <div className="wf-route-card__banner" role="status">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>Did you mean {destination.label}?</span>
          </div>
        )}

        {/* Source -> Destination flow */}
        <div className="wf-route-card__header">
          <div className="wf-route-flow">
            <span>You</span>
            <span className="wf-route-flow__arrow" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </span>
            <span>{destination.label}</span>
          </div>
          <span className="wf-destination-info__badge">{destination.host}</span>
        </div>

        {/* Main card body with avatar & destination */}
        <div className="wf-route-card__main">
          <div className={`wf-avatar ${avatarClass}`} aria-hidden="true">
            {avatarLetter}
          </div>
          <div className="wf-destination-info">
            <h2 className="wf-destination-info__name">Opening {destination.label}</h2>
            <span className="wf-destination-info__host">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              {destination.host}
            </span>
          </div>
        </div>

        {/* Heard utterance feedback */}
        {heardUtterance && (
          <div className="wf-heard-pill">
            <span className="wf-heard-pill__icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </span>
            <span>
              I heard: <span className="wf-heard-pill__quote">&ldquo;{heardUtterance}&rdquo;</span>
            </span>
          </div>
        )}

        {/* Subtle 1.5s countdown indicator (purely driven by Aryanand's prop) */}
        {hasCountdown && (
          <div className="wf-countdown" role="timer" aria-label={`Opening in ${remainingSecText} seconds`}>
            <div className="wf-countdown__header">
              <span>{isPaused ? "Paused" : `Opening in ${remainingSecText}s...`}</span>
              <span>1.5s auto-confirm</span>
            </div>
            <div className="wf-countdown__track" aria-hidden="true">
              <div
                className="wf-countdown__fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions row */}
        <div className="wf-actions-row">
          <button
            type="button"
            className="wf-btn wf-btn--secondary"
            onClick={onCancel}
            aria-label="Cancel navigation"
          >
            Cancel
          </button>
          <button
            type="button"
            className="wf-btn wf-btn--primary"
            onClick={onConfirm}
            aria-label={`Go to ${destination.label} now`}
            autoFocus
          >
            <span>Go now</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </article>
    </div>
  )
}
