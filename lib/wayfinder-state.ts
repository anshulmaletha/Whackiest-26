/**
 * Wayfinder - State Machine Layer
 *
 * Owner: Aryanand (Interaction & State Management Layer)
 * Task: R2 — State Machine
 *
 * Single source of truth for the Wayfinder application state.
 * Manages state transitions, in-flight guards, duplicate action suppression,
 * and stale async protection per the Wayfinder Master Execution PRD.
 */

import {
  resolveDestination,
  openDestination,
  type WayfinderDestination,
  type DestinationSuggestion,
  type ResolveRequest,
  type ResolveResponse,
  type OpenRequest,
  type OpenResponse,
} from "./wayfinder-api.ts";
import {
  type WayfinderErrorCode,
  type WayfinderRecoveryAction,
  type ErrorInfo,
  createErrorInfo,
  isClientOffline,
  CANONICAL_ERROR_MAPPINGS,
} from "./wayfinder-errors.ts";

export {
  type WayfinderErrorCode,
  type WayfinderRecoveryAction,
  type ErrorInfo,
  createErrorInfo,
  isClientOffline,
  CANONICAL_ERROR_MAPPINGS,
};

// ══════════════════════════════════════════════════════════════
// 1. States & Type Contracts
// ══════════════════════════════════════════════════════════════

export type WayfinderState =
  | "INITIAL"
  | "READY"
  | "LISTENING"
  | "PROCESSING"
  | "CONFIRMATION"
  | "NAVIGATING"
  | "SUCCESS"
  | "ERROR"
  | "RETRY";

export interface WayfinderStateSnapshot {
  state: WayfinderState;
  destination: WayfinderDestination | null;
  heardUtterance: string;
  error: ErrorInfo | null;
  elapsedMs?: number;
  isProcessing: boolean;
  isNavigating: boolean;
}

export type StateListener = (snapshot: WayfinderStateSnapshot) => void;

export type SpeechCancellationHandler = () => void;

export interface WayfinderTimerConfig {
  processingMinMs?: number;
  processingMaxMs?: number;
  confirmationCountdownMs?: number;
  navigationTimeoutMs?: number;
}

export const DEFAULT_TIMER_CONFIG: Required<WayfinderTimerConfig> = {
  processingMinMs: 600,
  processingMaxMs: 3000,
  confirmationCountdownMs: 1500,
  navigationTimeoutMs: 15000,
};

let globalSpeechCancellationHandler: SpeechCancellationHandler | null = null;

export function registerSpeechCancellationHandler(handler: SpeechCancellationHandler | null): void {
  globalSpeechCancellationHandler = handler;
  if (typeof defaultMachine !== "undefined") {
    defaultMachine.setSpeechCancellationHandler(handler);
  }
}

// ══════════════════════════════════════════════════════════════
// 2. WayfinderStateMachine Class
// ══════════════════════════════════════════════════════════════

export class WayfinderStateMachine {
  private state: WayfinderState = "INITIAL";
  private destination: WayfinderDestination | null = null;
  private heardUtterance = "";
  private error: ErrorInfo | null = null;
  private elapsedMs?: number = undefined;

  // In-flight guards & stale token tracking
  private isProcessing = false;
  private isNavigating = false;
  private currentResolveToken = 0;
  private currentOpenToken = 0;

  // Timers & lifecycle management (R5)
  private timerConfig: Required<WayfinderTimerConfig>;
  private processingTimeoutTimer: any = null;
  private processingMinDelayTimer: any = null;
  private confirmationTimer: any = null;
  private navigationTimer: any = null;
  private speechCancellationHandler: SpeechCancellationHandler | null = null;

  // Listeners
  private listeners: Set<StateListener> = new Set();

  constructor(initialState: WayfinderState = "INITIAL", timerConfig: WayfinderTimerConfig = {}) {
    this.state = initialState;
    this.timerConfig = { ...DEFAULT_TIMER_CONFIG, ...timerConfig };
    this.speechCancellationHandler = globalSpeechCancellationHandler;
  }

  public setSpeechCancellationHandler(handler: SpeechCancellationHandler | null): void {
    this.speechCancellationHandler = handler;
  }

  public configureTimers(config: WayfinderTimerConfig): void {
    this.timerConfig = { ...this.timerConfig, ...config };
  }

  public getTimerConfig(): Required<WayfinderTimerConfig> {
    return { ...this.timerConfig };
  }

  // Timer cleanup helpers (R5)
  private clearProcessingTimers(): void {
    if (this.processingTimeoutTimer) {
      clearTimeout(this.processingTimeoutTimer);
      this.processingTimeoutTimer = null;
    }
    if (this.processingMinDelayTimer) {
      clearTimeout(this.processingMinDelayTimer);
      this.processingMinDelayTimer = null;
    }
  }

  private clearConfirmationTimer(): void {
    if (this.confirmationTimer) {
      clearTimeout(this.confirmationTimer);
      this.confirmationTimer = null;
    }
  }

  private clearNavigationTimer(): void {
    if (this.navigationTimer) {
      clearTimeout(this.navigationTimer);
      this.navigationTimer = null;
    }
  }

  public clearAllTimers(): void {
    this.clearProcessingTimers();
    this.clearConfirmationTimer();
    this.clearNavigationTimer();
  }

  /**
   * Returns a clean, immutable snapshot of the current state machine.
   */
  public getSnapshot(): WayfinderStateSnapshot {
    return {
      state: this.state,
      destination: this.destination ? { ...this.destination } : null,
      heardUtterance: this.heardUtterance,
      error: this.error ? { ...this.error, suggestions: this.error.suggestions ? [...this.error.suggestions] : undefined } : null,
      elapsedMs: this.elapsedMs,
      isProcessing: this.isProcessing,
      isNavigating: this.isNavigating,
    };
  }

  public subscribe(listener: StateListener): () => void {
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
        console.error("[WayfinderState] Listener error:", err);
      }
    }
  }

  // ────────────────────────────────────────────────────────────
  // Transition 1: INITIAL → READY (Get Started)
  // ────────────────────────────────────────────────────────────
  public getStarted(): void {
    if (this.state !== "INITIAL") return;
    this.state = "READY";
    this.error = null;
    this.notify();
  }

  // ────────────────────────────────────────────────────────────
  // Transition 2: READY → LISTENING (Start Mic Interaction)
  // ────────────────────────────────────────────────────────────
  public startListening(): void {
    if (this.state !== "READY") return;
    this.state = "LISTENING";
    this.error = null;
    this.notify();
  }

  // ────────────────────────────────────────────────────────────
  // Transition 3: READY → PROCESSING (Text submit / Chip tap)
  // ────────────────────────────────────────────────────────────
  public async submitText(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Allowed source state per PRD table: READY
    if (this.state !== "READY") {
      return;
    }

    // In-flight guard: block duplicate submissions while PROCESSING
    if (this.isProcessing) return;

    await this.initiateResolve(trimmed, "text");
  }

  public async chooseChip(chip: string): Promise<void> {
    const trimmed = chip.trim();
    if (!trimmed) return;

    // Allowed source state per PRD table: READY
    if (this.state !== "READY") return;
    if (this.isProcessing) return;

    await this.initiateResolve(trimmed, "text");
  }

  // ────────────────────────────────────────────────────────────
  // Transition 4: LISTENING → PROCESSING (Final transcript)
  // ────────────────────────────────────────────────────────────
  public async onFinalTranscript(transcript: string): Promise<void> {
    const trimmed = transcript.trim();
    if (!trimmed) return;

    if (this.state !== "LISTENING") return;
    if (this.isProcessing) return;

    await this.initiateResolve(trimmed, "voice");
  }

  private async initiateResolve(utterance: string, source: "voice" | "text"): Promise<void> {
    this.isProcessing = true;
    const token = ++this.currentResolveToken;

    this.state = "PROCESSING";
    this.heardUtterance = utterance;
    this.destination = null;
    this.error = null;
    this.elapsedMs = undefined;
    this.notify();

    this.clearProcessingTimers();

    const minDelayMs = this.timerConfig.processingMinMs;
    const maxTimeoutMs = this.timerConfig.processingMaxMs;
    const startTime = Date.now();

    // 1. Arm maximum processing ceiling timer (R5: ~3 seconds)
    this.processingTimeoutTimer = setTimeout(() => {
      if (token !== this.currentResolveToken || this.state !== "PROCESSING") return;
      this.clearProcessingTimers();
      this.currentResolveToken++; // Invalidate resolve token so late response is discarded
      this.isProcessing = false;
      this.state = "ERROR";
      this.error = createErrorInfo("engine_unreachable");
      this.notify();
    }, maxTimeoutMs);

    try {
      const response = await resolveDestination({ utterance, source });
      // Stale response protection: check token and state
      if (token !== this.currentResolveToken || this.state !== "PROCESSING") {
        return;
      }

      // 2. Enforce minimum visible processing duration (R5: ~600ms)
      const elapsed = Date.now() - startTime;
      const remainingMinDelay = Math.max(0, minDelayMs - elapsed);

      if (remainingMinDelay > 0) {
        await new Promise<void>((resolve) => {
          this.processingMinDelayTimer = setTimeout(() => {
            if (token === this.currentResolveToken && this.state === "PROCESSING") {
              this.finishResolve(token, response);
            }
            resolve();
          }, remainingMinDelay);
        });
      } else {
        this.finishResolve(token, response);
      }
    } catch (err) {
      if (token !== this.currentResolveToken || this.state !== "PROCESSING") {
        return;
      }

      const elapsed = Date.now() - startTime;
      const remainingMinDelay = Math.max(0, minDelayMs - elapsed);

      const dispatchError = () => {
        if (token !== this.currentResolveToken || this.state !== "PROCESSING") return;
        this.clearProcessingTimers();
        this.isProcessing = false;
        this.state = "ERROR";
        const errorCode: WayfinderErrorCode = isClientOffline() ? "offline" : "engine_unreachable";
        this.error = createErrorInfo(errorCode);
        this.notify();
      };

      if (remainingMinDelay > 0) {
        await new Promise<void>((resolve) => {
          this.processingMinDelayTimer = setTimeout(() => {
            dispatchError();
            resolve();
          }, remainingMinDelay);
        });
      } else {
        dispatchError();
      }
    }
  }

  private finishResolve(token: number, response: ResolveResponse): void {
    if (token !== this.currentResolveToken || this.state !== "PROCESSING") return;
    this.clearProcessingTimers();
    this.isProcessing = false;
    this.handleResolveResponse(response);
  }

  public onResolveResult(result: ResolveResponse): void {
    if (this.state !== "PROCESSING") return;
    this.clearProcessingTimers();
    this.isProcessing = false;
    this.handleResolveResponse(result);
  }

  private handleResolveResponse(result: ResolveResponse): void {
    if (result.status === "matched" && result.destination) {
      // PROCESSING → CONFIRMATION: Resolve matched
      this.state = "CONFIRMATION";
      this.destination = result.destination;
      this.error = null;
      this.armConfirmationCountdown();
    } else if (result.status === "suggest") {
      // PROCESSING → ERROR: Suggest offers alternative recovery
      this.state = "ERROR";
      this.destination = null;
      this.error = createErrorInfo("unknown_site", {
        suggestions: result.suggestions,
      });
    } else {
      // PROCESSING → ERROR: Unmatched destination
      this.state = "ERROR";
      this.destination = null;
      this.error = createErrorInfo("unknown_site", {
        suggestions: result.suggestions,
      });
    }
    this.notify();
  }

  private armConfirmationCountdown(): void {
    this.clearConfirmationTimer();
    this.confirmationTimer = setTimeout(() => {
      if (this.state !== "CONFIRMATION" || this.isNavigating) return;
      this.clearConfirmationTimer();
      this.onCountdownEnd();
    }, this.timerConfig.confirmationCountdownMs);
  }

  // ────────────────────────────────────────────────────────────
  // Transition 5: LISTENING → ERROR (Silence / Mic Denied)
  // ────────────────────────────────────────────────────────────
  public onSilenceTimeout(): void {
    if (this.state !== "LISTENING") return;
    this.clearAllTimers();
    this.state = "ERROR";
    this.error = createErrorInfo("no_speech");
    this.notify();
  }

  public onMicrophoneDenied(): void {
    if (this.state !== "LISTENING" && this.state !== "READY") return;
    this.clearAllTimers();
    this.state = "ERROR";
    this.error = createErrorInfo("mic_denied");
    this.notify();
  }

  // ────────────────────────────────────────────────────────────
  // Transition 6: CONFIRMATION → NAVIGATING (Proceed / Countdown)
  // ────────────────────────────────────────────────────────────
  public async confirm(): Promise<void> {
    if (this.state !== "CONFIRMATION") return;
    if (this.isNavigating) return; // In-flight duplicate open guard
    if (!this.destination) return;

    this.clearConfirmationTimer();
    await this.initiateOpen();
  }

  public async onCountdownEnd(): Promise<void> {
    if (this.state !== "CONFIRMATION") return;
    if (this.isNavigating) return;
    if (!this.destination) return;

    this.clearConfirmationTimer();
    await this.initiateOpen();
  }

  private async initiateOpen(): Promise<void> {
    if (!this.destination) return;

    this.isNavigating = true;
    const token = ++this.currentOpenToken;

    this.state = "NAVIGATING";
    this.error = null;
    this.armNavigationTimer(token);
    this.notify();

    try {
      // Pass destination ID to openDestination (never raw URL)
      const response = await openDestination({ destinationId: this.destination.id });

      // Stale response protection
      if (token !== this.currentOpenToken || this.state !== "NAVIGATING") {
        return;
      }
      this.clearNavigationTimer();
      this.isNavigating = false;
      this.handleOpenResponse(response);
    } catch (err) {
      if (token !== this.currentOpenToken || this.state !== "NAVIGATING") {
        return;
      }
      this.clearNavigationTimer();
      this.isNavigating = false;
      this.state = "ERROR";
      this.error = createErrorInfo("nav_failed", {
        diagnostic: err instanceof Error ? err.message : String(err),
      });
      this.notify();
    }
  }

  private armNavigationTimer(token: number): void {
    this.clearNavigationTimer();
    this.navigationTimer = setTimeout(() => {
      if (token !== this.currentOpenToken || this.state !== "NAVIGATING") return;
      this.clearNavigationTimer();
      this.onNavigationTimeout();
    }, this.timerConfig.navigationTimeoutMs);
  }

  public onOpenResult(result: OpenResponse): void {
    if (this.state !== "NAVIGATING") return;
    this.clearNavigationTimer();
    this.isNavigating = false;
    this.handleOpenResponse(result);
  }

  private handleOpenResponse(result: OpenResponse): void {
    if (result.status === "opened") {
      // NAVIGATING → SUCCESS: Open returns opened
      this.state = "SUCCESS";
      this.destination = result.destination;
      this.elapsedMs = result.elapsedMs;
      this.error = null;
    } else {
      // NAVIGATING → ERROR: Open fails
      this.state = "ERROR";
      this.destination = result.destination;
      this.elapsedMs = result.elapsedMs;
      this.error = createErrorInfo("nav_failed", {
        diagnostic: result.error,
      });
    }
    this.notify();
  }

  // ────────────────────────────────────────────────────────────
  // Transition 7: NAVIGATING → ERROR (15s Navigation Timeout)
  // ────────────────────────────────────────────────────────────
  public onNavigationTimeout(): void {
    if (this.state !== "NAVIGATING") return;
    this.clearNavigationTimer();
    this.isNavigating = false;
    this.currentOpenToken++; // Invalidate pending open promise

    this.state = "ERROR";
    this.elapsedMs = 15000;
    this.error = createErrorInfo("nav_failed", {
      diagnostic: "Navigation timed out after 15 seconds",
    });
    this.notify();
  }

  // ────────────────────────────────────────────────────────────
  // Transition 8: CONFIRMATION / PROCESSING / LISTENING → READY (Cancel)
  // ────────────────────────────────────────────────────────────
  public cancel(): void {
    if (
      this.state !== "CONFIRMATION" &&
      this.state !== "PROCESSING" &&
      this.state !== "LISTENING"
    ) {
      return;
    }

    // Cancel active speech recognition if cancelled during LISTENING
    if (this.state === "LISTENING") {
      const handler = this.speechCancellationHandler || globalSpeechCancellationHandler;
      if (handler) {
        try {
          handler();
        } catch (err) {
          console.error("[WayfinderState] Speech cancellation error:", err);
        }
      }
    }

    // Cancel in-flight resolve if processing
    if (this.state === "PROCESSING") {
      this.currentResolveToken++;
      this.isProcessing = false;
    }

    this.clearAllTimers();

    this.state = "READY";
    this.destination = null;
    this.error = null;
    this.notify();
  }

  // ────────────────────────────────────────────────────────────
  // Transition 9: SUCCESS → READY (Go somewhere else)
  // ────────────────────────────────────────────────────────────
  public goSomewhereElse(): void {
    if (this.state !== "SUCCESS") return;
    this.clearAllTimers();
    this.state = "READY";
    this.destination = null;
    this.heardUtterance = "";
    this.error = null;
    this.elapsedMs = undefined;
    this.notify();
  }

  // ────────────────────────────────────────────────────────────
  // Transition 10: ERROR → RETRY → READY (Retry Flow)
  // ────────────────────────────────────────────────────────────
  public retry(): void {
    if (this.state !== "ERROR") return;
    this.clearAllTimers();
    // PRD: ERROR -> retry -> RETRY -> READY
    this.state = "RETRY";
    this.notify();

    this.state = "READY";
    this.destination = null;
    this.error = null;
    this.notify();
  }
}

// ══════════════════════════════════════════════════════════════
// 3. Module-Level Singleton & Public Dispatchers
// ══════════════════════════════════════════════════════════════

export function createWayfinderStateMachine(
  initialState?: WayfinderState,
  timerConfig?: WayfinderTimerConfig
): WayfinderStateMachine {
  return new WayfinderStateMachine(initialState, timerConfig);
}

// Default shared machine instance
const defaultMachine = new WayfinderStateMachine();

if (globalSpeechCancellationHandler) {
  defaultMachine.setSpeechCancellationHandler(globalSpeechCancellationHandler);
}

export function configureWayfinderTimers(config: WayfinderTimerConfig): void {
  defaultMachine.configureTimers(config);
}

export function resetWayfinderTimers(): void {
  defaultMachine.configureTimers(DEFAULT_TIMER_CONFIG);
}

export function clearWayfinderTimers(): void {
  defaultMachine.clearAllTimers();
}

export function getWayfinderState(): WayfinderStateSnapshot {
  return defaultMachine.getSnapshot();
}

export function subscribeToWayfinderState(listener: StateListener): () => void {
  return defaultMachine.subscribe(listener);
}

// Required Public Dispatchers
export function getStarted(): void {
  defaultMachine.getStarted();
}

export function startListening(): void {
  defaultMachine.startListening();
}

export function submitText(text: string): Promise<void> {
  return defaultMachine.submitText(text);
}

export function chooseChip(chip: string): Promise<void> {
  return defaultMachine.chooseChip(chip);
}

export function confirm(): Promise<void> {
  return defaultMachine.confirm();
}

export function cancel(): void {
  defaultMachine.cancel();
}

export function retry(): void {
  defaultMachine.retry();
}

export function goSomewhereElse(): void {
  defaultMachine.goSomewhereElse();
}

// Event Handlers (for timer, speech, or external handlers)
export function onFinalTranscript(transcript: string): Promise<void> {
  return defaultMachine.onFinalTranscript(transcript);
}

export function onSilenceTimeout(): void {
  defaultMachine.onSilenceTimeout();
}

export function onMicrophoneDenied(): void {
  defaultMachine.onMicrophoneDenied();
}

export function onCountdownEnd(): Promise<void> {
  return defaultMachine.onCountdownEnd();
}

export function onNavigationTimeout(): void {
  defaultMachine.onNavigationTimeout();
}

export function onResolveResult(result: ResolveResponse): void {
  defaultMachine.onResolveResult(result);
}

export function onOpenResult(result: OpenResponse): void {
  defaultMachine.onOpenResult(result);
}
