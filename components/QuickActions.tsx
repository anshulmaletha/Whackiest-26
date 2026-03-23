"use client"

import { useRef, useCallback } from "react"

interface Props {
  onAction: (question: string) => void
  disabled: boolean
}

const ACTIONS = [
  { label: "Explain this page", question: "What is this website about?", key: "1" },
  { label: "Phone number", question: "What is the phone number?", key: "2" },
  { label: "Contact info", question: "What is the email or contact info?", key: "3" },
  { label: "Address / Location", question: "Where is the address?", key: "4" },
  { label: "Opening hours", question: "What are the opening hours?", key: "5" },
  { label: "Main content", question: "Summarize the main content of this page", key: "6" },
]

export default function QuickActions({ onAction, disabled }: Props) {
  const gridRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const btns = gridRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")
    if (!btns || btns.length === 0) return

    const current = Array.from(btns).indexOf(document.activeElement as HTMLButtonElement)

    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown": {
        e.preventDefault()
        const next = current < btns.length - 1 ? current + 1 : 0
        btns[next].focus()
        break
      }
      case "ArrowLeft":
      case "ArrowUp": {
        e.preventDefault()
        const prev = current > 0 ? current - 1 : btns.length - 1
        btns[prev].focus()
        break
      }
    }
  }, [])

  return (
    <div className="quick-actions" role="group" aria-label="Quick actions — press a button to ask about this page">
      <span className="quick-actions__label" id="qa-label">Quick ask</span>
      <div
        ref={gridRef}
        className="quick-actions__grid"
        role="toolbar"
        aria-labelledby="qa-label"
        onKeyDown={handleKeyDown}
      >
        {ACTIONS.map((a, i) => (
          <button
            key={a.label}
            onClick={() => onAction(a.question)}
            disabled={disabled}
            className="quick-action-btn"
            aria-label={`${a.label} — shortcut key ${a.key}`}
            tabIndex={i === 0 ? 0 : -1}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
