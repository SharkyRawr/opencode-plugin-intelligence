import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readLeaderboardCache, refreshLeaderboardCache } from "./leaderboard-cache.js";
import { buildProviderNamePatch } from "./model-annotations.js";

const CACHE_OPTIONS = {
  forceRefresh: process.env.OPENCODE_INTELLIGENCE_FORCE_REFRESH === "1",
  cachePath: process.env.OPENCODE_INTELLIGENCE_CACHE_PATH,
};

let sharedLeaderboardPromise = null;
let sharedSyncPromise = null;
let startedBackgroundSync = false;

async function loadLeaderboard({ client, directory, worktree }) {
  if (sharedLeaderboardPromise) {
    return sharedLeaderboardPromise;
  }

  sharedLeaderboardPromise = (async () => {
    try {
      return CACHE_OPTIONS.forceRefresh
        ? await refreshLeaderboardCache({ directory, worktree, cachePath: CACHE_OPTIONS.cachePath })
        : await readLeaderboardCache({ directory, worktree, cachePath: CACHE_OPTIONS.cachePath });
    } catch (error) {
      await client.app.log({
        body: {
          service: "opencode-plugin-intelligence",
          level: "warn",
          message: "Failed to load Artificial Analysis leaderboard cache",
          extra: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
      });

      return {
        source: "unavailable",
        fetchedAt: null,
        models: [],
      };
    }
  })();

  return sharedLeaderboardPromise;
}

function globalGeneratedConfigPath() {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configHome, "opencode", "config.json");
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return {};
  }
}

async function writeJsonFile(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function stableJson(value) {
  return JSON.stringify(value);
}

async function syncDisplayedModelNames(input) {
  if (sharedSyncPromise) {
    return sharedSyncPromise;
  }

  sharedSyncPromise = (async () => {
    const leaderboard = await loadLeaderboard(input);

    if (!leaderboard?.models?.length) {
      return;
    }

    const providerResult = await input.client.provider.list();
    const providers = providerResult?.data?.all ?? [];
    const patch = buildProviderNamePatch(providers, leaderboard);

    if (Object.keys(patch.provider).length === 0) {
      return;
    }

    const configPath = globalGeneratedConfigPath();
    const existingConfig = await readJsonFile(configPath);
    const nextConfig = {
      ...existingConfig,
      provider: {
        ...(existingConfig.provider ?? {}),
        ...patch.provider,
      },
    };

    if (stableJson(existingConfig) === stableJson(nextConfig)) {
      return;
    }

    await writeJsonFile(configPath, nextConfig);
    await input.client.app.log({
      body: {
        service: "opencode-plugin-intelligence",
        level: "info",
        message: "Updated generated model-name annotations",
        extra: {
          configPath,
          providers: Object.keys(patch.provider).length,
        },
      },
    });

    await input.client.instance.dispose();
  })();

  return sharedSyncPromise;
}

async function waitForResolvedProviders(input) {
  let lastError = null;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const result = await input.client.provider.list();
      const providers = result?.data?.all ?? [];

      if (providers.length > 0) {
        return providers;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (lastError) {
    throw lastError;
  }

  return [];
}

async function syncAfterStartup(input) {
  try {
    const providers = await waitForResolvedProviders(input);

    if (providers.length === 0) {
      return;
    }

    const leaderboard = await loadLeaderboard(input);

    if (!leaderboard?.models?.length) {
      return;
    }

    const patch = buildProviderNamePatch(providers, leaderboard);

    if (Object.keys(patch.provider).length === 0) {
      return;
    }

    const configPath = globalGeneratedConfigPath();
    const existingConfig = await readJsonFile(configPath);
    const nextConfig = {
      ...existingConfig,
      provider: {
        ...(existingConfig.provider ?? {}),
        ...patch.provider,
      },
    };

    if (stableJson(existingConfig) === stableJson(nextConfig)) {
      return;
    }

    await writeJsonFile(configPath, nextConfig);
    await input.client.app.log({
      body: {
        service: "opencode-plugin-intelligence",
        level: "info",
        message: "Updated generated model-name annotations",
        extra: {
          configPath,
          providers: Object.keys(patch.provider).length,
        },
      },
    });

    await input.client.instance.dispose();
  } catch (error) {
    await input.client.app.log({
      body: {
        service: "opencode-plugin-intelligence",
        level: "warn",
        message: "Failed to sync generated model-name annotations",
        extra: {
          error: error instanceof Error ? error.message : String(error),
        },
      },
    });
  }
}

export const IntelligencePlugin = async (input) => {
  if (!startedBackgroundSync) {
    startedBackgroundSync = true;
    void syncAfterStartup(input);
  }

  return {};
};

export default IntelligencePlugin;
