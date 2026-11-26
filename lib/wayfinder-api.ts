/**
 * Wayfinder - API Client & Mock/Real Layer
 *
 * Owner: Aryanand (Interaction & State Management Layer)
 * Task: R1 — Mock API
 *
 * Central configuration point controlling whether Wayfinder operates
 * against the deterministic in-memory mock or the real FastAPI backend.
 *
 * Contracts match the Wayfinder Master Execution PRD and backend/wayfinder_routes.py.
 */

// ══════════════════════════════════════════════════════════════
// 1. Exact TypeScript Interfaces
// ══════════════════════════════════════════════════════════════

export interface WayfinderDestination {
  id: string;
  label: string;
  host: string;
}

export interface DestinationSuggestion {
  id: string;
  label: string;
}

export interface ResolveRequest {
  utterance: string;
  source: "voice" | "text";
}

export interface ResolveResponse {
  status: "matched" | "suggest" | "unmatched";
  heard: string;
  destination: WayfinderDestination | null;
  suggestions: DestinationSuggestion[];
}

export interface OpenRequest {
  destinationId: string;
}

export interface OpenResponse {
  status: "opened" | "failed";
  destination: WayfinderDestination | null;
  elapsedMs: number;
  error?: string;
}

export interface HealthResponse {
  ok: boolean;
}

export class WayfinderTimeoutError extends Error {
  public readonly code = "timeout";
  public readonly endpoint: string;
  public readonly timeoutMs: number;

  constructor(endpoint: string, timeoutMs: number) {
    super(`Request to ${endpoint} timed out after ${timeoutMs}ms`);
    this.name = "WayfinderTimeoutError";
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
  }
}

// ══════════════════════════════════════════════════════════════
// 2. Centralized MOCK / REAL Configuration Switch
// ══════════════════════════════════════════════════════════════

function normalizeBackendUrl(url: string): string {
  return (url || "http://localhost:8000").trim().replace(/\/+$/, "");
}

/**
 * Single central configuration point for the entire application.
 * Private to this module — other modules must only use
 * setWayfinderMockMode() and isWayfinderMockMode().
 */
const WAYFINDER_CONFIG = {
  // In-memory mock is the default; set to false (or NEXT_PUBLIC_WAYFINDER_MOCK="false") for real backend
  mock: typeof process !== "undefined" && process.env?.NEXT_PUBLIC_WAYFINDER_MOCK === "false" ? false : true,
  backendUrl: normalizeBackendUrl((typeof process !== "undefined" && process.env?.NEXT_PUBLIC_WAYFINDER_BACKEND_URL) || "http://localhost:8000"),
};

export function setWayfinderMockMode(enabled: boolean): void {
  WAYFINDER_CONFIG.mock = enabled;
}

export function isWayfinderMockMode(): boolean {
  return WAYFINDER_CONFIG.mock;
}

export function setWayfinderBackendUrl(url: string): void {
  WAYFINDER_CONFIG.backendUrl = normalizeBackendUrl(url);
}

// ══════════════════════════════════════════════════════════════
// 3. Deterministic Mock Registry (Strictly No Raw URLs)
// ══════════════════════════════════════════════════════════════

const MOCK_DESTINATIONS: Record<string, WayfinderDestination> = {
  amazon: {
    id: "amazon",
    label: "Amazon",
    host: "www.amazon.in",
  },
  orion_mall: {
    id: "orion_mall",
    label: "Orion Mall",
    host: "www.orionmalls.com",
  },
};

// Prefixes stripped during utterance normalization, matching backend/wayfinder_nav.py
const FILLER_PREFIXES = [
  "please ",
  "can you ",
  "take me to ",
  "navigate to ",
  "go to ",
  "open ",
  "visit ",
  "launch ",
];

function normalizeUtterance(text: string): string {
  let cleaned = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of FILLER_PREFIXES) {
      if (cleaned.startsWith(prefix)) {
        cleaned = cleaned.slice(prefix.length).trim();
        changed = true;
      }
    }
  }
  return cleaned;
}

// ══════════════════════════════════════════════════════════════
// 4. Configurable Mock Open Failure Test Harness
// ══════════════════════════════════════════════════════════════

interface MockOpenFailureOptions {
  shouldFail: boolean;
  destination?: WayfinderDestination | null;
  error?: string;
  elapsedMs?: number;
}

let mockFailureConfig: MockOpenFailureOptions = {
  shouldFail: false,
};

/**
 * Configure deterministic mock open failures for unit testing,
 * error state verification, and UI drills without launching a browser.
 */
export function configureMockOpenFailure(options: MockOpenFailureOptions): void {
  mockFailureConfig = { ...options };
}

export function resetMockOpenFailure(): void {
  mockFailureConfig = { shouldFail: false };
}

// ══════════════════════════════════════════════════════════════
// 5. In-Memory Mock Implementations
// ══════════════════════════════════════════════════════════════

export async function mockCheckHealth(): Promise<HealthResponse> {
  return { ok: true };
}

export async function mockResolveDestination(req: ResolveRequest): Promise<ResolveResponse> {
  const normalized = normalizeUtterance(req.utterance || "");

  // Scenario 1: Matched Amazon
  if (normalized === "amazon" || normalized.includes("amazon")) {
    return {
      status: "matched",
      heard: req.utterance,
      destination: MOCK_DESTINATIONS.amazon,
      suggestions: [],
    };
  }

  // Scenario 2: Matched Orion Mall
  if (
    normalized === "orion mall" ||
    normalized === "orion" ||
    normalized.includes("orion mall") ||
    normalized.includes("orion")
  ) {
    return {
      status: "matched",
      heard: req.utterance,
      destination: MOCK_DESTINATIONS.orion_mall,
      suggestions: [],
    };
  }

  // Near miss / suggestion trigger (PRD B5 / R1)
  if (normalized.includes("amzon") || normalized.includes("amzn")) {
    return {
      status: "suggest",
      heard: req.utterance,
      destination: null,
      suggestions: [{ id: "amazon", label: "Amazon" }],
    };
  }

  // Scenario 3: Unknown Utterance Unmatched
  return {
    status: "unmatched",
    heard: req.utterance,
    destination: null,
    suggestions: [],
  };
}

export async function mockOpenDestination(req: OpenRequest): Promise<OpenResponse> {
  const { destinationId } = req;

  // Scenario 4A: Configured programmatic failure or in-band test trigger
  const isTriggeredFailure =
    mockFailureConfig.shouldFail ||
    destinationId === "fail" ||
    destinationId.startsWith("fail_");

  if (isTriggeredFailure) {
    const baseId = destinationId.replace(/^fail_/, "");
    const dest =
      mockFailureConfig.destination !== undefined
        ? mockFailureConfig.destination
        : (MOCK_DESTINATIONS[baseId] || MOCK_DESTINATIONS.amazon);

    return {
      status: "failed",
      destination: dest,
      elapsedMs: mockFailureConfig.elapsedMs ?? 15000,
      error: mockFailureConfig.error ?? "Navigation timed out after 15 seconds",
    };
  }

  // Scenario 4B: Unregistered destination ID (preserves backend's actual semantics: destination is null)
  const dest = MOCK_DESTINATIONS[destinationId];
  if (!dest) {
    return {
      status: "failed",
      destination: null,
      elapsedMs: 0,
      error: `Unknown destination ID: ${destinationId}`,
    };
  }

  // Scenario: Successful Open
  return {
    status: "opened",
    destination: dest,
    elapsedMs: 120,
  };
}

// ══════════════════════════════════════════════════════════════
// 6. Real API Implementations (Bhargav's Endpoints)
// ══════════════════════════════════════════════════════════════

interface RequestBackendOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

/**
 * Robust HTTP client helper with:
 * - Trailing slash URL normalization (prevents double slashes)
 * - Configurable request timeout with descriptive WayfinderTimeoutError
 * - Structured HTTP error detail extraction (FastAPI detail, message, error)
 * - Safe JSON parsing (protects against empty and malformed non-JSON responses)
 */
async function requestBackend<T>(endpoint: string, options: RequestBackendOptions = {}): Promise<T> {
  const baseUrl = normalizeBackendUrl(WAYFINDER_CONFIG.backendUrl);
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${cleanEndpoint}`;
  const timeoutMs = options.timeoutMs ?? 5000;

  let timer: any = null;
  const controller = new AbortController();

  let signal: AbortSignal;
  let didTimeout = false;

  const hasSignalTimeout = typeof AbortSignal !== "undefined" && typeof (AbortSignal as any).timeout === "function";
  if (hasSignalTimeout) {
    signal = (AbortSignal as any).timeout(timeoutMs);
  } else {
    signal = controller.signal;
    timer = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers,
      body: options.body,
      signal,
    });
  } catch (err: any) {
    const isTimeout =
      didTimeout ||
      err?.name === "TimeoutError" ||
      (err?.name === "AbortError" && didTimeout) ||
      (err instanceof Error && err.message.toLowerCase().includes("timed out"));

    if (isTimeout) {
      throw new WayfinderTimeoutError(cleanEndpoint, timeoutMs);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }

  // Handle HTTP error status (res.ok is false)
  if (!res.ok) {
    let detailMessage = "";
    try {
      const rawText = await res.text();
      if (rawText && rawText.trim()) {
        try {
          const parsed = JSON.parse(rawText);
          if (parsed && typeof parsed === "object") {
            if (typeof parsed.detail === "string") {
              detailMessage = parsed.detail;
            } else if (Array.isArray(parsed.detail)) {
              detailMessage = parsed.detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ");
            } else if (typeof parsed.message === "string") {
              detailMessage = parsed.message;
            } else if (typeof parsed.error === "string") {
              detailMessage = parsed.error;
            }
          }
        } catch {
          if (rawText.length < 200 && !rawText.includes("<html")) {
            detailMessage = rawText.trim();
          }
        }
      }
    } catch {
      // Fallback if response text cannot be retrieved
    }

    const statusDesc = res.statusText ? `${res.status} ${res.statusText}` : `${res.status}`;
    const errMessage = detailMessage
      ? `HTTP ${statusDesc} from ${cleanEndpoint}: ${detailMessage}`
      : `HTTP ${statusDesc} from ${cleanEndpoint}`;
    throw new Error(errMessage);
  }

  // Safe JSON parsing: handle empty or malformed non-JSON responses
  let text = "";
  try {
    text = await res.text();
  } catch (err: any) {
    throw new Error(`Failed to read response body from ${cleanEndpoint}: ${err.message}`);
  }

  if (!text || !text.trim()) {
    throw new Error(`Empty response received from ${cleanEndpoint}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch (err: any) {
    throw new Error(`Malformed JSON response received from ${cleanEndpoint}: ${err.message}`);
  }
}

async function realCheckHealth(): Promise<HealthResponse> {
  return requestBackend<HealthResponse>("/api/health", {
    method: "GET",
    timeoutMs: 5000,
  });
}

async function realResolveDestination(req: ResolveRequest): Promise<ResolveResponse> {
  return requestBackend<ResolveResponse>("/api/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      utterance: req.utterance,
      source: req.source,
    }),
    timeoutMs: 5000,
  });
}

async function realOpenDestination(req: OpenRequest): Promise<OpenResponse> {
  return requestBackend<OpenResponse>("/api/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      destinationId: req.destinationId,
    }),
    timeoutMs: 15000,
  });
}

// ══════════════════════════════════════════════════════════════
// 7. Unified Public API Client Functions
// ══════════════════════════════════════════════════════════════

/**
 * Health check: GET /api/health
 * Returns { ok: true }
 */
export async function checkHealth(): Promise<HealthResponse> {
  return WAYFINDER_CONFIG.mock ? mockCheckHealth() : realCheckHealth();
}

/**
 * Resolve utterance to destination: POST /api/resolve
 */
export async function resolveDestination(req: ResolveRequest): Promise<ResolveResponse> {
  return WAYFINDER_CONFIG.mock ? mockResolveDestination(req) : realResolveDestination(req);
}

/**
 * Open resolved destination: POST /api/open
 */
export async function openDestination(req: OpenRequest): Promise<OpenResponse> {
  return WAYFINDER_CONFIG.mock ? mockOpenDestination(req) : realOpenDestination(req);
}
