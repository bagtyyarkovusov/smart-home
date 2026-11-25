// Device revisions and stream revisions differ when a command times out.
export function projectFrame(current, frame) {
  if (frame.type !== 'snapshot' && frame.revision <= current.streamRevision) return current
  const state = frame.state && (!current.state || frame.state.revision > current.state.revision)
    ? frame.state
    : current.state
  return { state, streamRevision: frame.revision }
}

export function updateCommand(current, incoming) {
  if (current?.requestId !== incoming.requestId || current.status !== 'pending') return current
  return incoming
}
