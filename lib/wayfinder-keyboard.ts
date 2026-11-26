/**
 * Wayfinder - Keyboard Controls Layer
 *
 * Owner: Aryanand (Interaction & State Management Layer)
 * Task: R6 — Keyboard Controls
 *
 * Manages global keyboard shortcuts (Space, Enter, Escape) per the Wayfinder PRD.
 * Connects directly to existing R2/R3 public dispatchers, respects editable element
 * focus, prevents unwanted page scroll, and manages listener lifecycle safely.
 */

import {
  getWayfinderState,
  getStarted as defaultGetStarted,
  confirm as defaultConfirm,
  cancel as defaultCancel,
  retry as defaultRetry,
  goSomewhereElse as defaultGoSomewhereElse,
  type WayfinderState,
} from "./wayfinder-state.ts";
import {
  startListening as defaultSpeechStartListening,
  getSpeechSnapshot,
} from "./wayfinder-speech.ts";

// ══════════════════════════════════════════════════════════════
// 1. Interfaces & Types
// ══════════════════════════════════════════════════════════════

export interface KeyboardDependencies {
  getState?: () => WayfinderState;
  getStarted?: () => void;
  startListening?: () => boolean | void;
  confirm?: () => Promise<void> | void;
  cancel?: () => void;
  retry?: () => void;
  goSomewhereElse?: () => void;
}

export interface AttachKeyboardOptions extends KeyboardDependencies {
  target?: EventTarget | Window;
}

// ══════════════════════════════════════════════════════════════
// 2. Editable Element Detection
// ══════════════════════════════════════════════════════════════

/**
 * Checks whether an event target is an interactive editable element
 * (e.g. input field, textarea, select box, or contentEditable element).
 * Keyboard shortcuts must not hijack keys when user is typing in these fields.
 */
export function isEditableElement(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as any;
  if (!el || typeof el !== "object") return false;

  const tagName = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  if (el.isContentEditable === true) {
    return true;
  }
  return false;
}

// ══════════════════════════════════════════════════════════════
// 3. Event Processing Logic
// ══════════════════════════════════════════════════════════════

/**
 * Evaluates a keyboard event against current application state and dispatches
 * the appropriate state-machine or speech action.
 *
 * Returns true if the event was handled and action taken, false otherwise.
 */
export function handleKeyboardEvent(
  event: KeyboardEvent,
  deps: KeyboardDependencies = {}
): boolean {
  if (!event) return false;

  const target = event.target;
  const inEditable = isEditableElement(target);

  // 1. Space Key — Start microphone listening
  if (event.code === "Space") {
    // Must ignore when focused on input/textarea/editable
    if (inEditable) {
      return false;
    }

    // Ignore repeated keydown events while held down
    if (event.repeat) {
      return false;
    }

    // Call preventDefault() outside editable elements to stop page scrolling
    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    // Only allow starting speech if current state is READY
    const currentState = deps.getState ? deps.getState() : getWayfinderState().state;
    if (currentState !== "READY") {
      return false;
    }

    // Never create duplicate speech sessions
    if (getSpeechSnapshot().listening) {
      return false;
    }

    const startSpeech = deps.startListening || defaultSpeechStartListening;
    startSpeech();
    return true;
  }

  // 2. Enter Key — Primary state action
  if (event.key === "Enter") {
    // Ignore Enter when an editable element is focused so text forms submit naturally
    if (inEditable) {
      return false;
    }

    const currentState = deps.getState ? deps.getState() : getWayfinderState().state;

    if (currentState === "INITIAL") {
      if (typeof event.preventDefault === "function") event.preventDefault();
      (deps.getStarted || defaultGetStarted)();
      return true;
    }

    if (currentState === "CONFIRMATION") {
      if (typeof event.preventDefault === "function") event.preventDefault();
      (deps.confirm || defaultConfirm)();
      return true;
    }

    if (currentState === "ERROR") {
      if (typeof event.preventDefault === "function") event.preventDefault();
      (deps.retry || defaultRetry)();
      return true;
    }

    if (currentState === "SUCCESS") {
      if (typeof event.preventDefault === "function") event.preventDefault();
      (deps.goSomewhereElse || defaultGoSomewhereElse)();
      return true;
    }

    return false;
  }

  // 3. Escape Key — Cancel / Back out
  if (event.key === "Escape") {
    const currentState = deps.getState ? deps.getState() : getWayfinderState().state;

    // Only cancel in states where cancellation is applicable
    if (
      currentState === "LISTENING" ||
      currentState === "PROCESSING" ||
      currentState === "CONFIRMATION"
    ) {
      if (typeof event.preventDefault === "function") event.preventDefault();
      (deps.cancel || defaultCancel)();
      return true;
    }

    return false;
  }

  return false;
}

// ══════════════════════════════════════════════════════════════
// 4. Lifecycle & Listener Attachment
// ══════════════════════════════════════════════════════════════

/**
 * Attaches a single keydown event listener to the window or specified target.
 * SSR-safe (no-ops cleanly when window is undefined).
 *
 * Returns a cleanup function that removes the exact listener.
 */
export function attachKeyboardListeners(
  targetOrOptions?: EventTarget | Window | AttachKeyboardOptions,
  optionalDeps?: KeyboardDependencies
): () => void {
  let target: EventTarget | Window | undefined;
  let deps: KeyboardDependencies = {};

  if (targetOrOptions && typeof (targetOrOptions as any).addEventListener === "function") {
    target = targetOrOptions as EventTarget | Window;
    deps = optionalDeps || {};
  } else if (targetOrOptions && typeof targetOrOptions === "object") {
    const opts = targetOrOptions as AttachKeyboardOptions;
    target = opts.target;
    deps = { ...opts };
  } else {
    deps = optionalDeps || {};
  }

  // SSR-safe window detection
  if (!target) {
    if (typeof window !== "undefined") {
      target = window;
    } else if (typeof globalThis !== "undefined" && typeof (globalThis as any).addEventListener === "function") {
      target = globalThis as any;
    }
  }

  if (!target || typeof target.addEventListener !== "function") {
    // Non-browser or SSR environment: return safe no-op cleanup
    return () => {};
  }

  const listener = (event: Event) => {
    handleKeyboardEvent(event as KeyboardEvent, deps);
  };

  target.addEventListener("keydown", listener);

  return () => {
    target?.removeEventListener("keydown", listener);
  };
}
