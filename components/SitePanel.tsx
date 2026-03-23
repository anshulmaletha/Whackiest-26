"use client"

import type { SiteData } from "@/types"
import QuickActions from "./QuickActions"

interface Props {
  siteData: SiteData | null
  isLoading: boolean
  onQuickAction: (question: string) => void
  category?: string
}

const CATEGORY_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
  restaurant: { emoji: "🍽", label: "Restaurant", color: "#f97316" },
  shopping: { emoji: "🛒", label: "Shopping", color: "#8b5cf6" },
  services: { emoji: "🔧", label: "Services", color: "#3b82f6" },
  news: { emoji: "📰", label: "News", color: "#ef4444" },
  entertainment: { emoji: "🎮", label: "Entertainment", color: "#ec4899" },
  travel: { emoji: "✈️", label: "Travel", color: "#06b6d4" },
  health: { emoji: "🏥", label: "Health", color: "#10b981" },
  education: { emoji: "📚", label: "Education", color: "#6366f1" },
  tech: { emoji: "💻", label: "Tech", color: "#0ea5e9" },
  finance: { emoji: "💰", label: "Finance", color: "#eab308" },
  government: { emoji: "🏛", label: "Government", color: "#64748b" },
  reference: { emoji: "📖", label: "Reference", color: "#a855f7" },
  general: { emoji: "🌐", label: "Website", color: "#6b7280" },
}

const FIELD_ICONS: Record<string, (props: React.SVGProps<SVGSVGElement>) => React.ReactElement> = {
  phone: PhoneIcon,
  address: PinIcon,
  hours: ClockIcon,
  email: EmailIcon,
}

function hrefForField(key: string, value: string): string | undefined {
  if (key === "phone") return `tel:${value.replace(/\s/g, "")}`
  if (key === "email") return `mailto:${value}`
  return undefined
}

export default function SitePanel({ siteData, isLoading, onQuickAction, category }: Props) {
  if (isLoading) {
    return (
      <div className="site-panel site-panel--loading" role="status" aria-label="Loading site">
        <div className="site-panel__loading-label">Opening website...</div>
        <div className="site-panel__skeleton" />
        <div className="site-panel__loading-label site-panel__loading-label--dim">Extracting key information...</div>
        <div className="site-panel__skeleton site-panel__skeleton--sm" />
        <div className="site-panel__skeleton site-panel__skeleton--xs" />
      </div>
    )
  }

  if (!siteData) {
    return (
      <div className="site-panel site-panel--empty">
        <div className="site-panel__empty-visual" aria-hidden="true">
          <GlobeIcon />
        </div>
        <h2 className="site-panel__empty-title">Select a result to explore</h2>
        <p className="site-panel__empty-sub">Navia helps you search, understand, and use any website by voice.</p>
      </div>
    )
  }

  const info = siteData.keyInfo ?? {}
  const infoEntries = Object.entries(info).filter(([, v]) => v && v.length > 0)
  const hasHeadings = siteData.headings && siteData.headings.length > 0
  const hasLinks = siteData.links && siteData.links.length > 0

  return (
    <div className="site-panel" role="region" aria-label={`Details for ${siteData.siteName}`}>
      <div className="site-panel__header">
        <h2 className="site-panel__name">{siteData.siteName}</h2>
        {category && (
          <CategoryBadge category={category} />
        )}
      </div>

      <div className="site-insights" role="region" aria-label="Site summary">
        <p className="site-insights__summary">{siteData.summary}</p>
      </div>

      {infoEntries.length > 0 && (
        <div className="site-panel__extracted-tags" role="status" aria-label="Extracted fields">
          {infoEntries.map(([key]) => (
            <span key={key} className="extracted-tag">{key.replace(/_/g, " ")}</span>
          ))}
        </div>
      )}

      {infoEntries.length > 0 && (
        <div className="site-panel__fields" role="list" aria-label="Key information">
          {infoEntries.map(([key, value]) => {
            const IconComponent = FIELD_ICONS[key] ?? InfoIcon
            const href = hrefForField(key, value)
            const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
            return (
              <div key={key} className="site-field" role="listitem">
                <span className="site-field__icon" aria-hidden="true"><IconComponent /></span>
                <div className="site-field__content">
                  <span className="site-field__label">{label}</span>
                  {href ? (
                    <a href={href} className="site-field__value site-field__value--link" target="_blank" rel="noopener noreferrer">{value}</a>
                  ) : (
                    <span className="site-field__value">{value}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {hasHeadings && (
        <div className="site-panel__section">
          <span className="site-panel__section-label">Page structure</span>
          <ul className="site-panel__headings" aria-label="Page headings">
            {siteData.headings!.slice(0, 6).map((h, i) => (
              <li key={i} className="site-panel__heading-item">{h}</li>
            ))}
          </ul>
        </div>
      )}

      {hasLinks && (
        <div className="site-panel__section">
          <span className="site-panel__section-label">Links</span>
          <ul className="site-panel__links" aria-label="Links found on this page">
            {siteData.links!.slice(0, 6).map((l, i) => (
              <li key={i}>
                <a href={l.href} target="_blank" rel="noopener noreferrer" className="site-panel__link" aria-label={`${l.text} — opens in new tab`}>
                  <LinkIcon />
                  <span>{l.text}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <QuickActions onAction={onQuickAction} siteData={siteData} />
    </div>
  )
}

function CategoryBadge({ category }: { category: string }) {
  const config = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.general
  return (
    <span
      className="category-badge"
      style={{ "--cat-color": config.color } as React.CSSProperties}
      aria-label={`Category: ${config.label}`}
    >
      <span className="category-badge__emoji" aria-hidden="true">{config.emoji}</span>
      {config.label}
    </span>
  )
}

function PhoneIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.29h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.75a16 16 0 0 0 6 6l1.27-.9a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2z" /></svg> }
function EmailIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg> }
function PinIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg> }
function ClockIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> }
function InfoIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg> }
function GlobeIcon() { return <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg> }
function LinkIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg> }
