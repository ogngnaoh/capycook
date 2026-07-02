import { useEffect, useState } from 'react'
import type { Proposal, GateVerb } from './types'
import { fetchProposal, postGate } from './api'
import Workbench, { type GateState } from './components/Workbench'

const STATES: GateState[] = ['proposing', 'blocked', 'awaiting', 'accepted']

export default function App() {
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [state, setState] = useState<GateState>('awaiting')

  useEffect(() => { fetchProposal().then(setProposal).catch(() => {}) }, [])

  async function onVerb(v: GateVerb) {
    if (!proposal) return
    if (v === 'accept') { await postGate(proposal.id, v).catch(() => {}); setState('accepted') }
  }

  if (!proposal) return <main data-testid="app-root" className="min-h-screen bg-gray-100 p-4">Loading…</main>

  return (
    <main data-testid="app-root" className="min-h-screen bg-gray-100">
      <Workbench proposal={proposal} state={state} onVerb={onVerb} />
      <div className="fixed bottom-2 right-2 flex gap-1 text-xs">
        {STATES.map((s) => (
          <button key={s} onClick={() => setState(s)} className="px-2 py-1 bg-white border rounded">{s}</button>
        ))}
      </div>
    </main>
  )
}
