import type { Proposal, GateVerb } from './types'

export async function fetchProposal(): Promise<Proposal> {
  const r = await fetch('/api/proposal')
  if (!r.ok) throw new Error(`proposal ${r.status}`)
  return r.json()
}

export async function postGate(id: string, verb: GateVerb): Promise<{ ok: boolean }> {
  const r = await fetch('/api/gate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposalId: id, verb }),
  })
  if (!r.ok) throw new Error(`gate ${r.status}`)
  return r.json()
}
