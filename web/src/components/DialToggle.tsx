// DialToggle is the header autonomy-dial switch: ON auto-applies
// deterministic moves (move_auto_advanced); OFF pends them at the gate.
export default function DialToggle({ on, onToggle }: { on: boolean; onToggle: (next: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label="Autonomy dial"
      onClick={() => onToggle(!on)}
      className="flex items-center gap-2 px-2 py-1 text-xs border border-gray-400 rounded bg-white text-gray-900">
      <span className={`inline-block w-2 h-2 rounded-full ${on ? 'bg-gray-800' : 'bg-gray-300'}`} />
      dial: {on ? 'auto' : 'manual'}
    </button>
  )
}
