import { cacheStatusRpc } from "./cache-status.js";

/** @type {import("@opencode/plugin/tui").Plugin.Definition} */
export default {
  id: "opencode-plugin-intelligence",
  async setup(ctx) {
    try {
      const message = await ctx.client.rpc(cacheStatusRpc).status(null, {
        location: ctx.location,
      });
      if (message) {
        ctx.ui.toast.show({
          title: "Artificial Analysis",
          message,
          variant: "error",
          duration: 10000,
        });
      }
    } catch (error) {
      console.warn(
        "opencode-plugin-intelligence: Failed to read leaderboard cache status",
        error,
      );
    }
  },
};
