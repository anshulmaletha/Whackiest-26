"use client"

import type { SearchResult } from "@/types"
import ResultCard from "./ResultCard"

interface Props {
  results: SearchResult[]
  selectedResultId: string | null
  isLoadingSite: boolean
  onOpen: (result: SearchResult) => void
}

export default function ResultsList({
  results,
  selectedResultId,
  isLoadingSite,
  onOpen,
}: Props) {
  if (results.length === 0) {
    return (
      <div className="results-empty">
        <span>No results yet.</span>
        <p>Type a query above or press the mic button to search by voice.</p>
      </div>
    )
  }

  return (
    <ul className="results-list" role="list" aria-label="Search results">
      {results.map((result) => (
        <li key={result.id}>
          <ResultCard
            result={result}
            isSelected={selectedResultId === result.id}
            isLoading={isLoadingSite && selectedResultId === result.id}
            onOpen={onOpen}
          />
        </li>
      ))}
    </ul>
  )
}
