import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractLeaderboardSnapshot } from "./leaderboard-parser.js";

const LEADERBOARD_URL = "https://artificialanalysis.ai/leaderboards/models";
const FETCH_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const pendingRefreshes = new Map();

function resolveCachePath({ directory, worktree, cachePath }) {
  if (cachePath) {
    return path.resolve(cachePath);
  }

  void directory;
  void worktree;
  return defaultCachePath();
}

async function ensureDirectory(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function fetchLeaderboardHtml() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(LEADERBOARD_URL, {
      signal: controller.signal,
      headers: {
        "user-agent": "opencode-plugin-intelligence/0.1.1",
      },
    });
    if (!response.ok) {
      throw new Error(
        `Artificial Analysis request failed with ${response.status}`,
      );
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchLeaderboardSnapshot() {
  const html = await fetchLeaderboardHtml();
  return extractLeaderboardSnapshot(html);
}

export async function readCacheFile(cacheFile) {
  const raw = await readFile(cacheFile, "utf8");
  return JSON.parse(raw);
}

export async function writeCacheFile(cacheFile, snapshot) {
  await ensureDirectory(cacheFile);
  await writeFile(cacheFile, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

export async function refreshLeaderboardCache({
  directory,
  worktree,
  cachePath,
} = {}) {
  const resolvedCachePath = resolveCachePath({
    directory,
    worktree,
    cachePath,
  });
  if (pendingRefreshes.has(resolvedCachePath))
    return pendingRefreshes.get(resolvedCachePath);
  const pending = (async () => {
    const snapshot = await fetchLeaderboardSnapshot();
    await writeCacheFile(resolvedCachePath, snapshot);
    return snapshot;
  })();
  pendingRefreshes.set(resolvedCachePath, pending);
  try {
    return await pending;
  } finally {
    pendingRefreshes.delete(resolvedCachePath);
  }
}

export async function readLeaderboardCache({
  directory,
  worktree,
  cachePath,
  onRefreshError,
} = {}) {
  const resolvedCachePath = resolveCachePath({
    directory,
    worktree,
    cachePath,
  });

  let cached;
  try {
    cached = await readCacheFile(resolvedCachePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return refreshLeaderboardCache({
        directory,
        worktree,
        cachePath: resolvedCachePath,
      });
    }

    throw error;
  }

  const age = Date.now() - Date.parse(cached.fetchedAt);
  if (age >= 0 && age < CACHE_TTL_MS) return cached;
  try {
    return await refreshLeaderboardCache({ cachePath: resolvedCachePath });
  } catch (error) {
    console.warn(
      "opencode-plugin-intelligence: Refresh failed; using stale leaderboard cache",
      error,
    );
    onRefreshError?.(error);
    return cached;
  }
}

export function defaultCachePath() {
  return path.join(
    os.homedir(),
    ".config",
    "opencode",
    "cache",
    "opencode-plugin-intelligence",
    "leaderboard.json",
  );
}
