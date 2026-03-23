let speaking = false
let currentRate = 1.05

export function setSpeechRate(rate: number) {
  currentRate = Math.max(0.5, Math.min(2.0, rate))
}

export function getSpeechRate(): number {
  return currentRate
}

export function isSpeaking(): boolean {
  return speaking
}

export function speakText(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve()
      return
    }

    if (speaking) {
      window.speechSynthesis.cancel()
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = currentRate
    utterance.pitch = 1.0

    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(
      (v) => v.lang.startsWith("en") && v.name.includes("Google")
    ) ?? voices.find((v) => v.lang.startsWith("en"))

    if (preferred) utterance.voice = preferred

    speaking = true
    utterance.onend = () => { speaking = false; resolve() }
    utterance.onerror = () => { speaking = false; resolve() }

    window.speechSynthesis.speak(utterance)
  })
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel()
    speaking = false
  }
}
