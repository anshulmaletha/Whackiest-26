"use client"

import { FormEvent, useRef } from "react"

interface Props {
  query: string
  onChange: (v: string) => void
  onSearch: (q: string) => void
  isLoading: boolean
  isListening: boolean
  onMicClick: () => void
}

export default function SearchBar({
  query,
  onChange,
  onSearch,
  isLoading,
  isListening,
  onMicClick,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (query.trim()) onSearch(query.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="search-bar">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder='Try: "Find a plumber in Tel Aviv"'
        className="search-input"
        aria-label="Search query"
        disabled={isLoading}
      />
      <div className="search-actions">
        <button
          type="button"
          onClick={onMicClick}
          className={`mic-btn ${isListening ? "mic-btn--active" : ""}`}
          aria-label={isListening ? "Stop listening" : "Start voice search"}
        >
          <MicIcon active={isListening} />
        </button>
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="search-btn"
          aria-label="Search"
        >
          {isLoading ? <SpinnerIcon /> : "Search"}
        </button>
      </div>
    </form>
  )
}

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
      {active && <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1" opacity="0.3" />}
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}
