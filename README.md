# opencode-plugin-intelligence

OpenCode plugin that annotates model names with the Artificial Analysis Intelligence Index from the Artificial Analysis model leaderboard.

## What it does

When the plugin can match a leaderboard model to an OpenCode model, it appends a suffix like `[AAII 53.97]` to the model display name. The intent is to make the index visible in the `/models` picker without requiring a separate lookup.

The plugin fetches the leaderboard once and writes a local cache file. After that it reads from cache until you explicitly refresh it.

## Install

Add the package to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-plugin-intelligence"]
}
```

## Cache behavior

Default cache path:

```text
.opencode/cache/opencode-plugin-intelligence/leaderboard.json
```

Environment variables:

- `OPENCODE_INTELLIGENCE_FORCE_REFRESH=1` forces a re-fetch instead of reading the cache.
- `OPENCODE_INTELLIGENCE_CACHE_PATH=/path/to/leaderboard.json` overrides the cache location.

Manual refresh:

```bash
npm run refresh-cache
```

## Notes

- Matching is strongest for providers where the Artificial Analysis creator slug lines up with the OpenCode provider id, especially `openai`, `anthropic`, `google`, and `deepseek`.
- The Artificial Analysis page structure is not a public API. The parser is defensive, but this may need adjustments if their payload format changes.
