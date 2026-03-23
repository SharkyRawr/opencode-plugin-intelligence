import { refreshLeaderboardCache } from "../src/leaderboard-cache.js";

const snapshot = await refreshLeaderboardCache({
  cachePath: process.env.OPENCODE_INTELLIGENCE_CACHE_PATH,
});

console.log(
  JSON.stringify(
    {
      fetchedAt: snapshot.fetchedAt,
      modelCount: snapshot.modelCount,
      leaderboardUrl: snapshot.leaderboardUrl,
    },
    null,
    2,
  ),
);
