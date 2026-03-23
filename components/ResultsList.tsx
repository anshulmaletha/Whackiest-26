"use client"

import { useRef, useEffect, useCallback } from "react"
import type { SearchResult } from "@/types"
import ResultCard from "./ResultCard"

interface Props {
  results: SearchResult[]
  selectedResultId: string | null
  isLoadingSite: boolean
  onOpen: (result: SearchResult) => void
  focusedIndex: number
  onFocusedIndexChange: (index: number) => void
  isSearching?: boolean
}

export default function ResultsList({
  results,
  selectedResultId,
  isLoadingSite,
  onOpen,
  focusedIndex,
  onFocusedIndexChange,
  isSearching,
}: Props) {
  const listRef = useRef<HTMLUListElement>(null)
  const itemRefs = useRef<(HTMLLIElement | null)[]>([])

  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < results.length) {
      itemRefs.current[focusedIndex]?.focus()
    }
  }, [focusedIndex, results.length])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (results.length === 0) return

      switch (e.key) {
        case "ArrowDown":
        case "j": {
          e.preventDefault()
          const next = Math.min(focusedIndex + 1, results.length - 1)
          onFocusedIndexChange(next)
          break
        }
        case "ArrowUp":
        case "k": {
          e.preventDefault()
          const prev = Math.max(focusedIndex - 1, 0)
          onFocusedIndexChange(prev)
          break
        }
        case "Enter":
        case " ": {
          e.preventDefault()
          if (focusedIndex >= 0 && focusedIndex < results.length) {
            onOpen(results[focusedIndex])
          }
          break
        }
        case "Home": {
          e.preventDefault()
          onFocusedIndexChange(0)
          break
        }
        case "End": {
          e.preventDefault()
          onFocusedIndexChange(results.length - 1)
          break
        }
      }
    },
    [focusedIndex, results, onOpen, onFocusedIndexChange]
  )

  if (isSearching) {
    return (
      <div className="results-loading" role="status">
        <div className="results-loading__spinner" aria-hidden="true" />
        <span>Searching the web...</span>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="results-empty" role="status">
        <span className="results-empty__title">Search anything</span>
        <p>A website, a business, a topic, a question — Navia helps you search, understand, and use any website by voice.</p>
      </div>
    )
  }

  return (
    <ul
      ref={listRef}
      className="results-list"
      role="listbox"
      aria-label={`${results.length} results. Arrow keys to navigate, Enter to open.`}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {results.map((result, i) => (
        <li
          key={result.id}
          ref={(el) => { itemRefs.current[i] = el }}
          role="option"
          aria-selected={selectedResultId === result.id}
          tabIndex={focusedIndex === i ? 0 : -1}
          className={`results-list__item ${focusedIndex === i ? "results-list__item--focused" : ""}`}
        >
          <ResultCard
            result={result}
            isSelected={selectedResultId === result.id}
            isFocused={focusedIndex === i}
            isLoading={isLoadingSite && selectedResultId === result.id}
            onOpen={onOpen}
          />
        </li>
      ))}
    </ul>
  )
}
