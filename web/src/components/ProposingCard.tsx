// ProposingCard is the streaming-in-progress card (design 206-217): the
// accent-tinted band that owns the canvas while a move is in flight — the
// spinner + "Working on your idea" label, a Stop button, and the rationale
// tokens arriving live with a blinking caret. Both animations ride the
// global prefers-reduced-motion kill in index.css (transition/animation
// duration zeroed) — the streamed text itself still updates either way.
export default function ProposingCard({ text, onCancel }: {
  text: string
  onCancel: () => void
}) {
  return (
    <div data-testid="proposing-card" className="cc-rise border border-accent bg-accent-soft px-[18px] py-[16px] mb-4">
      <div className="flex items-center gap-2 mb-[10px]">
        <span aria-hidden="true" data-testid="proposing-spinner"
          className="inline-block w-[13px] h-[13px] rounded-[50%] border-2 border-accent border-t-transparent animate-[cc-spin_.7s_linear_infinite]" />
        {/* The card's heading doubles as the focus target at move dispatch
            (BC-A-5): programmatically focusable, never the Stop control. */}
        <span data-testid="proposing-heading" tabIndex={-1}
          className="text-2xs tracking-[0.1em] uppercase text-accent-text focus:outline-none">
          Working on your idea
        </span>
        <div className="flex-1" />
        <button type="button" onClick={onCancel}
          className="border border-accent bg-transparent text-accent-text uppercase font-medium text-2xs px-3 min-h-[30px]">
          Stop
        </button>
      </div>
      <p className="m-0 text-[15px] leading-[1.6] text-ink">
        {text}
        <span aria-hidden="true" data-testid="proposing-caret"
          className="inline-block w-2 h-[17px] bg-accent align-[-2px] ml-[2px] animate-[cc-blink_1s_step-start_infinite]" />
      </p>
    </div>
  )
}
