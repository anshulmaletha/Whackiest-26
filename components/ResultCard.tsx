"use client"

import type { SearchResult } from "@/types"

interface Props {
  result: SearchResult
  isSelected: boolean
  isFocused: boolean
  isLoading: boolean
  onOpen: (result: SearchResult) => void
}

const FIELD_LABELS: Record<string, { icon: string; label: string }> = {
  phone: { icon: "phone", label: "Phone" },
  address: { icon: "pin", label: "Address" },
  hours: { icon: "clock", label: "Hours" },
  email: { icon: "mail", label: "Email" },
  price: { icon: "tag", label: "Price" },
  rating: { icon: "star", label: "Rating" },
}

export default function ResultCard({ result, isSelected, isFocused, isLoading, onOpen }: Props) {
  const snippetEntries = Object.entries(result.snippetInfo ?? {}).filter(
    ([, v]) => v && v.length > 0
  )
  const snippetAria = snippetEntries.length > 0
    ? ". " + snippetEntries.map(([k, v]) => `${FIELD_LABELS[k]?.label ?? k}: ${v}`).join(". ")
    : ""

  return (
    <article
      className={`result-card ${isSelected ? "result-card--selected" : ""} ${isFocused ? "result-card--focused" : ""}`}
      aria-label={`Result ${result.id}: ${result.title}. ${result.type}${result.source ? ` from ${result.source}` : ""}. ${result.description || ""}${snippetAria}`}
      onClick={() => !isLoading && onOpen(result)}
    >
      <div className="result-card__meta">
        <span className="result-card__id" aria-hidden="true">#{result.id}</span>
        <span className="result-card__type">{result.type}</span>
        {result.source && (
          <span className="result-card__source">{result.source}</span>
        )}
      </div>
      <h3 className="result-card__title">{result.title}</h3>
      {result.description && (
        <p className="result-card__desc">{result.description}</p>
      )}

      {snippetEntries.length > 0 && (
        <div className="result-card__snippets" aria-label="Quick info">
          {snippetEntries.slice(0, 4).map(([key, value]) => {
            const meta = FIELD_LABELS[key]
            return (
              <span key={key} className="result-card__snippet-tag">
                <FieldIcon type={meta?.icon ?? "info"} />
                <span className="result-card__snippet-value">{value}</span>
              </span>
            )
          })}
        </div>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); onOpen(result) }}
        disabled={isLoading}
        className="result-card__btn"
        aria-label={`Open ${result.title}`}
        tabIndex={-1}
      >
        {isLoading && isSelected ? (
          <span className="result-card__btn-loading" role="status">Opening...</span>
        ) : (
          <>
            Open
            <ArrowIcon />
          </>
        )}
      </button>
    </article>
  )
}

function FieldIcon({ type }: { type: string }) {
  const size = 11
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.5, "aria-hidden": true as const }

  switch (type) {
    case "phone":
      return <svg {...props}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.29h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.75a16 16 0 0 0 6 6l1.27-.9a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2z" /></svg>
    case "pin":
      return <svg {...props}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
    case "clock":
      return <svg {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
    case "mail":
      return <svg {...props}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
    case "tag":
      return <svg {...props}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
    case "star":
      return <svg {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
    default:
      return <svg {...props}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
  }
}

function ArrowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  )
}
