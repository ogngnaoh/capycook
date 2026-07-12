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
        // BC-G-13: the OFF state's border must be >=3:1 against the header
        // background in both themes. border-accent (ON) already clears
        // that (3.5:1 light / 4.6:1 dark vs accent-soft); border-hairline-
        // strong (~1.6-1.7:1) did not — border-muted does (>=5:1), the same
        // token already used for the "unverified" chip border (DishCard).
        on ? 'border-accent bg-accent-soft text-accent-text' : 'border-muted bg-transparent text-ink hover:bg-ink hover:text-page'
      }`}>
      <span aria-hidden="true"
        className={`inline-block w-[7px] h-[7px] ${on ? 'bg-accent' : 'border border-muted'}`} />
      {DIAL_LABEL}
    </button>
  )
}
