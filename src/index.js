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
    try {
      const options = {
        cachePath: process.env.OPENCODE_INTELLIGENCE_CACHE_PATH,
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
      return;
    }

    if (!leaderboard?.models?.length) return;

    const annotateName = createModelNameAnnotator(leaderboard);
    const registration = await ctx.model.transform((editor) => {
      for (const model of editor.list()) {
        const name = annotateName(model.id, model.name);
        if (name !== model.name) {
          editor.update(model.providerID, model.id, (draft) => {
            draft.name = name;
          });
        }
      }
    });

    return () => registration.dispose();
  },
};

export default IntelligencePlugin;
