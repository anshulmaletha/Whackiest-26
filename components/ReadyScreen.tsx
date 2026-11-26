"use client"

import { useId, useRef, useState, type FormEvent } from "react"
import styles from "./ReadyScreen.module.css"

const QUICK_DESTINATIONS = ["Amazon", "Orion Mall"] as const

export interface ReadyScreenProps {
  /** Called with the user's non-empty entered text on form submit */
  onSubmitText?: (value: string) => void
  /** Called when the user selects a quick destination chip */
  onQuickDestination?: (destination: string) => void
  /** Optional className for container overrides */
  className?: string
}

export function ReadyHeader() {
  return (
    <h1 className={styles.heading}>
      What do you want to open?
    </h1>
  )
}

export default function ReadyScreen({
  onSubmitText,
  onQuickDestination,
  className = "",
}: ReadyScreenProps) {
  const [value, setValue] = useState("")
  const [emptyHint, setEmptyHint] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const hintId = useId()

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!value.trim()) {
      setEmptyHint(true)
      inputRef.current?.focus()
      return
    }
    setEmptyHint(false)
    onSubmitText?.(value)
  }

  function handleChange(nextValue: string) {
    setValue(nextValue)
    if (emptyHint && nextValue.trim()) {
      setEmptyHint(false)
    }
  }

  function handleChipClick(destination: string) {
    setEmptyHint(false)
    onQuickDestination?.(destination)
  }

  return (
    <div className={`${styles.container} ${className}`.trim()}>
      {/* Secondary input mode: single-line text field + Go submit */}
      <form
        className={styles.form}
        onSubmit={handleSubmit}
        noValidate
        aria-label="Type a destination"
      >
        <div className={styles.dividerRow}>
          <span className={styles.dividerLine} aria-hidden="true" />
          <label htmlFor={inputId} className={styles.inputLabel}>
            Or type a destination
          </label>
          <span className={styles.dividerLine} aria-hidden="true" />
        </div>

        <div className={styles.inputRow}>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Enter a website or destination"
            autoComplete="off"
            className={styles.input}
            aria-invalid={emptyHint || undefined}
            aria-describedby={emptyHint ? hintId : undefined}
          />
          <button
            type="submit"
            className={styles.submitButton}
            aria-label="Go to destination"
          >
            Go
          </button>
        </div>

        {emptyHint && (
          <p id={hintId} className={styles.emptyHint} role="status" aria-live="polite">
            Enter a website or destination first.
          </p>
        )}
      </form>

      {/* Tertiary input mode: quick destination chips */}
      <div className={styles.chipsSection} role="group" aria-label="Quick destinations">
        <span className={styles.chipsLabel}>Quick destinations</span>
        <div className={styles.chipsList}>
          {QUICK_DESTINATIONS.map((destination) => (
            <button
              key={destination}
              type="button"
              className={styles.chipButton}
              onClick={() => handleChipClick(destination)}
            >
              {destination}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
