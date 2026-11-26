/**
 * Wayfinder - Core TypeScript Definitions
 * 
 * Defines destination models, navigation states, error situations,
 * and component prop contracts for Wayfinder feedback components.
 * 
 * Ownership: Saurabh Singh (UI/UX Specialist)
 */

export type WayfinderDestinationId = "amazon" | "orion_mall"

export interface WayfinderDestination {
  id: WayfinderDestinationId | string
  label: string
  host: string
  url?: string
}

export type NavigationStep = "heard" | "understood" | "opening" | "completed"

export type ErrorSituation =
  | "not_understood"     // "I couldn't find a website called 'X'."
  | "no_speech"          // "I didn't hear anything."
  | "mic_unavailable"    // "Voice isn't available here. You can type your request below."
  | "nav_failed"         // "I couldn't open [X]. Check your connection and try again."
  | "engine_unreachable" // "Wayfinder can't reach its engine. Give it a moment, then try again."

export interface DestinationSuggestion {
  id: string
  label: string
}

/**
 * RouteCardProps
 * Aryanand owns the actual countdown timer. This component only displays
 * countdown progress through props (e.g. countdownRemainingMs).
 */
export interface RouteCardProps {
  destination: WayfinderDestination
  heardUtterance: string
  isLowConfidence?: boolean
  /** Milliseconds remaining on the confirmation countdown (Aryanand's timer) */
  countdownRemainingMs?: number
  /** Total countdown duration in ms (defaults to 1500ms = 1.5s per PRD) */
  countdownTotalMs?: number
  isPaused?: boolean
  onConfirm: () => void
  onCancel: () => void
  className?: string
}

/**
 * NavigationProgressTrackProps
 * Pure 3-step progress track: Heard -> Understood -> Opening.
 */
export interface NavigationProgressTrackProps {
  currentStep: NavigationStep
  className?: string
}

/**
 * SuccessViewProps
 * Displays post-navigation confirmation and the hard STOP guarantee.
 */
export interface SuccessViewProps {
  destination: WayfinderDestination
  elapsedMs?: number
  onReset: () => void
  onOpenAgain?: () => void
  className?: string
}

/**
 * ErrorViewProps
 * Displays calm amber feedback for the 5 error scenarios.
 */
export interface ErrorViewProps {
  situation: ErrorSituation
  failedUtterance?: string
  destinationLabel?: string
  suggestions?: DestinationSuggestion[]
  onRetryClick?: () => void
  onSelectSuggestion?: (id: string) => void
  onCancel?: () => void
  className?: string
}

/**
 * RetryViewProps
 * Controlled input interface for retrying or editing a failed request.
 * Completely stateless; Aryanand manages the state and submissions.
 */
export interface RetryViewProps {
  retryUtterance: string
  onRetryUtteranceChange: (value: string) => void
  onRetry: () => void
  onCancel?: () => void
  isSubmitting?: boolean
  errorMessage?: string
  placeholder?: string
  suggestions?: DestinationSuggestion[]
  onSelectSuggestion?: (label: string) => void
  className?: string
}
