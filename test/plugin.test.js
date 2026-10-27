import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Host } from "@opencode/plugin/host";
import plugin from "../index.js";
import { cacheStatusRpc } from "../src/cache-status.js";
import tui from "../tui.js";

test("OpenCode resolves and loads the server and TUI definitions", async () => {
  const entries = Host.resolve({
    directory: path.resolve(import.meta.dirname, ".."),
  });
  for (const runtime of ["server", "tui"]) {
    assert.ok(entries[runtime], `missing ${runtime} entrypoint`);
    const { default: definition } = await Host.load(entries[runtime]);
    assert.equal(definition.id, "opencode-plugin-intelligence");
    assert.equal(typeof definition.setup, "function");
  }
});

function notificationContext(t) {
  let handlers;
  const dispose = t.mock.fn();
  const toasts = [];
  const location = { directory: "/example" };
  return {
    rpc: {
      async register(definition, implementation) {
        assert.deepEqual(definition, cacheStatusRpc);
        handlers = implementation;
        return { dispose };
      },
    },
    async showStatus() {
      await tui.setup({
        location,
        client: {
          rpc(definition) {
            assert.deepEqual(definition, cacheStatusRpc);
            return {
              status(input, options) {
                assert.equal(input, null);
                assert.deepEqual(options, { location });
                return handlers.status();
              },
            };
          },
        },
        ui: { toast: { show: (toast) => toasts.push(toast) } },
      });
      return toasts;
    },
    dispose,
  };
}

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
  const notification = notificationContext(t);
  const cleanup = await plugin.setup({
    rpc: notification.rpc,
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
  assert.equal(notification.dispose.mock.callCount(), 1);
  assert.deepEqual(await notification.showStatus(), []);
});

test("an unreadable cache leaves OpenCode models alone and reports a warning", async (t) => {
  await withCache(t, "invalid JSON");
  const warnings = t.mock.method(console, "warn", () => {});
  const notification = notificationContext(t);
  const cleanup = await plugin.setup({
    rpc: notification.rpc,
    model: {
      transform() {
        assert.fail("must not register a transform with unavailable data");
      },
    },
  });
  assert.equal(warnings.mock.callCount(), 1);
  const [toast] = await notification.showStatus();
  assert.equal(toast.variant, "error");
  assert.match(toast.message, /could not be loaded; scores are unavailable/);
  await cleanup();
  assert.equal(notification.dispose.mock.callCount(), 1);
});

test("an empty leaderboard does not register a transform", async (t) => {
  await withCache(
    t,
    JSON.stringify({ fetchedAt: new Date().toISOString(), models: [] }),
  );
  const notification = notificationContext(t);
  const cleanup = await plugin.setup({
    rpc: notification.rpc,
    model: {
      transform() {
        assert.fail("must not register an empty transform");
      },
    },
  });
  assert.deepEqual(await notification.showStatus(), []);
  await cleanup();
});

for (const failure of ["missing cache", "forced refresh", "expired cache"]) {
  test(`${failure} fetch failure shows an error toast`, async (t) => {
    const models = [{ shortName: "Example", intelligenceIndex: 50 }];
    await withCache(
      t,
      JSON.stringify({ fetchedAt: "2000-01-01T00:00:00Z", models }),
    );
    if (failure === "missing cache")
      await rm(process.env.OPENCODE_INTELLIGENCE_CACHE_PATH);
    if (failure === "forced refresh")
      process.env.OPENCODE_INTELLIGENCE_FORCE_REFRESH = "1";
    t.mock.method(globalThis, "fetch", async () => ({
      ok: false,
      status: 503,
    }));
    t.mock.method(console, "warn", () => {});
    const notification = notificationContext(t);
    let transform;
    const cleanup = await plugin.setup({
      rpc: notification.rpc,
      model: {
        async transform(callback) {
          assert.equal(failure, "expired cache");
          transform = callback;
          return { dispose() {} };
        },
      },
    });
    const toasts = await notification.showStatus();
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].variant, "error");
    assert.match(toasts[0].message, /503/);
    if (failure === "expired cache") {
      assert.match(toasts[0].message, /using saved scores/);
      const model = { providerID: "host", id: "example", name: "Example" };
      transform({
        list: () => [model],
        update: (_provider, _id, update) => update(model),
      });
      assert.equal(model.name, "Example (AIQ: 50)");
    } else {
      assert.equal(transform, undefined);
      assert.match(toasts[0].message, /scores are unavailable/);
    }
    await cleanup();
  });
}
