"use client"

import type { SiteData } from "@/types"
import QuickActions from "./QuickActions"

interface Props {
  siteData: SiteData | null
  isLoading: boolean
  onQuickAction: (question: string) => void
}

export default function SitePanel({ siteData, isLoading, onQuickAction }: Props) {
  if (isLoading) {
    return (
      <div className="site-panel site-panel--loading" role="status" aria-label="Loading site">
        <div className="site-panel__skeleton" />
        <div className="site-panel__skeleton site-panel__skeleton--sm" />
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
        <p className="site-panel__empty-sub">Navia will read and understand any website — news, shops, articles, government pages, anything.</p>
      </div>
    )
  }

  const hasContact = siteData.phone || siteData.email || siteData.address || siteData.hours
  const hasHeadings = siteData.headings && siteData.headings.length > 0
  const hasLinks = siteData.links && siteData.links.length > 0
  const hasServices = siteData.services && siteData.services.length > 0

  return (
    <div className="site-panel" role="region" aria-label={`Details for ${siteData.siteName}`}>
      <div className="site-panel__header">
        <h2 className="site-panel__name">{siteData.siteName}</h2>
      </div>

      <p className="site-panel__summary">{siteData.summary}</p>

      {hasHeadings && (
        <div className="site-panel__section">
          <span className="site-panel__section-label">Page structure</span>
          <ul className="site-panel__headings" aria-label="Page headings">
            {siteData.headings!.map((h, i) => (
              <li key={i} className="site-panel__heading-item">{h}</li>
            ))}
          </ul>
        </div>
      )}

      {hasContact && (
        <div className="site-panel__fields" role="list" aria-label="Contact information">
          {siteData.phone && (
            <Field icon={<PhoneIcon />} label="Phone" value={siteData.phone} href={`tel:${siteData.phone}`} />
          )}
          {siteData.email && (
            <Field icon={<EmailIcon />} label="Email" value={siteData.email} href={`mailto:${siteData.email}`} />
          )}
          {siteData.address && (
            <Field icon={<PinIcon />} label="Address" value={siteData.address} />
          )}
          {siteData.hours && (
            <Field icon={<ClockIcon />} label="Hours" value={siteData.hours} />
          )}
        </div>
      )}

      {hasServices && (
        <div className="site-panel__section">
          <span className="site-panel__section-label">Services / Topics</span>
          <ul className="site-panel__tags" aria-label="Services or topics">
            {siteData.services!.map((s, i) => (
              <li key={i} className="site-panel__tag">{s}</li>
            ))}
          </ul>
        </div>
      )}

      {hasLinks && (
        <div className="site-panel__section">
          <span className="site-panel__section-label">Key links</span>
          <ul className="site-panel__links" aria-label="Links found on this page">
            {siteData.links!.slice(0, 8).map((l, i) => (
              <li key={i}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="site-panel__link"
                  aria-label={`${l.text} — opens in new tab`}
                >
                  <LinkIcon />
                  <span>{l.text}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <QuickActions onAction={onQuickAction} disabled={false} />
    </div>
  )
}

function Field({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode
  label: string
  value: string
  href?: string
}) {
  return (
    <div className="site-field" role="listitem">
      <span className="site-field__icon" aria-hidden="true">{icon}</span>
      <div className="site-field__content">
        <span className="site-field__label">{label}</span>
        {href ? (
          <a href={href} className="site-field__value site-field__value--link" target="_blank" rel="noopener noreferrer">
            {value}
          </a>
        ) : (
          <span className="site-field__value">{value}</span>
        )}
      </div>
    </div>
  )
}

function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.29h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.75a16 16 0 0 0 6 6l1.27-.9a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2z" />
    </svg>
  )
}
function EmailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  )
}
function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
function GlobeIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}
function LinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}
