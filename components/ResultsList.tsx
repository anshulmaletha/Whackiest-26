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
}

export default function ResultsList({
  results,
  selectedResultId,
  isLoadingSite,
  onOpen,
  focusedIndex,
  onFocusedIndexChange,
}: Props) {
  const listRef = useRef<HTMLUListElement>(null)
  const itemRefs = useRef<(HTMLLIElement | null)[]>([])

  // Focus the item when focusedIndex changes
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

  if (results.length === 0) {
    return (
      <div className="results-empty" role="status">
        <span>No results yet.</span>
        <p>Search for anything — a website, a topic, a business, a question. Use the search bar above or press the mic button.</p>
      </div>
    )
  }

  return (
    <ul
      ref={listRef}
      className="results-list"
      role="listbox"
      aria-label={`${results.length} search results. Use arrow keys to navigate, Enter to open.`}
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
