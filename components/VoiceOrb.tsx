import type { ReactElement } from "react"
import styles from "./VoiceOrb.module.css"

export type VoiceOrbState =
  | "idle"
  | "listening"
  | "processing"
  | "navigating"
  | "success"
  | "error"

export interface VoiceOrbProps {
  /** Visual interaction state controlled by the parent state machine */
  state?: VoiceOrbState
  /** Callback fired when the user activates an interactive Orb */
  onActivate?: () => void
  /** Explicitly override whether the Orb renders as an interactive button */
  interactive?: boolean
  /** Explicitly disable activation */
  disabled?: boolean
  /** Optional custom accessible label */
  ariaLabel?: string
  /** Optional className for container overrides */
  className?: string
}

interface StateConfig {
  label: string
  accessibleDescription: string
  interactiveByDefault: boolean
}

const STATE_CONFIG: Record<VoiceOrbState, StateConfig> = {
  idle: {
    label: "Tap to speak",
    accessibleDescription: "Tap to speak — start voice input",
    interactiveByDefault: true,
  },
  listening: {
    label: "Listening...",
    accessibleDescription: "Listening — tap to stop voice input",
    interactiveByDefault: true,
  },
  processing: {
    label: "Understanding...",
    accessibleDescription: "Understanding your request",
    interactiveByDefault: false,
  },
  navigating: {
    label: "Opening...",
    accessibleDescription: "Opening website",
    interactiveByDefault: false,
  },
  success: {
    label: "Stopped",
    accessibleDescription: "Stopped — navigation complete, tap to start again",
    interactiveByDefault: true,
  },
  error: {
    label: "Something went wrong",
    accessibleDescription: "Something went wrong — tap to retry",
    interactiveByDefault: true,
  },
}

function StateGlyph({ state }: { state: VoiceOrbState }): ReactElement {
  switch (state) {
    case "idle":
      return (
        <svg
          className={styles.glyph}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="8" y1="22" x2="16" y2="22" />
        </svg>
      )

    case "listening":
      return (
        <svg
          className={styles.glyph}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="2" width="6" height="11" rx="3" fill="currentColor" />
          <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="2" y1="9" x2="2" y2="15" />
          <line x1="22" y1="9" x2="22" y2="15" />
        </svg>
      )

    case "processing":
      return (
        <svg
          className={styles.glyph}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 1 1-6.22-8.56" />
          <circle cx="9" cy="12" r="1.25" fill="currentColor" stroke="none" />
          <circle cx="12.5" cy="12" r="1.25" fill="currentColor" stroke="none" />
          <circle cx="16" cy="12" r="1.25" fill="currentColor" stroke="none" />
        </svg>
      )

    case "navigating":
      return (
        <svg
          className={styles.glyph}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="13 6 19 12 13 18" />
        </svg>
      )

    case "success":
      return (
        <svg
          className={styles.glyph}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )

    case "error":
      return (
        <svg
          className={styles.glyph}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
        </svg>
      )
  }
}

export default function VoiceOrb({
  state = "idle",
  onActivate,
  interactive,
  disabled = false,
  ariaLabel,
  className = "",
}: VoiceOrbProps) {
  const config = STATE_CONFIG[state]
  const isClickable =
    !disabled && (interactive ?? config.interactiveByDefault)
  const accessibleName = ariaLabel ?? config.accessibleDescription

  const orbVisual = (
    <span className={styles.orbFrame} aria-hidden="true">
      {/* Concentric outer ring layer (pulsing in listening, static in reduced-motion) */}
      <span className={styles.outerRing} />

      {/* Segmented / progress perimeter SVG ring for processing & navigating */}
      {(state === "processing" || state === "navigating") && (
        <svg className={styles.arcRing} viewBox="0 0 120 120">
          <circle
            className={styles.arcTrack}
            cx="60"
            cy="60"
            r="54"
            fill="none"
            strokeWidth="3"
          />
          <circle
            className={styles.arcIndicator}
            cx="60"
            cy="60"
            r="54"
            fill="none"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </svg>
      )}

      {/* Core circular Orb surface */}
      <span className={styles.orbCore}>
        <StateGlyph state={state} />
      </span>
    </span>
  )

  return (
    <div
      className={`${styles.container} ${className}`.trim()}
      data-orb-state={state}
    >
      {isClickable ? (
        <button
          type="button"
          className={styles.orbButton}
          onClick={onActivate}
          aria-label={accessibleName}
          aria-pressed={state === "listening" ? true : undefined}
        >
          {orbVisual}
        </button>
      ) : (
        <div
          className={styles.orbStatic}
          role="img"
          aria-label={accessibleName}
        >
          {orbVisual}
        </div>
      )}

      <span className={styles.label}>{config.label}</span>
    </div>
  )
}
