export type SearchResult = {
  id: string
  title: string
  url: string
  description: string
  type: string
  source?: string
}

export type SiteData = {
  siteName: string
  summary: string
  phone?: string
  address?: string
  hours?: string
  email?: string
  services?: string[]
  contactLinks?: string[]
  extractedText?: string
}

export type TranscriptItem = {
  role: "user" | "assistant"
  text: string
}

export type AppState = {
  query: string
  results: SearchResult[]
  selectedResult: SearchResult | null
  selectedResultId: string | null
  currentSite: SiteData | null
  transcript: TranscriptItem[]
  isListening: boolean
  isSpeaking: boolean
  isLoadingResults: boolean
  isLoadingSite: boolean
}
