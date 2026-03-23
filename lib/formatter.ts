import type { SearchResult } from "@/types"
import { isBlacklistedDomain, domainScore } from "@/lib/blocked"
import { extractFromSnippet, snippetInfoToRecord, hasUsefulInfo } from "@/lib/snippet-extract"

const OFFICIAL_TLDS = /\.(gov|org|edu|ac|mil|int)\b/i
const FORUM_DOMAINS = /forum|community|discuss|stackexchange|quora/i
const AGGREGATOR_DOMAINS = /yelp\.com|yellowpages|bbb\.org|manta\.com|mapquest|superpages|hotfrog|cylex|foursquare|kompass/i

function isOfficialSite(url: string, query: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "")
    const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    return queryWords.some((w) => hostname.includes(w.replace(/[^a-z]/g, "")))
  } catch {
    return false
  }
}

function detectPageType(combined: string): string {
  if (/news|article|blog|press|journal|breaking/i.test(combined)) return "Article"
  if (/wiki|encyclopedia|reference/i.test(combined)) return "Reference"
  if (/shop|store|buy|product|price|cart|order/i.test(combined)) return "Store"
  if (/video|youtube|vimeo|watch/i.test(combined)) return "Video"
  if (/\.gov|government/i.test(combined)) return "Government"
  if (/restaurant|cafe|food|pizza|menu|cuisine|dine|eat/i.test(combined)) return "Restaurant"
  if (/clinic|doctor|hospital|medical|health|dentist|therapy/i.test(combined)) return "Health"
  if (/school|university|course|education|college|tuition/i.test(combined)) return "Education"
  if (/forum|reddit|community/i.test(combined)) return "Forum"
  if (/plumb|electric|hvac|repair|contractor|roofing|cleaning|moving/i.test(combined)) return "Service"
  if (/hotel|travel|flight|booking|resort|tour/i.test(combined)) return "Travel"
  return "Website"
}

function scoreResult(
  r: { url?: string; title?: string; description?: string },
  query: string,
  snippetInfo: Record<string, string>
): number {
  let score = 0
  const url = (r.url ?? "").toLowerCase()
  const text = `${r.title ?? ""} ${r.description ?? ""}`.toLowerCase()

  score += domainScore(url)

  // Official site bonus — hostname matches a query keyword
  if (isOfficialSite(url, query)) score += 40

  // TLD bonuses
  if (OFFICIAL_TLDS.test(url)) score += 30

  // Penalize aggregators/directories when there's a direct result
  if (AGGREGATOR_DOMAINS.test(url)) score -= 20

  // Forums are rarely task-useful
  if (FORUM_DOMAINS.test(url)) score -= 15

  // Contact info in snippet = actionable
  const infoCount = Object.keys(snippetInfo).length
  score += infoCount * 12

  // Specific useful signals
  if (/phone|call|contact|tel:/i.test(text)) score += 10
  if (/address|location|directions/i.test(text)) score += 8
  if (/hours|open|schedule/i.test(text)) score += 8
  if (/about|who we are|our team|our services/i.test(text)) score += 5

  // Penalize ads/spam
  if (/sponsored|ad\b|affiliate/i.test(text)) score -= 15

  // Geographic match — query mentions a city, result title mentions same city
  const geoMatch = query.match(/\b(new york|los angeles|chicago|houston|phoenix|philadelphia|san antonio|san diego|dallas|san jose|austin|miami|seattle|boston|denver|portland|las vegas|nashville|atlanta|detroit|minneapolis|cleveland|pittsburgh|tampa|baltimore|oakland|sacramento|san francisco|haifa|tel aviv|jerusalem)\b/i)
  if (geoMatch && text.includes(geoMatch[1].toLowerCase())) score += 15

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

      const combined = `${r.url} ${r.title ?? ""} ${r.description ?? ""}`
      const type = detectPageType(combined)

      const snippetText = `${r.title ?? ""} ${r.description ?? ""} ${r.markdown?.slice(0, 3000) ?? ""}`
      const snippetInfo = snippetInfoToRecord(extractFromSnippet(snippetText))

      return {
        id: "",
        title: r.title ?? source ?? r.url!,
        url: r.url!,
        description: r.description ?? r.markdown?.slice(0, 160) ?? "",
        type,
        source,
        snippetInfo,
        _score: scoreResult(r, query, snippetInfo),
        _hasInfo: hasUsefulInfo(extractFromSnippet(snippetText)),
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
    snippetInfo: Object.keys(r.snippetInfo).length > 0 ? r.snippetInfo : undefined,
  }))
}
