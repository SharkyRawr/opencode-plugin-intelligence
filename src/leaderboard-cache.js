import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { extractLeaderboardSnapshot } from "./leaderboard-parser.js";

const LEADERBOARD_URL = "https://artificialanalysis.ai/leaderboards/models";
const FETCH_TIMEOUT_MS = 4000;

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

  let response;

  try {
    response = await fetch(LEADERBOARD_URL, {
      signal: controller.signal,
      headers: {
        "user-agent": "opencode-plugin-intelligence/0.1.0",
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Artificial Analysis request failed with ${response.status}`);
  }

  return response.text();
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
  await writeFile(cacheFile, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
}

export async function refreshLeaderboardCache({ directory, worktree, cachePath } = {}) {
  const snapshot = await fetchLeaderboardSnapshot();
  const resolvedCachePath = resolveCachePath({ directory, worktree, cachePath });

  await writeCacheFile(resolvedCachePath, snapshot);

  return snapshot;
}

export async function readLeaderboardCache({ directory, worktree, cachePath } = {}) {
  const resolvedCachePath = resolveCachePath({ directory, worktree, cachePath });

  try {
    return await readCacheFile(resolvedCachePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return refreshLeaderboardCache({ directory, worktree, cachePath: resolvedCachePath });
    }

    throw error;
  }
}

export function defaultCachePath() {
  return path.join(os.homedir(), ".config", "opencode", "cache", "opencode-plugin-intelligence", "leaderboard.json");
}
