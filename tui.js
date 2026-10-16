import { createElement, insert, setProp } from "@opentui/solid"
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { cleanTitle, descendants, duration, tokenLabel, visibleRows } from "./model.js"

function node(tag, props, children = []) {
  const element = createElement(tag)
  for (const [key, value] of Object.entries(props)) if (value !== undefined) setProp(element, key, value)
  for (const child of children) insert(element, child)
  return element
}
const text = (fg, value) => node("text", { fg, wrapMode: "word" }, [value])
const box = (props, children) => node("box", { flexDirection: "column", ...props }, children)

function color(theme, path) {
  let value = theme
  for (const key of path.split(".")) value = value?.[key]
  return value?.default ?? value
}

function Sidebar(api, props, settings, update) {
  const [now, setNow] = createSignal(Date.now())
  const [selected, setSelected] = createSignal(null)
  const [focused, setFocused] = createSignal(false)
  const rows = createMemo(() => visibleRows(
    api.data.session.list(), props.sessionID,
    (id) => api.data.session.status(id), settings.history, now(),
  ))
  const all = createMemo(() => descendants(api.data.session.list(), props.sessionID))
  const running = createMemo(() => all().filter(({ session }) => api.data.session.status(session.id) === "running").length)
  const muted = color(api.theme, "text.subdued")
  const normal = color(api.theme, "text.default")
  const success = color(api.theme, "text.feedback.success") ?? normal
  const failure = color(api.theme, "text.feedback.error") ?? normal

  createEffect(() => {
    props.sessionID
    setFocused(false)
    setSelected(null)
  })
  createEffect(() => {
    const current = rows()
    if (!current.some((row) => row.session.id === selected())) setSelected(current[0]?.session.id ?? null)
    if (!running()) setFocused(false)
  })
  createEffect(() => {
    if (!running()) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => clearInterval(timer))
  })

  function open(id = selected()) {
    if (!id || !api.data.session.get(id)) return
    setFocused(false)
    api.ui.router.navigate({ type: "session", sessionID: id })
  }
  function move(delta) {
    const list = rows()
    if (!list.length) return
    const index = Math.max(0, list.findIndex((row) => row.session.id === selected()))
    setSelected(list[(index + delta + list.length) % list.length].session.id)
  }
  const toggleHistory = () => update((draft) => { draft.history = !draft.history })
  api.keymap.layer(() => ({
    mode: "global",
    commands: [{
      id: "subagents.focus", title: "Subagents: Focus sidebar list", group: "Subagents",
      palette: true, bind: "alt+b", enabled: () => rows().length > 0,
      run: () => { update((draft) => { draft.collapsed = false }); setFocused(!focused()) },
    }, {
      id: "subagents.history", title: "Subagents: Toggle completed history", group: "Subagents",
      palette: true, run: toggleHistory,
    }],
  }))
  createEffect(() => {
    if (!focused()) return
    const release = api.keymap.mode.push("subagent-statusline")
    onCleanup(release)
  })
  api.keymap.layer(() => ({
    mode: "subagent-statusline", enabled: focused, priority: 100,
    commands: [
      { bind: "j", run: () => move(1) }, { bind: "down", run: () => move(1) },
      { bind: "k", run: () => move(-1) }, { bind: "up", run: () => move(-1) },
      { bind: "return", run: () => open() },
      { bind: "escape", run: () => setFocused(false) },
      { bind: "c", run: toggleHistory },
      { bind: "h", run: () => { update((draft) => { draft.collapsed = true }); setFocused(false) } },
      { bind: "l", run: () => update((draft) => { draft.collapsed = false }) },
    ],
  }))

  return box({ marginTop: 1 }, [() => {
    if (!all().length) return null
    return box({}, [
      node("text", { fg: normal, onMouseDown: () => update((draft) => { draft.collapsed = !draft.collapsed }) },
        [`${settings.collapsed ? "▸" : "▾"} Subagents · ${running()} running / ${all().length}`]),
      ...(settings.collapsed ? [] : [
        text(muted, `${focused() ? "j/k · Enter · Esc" : "Alt+B to navigate"} · history ${settings.history ? "on" : "off"}`),
        ...rows().map(({ session, state, depth }) => box({ marginTop: 1, onMouseDown: () => open(session.id) }, [
          text(state === "failed" ? failure : state === "completed" ? success : normal,
            `${focused() && selected() === session.id ? ">" : " "} ${state === "running" ? "●" : state === "failed" ? "✗" : state === "completed" ? "✓" : "○"} ${depth ? "↳ " : ""}${cleanTitle(session.title ?? session.agent)}`),
          text(muted, `${state} · ${duration(session, state, now())}${session.agent ? ` · ${cleanTitle(session.agent)}` : ""}`),
          text(muted, tokenLabel(session.tokens)),
          ...(session.model ? [text(muted, `${session.model.providerID}/${session.model.id}${session.model.variant ? ` · ${session.model.variant}` : ""}`)] : []),
        ])),
        ...(all().length > rows().length ? [text(muted, `${all().length - rows().length} hidden (history/age/display limit)`)] : []),
      ]),
    ])
  }])
}

function Footer(api, props) {
  return text(color(api.theme, "text.subdued"), () => {
    const route = api.ui.router.current()
    const parentID = props.sessionID ?? (route.type === "session" ? route.sessionID : undefined)
    const sessions = parentID ? descendants(api.data.session.list(), parentID).map((row) => row.session) : api.data.session.list().filter((s) => s.parentID)
    const count = sessions.filter((s) => api.data.session.status(s.id) === "running").length
    return count ? `Subagents: ${count} running` : ""
  })
}

export default {
  id: "local.subagent-statusline.v2",
  setup(api) {
    // api.storage.memory exists on newer OpenCode builds; fall back to an
    // in-memory store on builds where the storage domain is unavailable.
    const useFallback = typeof api?.storage?.memory !== "function"
    const fallbackStore = { history: true, collapsed: false }
    const [settings, update] = useFallback
      ? [fallbackStore, (draft) => { if (typeof draft === "function") draft(fallbackStore); else Object.assign(fallbackStore, draft) }]
      : api.storage.memory("subagent-statusline.v2.settings", {
          initial: { history: true, collapsed: false },
        })
    const cleanup = []
    try {
      cleanup.push(api.ui.slot({ append: "sidebar.content", render: (props) => Sidebar(api, props, settings, update) }))
      cleanup.push(api.ui.slot({ append: "home.footer", render: (props) => Footer(api, props) }))
      cleanup.push(api.ui.slot({ append: "prompt.footer", render: (props) => Footer(api, props) }))
    } catch (error) {
      for (const dispose of cleanup.reverse()) dispose()
      throw error
    }
    return () => { for (const dispose of cleanup.reverse()) dispose() }
  },
}
