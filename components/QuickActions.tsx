"use client"

import { useRef, useCallback } from "react"

interface Props {
  onAction: (question: string) => void
  disabled: boolean
}

const ACTIONS = [
  { icon: "💡", label: "What's this page about?", question: "What is this website about?" },
  { icon: "📑", label: "Page sections", question: "What are the main headings or sections on this page?" },
  { icon: "🔗", label: "Links on this page", question: "What are the main links on this page?" },
  { icon: "📝", label: "Summarize content", question: "Summarize the main content of this page" },
  { icon: "📞", label: "Phone / Contact", question: "What is the phone number or contact info?" },
  { icon: "📍", label: "Address / Location", question: "Where is the address?" },
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
    <div className="quick-actions" role="group" aria-label="Quick actions — ask common questions about this page">
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
            aria-label={a.label}
            tabIndex={i === 0 ? 0 : -1}
          >
            <span className="quick-action-btn__icon" aria-hidden="true">{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
