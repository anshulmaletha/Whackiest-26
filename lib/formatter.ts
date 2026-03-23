import type { SearchResult, SiteData } from "@/types"

export function formatSearchResults(
  raw: Array<{ url?: string; title?: string; description?: string; markdown?: string }>,
  query: string
): SearchResult[] {
  return raw
    .filter((r) => r.url)
    .map((r, i) => {
      let source: string | undefined
      try {
        source = new URL(r.url!).hostname.replace(/^www\./, "")
      } catch {
        source = undefined
      }

      const combined = `${r.url} ${r.title ?? ""} ${r.description ?? ""}`.toLowerCase()
      let type = "Website"
      if (/news|article|blog|press|journal|opinion|editorial/i.test(combined)) type = "Article"
      else if (/wiki|encyclopedia|reference/i.test(combined)) type = "Reference"
      else if (/shop|store|buy|product|ecommerce|price|cart/i.test(combined)) type = "Store"
      else if (/video|youtube|vimeo|watch/i.test(combined)) type = "Video"
      else if (/\.gov|government|municipality|ministry/i.test(combined)) type = "Government"
      else if (/restaurant|cafe|food|pizza|sushi|grill/i.test(combined)) type = "Restaurant"
      else if (/clinic|doctor|hospital|medical|dental|health/i.test(combined)) type = "Health"
      else if (/school|university|course|learn|education|academy/i.test(combined)) type = "Education"
      else if (/forum|reddit|community|discussion/i.test(combined)) type = "Forum"
      else if (/plumb|electric|repair|handyman|contractor/i.test(combined)) type = "Service"

      return {
        id: String(i + 1),
        title: r.title ?? source ?? r.url!,
        url: r.url!,
        description: r.description ?? r.markdown?.slice(0, 160) ?? "",
        type,
        source,
      }
    })
    .slice(0, 5)
}

export function answerFromSiteContext(
  question: string,
  ctx: SiteData
): string {
  const q = question.toLowerCase()

  if (/phone|number|call|telephone|contact number/.test(q)) {
    if (ctx.phone) return `The phone number is ${ctx.phone}.`
    if (ctx.contactLinks?.some((l) => l.startsWith("tel:"))) {
      const tel = ctx.contactLinks.find((l) => l.startsWith("tel:"))!
      return `You can call: ${tel.replace("tel:", "")}`
    }
    return "I couldn't find a phone number on this page."
  }

  if (/address|location|where|directions/.test(q)) {
    if (ctx.address) return `The address is: ${ctx.address}.`
    return "I couldn't find an address on this page."
  }

  if (/hours|open|closing|time|schedule/.test(q)) {
    if (ctx.hours) return `Opening hours: ${ctx.hours}.`
    return "I couldn't find opening hours on this page."
  }

  if (/service|offer|do they|what do|what's available|provide/.test(q)) {
    if (ctx.services && ctx.services.length > 0) {
      return `Services found: ${ctx.services.join(", ")}.`
    }
    return "I couldn't identify specific services on this page."
  }

  if (/email|mail/.test(q)) {
    if (ctx.email) return `The email address is ${ctx.email}.`
    if (ctx.contactLinks?.some((l) => l.startsWith("mailto:"))) {
      const mail = ctx.contactLinks.find((l) => l.startsWith("mailto:"))!
      return `Email: ${mail.replace("mailto:", "")}`
    }
    return "I couldn't find an email address on this page."
  }

  if (/heading|section|table of content|navigation|structure|outline/.test(q)) {
    if (ctx.headings && ctx.headings.length > 0) {
      return `Page sections: ${ctx.headings.join(", ")}.`
    }
    return "I couldn't identify clear sections on this page."
  }

  if (/link|navigate|go to|click|href/.test(q)) {
    if (ctx.links && ctx.links.length > 0) {
      const top = ctx.links.slice(0, 5)
      return `Links on this page: ${top.map((l) => l.text).join(", ")}.`
    }
    return "I couldn't find notable links on this page."
  }

  if (/explain|what is|what does|about|summary|describe|summarize|main content|what.*page/.test(q)) {
    return ctx.summary
  }

  // Fallback: keyword search in extractedText + summary
  const haystack = `${ctx.summary} ${ctx.extractedText ?? ""}`.toLowerCase()
  const words = question.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  const found = words.some((w) => haystack.includes(w))

  if (found) {
    // Extract the most relevant 2 sentences around the keyword
    const sentences = haystack.split(/[.!?]+/).filter((s) => s.trim().length > 10)
    const relevant = sentences.find((s) => words.some((w) => s.includes(w)))
    if (relevant) {
      return relevant.trim().charAt(0).toUpperCase() + relevant.trim().slice(1) + "."
    }
    return `Based on this page: ${ctx.summary}`
  }

  return "I don't have enough information from this page to answer that question."
}
