"use client"

import type { SearchResult } from "@/types"

interface Props {
  result: SearchResult
  isSelected: boolean
  isLoading: boolean
  onOpen: (result: SearchResult) => void
}

export default function ResultCard({ result, isSelected, isLoading, onOpen }: Props) {
  return (
    <article
      className={`result-card ${isSelected ? "result-card--selected" : ""}`}
      aria-selected={isSelected}
    >
      <div className="result-card__meta">
        <span className="result-card__id">#{result.id}</span>
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
        onClick={() => onOpen(result)}
        disabled={isLoading}
        className="result-card__btn"
        aria-label={`Open ${result.title}`}
      >
        {isLoading && isSelected ? (
          <span className="result-card__btn-loading">Opening…</span>
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
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  )
}
