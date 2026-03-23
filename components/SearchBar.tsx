"use client"

import { FormEvent, useRef, useEffect } from "react"

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

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (query.trim()) onSearch(query.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="search-bar" role="search" aria-label="Web search">
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search the web or ask anything..."
        className="search-input"
        aria-label="Search the web — type a query and press Enter, or use the mic button"
        autoComplete="off"
        disabled={isLoading}
      />
      <div className="search-actions" role="group" aria-label="Search controls">
        <button
          type="button"
          onClick={onMicClick}
          className={`mic-btn ${isListening ? "mic-btn--active" : ""}`}
          aria-label={isListening ? "Voice active — press to stop" : "Start voice search"}
          aria-pressed={isListening}
        >
          <MicIcon />
        </button>
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="search-btn"
          aria-label={isLoading ? "Searching..." : "Search"}
        >
          {isLoading ? <SpinnerIcon /> : "Search"}
        </button>
      </div>
    </form>
  )
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}
