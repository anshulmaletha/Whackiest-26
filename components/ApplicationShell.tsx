import type { ReactNode } from "react"
import styles from "./ApplicationShell.module.css"

export type WayfinderState =
  | "Initial"
  | "Ready"
  | "Listening"
  | "Processing"
  | "Confirmation"
  | "Navigating"
  | "Success"
  | "Error"
  | "Retry"

export interface ApplicationShellProps {
  /** Current Wayfinder state shown in the top-bar status chip */
  status?: WayfinderState
  /** Optional custom text for the status chip */
  statusLabel?: string
  /** Optional custom status chip element */
  statusSlot?: ReactNode
  /** Optional state heading/prompt above the Orb slot */
  headerSlot?: ReactNode
  /** Reserved centered placement slot for the future Voice Orb */
  orbSlot?: ReactNode
  /** Reserved placement slot for the future Route Card / feedback content */
  routeCardSlot?: ReactNode
  /** Optional state-specific content rendered in the lower main area */
  children?: ReactNode
}

export default function ApplicationShell({
  status = "Ready",
  statusLabel,
  statusSlot,
  headerSlot,
  orbSlot,
  routeCardSlot,
  children,
}: ApplicationShellProps) {
  const displayStatus = statusLabel ?? status
  const hasStageSlots =
    headerSlot !== undefined || orbSlot !== undefined || routeCardSlot !== undefined
  const lowerContent = routeCardSlot ?? children

  return (
    <div className={styles.shell} data-state={status}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className={styles.topBar} role="banner">
        <div className={styles.topBarInner}>
          <div className={styles.identity}>
            <span className={styles.brandMark} aria-hidden="true" />
            <span className={styles.wordmark}>Wayfinder</span>
          </div>

          <div className={styles.statusArea} data-wf-slot="status">
            {statusSlot ?? (
              <div
                className={styles.statusChip}
                data-status={status}
                role="status"
                aria-label={`Current state: ${displayStatus}`}
              >
                <span className={styles.statusDot} aria-hidden="true" />
                <span className={styles.statusText}>{displayStatus}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" className={styles.main} role="main" tabIndex={-1}>
        {hasStageSlots ? (
          <div className={styles.mainInner}>
            <div className={styles.headerSlot} data-wf-slot="header">
              {headerSlot}
            </div>

            <section
              className={styles.orbSlot}
              data-wf-slot="orb"
              aria-label="Voice control area"
            >
              {orbSlot}
            </section>

            <section
              className={styles.routeCardSlot}
              data-wf-slot="route-card"
              aria-label="Destination and status details"
            >
              {lowerContent}
            </section>
          </div>
        ) : (
          <div className={styles.stageSingle}>{children}</div>
        )}
      </main>

      <footer className={styles.footer} role="contentinfo">
        <p className={styles.trustLine}>
          Wayfinder only opens websites. It never clicks or types for you.
        </p>
      </footer>
    </div>
  )
}
