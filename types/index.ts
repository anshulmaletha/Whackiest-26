export type SearchResult = {
  id: string
  title: string
  url: string
  description: string
  type: string
  source?: string
}

export type SearchContext = {
  intent: "search" | "open" | "ask" | "ignore"
  query: string
  category: string
  extractFields: string[]
}

export type SiteData = {
  siteName: string
  summary: string
  keyInfo: Record<string, string>
  headings?: string[]
  links?: { text: string; href: string }[]
  extractedText?: string
}

export type TranscriptItem = {
  role: "user" | "assistant"
  text: string
  timestamp?: number
}
