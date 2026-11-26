/**
 * Wayfinder - Canonical Error Mapping Layer
 *
 * Owner: Aryanand (Interaction & State Management Layer)
 * Task: R7 — Error Mapping
 *
 * Centralized, pure error mapping module mapping technical failures to
 * user-understandable, non-technical error categories and recoverable actions
 * for the UI and Feedback layer (Saurabh / Anshul) per the Wayfinder PRD.
 */

import type { DestinationSuggestion } from "./wayfinder-api.ts";

export type WayfinderErrorCode =
  | "unknown_site"
  | "no_speech"
  | "mic_denied"
  | "engine_unreachable"
  | "offline"
  | "nav_failed";

export type WayfinderRecoveryAction =
  | "retry"
  | "speak"
  | "type"
  | "none";

export interface ErrorInfo {
  code: WayfinderErrorCode;
  category: string;
  message: string;
  action: WayfinderRecoveryAction;
  suggestions?: DestinationSuggestion[];
}

export interface ErrorMappingOptions {
  suggestions?: DestinationSuggestion[];
  diagnostic?: string;
}

/**
 * Exact canonical mapping specification per Wayfinder PRD (R7, S4, S6).
 * Answers: What happened? What can I do now?
 */
export const CANONICAL_ERROR_MAPPINGS: Record<
  WayfinderErrorCode,
  { category: string; message: string; action: WayfinderRecoveryAction }
> = {
  unknown_site: {
    category: "Unknown site",
    message: "I couldn't find a website for that. Try another destination or pick from below.",
    action: "type",
  },
  no_speech: {
    category: "Silence",
    message: "I didn't hear anything. Tap to speak again or type instead.",
    action: "speak",
  },
  mic_denied: {
    category: "Microphone blocked",
    message: "Microphone access is blocked. You can type your request below.",
    action: "type",
  },
  engine_unreachable: {
    category: "Backend unavailable",
    message: "Wayfinder can't reach its engine. Give it a moment, then try again.",
    action: "retry",
  },
  offline: {
    category: "Offline / network failure",
    message: "You seem to be offline. Check your internet connection and try again.",
    action: "retry",
  },
  nav_failed: {
    category: "Navigation failed",
    message: "We couldn't open the destination. Please try again.",
    action: "retry",
  },
};

/**
 * Pure mapping function producing a clean, user-facing ErrorInfo object.
 * Guaranteed never to leak technical stack traces, HTTP status codes, or raw exceptions.
 */
export function createErrorInfo(
  code: WayfinderErrorCode,
  options?: ErrorMappingOptions
): ErrorInfo {
  const mapping = CANONICAL_ERROR_MAPPINGS[code] || CANONICAL_ERROR_MAPPINGS.engine_unreachable;
  return {
    code,
    category: mapping.category,
    message: mapping.message,
    action: mapping.action,
    suggestions: options?.suggestions ? [...options.suggestions] : undefined,
  };
}

/**
 * Safe, SSR-friendly check to determine if the client environment is explicitly offline.
 * Never throws in Node.js or SSR environments without window/navigator.
 */
export function isClientOffline(): boolean {
  if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
    return navigator.onLine === false;
  }
  return false;
}
