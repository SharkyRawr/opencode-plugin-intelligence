# AGENTS.md

## Project

`opencode-plugin-intelligence` is an OpenCode v2 plugin that annotates model display names with the Artificial Analysis Intelligence Index. It requires OpenCode v2.2.0 or newer v2 and Node.js 26.13.0 or newer.

The plugin fetches the model leaderboard from `https://artificialanalysis.ai/leaderboards/models`, extracts scored models, caches the simplified result locally, and annotates OpenCode's runtime model catalog so `/models` displays scores like `(AIQ: 53.97)`.

## Current Design

- Entry point: [src/index.js](/Users/sophie/checkouts/opencode-plugin-intelligence/src/index.js)
- Cache/fetch layer: [src/leaderboard-cache.js](/Users/sophie/checkouts/opencode-plugin-intelligence/src/leaderboard-cache.js)
- Leaderboard parser: [src/leaderboard-parser.js](/Users/sophie/checkouts/opencode-plugin-intelligence/src/leaderboard-parser.js)
- Model annotation logic: [src/model-annotations.js](/Users/sophie/checkouts/opencode-plugin-intelligence/src/model-annotations.js)
- TUI entry point and error toasts: [src/tui.js](/Users/sophie/checkouts/opencode-plugin-intelligence/src/tui.js)
- Startup cache status RPC contract: [src/cache-status.js](/Users/sophie/checkouts/opencode-plugin-intelligence/src/cache-status.js)
- Manual cache refresh: [scripts/refresh-cache.mjs](/Users/sophie/checkouts/opencode-plugin-intelligence/scripts/refresh-cache.mjs)

Important behavior:

- Matching is based on model names, not provider identity.
- If both reasoning and non-reasoning variants exist, prefer the variant that matches the provider model name.
- Setup loads the leaderboard and registers `ctx.model.transform`. The transform also runs when OpenCode rebuilds its catalog; it updates only changed `draft.name` values.
- `createModelNameAnnotator` builds a name index once per setup and reuses it for the transform. Existing `[AAII …]` and `(AIQ: …)` suffixes are replaced on matched names.
- The plugin does not write OpenCode config or restart the server. Explicit configured model names take precedence over annotations.
- Cache entries are reused for 24 hours. Missing or expired entries refresh on access; forced and manual refreshes bypass expiry. Concurrent refreshes share one request per cache path within the process. There is no polling timer.
- A failed expiry refresh preserves stale scores. Missing-cache, forced-refresh, malformed-cache, and unreadable-cache failures skip annotations. Console warnings and TUI error toasts report failures.
- The TUI reads startup cache status through RPC so failures are visible even when it attaches after server setup. Cleanup disposes the RPC and model-transform registrations.

## Working Rules

- Keep the plugin dependency-light. Prefer built-in Node APIs unless an external package is clearly justified.
- Preserve the 24-hour cache policy, concurrent request sharing, and stale-score fallback. The four-second fetch timeout covers both headers and the response body.
- Treat the Artificial Analysis page structure as unstable. If parsing changes are needed, update tests at the same time.
- Do not reintroduce provider-id maintenance tables unless absolutely necessary. Use the runtime model catalog and match by model name, ID, and leaderboard slug.
- Keep annotation logic in `createModelNameAnnotator`; do not restore the legacy config-patching path.
- Register transforms and cache status directly from setup rather than relying on startup event timing.

## Verification

Run:

```bash
node --test
npm run lint
```

If changing fetch or parse behavior, also verify:

```bash
npm run refresh-cache
```

## Notes For Future Agents

- The parser currently reads the React Flight payload embedded in the leaderboard HTML, not an official public API.
- If annotation coverage is poor for a specific host, improve normalization and reasoning/non-reasoning disambiguation before considering host-specific rules.
