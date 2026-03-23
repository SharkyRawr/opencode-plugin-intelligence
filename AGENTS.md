# AGENTS.md

## Project

`opencode-plugin-intelligence` is an OpenCode plugin that annotates model display names with the Artificial Analysis Intelligence Index.

The plugin fetches the model leaderboard from `https://artificialanalysis.ai/leaderboards/models`, extracts scored models, caches the simplified result locally, discovers the resolved provider/model list from OpenCode at runtime, and writes generated model-name overrides so `/models` can display tags like `[AAII 53.97]`.

## Current Design

- Entry point: [src/index.js](/Users/sophie/checkouts/opencode-plugin-intelligence/src/index.js)
- Cache/fetch layer: [src/leaderboard-cache.js](/Users/sophie/checkouts/opencode-plugin-intelligence/src/leaderboard-cache.js)
- Leaderboard parser: [src/leaderboard-parser.js](/Users/sophie/checkouts/opencode-plugin-intelligence/src/leaderboard-parser.js)
- Model annotation logic: [src/model-annotations.js](/Users/sophie/checkouts/opencode-plugin-intelligence/src/model-annotations.js)
- Manual cache refresh: [scripts/refresh-cache.mjs](/Users/sophie/checkouts/opencode-plugin-intelligence/scripts/refresh-cache.mjs)

Important behavior:

- Matching is based on model names, not provider identity.
- If both reasoning and non-reasoning variants exist, prefer the variant that matches the provider model name.
- Cached leaderboard data is intended to be reused once fetched. Do not add aggressive re-fetch behavior unless explicitly requested.
- The plugin no longer relies on provider-specific auth hooks or the `config` hook to annotate models.
- On startup, the plugin waits for the provider catalog to become available, computes only the changed display names, writes them to `~/.config/opencode/config.json`, and disposes the instance once if the generated config changed.
- Generated config must stay minimal. Only write model entries whose names actually change.

## Working Rules

- Keep the plugin dependency-light. Prefer built-in Node APIs unless an external package is clearly justified.
- Preserve the cache-first behavior. Refresh only when the cache is missing or explicitly forced.
- Treat the Artificial Analysis page structure as unstable. If parsing changes are needed, update tests at the same time.
- Do not reintroduce provider-id maintenance tables unless absolutely necessary. The intended strategy is to discover providers programmatically from OpenCode and match by model name.
- Do not bloat the generated config file by copying every model name. The generator should emit overrides only for matched models whose names changed.
- Avoid hook timing assumptions. The initial `server.connected` event happens too early for plugin event handlers, so startup sync is triggered directly from plugin initialization.

## Verification

Run:

```bash
node --test
```

If changing fetch or parse behavior, also verify:

```bash
npm run refresh-cache
```

## Notes For Future Agents

- The parser currently reads the React Flight payload embedded in the leaderboard HTML, not an official public API.
- If annotation coverage is poor for a specific host, improve normalization and reasoning/non-reasoning disambiguation before considering host-specific rules.
