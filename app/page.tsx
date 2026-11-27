"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import ErrorView from "@/components/ErrorView"
import RouteCard from "@/components/RouteCard"
import WayfinderView, {
  type WayfinderUIState,
  type WayfinderViewData,
} from "@/components/WayfinderView"
import type {
  DestinationSuggestion,
  ErrorSituation,
  WayfinderDestination,
} from "@/types/wayfinder"

interface ResolveResponse {
  status: "matched" | "suggest" | "unmatched"
  heard: string
  destination: WayfinderDestination | null
  suggestions: DestinationSuggestion[]
}

interface OpenResponse {
  status: "opened" | "failed"
  destination: WayfinderDestination | null
  elapsedMs: number
  error?: string
}

interface BrowserSpeechRecognition {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

const CONFIRM_TOTAL_MS = 1500
const LISTEN_TIMEOUT_MS = 8000
const NAV_TIMEOUT_MS = 15000

export default function Home() {
  const [uiState, setUiState] = useState<WayfinderUIState>("INITIAL")
  const [data, setData] = useState<WayfinderViewData>({})
  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([])
  const [countdownMs, setCountdownMs] = useState<number>(CONFIRM_TOTAL_MS)

  const inFlightRef = useRef(false)
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const listenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confirmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeDestRef = useRef<WayfinderDestination | null>(null)

  const clearTimers = useCallback(() => {
    if (listenTimerRef.current) {
      clearTimeout(listenTimerRef.current)
      listenTimerRef.current = null
    }
    if (confirmIntervalRef.current) {
      clearInterval(confirmIntervalRef.current)
      confirmIntervalRef.current = null
    }
  }, [])

  const stopMic = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // ignore if already stopped
      }
      recognitionRef.current = null
    }
  }, [])

  const resetToReady = useCallback(() => {
    clearTimers()
    stopMic()
    inFlightRef.current = false
    activeDestRef.current = null
    setSuggestions([])
    setData({})
    setUiState("READY")
  }, [clearTimers, stopMic])

  const openDestination = useCallback(async (dest: WayfinderDestination) => {
    if (inFlightRef.current) return
    clearTimers()
    inFlightRef.current = true
    setUiState("NAVIGATING")

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), NAV_TIMEOUT_MS)

    try {
      const res = await fetch("/api/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationId: dest.id }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result: OpenResponse = await res.json()

      if (result.status === "opened") {
        setData((prev) => ({ ...prev, elapsedMs: result.elapsedMs }))
        setUiState("SUCCESS")
      } else {
        setData((prev) => ({
          ...prev,
          errorSituation: "nav_failed",
          errorMessage: result.error,
        }))
        setUiState("ERROR")
      }
    } catch {
      clearTimeout(timeoutId)
      setData((prev) => ({
        ...prev,
        errorSituation: "nav_failed",
      }))
      setUiState("ERROR")
    } finally {
      inFlightRef.current = false
    }
  }, [clearTimers])

  const resolveUtterance = useCallback(
    async (utterance: string, source: "voice" | "text") => {
      if (inFlightRef.current) return
      clearTimers()
      stopMic()
      inFlightRef.current = true
      setSuggestions([])
      setData({ heardText: utterance })
      setUiState("PROCESSING")

      try {
        const res = await fetch("/api/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ utterance, source }),
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const result: ResolveResponse = await res.json()

        if (result.status === "matched" && result.destination) {
          const dest = result.destination
          activeDestRef.current = dest
          setData({
            heardText: result.heard,
            destinationId: dest.id,
            destinationName: dest.label,
            destinationHost: dest.host,
          })
          setCountdownMs(CONFIRM_TOTAL_MS)
          setUiState("CONFIRMATION")
        } else {
          setSuggestions(result.suggestions ?? [])
          setData({
            heardText: result.heard || utterance,
            errorSituation: "not_understood",
          })
          setUiState("ERROR")
        }
      } catch {
        setData({
          heardText: utterance,
          errorSituation: "engine_unreachable",
        })
        setUiState("ERROR")
      } finally {
        inFlightRef.current = false
      }
    },
    [clearTimers, stopMic]
  )

  // Drive the 1.5s auto-confirm countdown while in CONFIRMATION state
  useEffect(() => {
    if (uiState !== "CONFIRMATION" || !activeDestRef.current) return

    const startedAt = Date.now()
    confirmIntervalRef.current = setInterval(() => {
      const remaining = Math.max(0, CONFIRM_TOTAL_MS - (Date.now() - startedAt))
      setCountdownMs(remaining)
      if (remaining === 0 && activeDestRef.current) {
        clearTimers()
        void openDestination(activeDestRef.current)
      }
    }, 100)

    return () => {
      if (confirmIntervalRef.current) {
        clearInterval(confirmIntervalRef.current)
        confirmIntervalRef.current = null
      }
    }
  }, [uiState, clearTimers, openDestination])

  const startListening = useCallback(() => {
    if (inFlightRef.current) return
    clearTimers()

    const win = window as unknown as {
      SpeechRecognition?: new () => BrowserSpeechRecognition
      webkitSpeechRecognition?: new () => BrowserSpeechRecognition
    }
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition

    if (!SpeechRec) {
      setData({ errorSituation: "mic_unavailable" })
      setUiState("ERROR")
      return
    }

    const recognition = new SpeechRec()
    recognition.lang = "en-IN"
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition

    let gotResult = false
    setData({})
    setUiState("LISTENING")

    listenTimerRef.current = setTimeout(() => {
      if (!gotResult) {
        stopMic()
        setData({ errorSituation: "no_speech" })
        setUiState("ERROR")
      }
    }, LISTEN_TIMEOUT_MS)

    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1]
      const transcript = last[0].transcript.trim()
      if (last.isFinal && transcript) {
        gotResult = true
        void resolveUtterance(transcript, "voice")
      }
    }

    recognition.onerror = (event) => {
      clearTimers()
      const situation: ErrorSituation =
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "mic_unavailable"
          : "no_speech"
      setData({ errorSituation: situation })
      setUiState("ERROR")
    }

    recognition.onend = () => {
      if (!gotResult && listenTimerRef.current) {
        clearTimers()
        setData({ errorSituation: "no_speech" })
        setUiState("ERROR")
      }
    }

    recognition.start()
  }, [clearTimers, resolveUtterance, stopMic])

  // Clean up timers/mic on unmount
  useEffect(() => () => {
    clearTimers()
    stopMic()
  }, [clearTimers, stopMic])

  const currentDest: WayfinderDestination = {
    id: data.destinationId ?? "destination",
    label: data.destinationName ?? "Selected destination",
    host: data.destinationHost ?? "website",
  }

  return (
    <WayfinderView
      state={uiState}
      data={data}
      intents={{
        onGetStarted: resetToReady,
        onStartListening: startListening,
        onStopListening: resetToReady,
        onSubmitText: (text) => void resolveUtterance(text, "text"),
        onQuickDestination: (name) => void resolveUtterance(`Open ${name}`, "text"),
        onConfirm: () => {
          if (activeDestRef.current) void openDestination(activeDestRef.current)
        },
        onCancel: resetToReady,
        onRetry: resetToReady,
        onReset: resetToReady,
      }}
      slots={{
        confirmationSlot: (
          <RouteCard
            destination={currentDest}
            heardUtterance={data.heardText ?? ""}
            countdownRemainingMs={countdownMs}
            countdownTotalMs={CONFIRM_TOTAL_MS}
            onConfirm={() => {
              if (activeDestRef.current) void openDestination(activeDestRef.current)
            }}
            onCancel={resetToReady}
          />
        ),
        errorSlot: (
          <ErrorView
            situation={data.errorSituation ?? "nav_failed"}
            failedUtterance={data.heardText}
            destinationLabel={data.destinationName}
            suggestions={suggestions}
            onSelectSuggestion={(id) => {
              const picked = suggestions.find((s) => s.id === id)
              if (picked) void resolveUtterance(`Open ${picked.label}`, "text")
            }}
            onRetryClick={resetToReady}
            onCancel={resetToReady}
          />
        ),
      }}
    />
  )
}
