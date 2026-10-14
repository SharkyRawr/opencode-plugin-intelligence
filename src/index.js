import { cacheStatusRpc } from "./cache-status.js";
import {
  readLeaderboardCache,
  refreshLeaderboardCache,
} from "./leaderboard-cache.js";
import { createModelNameAnnotator } from "./model-annotations.js";

/** @type {import("@opencode/plugin").Plugin.Plugin} */
export const IntelligencePlugin = {
  id: "opencode-plugin-intelligence",
  async setup(ctx) {
    let leaderboard;
    let errorMessage = null;
    try {
      const options = {
        cachePath: process.env.OPENCODE_INTELLIGENCE_CACHE_PATH,
        onRefreshError(error) {
          errorMessage = `Leaderboard refresh failed; using saved scores. ${error.message ?? error}`;
        },
      };
      leaderboard =
        process.env.OPENCODE_INTELLIGENCE_FORCE_REFRESH === "1"
          ? await refreshLeaderboardCache(options)
          : await readLeaderboardCache(options);
    } catch (error) {
      console.warn(
        "opencode-plugin-intelligence: Failed to load Artificial Analysis leaderboard cache",
        error,
      );
      errorMessage = `Leaderboard could not be loaded; scores are unavailable. ${error.message ?? error}`;
    }

    let registration;
    if (leaderboard?.models?.length) {
      const annotateName = createModelNameAnnotator(leaderboard);
      registration = await ctx.model.transform((editor) => {
        for (const model of editor.list()) {
          const name = annotateName(model.id, model.name);
          if (name !== model.name) {
            editor.update(model.providerID, model.id, (draft) => {
              draft.name = name;
            });
          }
        }
      });
    }
    const statusRegistration = await ctx.rpc.register(cacheStatusRpc, {
      status: async () => errorMessage,
    });

    return async () => {
      await statusRegistration.dispose();
      await registration?.dispose();
    };
  },
};

export default IntelligencePlugin;
