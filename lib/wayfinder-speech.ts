/**
 * Wayfinder - Speech Recognition Layer
 *
 * Owner: Aryanand (Interaction & State Management Layer)
 * Task: R3 — Speech Recognition
 *
 * Implements browser-native Web Speech API speech recognition for Chrome.
 * Manages tap-to-talk, interim and final transcript streaming, ~8-second silence
 * timeout, permission error handling, and clean dispatches to R2 state machine.
 */

import {
  startListening as r2StartListening,
  onFinalTranscript as r2OnFinalTranscript,
  onSilenceTimeout as r2OnSilenceTimeout,
  onMicrophoneDenied as r2OnMicrophoneDenied,
  registerSpeechCancellationHandler,
} from "./wayfinder-state.ts";

// ══════════════════════════════════════════════════════════════
// 1. Interfaces & Types
// ══════════════════════════════════════════════════════════════

export type SpeechErrorCode =
  | "unsupported"
  | "mic_denied"
  | "not_allowed"
  | "no_speech"
  | "network"
  | "audio_capture"
  | "aborted"
  | "unknown";

export interface SpeechErrorInfo {
  code: SpeechErrorCode;
  message: string;
}

export interface WayfinderSpeechSnapshot {
  listening: boolean;
  interimTranscript: string;
  finalTranscript: string;
  error: SpeechErrorInfo | null;
  isSupported: boolean;
  fallbackToText: boolean;
}

export interface SpeechIntegrationCallbacks {
  onListeningStarted?: () => void;
  onFinalTranscript?: (transcript: string) => Promise<void> | void;
  onSilenceTimeout?: () => void;
  onMicrophoneDenied?: () => void;
  onFallbackToText?: () => void;
}

export interface StartListeningOptions {
  callbacks?: SpeechIntegrationCallbacks;
  timeoutMs?: number;
  lang?: string;
}

export type SpeechListener = (snapshot: WayfinderSpeechSnapshot) => void;

// ══════════════════════════════════════════════════════════════
// 2. Browser Feature Detection
// ══════════════════════════════════════════════════════════════

type SpeechRecognitionConstructor = new () => any;

function getSpeechRecognitionClass(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") {
    // Check if globalThis has SpeechRecognition or webkitSpeechRecognition (e.g. Node tests/mock)
    if (typeof globalThis !== "undefined") {
      const g = globalThis as any;
      return g.SpeechRecognition || g.webkitSpeechRecognition || null;
    }
    return null;
  }
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionClass() !== null;
}

// ══════════════════════════════════════════════════════════════
// 3. WayfinderSpeechController Class
// ══════════════════════════════════════════════════════════════

const DEFAULT_TIMEOUT_MS = 8000; // ~8-second silence timeout per PRD

export class WayfinderSpeechController {
  private recognition: any = null;
  private listening = false;
  private interimTranscript = "";
  private finalTranscript = "";
  private error: SpeechErrorInfo | null = null;
  private fallbackToText = false;

  // Session & concurrency management
  private currentSessionToken = 0;
  private timeoutTimer: any = null;
  private hasDispatchedToR2 = false;
  private hasDispatchedStarted = false;

  // Callbacks & listeners
  private activeCallbacks: SpeechIntegrationCallbacks = {};
  private listeners: Set<SpeechListener> = new Set();

  constructor() {}

  public getSnapshot(): WayfinderSpeechSnapshot {
    return {
      listening: this.listening,
      interimTranscript: this.interimTranscript,
      finalTranscript: this.finalTranscript,
      error: this.error ? { ...this.error } : null,
      isSupported: isSpeechRecognitionSupported(),
      fallbackToText: this.fallbackToText,
    };
  }

  public isFallbackToText(): boolean {
    return this.fallbackToText;
  }

  public resetState(): void {
    this.stopListening();
    this.interimTranscript = "";
    this.finalTranscript = "";
    this.error = null;
    this.fallbackToText = false;
    this.notify();
  }

  public subscribe(listener: SpeechListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error("[WayfinderSpeech] Listener error:", err);
      }
    }
  }

  private clearTimer(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  /**
   * Resets and starts the ~8-second silence timeout.
   */
  private startSilenceTimer(timeoutMs: number, sessionToken: number): void {
    this.clearTimer();
    this.timeoutTimer = setTimeout(() => {
      if (sessionToken !== this.currentSessionToken || !this.listening) return;

      this.fallbackToText = true;
      this.error = {
        code: "no_speech",
        message: "I didn't hear anything. Tap to speak again or type instead.",
      };
      this.stopListeningInternal(sessionToken);

      const fallbackCb = this.activeCallbacks.onFallbackToText;
      if (fallbackCb) {
        try {
          fallbackCb();
        } catch (err) {
          console.error("[WayfinderSpeech] onFallbackToText error:", err);
        }
      }

      // Dispatch silence timeout to R2 exactly once
      if (!this.hasDispatchedToR2) {
        this.hasDispatchedToR2 = true;
        const cb = this.activeCallbacks.onSilenceTimeout || r2OnSilenceTimeout;
        try {
          cb();
        } catch (err) {
          console.error("[WayfinderSpeech] onSilenceTimeout error:", err);
        }
      }
      this.notify();
    }, timeoutMs);
  }

  /**
   * Starts a speech recognition session on explicit user action (tap-to-talk).
   * Prevents multiple simultaneous sessions.
   */
  public startListening(options: StartListeningOptions = {}): boolean {
    // 1. Prevent simultaneous sessions
    if (this.listening) {
      return false;
    }

    // 2. Feature detection
    const SpeechClass = getSpeechRecognitionClass();
    if (!SpeechClass) {
      this.fallbackToText = true;
      this.error = {
        code: "unsupported",
        message: "Web Speech API is not supported in this environment.",
      };
      this.listening = false;
      this.notify();

      // Trigger automatic text fallback callback if provided
      const fallbackCb = options.callbacks?.onFallbackToText;
      if (fallbackCb) {
        try {
          fallbackCb();
        } catch (err) {
          console.error("[WayfinderSpeech] onFallbackToText error:", err);
        }
      }

      // Trigger R2 text fallback transition
      const cb = options.callbacks?.onMicrophoneDenied || r2OnMicrophoneDenied;
      try {
        cb();
      } catch (err) {
        console.error("[WayfinderSpeech] onMicrophoneDenied error:", err);
      }
      return false;
    }

    // 3. Reset session state
    const sessionToken = ++this.currentSessionToken;
    this.listening = true;
    this.interimTranscript = "";
    this.finalTranscript = "";
    this.error = null;
    this.fallbackToText = false;
    this.hasDispatchedToR2 = false;
    this.hasDispatchedStarted = false;
    this.activeCallbacks = options.callbacks || {};

    const timeoutDuration = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    try {
      this.recognition = new SpeechClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = options.lang || "en-US";
      this.recognition.maxAlternatives = 1;

      // Recognition Started: always dispatch to R2 and trigger optional callback independently
      this.recognition.onstart = () => {
        if (sessionToken !== this.currentSessionToken) return;
        this.listening = true;
        if (!this.hasDispatchedStarted) {
          this.hasDispatchedStarted = true;

          // 1. Always invoke R2's startListening dispatcher
          try {
            r2StartListening();
          } catch (err) {
            console.error("[WayfinderSpeech] R2 startListening error:", err);
          }

          // 2. Separately invoke optional custom onListeningStarted callback
          if (this.activeCallbacks.onListeningStarted) {
            try {
              this.activeCallbacks.onListeningStarted();
            } catch (err) {
              console.error("[WayfinderSpeech] onListeningStarted error:", err);
            }
          }
        }
        this.notify();
      };

      // Results received (interim & final transcripts)
      this.recognition.onresult = (event: any) => {
        if (sessionToken !== this.currentSessionToken || !this.listening) return;

        let accumulatedInterim = "";
        let accumulatedFinal = "";

        const results = event.results;
        for (let i = 0; i < results.length; ++i) {
          const res = results[i];
          if (res.isFinal) {
            accumulatedFinal += res[0].transcript;
          } else {
            accumulatedInterim += res[0].transcript;
          }
        }

        const trimmedFinal = accumulatedFinal.trim();
        const trimmedInterim = accumulatedInterim.trim();

        if (trimmedInterim) {
          this.interimTranscript = trimmedInterim;
          // Refresh silence timer when speech activity is observed
          this.startSilenceTimer(timeoutDuration, sessionToken);
          this.notify();
        }

        // On final transcript
        if (trimmedFinal) {
          this.finalTranscript = trimmedFinal;
          this.interimTranscript = "";
          this.clearTimer();
          this.stopListeningInternal(sessionToken);

          if (!this.hasDispatchedToR2) {
            this.hasDispatchedToR2 = true;
            const cb = this.activeCallbacks.onFinalTranscript || r2OnFinalTranscript;
            try {
              cb(trimmedFinal);
            } catch (err) {
              console.error("[WayfinderSpeech] onFinalTranscript error:", err);
            }
          }
          this.notify();
        }
      };

      // Error handling
      this.recognition.onerror = (event: any) => {
        if (sessionToken !== this.currentSessionToken) return;

        const errType: string = event.error || "unknown";

        if (errType === "not-allowed" || errType === "service-not-allowed") {
          this.fallbackToText = true;
          this.error = {
            code: "mic_denied",
            message: "Microphone access is blocked. You can type your request below.",
          };
          this.stopListeningInternal(sessionToken);

          const fallbackCb = this.activeCallbacks.onFallbackToText;
          if (fallbackCb) {
            try {
              fallbackCb();
            } catch (err) {
              console.error("[WayfinderSpeech] onFallbackToText error:", err);
            }
          }

          if (!this.hasDispatchedToR2) {
            this.hasDispatchedToR2 = true;
            const cb = this.activeCallbacks.onMicrophoneDenied || r2OnMicrophoneDenied;
            try {
              cb();
            } catch (err) {
              console.error("[WayfinderSpeech] onMicrophoneDenied error:", err);
            }
          }
        } else if (errType === "no-speech") {
          this.fallbackToText = true;
          this.error = {
            code: "no_speech",
            message: "I didn't hear anything. Tap to speak again or type instead.",
          };
          this.stopListeningInternal(sessionToken);

          const fallbackCb = this.activeCallbacks.onFallbackToText;
          if (fallbackCb) {
            try {
              fallbackCb();
            } catch (err) {
              console.error("[WayfinderSpeech] onFallbackToText error:", err);
            }
          }

          if (!this.hasDispatchedToR2) {
            this.hasDispatchedToR2 = true;
            const cb = this.activeCallbacks.onSilenceTimeout || r2OnSilenceTimeout;
            try {
              cb();
            } catch (err) {
              console.error("[WayfinderSpeech] onSilenceTimeout error:", err);
            }
          }
        } else if (errType === "network") {
          this.error = {
            code: "network",
            message: "Network error during speech recognition.",
          };
          this.stopListeningInternal(sessionToken);
        } else if (errType === "audio-capture") {
          this.fallbackToText = true;
          this.error = {
            code: "mic_denied",
            message: "Microphone access is blocked. You can type your request below.",
          };
          this.stopListeningInternal(sessionToken);

          const fallbackCb = this.activeCallbacks.onFallbackToText;
          if (fallbackCb) {
            try {
              fallbackCb();
            } catch (err) {
              console.error("[WayfinderSpeech] onFallbackToText error:", err);
            }
          }

          if (!this.hasDispatchedToR2) {
            this.hasDispatchedToR2 = true;
            const cb = this.activeCallbacks.onMicrophoneDenied || r2OnMicrophoneDenied;
            try {
              cb();
            } catch (err) {
              console.error("[WayfinderSpeech] onMicrophoneDenied error:", err);
            }
          }
        } else if (errType !== "aborted") {
          this.error = {
            code: "unknown",
            message: `Speech recognition error: ${errType}`,
          };
          this.stopListeningInternal(sessionToken);
        }

        this.notify();
      };

      // Recognition Ended
      this.recognition.onend = () => {
        if (sessionToken !== this.currentSessionToken) return;
        this.listening = false;
        this.clearTimer();
        this.notify();
      };

      // Start Recognition & Silence Timer
      this.recognition.start();
      this.startSilenceTimer(timeoutDuration, sessionToken);
      this.notify();
      return true;
    } catch (err: any) {
      this.error = {
        code: "unknown",
        message: err instanceof Error ? err.message : "Failed to start speech recognition",
      };
      this.listening = false;
      this.clearTimer();
      this.notify();
      return false;
    }
  }

  /**
   * Stops the active recognition session and cleans up timers and callbacks.
   */
  public stopListening(): void {
    this.currentSessionToken++; // Invalidate pending session
    this.stopListeningInternal(this.currentSessionToken);
    this.notify();
  }

  private stopListeningInternal(token: number): void {
    this.clearTimer();
    this.listening = false;

    if (this.recognition) {
      try {
        // Nullify handlers to avoid stale callback events after stop
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        if (typeof this.recognition.abort === "function") {
          this.recognition.abort();
        } else if (typeof this.recognition.stop === "function") {
          this.recognition.stop();
        }
      } catch {
        // Ignore errors during abort/stop teardown
      }
      this.recognition = null;
    }
  }
}

// ══════════════════════════════════════════════════════════════
// 4. Module-Level Singleton & Public Exports
// ══════════════════════════════════════════════════════════════

export function createWayfinderSpeechController(): WayfinderSpeechController {
  return new WayfinderSpeechController();
}

const defaultSpeechController = new WayfinderSpeechController();

// Register speech cancellation handler with state machine (breaks circular dependency)
registerSpeechCancellationHandler(() => {
  defaultSpeechController.stopListening();
});

export function startListening(options?: StartListeningOptions): boolean {
  return defaultSpeechController.startListening(options);
}

export function stopListening(): void {
  defaultSpeechController.stopListening();
}

export function getSpeechSnapshot(): WayfinderSpeechSnapshot {
  return defaultSpeechController.getSnapshot();
}

export function isFallbackToText(): boolean {
  return defaultSpeechController.isFallbackToText();
}

export function resetSpeechState(): void {
  defaultSpeechController.resetState();
}

export function subscribeToSpeech(listener: SpeechListener): () => void {
  return defaultSpeechController.subscribe(listener);
}
