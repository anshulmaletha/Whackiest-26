import styles from "./InitialScreen.module.css"

export interface InitialScreenProps {
  /** Triggers the INITIAL -> READY transition owned by the state controller */
  onGetStarted?: () => void
  /** Optional className for layout overrides */
  className?: string
}

export default function InitialScreen({
  onGetStarted,
  className = "",
}: InitialScreenProps) {
  return (
    <section
      className={`${styles.container} ${className}`.trim()}
      aria-labelledby="wayfinder-initial-heading"
    >
      <div className={styles.identityPill}>
        <span className={styles.identityDot} aria-hidden="true" />
        <span className={styles.identityText}>Wayfinder</span>
      </div>

      <h1 id="wayfinder-initial-heading" className={styles.heroHeading}>
        Say where. Go.
      </h1>

      <p className={styles.promise}>
        Name a website by voice or text and Wayfinder opens it once.
      </p>

      <div className={styles.actionRow}>
        <button
          type="button"
          className={styles.ctaButton}
          onClick={onGetStarted}
        >
          <span>Get Started</span>
          <svg
            className={styles.ctaArrow}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </section>
  )
}
