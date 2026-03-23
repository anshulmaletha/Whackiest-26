# Navia — Voice-First Web Access

A voice-first web assistant for blind and visually impaired users. Search the web, understand websites, and extract critical information — all by voice.

## What it does

- User speaks a query (or types it)
- ElevenLabs AI agent manages the conversation
- Firecrawl searches and scrapes the web
- The server extracts phone, address, hours, services from any page
- ElevenLabs reads the answer back

## Demo flows

1. **Search** — "Find a plumber in Tel Aviv" → 5 results read aloud
2. **Open** — "Open the first one" → site summary + extracted info
3. **Ask** — "What's the phone number?" → direct spoken answer

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- `@elevenlabs/react` — conversational voice AI
- `@mendable/firecrawl-js` — web search + scrape
- No database, no auth, no LLM — regex + heuristics extraction

## Project structure

```
app/
  page.tsx              # Main UI (single page)
  layout.tsx
  api/
    search/route.ts     # POST /api/search
    site/route.ts       # POST /api/site
    ask/route.ts        # POST /api/ask
components/
  SearchBar.tsx
  ResultsList.tsx
  ResultCard.tsx
  SitePanel.tsx
  TranscriptPanel.tsx
  QuickActions.tsx
lib/
  firecrawl.ts          # Firecrawl client wrapper
  extractor.ts          # Regex + heuristics extraction
  formatter.ts          # JSON shaping + ask keyword matcher
types/
  index.ts              # SearchResult, SiteData, TranscriptItem
```

## Setup

1. Clone and install:
   ```bash
   npm install
   ```

2. Copy `.env.local.example` to `.env.local` and fill in your keys:
   ```
   FIRECRAWL_API_KEY=your_key
   ELEVENLABS_API_KEY=your_key
   NEXT_PUBLIC_ELEVENLABS_AGENT_ID=your_agent_id
   ```

3. Run:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000)

## ElevenLabs agent setup

In your ElevenLabs dashboard, create a Conversational AI agent with this system prompt:

```
You are Navia, a voice-first web assistant for blind and visually impaired users.

Your job is to help users search the web, understand websites, and extract important information such as phone numbers, addresses, opening hours, and services.

Always speak clearly, briefly, and helpfully.
Prioritize practical guidance over long explanations.
When search results are returned, read them in a simple structured way.
When a website is opened, explain what the site does and what important information is available.
When the user asks for a phone number, address, or service, answer directly if the information is available.
If something is unclear, say so simply.
```

Add 3 client tools:

**search_web** — `{ query: string }` — searches the web
**open_result** — `{ result_id?: string; url?: string }` — opens a result
**ask_site** — `{ question: string }` — answers a question about the open site

## Keys you need

- [Firecrawl API key](https://firecrawl.dev)
- [ElevenLabs API key + Agent ID](https://elevenlabs.io/conversational-ai)
