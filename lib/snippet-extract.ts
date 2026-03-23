/**
 * Extract useful info (phone, address, hours, email, price, rating) from
 * search result content. Works on full markdown (3000+ chars) for deep extraction.
 */

// Phone — US, international, with/without country code
const PHONE_RE = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g
// tel: links (common in scraped HTML-turned-markdown)
const TEL_RE = /tel:\+?([\d\-().]+)/g

// Email
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

// Hours — "Mon-Fri 9am-5pm", "Open daily 10:00–22:00", "Sunday: Closed", "24/7"
const HOURS_PATTERNS = [
  /(?:mon|tue|wed|thu|fri|sat|sun|daily|weekday|weekend)[a-z]*(?:\s*[-–—]\s*(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*)?\s*[:]?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m|p\.m)?[\s]*[-–—]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m|p\.m)?/gi,
  /open\s+(?:daily|24\/7|24 hours|every day)[^.]{0,40}/gi,
  /hours?\s*[:]?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–—]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi,
  /\b24\s*\/\s*7\b/gi,
]

// Address — street number + name + city pattern
const ADDRESS_PATTERNS = [
  /\d+\s+[\w\s]+(?:st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|way|ct|court|pl|place|hwy|highway)[.,]?\s*(?:(?:suite|ste|apt|#|unit)\s*[\w]+)?\s*[,.]?\s*[A-Z][a-z]+(?:[\s,]+[A-Z]{2})?\s*(?:\d{5}(?:-\d{4})?)?/gi,
  /\d+\s+[\w\s]{4,40}[,]\s*[A-Z][a-z]+[,]?\s*[A-Z]{2}\s*\d{5}/g,
]

// Price — "$15", "$15-$30", "$$", "from $25"
const PRICE_PATTERNS = [
  /\$\d+(?:\.\d{2})?(?:\s*[-–—]\s*\$\d+(?:\.\d{2})?)?/g,
  /\b(?:from|starting at)\s*\$\d+/gi,
  /\${2,4}/g,
]

// Rating — "4.5/5", "4.5 stars", "4.5 out of 5", "★ 4.5"
const RATING_RE = /(?:(\d(?:\.\d)?)\s*(?:\/\s*5|stars?|out of 5)|★+\s*(\d(?:\.\d)?))/gi

export type SnippetInfo = {
  phone?: string
  email?: string
  address?: string
  hours?: string
  price?: string
  rating?: string
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    re.lastIndex = 0
    const m = re.exec(text)
    if (m) return m[0].trim()
  }
  return undefined
}

function cleanPhone(raw: string): string {
  return raw.replace(/[^\d+\-() ]/g, "").trim()
}

export function extractFromSnippet(text: string): SnippetInfo {
  const info: SnippetInfo = {}
  if (!text) return info

  // Phone — try tel: links first (highest confidence), then regex
  TEL_RE.lastIndex = 0
  const telMatch = TEL_RE.exec(text)
  if (telMatch) {
    const digits = telMatch[1].replace(/[^0-9]/g, "")
    if (digits.length >= 7) info.phone = cleanPhone(telMatch[1])
  }
  if (!info.phone) {
    const phones = text.match(PHONE_RE)
    if (phones) {
      const candidate = phones.find((p) => p.replace(/[^0-9]/g, "").length >= 7)
      if (candidate) info.phone = cleanPhone(candidate)
    }
  }

  const emails = text.match(EMAIL_RE)
  if (emails) info.email = emails[0]

  const hours = firstMatch(text, HOURS_PATTERNS)
  if (hours && hours.length > 3) info.hours = hours.slice(0, 80)

  const address = firstMatch(text, ADDRESS_PATTERNS)
  if (address && address.length > 8) info.address = address.replace(/\s+/g, " ").slice(0, 100)

  const price = firstMatch(text, PRICE_PATTERNS)
  if (price) info.price = price

  RATING_RE.lastIndex = 0
  const ratingMatch = RATING_RE.exec(text)
  if (ratingMatch) {
    const val = ratingMatch[1] || ratingMatch[2]
    if (val) info.rating = `${val}/5`
  }

  return info
}

export function hasUsefulInfo(info: SnippetInfo): boolean {
  return Object.values(info).some((v) => !!v)
}

export function snippetInfoToRecord(info: SnippetInfo): Record<string, string> {
  const record: Record<string, string> = {}
  for (const [k, v] of Object.entries(info)) {
    if (v) record[k] = v
  }
  return record
}

/** Count of useful fields extracted */
export function infoFieldCount(info: Record<string, string>): number {
  return Object.keys(info).length
}
