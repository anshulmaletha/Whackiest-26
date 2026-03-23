import type { SiteData } from "@/types"

const cache = new Map<string, SiteData>()

export function getCachedSite(url: string): SiteData | null {
  return cache.get(url) ?? null
}

export function setCachedSite(url: string, data: SiteData): void {
  cache.set(url, data)
}

export function hasCachedSite(url: string): boolean {
  return cache.has(url)
}
