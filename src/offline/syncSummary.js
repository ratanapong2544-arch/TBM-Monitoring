/**
 * How many queued writes need a person, as opposed to needing patience.
 *
 * Conflicts, refusals and everything stranded behind them: three rings behind one conflict is three
 * records nobody can fix by waiting. It lives here because two surfaces show it together — the
 * status button and the notice strip — and when each spelled it itself either could change while the
 * other silently disagreed on the same screen.
 */
export function stuckCount(summary) {
  const counts = summary || {};
  return (counts.conflicts || 0) + (counts.errors || 0) + (counts.blocked || 0);
}

export function travellingCount(summary) {
  const counts = summary || {};
  return (counts.pending || 0) + (counts.syncing || 0);
}
