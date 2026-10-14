import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import plugin from "../index.js";

async function withCache(t, content) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "intelligence-test-"));
  const cachePath = path.join(directory, "leaderboard.json");
  await writeFile(cachePath, content);
  const previousPath = process.env.OPENCODE_INTELLIGENCE_CACHE_PATH;
  const previousRefresh = process.env.OPENCODE_INTELLIGENCE_FORCE_REFRESH;
  process.env.OPENCODE_INTELLIGENCE_CACHE_PATH = cachePath;
  delete process.env.OPENCODE_INTELLIGENCE_FORCE_REFRESH;
  t.after(async () => {
    if (previousPath === undefined)
      delete process.env.OPENCODE_INTELLIGENCE_CACHE_PATH;
    else process.env.OPENCODE_INTELLIGENCE_CACHE_PATH = previousPath;
    if (previousRefresh === undefined)
      delete process.env.OPENCODE_INTELLIGENCE_FORCE_REFRESH;
    else process.env.OPENCODE_INTELLIGENCE_FORCE_REFRESH = previousRefresh;
    await rm(directory, { recursive: true, force: true });
  });
}

test("v2 registers a repeatable model transform and cleans it up", async (t) => {
  await withCache(
    t,
    JSON.stringify({
      fetchedAt: new Date().toISOString(),
      models: [{ shortName: "Example Model", intelligenceIndex: 60 }],
    }),
  );
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("cache must be reused");
  });
  let transform;
  let disposed = 0;
  const cleanup = await plugin.setup({
    model: {
      async transform(callback) {
        transform = callback;
        return {
          async dispose() {
            disposed += 1;
          },
        };
      },
    },
  });
  const models = [
    {
      providerID: "host-a",
      id: "custom-id",
      name: "Example Model",
      settings: { temperature: 0.2 },
    },
    { providerID: "host-b", id: "another-id", name: "Example Model [AAII 50]" },
    { providerID: "host-a", id: "other", name: "Unmatched Model" },
  ];
  const updates = [];
  const editor = {
    list: () => models,
    update(providerID, id, callback) {
      updates.push([providerID, id]);
      callback(
        models.find(
          (model) => model.providerID === providerID && model.id === id,
        ),
      );
    },
  };
  transform(editor);
  assert.deepEqual(updates, [
    ["host-a", "custom-id"],
    ["host-b", "another-id"],
  ]);
  assert.equal(models[0].name, "Example Model (AIQ: 60)");
  assert.equal(models[1].name, "Example Model (AIQ: 60)");
  assert.deepEqual(models[0].settings, { temperature: 0.2 });
  transform(editor);
  assert.equal(updates.length, 2);
  models.push({ providerID: "new-host", id: "new-id", name: "Example Model" });
  transform(editor);
  assert.equal(models[3].name, "Example Model (AIQ: 60)");
  await cleanup();
  assert.equal(disposed, 1);
});

test("an unreadable cache leaves OpenCode models alone and reports a warning", async (t) => {
  await withCache(t, "invalid JSON");
  const warnings = t.mock.method(console, "warn", () => {});
  const cleanup = await plugin.setup({
    model: {
      transform() {
        assert.fail("must not register a transform with unavailable data");
      },
    },
  });
  assert.equal(cleanup, undefined);
  assert.equal(warnings.mock.callCount(), 1);
});

test("an empty leaderboard does not register a transform", async (t) => {
  await withCache(
    t,
    JSON.stringify({ fetchedAt: new Date().toISOString(), models: [] }),
  );
  assert.equal(
    await plugin.setup({
      model: {
        transform() {
          assert.fail("must not register an empty transform");
        },
      },
    }),
    undefined,
  );
});
