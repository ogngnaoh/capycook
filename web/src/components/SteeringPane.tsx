export default function SteeringPane({ rationale }: { rationale: string }) {
  return (
    <section data-testid="steering-pane" className="w-96 p-4 space-y-3">
      <h2 className="text-xs uppercase tracking-wide text-gray-500">Steering</h2>
      <div className="p-3 bg-white border border-gray-200 rounded text-sm">{rationale}</div>
    </section>
  )
}
