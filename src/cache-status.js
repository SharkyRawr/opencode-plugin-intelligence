// Read the startup result so a TUI attaching after setup still sees failures.
export const cacheStatusRpc = {
  id: "opencode-plugin-intelligence",
  methods: {
    status: {
      input: { type: "null" },
      output: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
  },
  events: {},
};
