// SafetyBlock renders the blocked state's reason and rule id as a critical
// alert. Display only: the gate bar beneath it offers the only verbs
// allowed while blocked — regenerate/redirect (spec §4).
export default function SafetyBlock({ reason, ruleId }: {
  reason: string
  ruleId: string
}) {
  return (
    <div data-testid="safety-block" role="alert"
      className="border border-critical bg-critical-surface p-2 space-y-1">
      <div className="uppercase font-medium text-critical">Safety gate blocked this move</div>
      <p className="text-ink">{reason}</p>
      <div className="text-2xs text-muted">rule: <span className="font-mono">{ruleId}</span></div>
    </div>
  )
}
