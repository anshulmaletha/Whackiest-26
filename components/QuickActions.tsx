"use client"

import { useRef, useCallback, useMemo } from "react"
import type { SiteData } from "@/types"

interface Props {
  onAction: (question: string) => void
  siteData: SiteData | null
}

const ALWAYS_ACTIONS = [
  { id: "explain", label: "What is this?", question: "What is this website about?" },
  { id: "summarize", label: "Summarize", question: "Summarize the main content" },
]

export default function QuickActions({ onAction, siteData }: Props) {
  const gridRef = useRef<HTMLDivElement>(null)

  const actions = useMemo(() => {
    const list = [...ALWAYS_ACTIONS]

    if (siteData?.headings && siteData.headings.length > 0) {
      list.push({ id: "sections", label: "Page sections", question: "What are the main headings?" })
    }
    if (siteData?.links && siteData.links.length > 0) {
      list.push({ id: "links", label: "Links", question: "What are the main links?" })
    }

    if (siteData?.keyInfo) {
      for (const key of Object.keys(siteData.keyInfo)) {
        if (!siteData.keyInfo[key]) continue
        const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        list.push({ id: `ki-${key}`, label, question: `What is the ${key.replace(/_/g, " ")}?` })
      }
    }

    return list
  }, [siteData])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const btns = gridRef.current?.querySelectorAll<HTMLButtonElement>("button")
    if (!btns || btns.length === 0) return
    const current = Array.from(btns).indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault()
      btns[current < btns.length - 1 ? current + 1 : 0].focus()
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault()
      btns[current > 0 ? current - 1 : btns.length - 1].focus()
    }
  }, [])

  if (actions.length === 0) return null

  return (
    <div className="quick-actions" role="group" aria-label="Quick actions for this page">
      <span className="quick-actions__label" id="qa-label">Quick ask</span>
      <div ref={gridRef} className="quick-actions__grid" role="toolbar" aria-labelledby="qa-label" onKeyDown={handleKeyDown}>
        {actions.map((a, i) => (
          <button key={a.id} onClick={() => onAction(a.question)} className="quick-action-btn" aria-label={a.label} tabIndex={i === 0 ? 0 : -1}>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
