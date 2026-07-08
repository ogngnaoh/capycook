import { DIAL_LABEL } from '../vocab'

// DialToggle is the header autonomy-dial switch, styled as header chrome
// (design 73/1135): ON auto-applies deterministic moves (move_auto_advanced);
// OFF pends them at the gate. Square status dot filled terracotta when on —
// state also rides aria-checked and the filled-vs-outline dot, so color is
// never the only signal.
export default function DialToggle({ on, onToggle }: { on: boolean; onToggle: (next: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on}
      onClick={() => onToggle(!on)}
      title="Auto-apply safe deterministic steps (scale, unit convert, recompute)"
      className={`inline-flex items-center gap-[6px] min-h-[32px] px-[10px] uppercase font-medium text-[11px] tracking-[0.06em] border transition ${
        on ? 'border-accent bg-accent-soft text-accent-text' : 'border-hairline-strong bg-transparent text-ink hover:bg-ink hover:text-page'
      }`}>
      <span aria-hidden="true"
        className={`inline-block w-[7px] h-[7px] ${on ? 'bg-accent' : 'border border-hairline-strong'}`} />
      {DIAL_LABEL}
    </button>
  )
}
