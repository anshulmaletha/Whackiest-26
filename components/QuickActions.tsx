"use client"

interface Props {
  onAction: (question: string) => void
  disabled: boolean
}

const ACTIONS = [
  { label: "Explain this site", question: "Explain this site" },
  { label: "Phone number", question: "What is the phone number?" },
  { label: "Services offered", question: "What services do they offer?" },
  { label: "Address", question: "Where is the address?" },
]

export default function QuickActions({ onAction, disabled }: Props) {
  return (
    <div className="quick-actions" aria-label="Quick actions">
      <span className="quick-actions__label">Quick ask</span>
      <div className="quick-actions__grid">
        {ACTIONS.map((a) => (
          <button
            key={a.label}
            onClick={() => onAction(a.question)}
            disabled={disabled}
            className="quick-action-btn"
            aria-label={a.label}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
