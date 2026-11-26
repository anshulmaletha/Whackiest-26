"use client"

import React from "react"
import type { NavigationProgressTrackProps, NavigationStep } from "@/types/wayfinder"
import "./wayfinder.css"

interface StepMeta {
  key: NavigationStep
  number: number
  label: string
}

const STEPS: StepMeta[] = [
  { key: "heard", number: 1, label: "Heard" },
  { key: "understood", number: 2, label: "Understood" },
  { key: "opening", number: 3, label: "Opening" },
]

function getStepState(
  stepIndex: number,
  currentStep: NavigationStep
): "completed" | "active" | "pending" {
  const order: Record<NavigationStep, number> = {
    heard: 0,
    understood: 1,
    opening: 2,
    completed: 3,
  }

  const currentIdx = order[currentStep] ?? 0
  if (currentIdx > stepIndex) return "completed"
  if (currentIdx === stepIndex) return "active"
  return "pending"
}

/**
 * NavigationProgressTrack
 * 
 * Attractive 3-step progress track:
 * 1. Heard  ->  2. Understood  ->  3. Opening
 * 
 * Reflects actual application state passed from Aryanand's coordinator.
 * 
 * Ownership: Saurabh Singh (UI/UX Specialist)
 */
export default function NavigationProgressTrack({
  currentStep,
  className = "",
}: NavigationProgressTrackProps) {
  const currentStepNum =
    currentStep === "completed"
      ? 3
      : currentStep === "opening"
      ? 3
      : currentStep === "understood"
      ? 2
      : 1

  const currentStepLabel =
    currentStep === "completed"
      ? "Navigation complete"
      : currentStep === "opening"
      ? "Opening destination"
      : currentStep === "understood"
      ? "Destination understood"
      : "Speech heard"

  return (
    <div className="wf-scope">
      <div
        className={`wf-track ${className}`}
        role="progressbar"
        aria-label="Navigation progress"
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={currentStepNum}
        aria-valuetext={currentStepLabel}
      >
        {STEPS.map((step, index) => {
          const state = getStepState(index, currentStep)
          const isLast = index === STEPS.length - 1
          const nextState = !isLast ? getStepState(index + 1, currentStep) : "pending"
          const isLineFilled = state === "completed"

          return (
            <React.Fragment key={step.key}>
              {/* Step Node */}
              <div
                className={`wf-track__step wf-track__step--${state}`}
                aria-current={state === "active" ? "step" : undefined}
              >
                <div className="wf-track__node" aria-hidden="true">
                  {state === "completed" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span>{step.number}</span>
                  )}
                </div>
                <span className="wf-track__label">{step.label}</span>
              </div>

              {/* Connecting line between nodes */}
              {!isLast && (
                <div className="wf-track__line" aria-hidden="true">
                  <div
                    className={`wf-track__line-fill ${
                      isLineFilled
                        ? "wf-track__line-fill--completed"
                        : nextState === "active"
                        ? "wf-track__line-fill--active"
                        : ""
                    }`}
                  />
                </div>
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
