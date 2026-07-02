import type { Proposal, GateVerb } from '../types'
import DraftPane from './DraftPane'
import SteeringPane from './SteeringPane'
import GateBar from './GateBar'

export type GateState = 'proposing' | 'blocked' | 'awaiting' | 'accepted'

const BANNER: Record<GateState, string> = {
  proposing: 'Proposing…', blocked: 'Blocked by safety gate',
  awaiting: 'Awaiting gate', accepted: 'Accepted',
}

export default function Workbench(
  { proposal, state, onVerb }: { proposal: Proposal; state: GateState; onVerb: (v: GateVerb) => void },
) {
  return (
    <div className="flex flex-col h-screen">
      <div className="px-4 py-2 bg-gray-800 text-white text-sm">CapyCook — {BANNER[state]}</div>
      <div className="flex flex-1 overflow-hidden">
        <DraftPane proposal={proposal} />
        <SteeringPane rationale={proposal.rationale} />
      </div>
      <div className="p-4"><GateBar onVerb={onVerb} disabled={state !== 'awaiting'} /></div>
    </div>
  )
}
