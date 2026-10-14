import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  readLeaderboardCache,
  refreshLeaderboardCache,
  writeCacheFile,
} from "../src/leaderboard-cache.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const fetchedAt = "2026-10-14T00:00:00.000Z";
const cached = {
  fetchedAt,
  models: [{ shortName: "Example", intelligenceIndex: 50 }],
};
const record = `35:${JSON.stringify({ models: [{ slug: "example", shortName: "Example", intelligenceIndex: 60, intelligenceIndexIsEstimated: false }] })}\n`;
const html = `<script>self.__next_f.push([1,${JSON.stringify(record)}]);</script>`;

async function cachePath(t) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "leaderboard-cache-test-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  return path.join(directory, "leaderboard.json");
}

function mockFetch(t) {
  return t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    text: async () => html,
  }));
}

test("the timeout covers a stalled response body and allows a later retry", async (t) => {
  const file = await cachePath(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let bodyStarted;
  const started = new Promise((resolve) => {
    bodyStarted = resolve;
  });
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async (_url, { signal }) => ({
      ok: true,
      text: () =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
          bodyStarted();
        }),
    }),
  );
  const pending = refreshLeaderboardCache({ cachePath: file });
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await started;
  t.mock.timers.tick(4000);
  await rejected;
  fetch.mock.mockImplementation(async () => ({
    ok: true,
    text: async () => html,
  }));
  assert.equal(
    (await refreshLeaderboardCache({ cachePath: file })).modelCount,
    1,
  );
  assert.equal(fetch.mock.callCount(), 2);
});

test("reuses a cache until 24 hours and refreshes at the expiry boundary", async (t) => {
  const file = await cachePath(t);
  await writeCacheFile(file, cached);
  const now = t.mock.method(
    Date,
    "now",
    () => Date.parse(fetchedAt) + DAY_MS - 1,
  );
  const fetch = mockFetch(t);
  assert.deepEqual(await readLeaderboardCache({ cachePath: file }), cached);
  assert.equal(fetch.mock.callCount(), 0);
  now.mock.mockImplementation(() => Date.parse(fetchedAt) + DAY_MS);
  const refreshed = await readLeaderboardCache({ cachePath: file });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(refreshed.models[0].intelligenceIndex, 60);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), refreshed);
});

test("a missing or undated cache refreshes, and explicit refresh bypasses freshness", async (t) => {
  const file = await cachePath(t);
  const fetch = mockFetch(t);
  await readLeaderboardCache({ cachePath: file });
  assert.equal(fetch.mock.callCount(), 1);
  await readLeaderboardCache({ cachePath: file });
  assert.equal(fetch.mock.callCount(), 1);
  await refreshLeaderboardCache({ cachePath: file });
  assert.equal(fetch.mock.callCount(), 2);
  await writeCacheFile(file, { models: cached.models });
  await readLeaderboardCache({ cachePath: file });
  assert.equal(fetch.mock.callCount(), 3);
});

test("concurrent refreshes share one request per cache path", async (t) => {
  const file = await cachePath(t);
  const fetch = mockFetch(t);
  const [first, second] = await Promise.all([
    refreshLeaderboardCache({ cachePath: file }),
    refreshLeaderboardCache({ cachePath: file }),
  ]);
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(first, second);
});

test("failed expiry refresh preserves the old cache and permits a later retry", async (t) => {
  const file = await cachePath(t);
  await writeCacheFile(file, cached);
  t.mock.method(Date, "now", () => Date.parse(fetchedAt) + DAY_MS);
  const fetch = t.mock.method(globalThis, "fetch", async () => ({
    ok: false,
    status: 503,
  }));
  const warn = t.mock.method(console, "warn", () => {});
  assert.deepEqual(await readLeaderboardCache({ cachePath: file }), cached);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), cached);
  assert.equal(warn.mock.callCount(), 1);
  fetch.mock.mockImplementation(async () => ({
    ok: true,
    text: async () => html,
  }));
  assert.equal(
    (await readLeaderboardCache({ cachePath: file })).models[0]
      .intelligenceIndex,
    60,
  );
});
