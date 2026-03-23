// Strong indicators — a single match is enough to flag as blocked
const STRONG_BLOCKED = [
  "verify you are human",
  "checking your browser",
  "captcha",
  "you have been blocked",
  "access denied",
  "403 forbidden",
  "access to this page has been denied",
  "complete the security check",
  "human verification",
  "ddos protection",
  "pardon our interruption",
]

// Weak indicators — need 2+ matches or combined with low content
const BLOCKED_PHRASES = [
  "please enable javascript",
  "enable js",
  "disable any ad blocker",
  "disable your ad blocker",
  "are you a robot",
  "just a moment",
  "attention required",
  "security check",
  "bot protection",
  "automated access",
  "unusual traffic",
  "please verify",
  "one more step",
  "ray id",
  "incapsula",
  "sucuri",
  "blocked by",
  "please turn javascript on",
  "browser check",
]

// Only truly unscrape-able social/auth-wall sites — NOT shopping/booking/directories
const SOCIAL_WALLS = [
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "pinterest.com",
  "tiktok.com",
]

const PREFERRED_DOMAINS = [
  "wikipedia.org",
  "wikimedia.org",
  "github.com",
  "docs.google.com",
  "medium.com",
  "dev.to",
  "stackoverflow.com",
  "bbc.com",
  "bbc.co.uk",
  "reuters.com",
  "apnews.com",
  "nytimes.com",
  "theguardian.com",
  "allrecipes.com",
  "healthline.com",
  "webmd.com",
  "investopedia.com",
  "tripadvisor.com",
]

export function isBlockedPage(content: string): boolean {
  if (!content || content.length < 50) return true

  const lower = content.toLowerCase()
  const alphaCount = (lower.match(/[a-z]/g) || []).length
  if (alphaCount < 100) return true

  for (const phrase of STRONG_BLOCKED) {
    if (lower.includes(phrase)) return true
  }

  let weakCount = 0
  for (const phrase of BLOCKED_PHRASES) {
    if (lower.includes(phrase)) weakCount++
    if (weakCount >= 2) return true
  }

  const lineCount = content.split("\n").filter((l) => l.trim().length > 10).length
  if (lineCount < 5 && weakCount >= 1) return true

  return false
}

export function isSocialWall(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "")
    return SOCIAL_WALLS.some((d) => hostname === d || hostname.endsWith(`.${d}`))
  } catch {
    return false
  }
}

export function isPreferredDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "")
    return PREFERRED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))
  } catch {
    return false
  }
}

export function domainScore(url: string): number {
  if (isSocialWall(url)) return -30
  if (isPreferredDomain(url)) return 25
  return 0
}

// Keep old name for backward compatibility but use new logic
export function isBlacklistedDomain(url: string): boolean {
  return isSocialWall(url)
}
