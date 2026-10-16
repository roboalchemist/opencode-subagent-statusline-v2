export function descendants(sessions, parentID) {
  const children = new Map()
  for (const session of sessions) {
    if (!session.parentID) continue
    const group = children.get(session.parentID) ?? []
    group.push(session)
    children.set(session.parentID, group)
  }
  const seen = new Set([parentID])
  const rows = []
  const queue = [{ id: parentID, depth: -1 }]
  for (let i = 0; i < queue.length; i++) {
    const parent = queue[i]
    for (const session of children.get(parent.id) ?? []) {
      if (seen.has(session.id)) continue
      seen.add(session.id)
      const depth = parent.depth + 1
      rows.push({ session, depth })
      queue.push({ id: session.id, depth })
    }
  }
  return rows
}

export function stateOf(session, status) {
  if (status === "running") return "running"
  if (session.outcome === "failed") return "failed"
  if (session.outcome === "interrupted") return "interrupted"
  if (session.outcome === "succeeded") return "completed"
  return "idle"
}

export function visibleRows(sessions, parentID, status, history, now, limit = 30) {
  const rank = { running: 0, failed: 1, interrupted: 2, idle: 3, completed: 4 }
  return descendants(sessions, parentID)
    .map(({ session, depth }) => ({ session, depth, state: stateOf(session, status(session.id)) }))
    .filter(({ session, state }) => state === "running" ||
      ((history || state !== "completed") && now - (session.time?.updated ?? 0) <= 3 * 86400000))
    .sort((a, b) => rank[a.state] - rank[b.state] || (b.session.time?.updated ?? 0) - (a.session.time?.updated ?? 0))
    .slice(0, limit)
}

export function duration(session, state, now) {
  const start = session.time?.created
  if (!Number.isFinite(start)) return "—"
  const end = state === "running" ? now : (session.time?.idle ?? session.time?.updated ?? now)
  const seconds = Math.max(0, Math.floor((end - start) / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`
}

export function tokenLabel(tokens) {
  if (!tokens) return ""
  const format = (n) => Number.isFinite(n) ? Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n) : "—"
  return `in ${format(tokens.input)} · out ${format(tokens.output)}`
}

export function cleanTitle(value) {
  return String(value ?? "Subagent").replace(/[\x00-\x1f\x7f-\x9f]/g, " ").slice(0, 160)
}
