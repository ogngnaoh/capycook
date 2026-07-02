export type GateVerb = 'accept' | 'edit' | 'regenerate' | 'alternatives' | 'redirect' | 'takeover'

export interface Citation { source: string; ref: string }

export interface Proposal {
  id: string
  diff: { op: 'add' | 'remove' | 'replace'; path: string; value: string }[]
  rationale: string
  citations: Citation[]
  confidence: number
  unverified: string[]
  safetyBlock: string | null
}
