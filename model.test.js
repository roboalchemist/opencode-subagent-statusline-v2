import { test } from "node:test"
import assert from "node:assert/strict"
import { descendants, visibleRows, stateOf, duration, tokenLabel } from "./model.js"

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
