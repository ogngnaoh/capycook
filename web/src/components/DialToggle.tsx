import { DIAL_LABEL } from '../vocab'

// DialToggle is the header autonomy-dial switch: ON auto-applies
// deterministic moves (move_auto_advanced); OFF pends them at the gate.
// Square status dot filled terracotta when on — state is also spelled out,
// color is never the only signal.
export default function DialToggle({ on, onToggle }: { on: boolean; onToggle: (next: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on}
      onClick={() => onToggle(!on)}
      className="flex items-center gap-1 px-2 py-1 uppercase border border-hairline bg-transparent text-ink transition hover:bg-ink hover:text-page">
      <span aria-hidden="true"
        className={`inline-block w-1 h-1 ${on ? 'bg-accent' : 'border border-hairline-strong'}`} />
      {DIAL_LABEL}: {on ? 'on' : 'off'}
    </button>
  )
}
