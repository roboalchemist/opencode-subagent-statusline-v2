// Server-side no-op. This plugin only renders TUI chrome (see ./tui.js, loaded
// by the OpenCode TUI runtime). Exporting a no-op ./server keeps the server
// plugin loader happy — without it the loader falls back to tui.js and calls
// its setup() in a context where api.ui does not exist.
export default {
  id: "opencode-subagent-statusline-v2.server",
  setup: async () => () => {},
}
