import type { SearchResult } from "@/types"
import { isBlacklistedDomain, domainScore } from "@/lib/blocked"

const OFFICIAL_TLDS = /\.(gov|org|edu|ac|mil|int)\b/i
const FORUM_DOMAINS = /forum|community|discuss|stackexchange|quora/i

function scoreResult(r: { url?: string; title?: string; description?: string }): number {
  let score = 0
  const url = (r.url ?? "").toLowerCase()
  const text = `${r.title ?? ""} ${r.description ?? ""}`.toLowerCase()

  score += domainScore(url)

  if (OFFICIAL_TLDS.test(url)) score += 30
  if (FORUM_DOMAINS.test(url)) score -= 15
  if (/phone|call|contact|address|hours|location|email|tel:/i.test(text)) score += 15
  if (/about|who we are|our team|our services/i.test(text)) score += 10
  if (/sponsored|ad\b|affiliate/i.test(text)) score -= 10

  return score
}

export function formatSearchResults(
  raw: Array<{ url?: string; title?: string; description?: string; markdown?: string }>,
  query: string
): SearchResult[] {
  const mapped = raw
    .filter((r) => r.url && !isBlacklistedDomain(r.url))
    .map((r) => {
      let source: string | undefined
      try { source = new URL(r.url!).hostname.replace(/^www\./, "") } catch { source = undefined }

      const combined = `${r.url} ${r.title ?? ""} ${r.description ?? ""}`.toLowerCase()
      let type = "Website"
      if (/news|article|blog|press|journal/i.test(combined)) type = "Article"
      else if (/wiki|encyclopedia|reference/i.test(combined)) type = "Reference"
      else if (/shop|store|buy|product|price|cart/i.test(combined)) type = "Store"
      else if (/video|youtube|vimeo|watch/i.test(combined)) type = "Video"
      else if (/\.gov|government/i.test(combined)) type = "Government"
      else if (/restaurant|cafe|food|pizza/i.test(combined)) type = "Restaurant"
      else if (/clinic|doctor|hospital|medical/i.test(combined)) type = "Health"
      else if (/school|university|course|education/i.test(combined)) type = "Education"
      else if (/forum|reddit|community/i.test(combined)) type = "Forum"

      return {
        id: "",
        title: r.title ?? source ?? r.url!,
        url: r.url!,
        description: r.description ?? r.markdown?.slice(0, 160) ?? "",
        type,
        source,
        _score: scoreResult(r),
      }
    })

  mapped.sort((a, b) => b._score - a._score)

  return mapped.slice(0, 5).map((r, i) => ({
    id: String(i + 1),
    title: r.title,
    url: r.url,
    description: r.description,
    type: r.type,
    source: r.source,
  }))
}
