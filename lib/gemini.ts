import { GoogleGenAI } from "@google/genai"
import type { SearchContext } from "@/types"

const apiKey = process.env.GEMINI_API_KEY ?? ""
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null
const MODEL = "gemini-2.0-flash"

/**
 * Step 1: Process raw voice input into a structured intent.
 * Single call — classifies, refines query, determines what data to extract.
 */
export async function processVoice(
  speech: string,
  hasResults: boolean,
  hasSiteOpen: boolean
): Promise<SearchContext> {
  const fallback: SearchContext = {
    intent: "search",
    query: speech.trim(),
    category: "general",
    extractFields: ["summary", "headings", "links"],
  }

  if (!ai || !speech.trim()) return { ...fallback, intent: speech.trim() ? "search" : "ignore" }

  try {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: `Voice command → JSON. No explanation.

"${speech.replace(/"/g, "'")}"
State: ${hasResults ? "results visible" : "no results"}${hasSiteOpen ? ", site open" : ""}

{"intent":"search|open|ask|ignore","query":"keyword query","category":"restaurant|shopping|services|news|entertainment|travel|health|education|tech|finance|government|reference|general","extractFields":["field1","field2"]}

intent: search=web lookup, open=click a result, ask=question about open site, ignore=greeting/thanks/filler
query: drop filler words, convert to search keywords ("get food in LA"→"restaurants in LA"), keep location+specifics
extractFields by category: restaurant→phone,address,hours,menu,price_range,cuisine,rating | shopping→price,specs,reviews,availability | services→phone,address,hours,services,email,pricing | news→headline,date,author,summary | tech→specs,price,reviews,release_date | travel→location,price,dates,amenities,rating | health→phone,address,hours,specialties | education→programs,tuition,contact | finance→rates,fees,contact | government→address,hours,phone,services | reference→summary,key_facts | general→summary,headings,links

JSON:`,
    })

    const text = res.text?.trim() ?? ""
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return fallback

    const parsed = JSON.parse(jsonMatch[0])
    return {
      intent: ["search", "open", "ask", "ignore"].includes(parsed.intent) ? parsed.intent : "search",
      query: typeof parsed.query === "string" && parsed.query.length > 0 ? parsed.query : speech.trim(),
      category: typeof parsed.category === "string" ? parsed.category : "general",
      extractFields: Array.isArray(parsed.extractFields) ? parsed.extractFields : fallback.extractFields,
    }
  } catch (e) {
    console.error("[gemini] processVoice error:", e)
    return fallback
  }
}

/**
 * Step 2: Smart extraction from a scraped page, guided by search context.
 * Returns structured key-value pairs relevant to the user's query.
 */
export async function extractSite(
  markdown: string,
  url: string,
  context: SearchContext
): Promise<{
  siteName: string
  summary: string
  keyInfo: Record<string, string>
  headings: string[]
  links: { text: string; href: string }[]
}> {
  const hostname = safeHostname(url)
  const fallback = {
    siteName: hostname,
    summary: markdown.slice(0, 200).replace(/[#*_`\[\]()]/g, "").trim() || "No description.",
    keyInfo: {},
    headings: extractHeadingsBasic(markdown),
    links: extractLinksBasic(markdown),
  }

  if (!ai || !markdown.trim()) return fallback

  const trimmed = markdown.slice(0, 6000)

  try {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: `Extract data from webpage → JSON. No prose.

URL: ${url} | Query: "${context.query}" | Category: ${context.category}
Extract: ${context.extractFields.join(",")}

${trimmed}

{"siteName":"short name","summary":"1 sentence, plain text","keyInfo":{"field":"value"}}

Only fields from Extract list that exist on page. Values: plain text, <80 chars, no markdown/URLs. Omit empty fields.
JSON:`,
    })

    const text = res.text?.trim() ?? ""
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return fallback

    const parsed = JSON.parse(jsonMatch[0])
    return {
      siteName: typeof parsed.siteName === "string" ? parsed.siteName : hostname,
      summary: typeof parsed.summary === "string" ? parsed.summary : fallback.summary,
      keyInfo: typeof parsed.keyInfo === "object" && parsed.keyInfo !== null ? parsed.keyInfo : {},
      headings: extractHeadingsBasic(markdown),
      links: extractLinksBasic(markdown),
    }
  } catch (e) {
    console.error("[gemini] extractSite error:", e)
    return fallback
  }
}

/**
 * Step 3: Answer a question about the currently open page.
 */
export async function answerQuestion(
  question: string,
  pageText: string,
  siteName: string,
  keyInfo: Record<string, string>
): Promise<string> {
  if (!ai) return ""

  const keyInfoStr = Object.entries(keyInfo)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")

  try {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: `Answer for blind user. Max 1 sentence. Data only, zero filler.

Site: ${siteName}
${keyInfoStr ? `Info:\n${keyInfoStr}\n` : ""}
Page: ${pageText.slice(0, 2500)}

Q: ${question}

If in Info→use it. If in Page→use it. Otherwise→"Not found on this page." Phone numbers→digit by digit.
A:`,
    })
    return res.text?.trim() || "Not found on this page."
  } catch (e) {
    console.error("[gemini] answerQuestion error:", e)
    return "Not found on this page."
  }
}

/**
 * Pick which result to open from voice command.
 */
export async function resolveOpenTarget(
  speech: string,
  results: Array<{ id: string; title: string }>
): Promise<string> {
  if (!ai || results.length === 0) return results[0]?.id ?? "1"

  try {
    const list = results.map((r, i) => `${i + 1}. ${r.title}`).join("\n")
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: `User wants to open a search result. Return ONLY the number (1-${results.length}).

Results:
${list}

User said: "${speech.replace(/"/g, "'")}"
Number:`,
    })
    const num = parseInt(res.text?.trim() ?? "")
    if (num >= 1 && num <= results.length) return results[num - 1].id
    return results[0].id
  } catch {
    return results[0].id
  }
}

function safeHostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "") } catch { return url }
}

function extractHeadingsBasic(md: string): string[] {
  const headings: string[] = []
  for (const line of md.split("\n")) {
    const m = line.match(/^#{1,3}\s+(.+)$/)
    if (m && m[1].length > 2 && m[1].length < 100) {
      headings.push(m[1].replace(/[*_`\[\]()]/g, "").trim())
      if (headings.length >= 10) break
    }
  }
  return headings
}

function extractLinksBasic(md: string): { text: string; href: string }[] {
  const links: { text: string; href: string }[] = []
  const re = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(md)) !== null) {
    const text = m[1].trim()
    if (text.length > 2 && text.length < 80) {
      links.push({ text, href: m[2] })
      if (links.length >= 12) break
    }
  }
  return links
}
