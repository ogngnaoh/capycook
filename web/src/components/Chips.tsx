import type { ReactNode } from 'react'
import type { Citation } from '../types'

// Chip is the square primitive behind every provenance marker: 11px IBM
// Plex Mono on a flat semantic surface tint, or a bare hairline outline for
// neutral data. Color is never the sole signal — every chip keeps its text
// label. normal-case guards chips nested inside uppercase UI labels.
const VARIANTS = {
  info: 'bg-info-surface text-info',
  success: 'bg-success-surface text-success',
  warning: 'bg-warning-surface text-ink border border-warning',
  critical: 'bg-critical-surface text-critical',
  neutral: 'border border-hairline-strong text-muted',
} as const

export function Chip({ variant, children }: {
  variant: keyof typeof VARIANTS
  children: ReactNode
}) {
  return (
    <span className={`inline-flex items-center px-1 font-mono text-2xs normal-case ${VARIANTS[variant]}`}>
      {children}
    </span>
  )
}

// CitationChip pins a deterministic source: a FlavorGraph edge, a USDA FDC
// id, a safety rule.
export function CitationChip({ citation }: { citation: Citation }) {
  return <Chip variant="info">{citation.source} #{citation.ref}</Chip>
}

// UnverifiedChip marks a claim the deterministic layer could not ground.
export function UnverifiedChip({ label }: { label?: string }) {
  return <Chip variant="warning">{label ? `[unverified] ${label}` : '[unverified]'}</Chip>
}

// ConfidenceChip renders the model's self-score. Deterministic services
// report exactly 1.0, which reads as a fact — "deterministic" — not a score.
export function ConfidenceChip({ confidence }: { confidence: number }) {
  if (confidence === 1) return <Chip variant="info">deterministic</Chip>
  return <Chip variant="neutral">conf {confidence.toFixed(2)}</Chip>
}

// ApproximateChip flags store-average cost arithmetic (never a silent $0).
export function ApproximateChip() {
  return <Chip variant="warning">[approximate]</Chip>
}
