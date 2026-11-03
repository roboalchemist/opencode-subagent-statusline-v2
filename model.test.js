import { test } from "node:test"
import assert from "node:assert/strict"
import { descendants, visibleRows, stateOf, duration, themeColor, tokenLabel } from "./model.js"

test("scope descendants, retain nesting and guard cycles", () => {
  const sessions = [{ id: "root", parentID: "grandchild" }, { id: "child", parentID: "root" },
    { id: "grandchild", parentID: "child" }, { id: "other", parentID: "unrelated" }]
  assert.deepEqual(descendants(sessions, "root").map((r) => [r.session.id, r.depth]), [["child", 0], ["grandchild", 1]])
})
test("running overrides stale outcome; history excludes only completed", () => {
  const now = Date.now()
  const sessions = ["done", "bad", "live"].map((id) => ({ id, parentID: "root", outcome: id === "bad" ? "failed" : "succeeded", time: { updated: now } }))
  const status = (id) => id === "live" ? "running" : "idle"
  assert.deepEqual(visibleRows(sessions, "root", status, false, now).map((r) => r.session.id), ["live", "bad"])
  assert.equal(stateOf({ outcome: "failed" }, "running"), "running")
  assert.equal(stateOf({}, "idle"), "idle")
})
test("old running sessions remain visible and finished elapsed time freezes", () => {
  const session = { id: "old", parentID: "root", time: { created: 1000, updated: 2000, idle: 61000 } }
  assert.equal(visibleRows([session], "root", () => "running", false, 1e10).length, 1)
  assert.equal(visibleRows([session], "root", () => "idle", true, 1e10).length, 0)
  assert.equal(duration(session, "completed", 1e10), "1m 0s")
  assert.equal(duration(session, "running", 121000), "2m 0s")
  assert.equal(tokenLabel({ input: 1500, output: 30 }), "in 1.5K · out 30")
})

test("themeColor reads OpenCode 2.2 tokens and legacy theme names", () => {
  const color = (value) => ({ buffer: [value, 0, 0, 255] })
  const current = {
    text: {
      base: color(1),
      muted: color(2),
      feedback: { success: { base: color(3), muted: color(4) }, error: { base: color(5) } },
    },
  }
  assert.equal(themeColor(current, "text.muted", "text.subdued"), current.text.muted)
  assert.equal(themeColor(current, "text.base", "text.default"), current.text.base)
  assert.equal(themeColor(current, "text.feedback.success"), current.text.feedback.success.base)
  assert.equal(themeColor(current, "text.feedback.error"), current.text.feedback.error.base)

  const legacy = { text: { subdued: "grey", default: "white", feedback: { success: "green" } } }
  assert.equal(themeColor(legacy, "text.muted", "text.subdued"), "grey")
  assert.equal(themeColor(legacy, "text.base", "text.default"), "white")
  assert.equal(themeColor(legacy, "text.feedback.success"), "green")
})
