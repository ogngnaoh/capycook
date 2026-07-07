import type { GateVerb } from '../types'

const VERBS: { verb: GateVerb; label: string }[] = [
  { verb: 'accept', label: 'Accept' }, { verb: 'edit', label: 'Edit' },
  { verb: 'regenerate', label: 'Regenerate' }, { verb: 'alternatives', label: 'Alternatives' },
  { verb: 'redirect', label: 'Redirect' }, { verb: 'take_over', label: 'Take over' },
]

export default function GateBar({ onVerb, disabled }: { onVerb: (v: GateVerb) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {VERBS.map(({ verb, label }) => (
        <button key={verb} disabled={disabled} onClick={() => onVerb(verb)}
          className="px-3 py-1 text-sm rounded bg-gray-800 text-white disabled:opacity-40">{label}</button>
      ))}
    </div>
  )
}
