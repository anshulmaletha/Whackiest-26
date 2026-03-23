import type { SiteData } from "@/types"

// Israeli + international phone patterns
const PHONE_REGEX =
  /(?:(?:\+972|972|0)[-\s]?)(?:[23489][-\s]?\d{7}|5\d[-\s]?\d{6})|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g

// Address heuristics: look for numbered street addresses or known keywords
const ADDRESS_REGEX =
  /\d{1,5}\s+[\w\s]{3,40}(?:street|st|avenue|ave|road|rd|blvd|boulevard|lane|ln|drive|dr|way|court|ct|רחוב|כתובת)[^,\n]*/gi

const HOURS_REGEX =
  /(?:hours?|open(?:ing)?|closing|times?|שעות|פתוח|סגור)[:\s]*([^\n.]{5,80})/gi

const SERVICES_KEYWORDS = [
  "service",
  "services",
  "we offer",
  "we provide",
  "specializ",
  "שירות",
  "שירותים",
  "מציעים",
]

const CONTACT_HREF_REGEX = /href="((?:tel:|mailto:|\/contact[^"]*)[^"]*)"/gi

function extractPhone(text: string): string | undefined {
  const matches = text.match(PHONE_REGEX)
  return matches?.[0]?.trim()
}

function extractEmail(text: string): string | undefined {
  const matches = text.match(EMAIL_REGEX)
  return matches?.[0]?.trim()
}

function extractAddress(text: string): string | undefined {
  const matches = text.match(ADDRESS_REGEX)
  return matches?.[0]?.trim()
}

function extractHours(text: string): string | undefined {
  const match = HOURS_REGEX.exec(text)
  HOURS_REGEX.lastIndex = 0
  return match?.[1]?.trim()
}

function extractServices(text: string): string[] {
  const lines = text.split(/\n|•|·|–|-/)
  const results: string[] = []

  let inServicesSection = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const isServicesHeader = SERVICES_KEYWORDS.some((kw) =>
      trimmed.toLowerCase().includes(kw)
    )

    if (isServicesHeader) {
      inServicesSection = true
      continue
    }

    if (inServicesSection && trimmed.length > 3 && trimmed.length < 80) {
      results.push(trimmed)
      if (results.length >= 6) break
    }

    // Reset section if we hit a new section header (all caps line or long line)
    if (inServicesSection && (trimmed.length > 100 || trimmed === trimmed.toUpperCase())) {
      inServicesSection = false
    }
  }

  return results
}

function extractContactLinks(html: string): string[] {
  const links: string[] = []
  let match: RegExpExecArray | null

  CONTACT_HREF_REGEX.lastIndex = 0
  while ((match = CONTACT_HREF_REGEX.exec(html)) !== null) {
    links.push(match[1])
  }

  return [...new Set(links)].slice(0, 5)
}

function extractSiteName(markdown: string, url: string): string {
  // Try first H1
  const h1Match = markdown.match(/^#\s+(.+)$/m)
  if (h1Match) return h1Match[1].trim()

  // Fall back to hostname
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "")
    return hostname
  } catch {
    return url
  }
}

const NOISE_REGEX =
  /cookie|consent|privacy policy|gdpr|accept|we use cookies|by continuing|clicking agree|terms of use|subscribe to our|newsletter|sign up for|javascript|enable js/i

function buildSummary(markdown: string): string {
  const lines = markdown.split("\n")
  for (const line of lines) {
    const trimmed = line.replace(/^#+\s*/, "").trim()
    if (
      trimmed.length > 60 &&
      !NOISE_REGEX.test(trimmed) &&
      !trimmed.startsWith("!") &&
      !trimmed.startsWith("[")
    ) {
      return trimmed.slice(0, 300)
    }
  }
  // All lines were noise — return best non-noise paragraph from first 2000 chars
  const cleaned = markdown
    .split("\n")
    .filter((l) => !NOISE_REGEX.test(l) && l.trim().length > 20)
    .join(" ")
  return cleaned.slice(0, 300).trim() || "No description available."
}

function buildExtractedText(markdown: string): string {
  return markdown
    .split("\n")
    .filter((l) => !NOISE_REGEX.test(l))
    .join("\n")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/[*_`~]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 3000)
    .trim()
}

export function extractSiteData(
  markdown: string,
  html: string,
  url: string
): SiteData {
  const extractedText = buildExtractedText(markdown)

  return {
    siteName: extractSiteName(markdown, url),
    summary: buildSummary(markdown),
    phone: extractPhone(extractedText),
    email: extractEmail(extractedText),
    address: extractAddress(extractedText),
    hours: extractHours(extractedText),
    services: extractServices(extractedText),
    contactLinks: extractContactLinks(html),
    extractedText,
  }
}
