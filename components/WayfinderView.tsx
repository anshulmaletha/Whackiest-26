import type { ReactNode } from "react"
import ApplicationShell, { type WayfinderState as ShellStatus } from "./ApplicationShell"
import InitialScreen from "./InitialScreen"
import ReadyScreen, { ReadyHeader } from "./ReadyScreen"
import VoiceOrb from "./VoiceOrb"
import styles from "./WayfinderView.module.css"

export type WayfinderUIState =
  | "INITIAL"
  | "READY"
  | "LISTENING"
  | "PROCESSING"
  | "CONFIRMATION"
  | "NAVIGATING"
  | "SUCCESS"
  | "ERROR"

export interface WayfinderViewData {
  /** Destination registry ID supplied by parent/backend layer (e.g. "amazon") */
  destinationId?: string
  /** Resolved destination label supplied by parent/state layer */
  destinationName?: string
  /** Resolved destination host supplied by parent/backend layer (e.g. "www.amazon.in") */
  destinationHost?: string
  /** Resolved destination URL or host supplied by parent/state layer */
  destinationUrl?: string
  /** Utterance heard or entered by the user */
  heardText?: string
  /** Navigation duration in ms supplied by backend /api/open */
  elapsedMs?: number
  /** Human-readable error message supplied by parent/state layer */
  errorMessage?: string
}

export interface WayfinderUIIntents {
  onGetStarted?: () => void
  onStartListening?: () => void
  onStopListening?: () => void
  onSubmitText?: (value: string) => void
  onQuickDestination?: (destination: string) => void
  onSelectSuggestion?: (destination: string) => void
  onConfirm?: () => void
  onCancel?: () => void
  onRetry?: () => void
  onReset?: () => void
}

export interface WayfinderViewSlots {
  /** Optional external Confirmation / RouteCard component (e.g. Saurabh's RouteCard) */
  confirmationSlot?: ReactNode
  /** Optional external Navigating / progress component */
  navigatingSlot?: ReactNode
  /** Optional external Success component */
  successSlot?: ReactNode
  /** Optional external Error / Retry component */
  errorSlot?: ReactNode
}

export interface WayfinderViewProps {
  /** Current application state owned by the parent/state-machine layer */
  state: WayfinderUIState
  /** Supplied display data for the active state */
  data?: WayfinderViewData
  /** Upward intent callbacks emitted on user actions */
  intents?: WayfinderUIIntents
  /** Optional teammate slot overrides for Confirmation / Navigating / Success / Error */
  slots?: WayfinderViewSlots
}

const SHELL_STATUS_MAP: Record<WayfinderUIState, ShellStatus> = {
  INITIAL: "Initial",
  READY: "Ready",
  LISTENING: "Listening",
  PROCESSING: "Processing",
  CONFIRMATION: "Confirmation",
  NAVIGATING: "Navigating",
  SUCCESS: "Success",
  ERROR: "Error",
}

export default function WayfinderView({
  state,
  data,
  intents,
  slots,
}: WayfinderViewProps) {
  const shellStatus = SHELL_STATUS_MAP[state]

  if (state === "INITIAL") {
    return (
      <ApplicationShell status={shellStatus}>
        <InitialScreen onGetStarted={intents?.onGetStarted} />
      </ApplicationShell>
    )
  }

  if (state === "READY") {
    return (
      <ApplicationShell
        status={shellStatus}
        headerSlot={<ReadyHeader />}
        orbSlot={<VoiceOrb state="idle" onActivate={intents?.onStartListening} />}
        routeCardSlot={
          <ReadyScreen
            onSubmitText={intents?.onSubmitText}
            onQuickDestination={intents?.onQuickDestination}
          />
        }
      />
    )
  }

  if (state === "LISTENING") {
    return (
      <ApplicationShell
        status={shellStatus}
        headerSlot={<h1 className={styles.stateHeading}>Listening...</h1>}
        orbSlot={
          <VoiceOrb state="listening" onActivate={intents?.onStopListening} />
        }
        routeCardSlot={
          <div className={styles.statePanel}>
            <p className={styles.stateBody}>
              Say the website or destination you want to open.
            </p>
            <div className={styles.actionsRow}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={intents?.onCancel}
              >
                Cancel
              </button>
            </div>
          </div>
        }
      />
    )
  }

  if (state === "PROCESSING") {
    return (
      <ApplicationShell
        status={shellStatus}
        headerSlot={<h1 className={styles.stateHeading}>Understanding...</h1>}
        orbSlot={<VoiceOrb state="processing" />}
        routeCardSlot={
          <div className={styles.statePanel}>
            <p className={styles.stateBody}>
              {data?.heardText
                ? `Heard: "${data.heardText}"`
                : "Matching your destination..."}
            </p>
          </div>
        }
      />
    )
  }

  if (state === "CONFIRMATION") {
    const destinationLabel = data?.destinationName ?? "Selected destination"
    return (
      <ApplicationShell
        status={shellStatus}
        headerSlot={
          <h1 className={styles.stateHeading}>
            This is what Wayfinder understood.
          </h1>
        }
        orbSlot={<VoiceOrb state="idle" interactive={false} />}
        routeCardSlot={
          slots?.confirmationSlot ?? (
            <section
              className={styles.stateCard}
              aria-label="Route confirmation"
            >
              <div className={styles.cardBody}>
                <span className={styles.cardEyebrow}>Destination</span>
                <p className={styles.destinationName}>{destinationLabel}</p>
                {data?.destinationUrl && (
                  <p className={styles.destinationUrl}>{data.destinationUrl}</p>
                )}
                {data?.heardText && (
                  <p className={styles.heardText}>
                    Heard: &ldquo;{data.heardText}&rdquo;
                  </p>
                )}
              </div>
              <div className={styles.actionsRow}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={intents?.onCancel}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={intents?.onConfirm}
                >
                  Go now
                </button>
              </div>
            </section>
          )
        }
      />
    )
  }

  if (state === "NAVIGATING") {
    return (
      <ApplicationShell
        status={shellStatus}
        headerSlot={<h1 className={styles.stateHeading}>Opening...</h1>}
        orbSlot={<VoiceOrb state="navigating" />}
        routeCardSlot={
          slots?.navigatingSlot ?? (
            <div className={styles.statePanel}>
              <p className={styles.stateBody}>
                {data?.destinationName
                  ? `Opening ${data.destinationName} once...`
                  : "Opening destination once..."}
              </p>
              {data?.destinationUrl && (
                <p className={styles.destinationUrl}>{data.destinationUrl}</p>
              )}
            </div>
          )
        }
      />
    )
  }

  if (state === "SUCCESS") {
    return (
      <ApplicationShell
        status={shellStatus}
        headerSlot={<h1 className={styles.stateHeading}>Stopped</h1>}
        orbSlot={<VoiceOrb state="success" onActivate={intents?.onReset} />}
        routeCardSlot={
          slots?.successSlot ?? (
            <section
              className={styles.stateCard}
              aria-label="Navigation complete"
            >
              <div className={styles.cardBody}>
                <span className={styles.cardEyebrow}>Completed</span>
                <p className={styles.destinationName}>
                  {data?.destinationName
                    ? `Opened ${data.destinationName}.`
                    : "Website opened."}
                </p>
                <p className={styles.stateBody}>
                  Wayfinder stopped after opening the destination once.
                </p>
              </div>
              {intents?.onReset && (
                <div className={styles.actionsRow}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={intents.onReset}
                  >
                    Open another
                  </button>
                </div>
              )}
            </section>
          )
        }
      />
    )
  }

  // ERROR
  return (
    <ApplicationShell
      status={shellStatus}
      headerSlot={<h1 className={styles.stateHeading}>Something went wrong</h1>}
      orbSlot={<VoiceOrb state="error" onActivate={intents?.onRetry} />}
      routeCardSlot={
        slots?.errorSlot ?? (
          <section
            className={`${styles.stateCard} ${styles.stateCardError}`}
            role="alert"
            aria-label="Error details"
          >
            <div className={styles.cardBody}>
              <span className={styles.cardEyebrow}>Error — couldn&apos;t open</span>
              <p className={styles.errorMessage}>
                {data?.errorMessage ??
                  "Wayfinder could not open that destination. Please try again."}
              </p>
            </div>
            <div className={styles.actionsRow}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={intents?.onRetry}
              >
                Retry
              </button>
            </div>
          </section>
        )
      }
    />
  )
}
