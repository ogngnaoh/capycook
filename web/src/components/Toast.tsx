// Toast is the fixed bottom-center confirmation chip (design 727-730): an
// ink-on-page inverse strip for a one-line, low-stakes confirmation. Renders
// nothing when there is no message — callers own showing/clearing it.
export function Toast({ message }: { message: string }) {
  if (!message) return null
  return (
    <div role="status" data-testid="toast"
      className="cc-rise fixed bottom-[18px] left-1/2 -translate-x-1/2 z-toast bg-ink text-page px-[18px] py-[11px] text-base tracking-[0.03em]">
      {message}
    </div>
  )
}
