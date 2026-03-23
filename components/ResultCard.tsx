"use client"

import type { SearchResult } from "@/types"

interface Props {
  result: SearchResult
  isSelected: boolean
  isFocused: boolean
  isLoading: boolean
  onOpen: (result: SearchResult) => void
}

export default function ResultCard({ result, isSelected, isFocused, isLoading, onOpen }: Props) {
  return (
    <article
      className={`result-card ${isSelected ? "result-card--selected" : ""} ${isFocused ? "result-card--focused" : ""}`}
      aria-label={`Result ${result.id}: ${result.title}. ${result.type}${result.source ? ` from ${result.source}` : ""}. ${result.description || ""}`}
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
      <button
        onClick={(e) => { e.stopPropagation(); onOpen(result) }}
        disabled={isLoading}
        className="result-card__btn"
        aria-label={`Open ${result.title}`}
        tabIndex={-1}
      >
        {isLoading && isSelected ? (
          <span className="result-card__btn-loading" role="status">Opening…</span>
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

function ArrowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  )
}
